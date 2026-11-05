import { test, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { init, one, all, run } from "../src/db.js";
import { DAY, HOUR, setClock, now, seedTemplates, resetSettingsCache, setSetting, settings } from "../src/core.js";
import { hashPassword } from "../src/auth.js";
import { createListing, reviewListing, placeBid, bidHistory, getAuction, dto } from "../src/auctions.js";
import { requestDeposit, reviewDeposit } from "../src/wallet.js";
import * as O from "../src/orders.js";
import { tick } from "../src/scheduler.js";
import { seedDemo } from "../src/seed.js";

let admin, seller, alice, bob, cat;
const hash = hashPassword("secret123");
const user = (name, role, extra = {}) => {
  const r = run("INSERT INTO users(email, name, password_hash, role, email_verified, created_at) VALUES(?,?,?,?,1,?)", `${name.toLowerCase()}@test.dev`, name, hash, role, now() - 100 * DAY);
  return one("SELECT * FROM users WHERE id = ?", r.lastInsertRowid);
};
const fresh = (id) => one("SELECT * FROM users WHERE id = ?", id);

function newAuction(over = {}) {
  const id = createListing(seller, {
    categoryId: cat, title: "Test camera body", description: "A long enough description for the listing to be accepted.", condition: "Good",
    images: ["/img/products/c1.jpg"], startPrice: 10000, reservePrice: null, minIncrement: 500, durationDays: 3, ...over,
  });
  reviewListing(admin, id, "approve", "");
  return id;
}
const fund = (u, cents = 20000) => requestDeposit(u, { amountCents: cents, method: "card_sandbox" });

beforeEach(() => {
  setClock(null);
  init(":memory:");
  resetSettingsCache();
  seedTemplates();
  setSetting("bid_cooldown_ms", 0);
  admin = user("Admin", "admin");
  seller = user("Seller", "seller");
  alice = user("Alice", "buyer");
  bob = user("Bob", "buyer");
  cat = Number(run("INSERT INTO categories(name, slug, icon) VALUES('Cameras','cameras','camera')").lastInsertRowid);
  run("INSERT INTO warehouses(name,address,city,phone,instructions) VALUES('Hub','1 Dock','Rotterdam','1','Ship after payment.')");
});

describe("bidding rules", () => {
  test("a deposit is required before bidding, and a confirmed deposit enables it automatically", () => {
    const id = newAuction();
    assert.throws(() => placeBid(alice, id, 10000), (e) => e.status === 403 && e.code === "DEPOSIT_REQUIRED");
    fund(alice);
    assert.equal(fresh(alice.id).deposit_cents, 5000);
    assert.equal(fresh(alice.id).wallet_cents, 15000);
    assert.doesNotThrow(() => placeBid(alice, id, 10000));
  });

  test("manual deposits need an admin and enable bidding only once approved", () => {
    const id = newAuction();
    const r = requestDeposit(alice, { amountCents: 6000, method: "bank_transfer", reference: "TX1" });
    assert.equal(r.status, "pending");
    assert.throws(() => placeBid(alice, id, 10000), (e) => e.code === "DEPOSIT_REQUIRED");
    reviewDeposit(admin, r.id, "approve");
    assert.doesNotThrow(() => placeBid(alice, id, 10000));
    assert.equal(fresh(alice.id).wallet_cents, 1000);
  });

  test("a bid below the minimum, from the seller or from the current leader is rejected", () => {
    const id = newAuction();
    fund(alice); fund(bob);
    assert.throws(() => placeBid(alice, id, 9900), /at least/);
    placeBid(alice, id, 10000);
    assert.throws(() => placeBid(bob, id, 10200), /at least/);
    assert.throws(() => placeBid(alice, id, 20000), /already the highest/);
    assert.throws(() => placeBid(seller, id, 20000), (e) => e.status === 403);
    placeBid(bob, id, 10500);
    assert.equal(getAuction(id).current_price, 10500);
    assert.equal(getAuction(id).bid_count, 2);
  });

  test("two people bidding the same amount: only the first one wins", () => {
    const id = newAuction();
    fund(alice); fund(bob);
    placeBid(alice, id, 10000);
    assert.throws(() => placeBid(bob, id, 10000), /at least/);
    assert.equal(getAuction(id).highest_bidder_id, alice.id);
  });

  test("bidders are shown with an anonymous alias only", () => {
    const id = newAuction();
    fund(alice);
    placeBid(alice, id, 10000);
    const h = bidHistory(id);
    assert.equal(h[0].bidder, "a***e");
    assert.ok(!JSON.stringify(dto(getAuction(id))).includes("alice@test.dev"));
    assert.ok(!JSON.stringify(dto(getAuction(id))).includes("seller@test.dev"));
  });

  test("a late bid extends the auction (anti-sniping), an early one does not", () => {
    const id = newAuction();
    fund(alice); fund(bob);
    const end = getAuction(id).end_at;
    placeBid(alice, id, 10000);
    assert.equal(getAuction(id).end_at, end);
    setClock(end - 30_000);
    placeBid(bob, id, 10500);
    assert.equal(getAuction(id).end_at, end + settings().anti_snipe_extension_sec * 1000);
    assert.equal(getAuction(id).extensions, 1);
  });

  test("bids stop at the end time", () => {
    const id = newAuction();
    fund(alice);
    setClock(getAuction(id).end_at + 1000);
    assert.throws(() => placeBid(alice, id, 10000), /not accepting/);
  });

  test("a listing is invisible until an admin approves it", () => {
    const id = createListing(seller, { categoryId: cat, title: "Hidden until approved", description: "x".repeat(40), condition: "New", images: ["/img/products/c1.jpg"], startPrice: 5000, minIncrement: 500, durationDays: 3 });
    assert.equal(getAuction(id).status, "pending");
    fund(alice);
    assert.throws(() => placeBid(alice, id, 5000), /not accepting/);
    reviewListing(admin, id, "approve", "");
    assert.equal(getAuction(id).status, "live");
  });

  test("only the configured durations are allowed", () => {
    assert.throws(() => createListing(seller, { categoryId: cat, title: "Wrong duration", description: "x".repeat(40), condition: "New", images: ["/a.jpg"], startPrice: 5000, minIncrement: 500, durationDays: 4 }), /duration/i);
  });
});

describe("closing and payment", () => {
  function sold({ pay = true } = {}) {
    const id = newAuction({ startPrice: 20000, minIncrement: 1000 });
    fund(alice, 50000);
    placeBid(alice, id, 20000);
    setClock(getAuction(id).end_at + 1000);
    tick();
    const order = one("SELECT * FROM orders WHERE auction_id = ?", id);
    if (pay) O.payOrder(fresh(alice.id), order.id, { name: "Alice", phone: "123456", address: "1 Main Street", city: "Lisbon" });
    return { id, order: one("SELECT * FROM orders WHERE auction_id = ?", id) };
  }

  test("closing picks the winner and creates an order with the commission", () => {
    const { order } = sold({ pay: false });
    assert.equal(order.buyer_id, alice.id);
    assert.equal(order.status, "awaiting_payment");
    assert.equal(order.commission_cents, 2000);
    assert.equal(order.seller_net_cents, 18000);
    assert.equal(order.payment_due_at - now(), 3 * DAY);
  });

  test("the reserve price keeps an item unsold when it is not met", () => {
    const id = newAuction({ reservePrice: 50000 });
    fund(alice);
    placeBid(alice, id, 10000);
    setClock(getAuction(id).end_at + 1000);
    tick();
    assert.equal(getAuction(id).status, "unsold");
    assert.equal(one("SELECT COUNT(*) AS n FROM orders").n, 0);
  });

  test("an auction without bids simply ends unsold", () => {
    const id = newAuction();
    setClock(getAuction(id).end_at + 1000);
    tick();
    assert.equal(getAuction(id).status, "unsold");
  });

  test("full happy path: pay, ship to the warehouse, inspect, same-day payout, deliver", () => {
    const { order } = sold();
    const money = () => fresh(seller.id);
    assert.equal(money().pending_cents, 18000);
    assert.equal(money().earnings_cents, 0);
    assert.throws(() => O.sellerShip(alice, order.id, { courier: "DHL", tracking: "1234" }), /not found/i);
    O.sellerShip(seller, order.id, { courier: "DHL", tracking: "TRACK-1" });
    O.receiveAtWarehouse(admin, order.id, { bin: "A-1", notes: "ok" });
    assert.throws(() => O.createLabel(admin, order.id, { courier: "UPS", tracking: "T-2" }), /packed/i);
    O.inspect(admin, order.id, { result: "passed", notes: "Matches the listing", photos: [] });
    const after = one("SELECT * FROM orders WHERE id = ?", order.id);
    assert.equal(after.payout_status, "released");
    assert.equal(money().earnings_cents, 18000);
    assert.equal(money().pending_cents, 0);
    assert.equal(new Date(after.payout_at).toDateString(), new Date(after.inspected_at).toDateString());
    O.createLabel(admin, order.id, { courier: "UPS", tracking: "OUT-1" });
    O.markDelivered(fresh(alice.id), order.id, true);
    assert.equal(one("SELECT status FROM orders WHERE id = ?", order.id).status, "completed");
    assert.equal(one("SELECT COALESCE(SUM(amount_cents),0) AS n FROM transactions WHERE account='platform'").n, 2000);
  });

  test("the seller cannot ship before the buyer has paid", () => {
    const { order } = sold({ pay: false });
    assert.throws(() => O.sellerShip(seller, order.id, { courier: "DHL", tracking: "1234" }), /payment is confirmed/);
  });

  test("a payment needs enough money in the wallet", () => {
    const id = newAuction({ startPrice: 90000, minIncrement: 1000 });
    fund(alice, 6000);
    placeBid(alice, id, 90000);
    setClock(getAuction(id).end_at + 1000);
    tick();
    const order = one("SELECT * FROM orders WHERE auction_id = ?", id);
    assert.throws(() => O.payOrder(fresh(alice.id), order.id, { name: "A", phone: "12345", address: "1 Main", city: "X" }), (e) => e.code === "LOW_BALANCE");
  });

  test("failed inspection refunds the buyer in full and the seller is not paid", () => {
    const { order } = sold();
    O.sellerShip(seller, order.id, { courier: "DHL", tracking: "TRACK-1" });
    O.receiveAtWarehouse(admin, order.id, {});
    O.inspect(admin, order.id, { result: "failed", notes: "Not as described", photos: [] });
    assert.equal(one("SELECT status FROM orders WHERE id = ?", order.id).status, "rejected_refunded");
    assert.equal(fresh(alice.id).wallet_cents, 45000);
    assert.equal(fresh(seller.id).pending_cents, 0);
    assert.equal(fresh(seller.id).earnings_cents, 0);
    assert.equal(fresh(seller.id).strikes, 1);
    assert.equal(one("SELECT COALESCE(SUM(amount_cents),0) AS n FROM transactions WHERE account='platform'").n, 0);
  });

  test("a dispute resolved for the buyer refunds the order", () => {
    const { order } = sold();
    O.sellerShip(seller, order.id, { courier: "DHL", tracking: "TRACK-1" });
    const d = O.openDispute(fresh(alice.id), order.id, "The item is not what I expected at all.");
    O.postDisputeMessage(admin, d, "We are looking into it.", "buyer");
    O.resolveDispute(admin, d, { outcome: "buyer", resolution: "Refund issued." });
    assert.equal(one("SELECT status FROM orders WHERE id = ?", order.id).status, "refunded");
    assert.equal(fresh(alice.id).wallet_cents, 45000);
  });

  test("the seller's view of an order never contains the buyer's details", () => {
    const { order } = sold();
    const view = JSON.stringify(O.orderDto(O.getOrder(order.id), "seller"));
    assert.ok(!view.includes("alice@test.dev"));
    assert.ok(!view.includes("1 Main Street"));
    assert.ok(!view.includes("Lisbon"));
    const buyerView = JSON.stringify(O.orderDto(O.getOrder(order.id), "buyer"));
    assert.ok(!buyerView.includes("seller@test.dev"));
  });
});

describe("payment deadline, deposit forfeiture and bidding restriction", () => {
  test("missing the deadline forfeits the deposit and blocks bidding for 15 days, then restores it", () => {
    const id = newAuction();
    fund(alice, 5000);
    placeBid(alice, id, 10000);
    const end = getAuction(id).end_at;
    setClock(end + 1000);
    tick();
    const order = one("SELECT * FROM orders WHERE auction_id = ?", id);
    // reminder first
    setClock(order.payment_due_at - 12 * HOUR);
    tick();
    assert.equal(one("SELECT reminder_sent FROM orders WHERE id = ?", order.id).reminder_sent, 1);
    // then the deadline
    setClock(order.payment_due_at + 1000);
    tick();
    assert.equal(one("SELECT status FROM orders WHERE id = ?", order.id).status, "defaulted");
    const u = fresh(alice.id);
    assert.equal(u.deposit_cents, 0);
    assert.equal(u.restricted_until, now() + 15 * DAY);
    assert.equal(one("SELECT COALESCE(SUM(amount_cents),0) AS n FROM transactions WHERE type='forfeit_income'").n, 5000);
    const second = newAuction();
    assert.throws(() => placeBid(u, second, 10000), (e) => e.status === 403);
    // 15 days later the restriction lifts itself; a new deposit is still needed
    setClock(now() + 15 * DAY + 1000);
    tick();
    assert.equal(fresh(alice.id).restricted_until, null);
    const third = newAuction();
    assert.throws(() => placeBid(fresh(alice.id), third, 10000), (e) => e.code === "DEPOSIT_REQUIRED");
    fund(fresh(alice.id), 5000);
    assert.doesNotThrow(() => placeBid(fresh(alice.id), third, 10000));
  });

  test("the rules are configurable: window, restriction length and forfeiture", () => {
    setSetting("payment_window_days", 1);
    setSetting("restriction_days", 2);
    setSetting("forfeit_deposit", 0);
    const id = newAuction();
    fund(alice, 5000);
    placeBid(alice, id, 10000);
    setClock(getAuction(id).end_at + 1000);
    tick();
    const order = one("SELECT * FROM orders WHERE auction_id = ?", id);
    assert.equal(order.payment_due_at - now(), DAY);
    setClock(order.payment_due_at + 1000);
    tick();
    assert.equal(fresh(alice.id).deposit_cents, 5000);
    assert.equal(fresh(alice.id).restricted_until, now() + 2 * DAY);
  });

  test("an admin can lift a restriction early", () => {
    O.addRestriction(admin, bob.id, 10, "Test");
    assert.ok(fresh(bob.id).restricted_until > now());
    const r = one("SELECT id FROM restrictions WHERE user_id = ?", bob.id);
    O.liftRestriction(admin, r.id);
    assert.equal(fresh(bob.id).restricted_until, null);
  });
});

describe("demo data", () => {
  test("the seeded marketplace is consistent: balances equal the ledger and nothing is negative", () => {
    seedDemo({});
    for (const [acct, col] of [["wallet", "wallet_cents"], ["deposit", "deposit_cents"], ["pending", "pending_cents"], ["earnings", "earnings_cents"]]) {
      for (const u of all(`SELECT id, ${col} AS v, (SELECT COALESCE(SUM(amount_cents),0) FROM transactions t WHERE t.user_id = u.id AND t.account = '${acct}') AS s FROM users u`)) {
        assert.equal(u.v, u.s, `${acct} balance of user ${u.id}`);
        assert.ok(u.v >= 0);
      }
    }
    assert.ok(one("SELECT COUNT(*) AS n FROM auctions WHERE status = 'live'").n >= 15);
    assert.equal(one("SELECT COUNT(*) AS n FROM auctions a WHERE a.bid_count != (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id)").n, 0);
  });
});
