// Fills an empty database with a believable marketplace. It runs the real services while the clock is set to
// past moments, so wallets, ledgers, orders and notifications are all consistent with each other.
import { db, one, all, run } from "./db.js";
import { setClock, DAY, HOUR, now, seedTemplates, resetSettingsCache } from "./core.js";
import { hashPassword } from "./auth.js";
import { CATEGORIES, ITEMS, SELLERS, BUYERS } from "./catalog.js";
import { createListing, reviewListing, placeBid, toggleWatch } from "./auctions.js";
import { requestDeposit, reviewDeposit } from "./wallet.js";
import * as O from "./orders.js";
import { activateDue } from "./scheduler.js";

const MIN = 60_000;
const TABLES = [
  "dispute_messages", "disputes", "refunds", "payouts", "order_events", "orders", "restrictions", "notifications", "emails", "email_templates",
  "activity_logs", "settings", "warehouses", "transactions", "deposit_requests", "watchlist", "bids", "auction_history", "auctions", "categories", "users",
];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function wipe() {
  db.pragma("foreign_keys = OFF");
  for (const t of TABLES) run(`DELETE FROM ${t}`);
  run("DELETE FROM sqlite_sequence");
  db.pragma("foreign_keys = ON");
}

const DEMO = { admin: "admin@bidora.demo", seller: "seller@bidora.demo", buyer: "buyer@bidora.demo" };
const slug = (n) => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");

export function seedDemo({ password = "demo1234", adminPassword = null } = {}) {
  const R = rng(20260);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const between = (a, b) => a + R() * (b - a);
  const NOW = Date.now();
  wipe();
  resetSettingsCache();
  setClock(NOW - 130 * DAY);
  seedTemplates();

  run("INSERT INTO warehouses(name, address, city, phone, instructions, active) VALUES(?,?,?,?,?,1)",
    "Bidora Fulfilment Hub", "Unit 4, 1200 Harbor Way", "Rotterdam, NL", "+31 10 555 0142",
    "Ship only after the buyer's payment is confirmed. Write the order reference on the outside of the parcel, pack the item securely and add the tracking number in your dashboard. Never ship to the buyer directly.");
  const catId = {};
  CATEGORIES.forEach(([name, slugName, icon], i) => {
    catId[slugName] = Number(run("INSERT INTO categories(name, slug, icon, sort) VALUES(?,?,?,?)", name, slugName, icon, i).lastInsertRowid);
  });

  // ---------------------------------------------------------------- people
  const hash = hashPassword(password);
  const addUser = (name, email, role, extra = {}) => {
    const r = run(
      `INSERT INTO users(email, name, password_hash, role, email_verified, phone, city, address, business_name, bio, is_demo, created_at)
       VALUES(?,?,?,?,1,?,?,?,?,?,?,?)`,
      email, name, extra.hash ?? hash, role, extra.phone ?? `+${Math.floor(between(30, 60))} ${Math.floor(between(100, 999))} ${Math.floor(between(1000, 9999))}`,
      extra.city ?? null, extra.address ?? `${Math.floor(between(2, 98))} ${pick(["Market", "Harbor", "Garden", "Station", "Linden"])} Street`,
      extra.business ?? null, extra.bio ?? null, extra.demo ? 1 : 0, extra.at ?? NOW - 100 * DAY,
    );
    return one("SELECT * FROM users WHERE id = ?", r.lastInsertRowid);
  };
  const admin = addUser("Avery Stone", DEMO.admin, "admin", { demo: 1, city: "Rotterdam", at: NOW - 140 * DAY });
  if (adminPassword) addUser("Marketplace Admin", "admin@bidora.app", "admin", { hash: hashPassword(adminPassword), at: NOW - 140 * DAY });

  const sellers = SELLERS.map(([name, business, city], i) =>
    addUser(name, i === 0 ? DEMO.seller : `${slug(name)}@sellers.bidora.demo`, "seller", {
      demo: i === 0, business, city, at: NOW - (125 - i * 5) * DAY,
      bio: `${business}: carefully described items, honest photos, fast handover to the warehouse.`,
    }));
  const buyers = BUYERS.map(([name, city], i) =>
    addUser(name, i === 0 ? DEMO.buyer : `${slug(name)}@bidora.demo`, "buyer", { demo: i === 0, city, at: NOW - (110 - i) * DAY }));
  const alex = buyers[0];
  const defaulter = buyers[5];
  const spare = [buyers[6], buyers[7]]; // reserved for scripted roles
  const pool = buyers.filter((b) => ![defaulter, ...spare].includes(b));

  // security deposits (instant sandbox top-ups)
  for (const b of buyers) {
    setClock(b.created_at + HOUR);
    requestDeposit(b, { amountCents: 5000 + Math.floor(between(0, 4)) * 5000, method: "card_sandbox" });
  }
  setClock(alex.created_at + 2 * HOUR);
  requestDeposit(alex, { amountCents: 120000, method: "card_sandbox" });

  // ---------------------------------------------------------------- helpers
  const incOf = (cents) => (cents < 10000 ? 200 : cents < 30000 ? 500 : cents < 60000 ? 1000 : 2500);
  const durationFor = (days) => [3, 5, 7, 14].find((d) => d >= days) ?? 14;
  const sellerMap = { watches: [1], cameras: [2], audio: [5], tech: [5], sneakers: [3], bags: [4, 9], jewelry: [9, 4], instruments: [7], cycling: [8], art: [4], home: [6], gaming: [7] };
  const sellerFor = (item, nora) => (nora ? sellers[0] : sellers[pick(sellerMap[item[1]])]);
  const used = new Set();
  const take = (n) => {
    const out = [];
    while (out.length < n) {
      const i = Math.floor(R() * ITEMS.length);
      if (!used.has(i)) { used.add(i); out.push(ITEMS[i]); }
    }
    return out;
  };

  const make = (item, seller, startAt, days, { approve = true, reserve = null } = {}) => {
    setClock(Math.min(startAt - Math.floor(between(2, 20)) * HOUR, NOW - 1000));
    const start = item[3] * 100;
    const id = createListing(seller, {
      categoryId: catId[item[1]], title: item[0], condition: item[2], images: item[4], startPrice: start,
      reservePrice: reserve === true ? Math.round((start * 1.35) / 500) * 500 : reserve, minIncrement: incOf(start), durationDays: days, startAt,
      description: `${item[5]}\n\nThe item ships to the Bidora warehouse, where it is inspected and photographed before it is sent to you. Photos show the actual item for sale.`,
    });
    if (approve) {
      setClock(Math.min(startAt - 5 * MIN, NOW - 1000));
      reviewListing(admin, id, "approve", "");
    }
    return id;
  };

  const bidFlow = (id, seller, { n, from, to, winner = null, include = null }) => {
    const a = one("SELECT * FROM auctions WHERE id = ?", id);
    const times = Array.from({ length: n }, () => between(from, to)).sort((x, y) => x - y);
    const seq = [];
    for (let i = 0; i < n; i++) {
      let who;
      do who = pick(pool); while (who === seq[i - 1]);
      seq.push(who);
    }
    if (include && n >= 3) seq[Math.max(0, n - 3)] = include;
    if (winner && n >= 1) {
      seq[n - 1] = winner;
      if (n >= 2 && seq[n - 2] === winner) seq[n - 2] = pool.find((p) => p !== winner);
    } else if (include && n >= 1 && seq[n - 1] === include) seq[n - 1] = pool.find((p) => p !== include);
    for (let i = 0; i < n; i++) {
      setClock(times[i]);
      const cur = one("SELECT current_price, bid_count, start_price, min_increment FROM auctions WHERE id = ?", id);
      const min = cur.bid_count ? cur.current_price + cur.min_increment : cur.start_price;
      const amount = min + cur.min_increment * Math.floor(between(0, 3));
      try { placeBid(seq[i], id, amount, "203.0.113." + Math.floor(between(2, 250))); } catch (e) { /* skip a bid that breaks a rule */ }
    }
    return a;
  };

  const topUp = (buyer, cents, at) => { setClock(at); requestDeposit(buyer, { amountCents: cents, method: "card_sandbox" }); };

  // ---------------------------------------------------------------- history: auctions that already ended
  const soldPlan = [
    ["completed", 21, 1, true], ["completed", 18, 0, false, alex], ["completed", 15, 1, false], ["completed", 25, 0, false],
    ["completed", 11, 1, false], ["delivered", 8, 0, false], ["shipped", 6, 0, false], ["shipped", 5, 0, false],
    ["packing", 4.5, 0, false], ["received", 4, 0, false], ["in_transit", 3, 0, false], ["awaiting_shipment", 2.2, 0, false],
    ["awaiting_payment", 1.2, 0, false, alex], ["awaiting_payment", 0.3, 0, false], ["defaulted", 6.5, 0, false, defaulter], ["rejected_refunded", 12, 0, false],
    ["completed", 28, 0, false], ["completed", 31, 0, false], ["completed", 34, 0, false], ["completed", 37, 0, false],
    ["completed", 40, 0, false], ["completed", 43, 0, false], ["completed", 46, 0, false], ["completed", 50, 0, false],
  ];
  const orders = [];
  soldPlan.forEach(([target, daysAgo, snipe, nora, forcedWinner], k) => {
    const [item] = take(1);
    const seller = sellerFor(item, nora);
    const C = NOW - daysAgo * DAY;
    const days = [3, 5, 7, 14][k % 4];
    const startAt = C - days * DAY;
    const id = make(item, seller, startAt, days);
    setClock(startAt);
    activateDue();
    const winner = forcedWinner ?? pick(pool);
    bidFlow(id, seller, { n: 4 + Math.floor(between(0, 9)), from: startAt + 30 * MIN, to: C - 20 * MIN, winner });
    if (k === 5) { // a bid in the last minute extends the auction (anti-sniping)
      const cur = one("SELECT end_at FROM auctions WHERE id = ?", id);
      setClock(cur.end_at - 50_000);
      const a2 = one("SELECT current_price, min_increment FROM auctions WHERE id = ?", id);
      const sniper = pick(pool.filter((p) => p.id !== one("SELECT highest_bidder_id AS h FROM auctions WHERE id = ?", id).h));
      try { placeBid(sniper, id, a2.current_price + a2.min_increment, "198.51.100.7"); } catch {}
    }
    const endAt = one("SELECT end_at FROM auctions WHERE id = ?", id).end_at;
    setClock(endAt + 1000);
    const out = O.closeAuction(id);
    if (!out?.sold) return;
    const o = one("SELECT * FROM orders WHERE auction_id = ?", id);
    const closeAt = endAt;
    orders.push({ o, target, closeAt, k });
    const buyer = one("SELECT * FROM users WHERE id = ?", o.buyer_id);
    const step = (offset) => setClock(closeAt + offset);
    const ship = { name: buyer.name, phone: buyer.phone, address: buyer.address, city: buyer.city };
    if (target === "defaulted") { setClock(o.payment_due_at + MIN); O.defaultOrder(o.id); return; }
    if (target === "awaiting_payment") return;
    topUp(buyer, o.amount_cents + 5000, closeAt + 30 * MIN);
    step(Math.floor(between(1, 9)) * HOUR);
    O.payOrder(buyer, o.id, ship);
    if (target === "awaiting_shipment") return;
    step(DAY + 2 * HOUR);
    O.sellerShip(seller, o.id, { courier: pick(["DHL", "UPS", "FedEx"]), tracking: `1Z${Math.floor(between(1e9, 9e9))}` });
    if (target === "in_transit") return;
    step(3 * DAY);
    O.receiveAtWarehouse(admin, o.id, { bin: `${pick(["A", "B", "C"])}-${Math.floor(between(1, 12))}-${Math.floor(between(1, 5))}`, notes: "Parcel arrived intact." });
    if (target === "received") return;
    step(3 * DAY + 5 * HOUR);
    if (target === "rejected_refunded") {
      O.inspect(admin, o.id, { result: "failed", notes: "The item does not match the listing: visible scratches that were not shown in the photos.", photos: [item[4][0]] });
      return;
    }
    O.inspect(admin, o.id, { result: "passed", notes: "Authentic, matches the description. Photographed and stored.", photos: item[4].slice(0, 2) });
    if (target === "packing") return;
    step(4 * DAY);
    O.createLabel(admin, o.id, { courier: pick(["DHL Express", "UPS", "FedEx"]), tracking: `JD${Math.floor(between(1e9, 9e9))}` });
    if (target === "shipped") return;
    step(7 * DAY);
    O.markDelivered(admin, o.id, false);
    if (target === "delivered") return;
    step(7 * DAY + 20 * HOUR);
    O.markDelivered(buyer, o.id, true);
  });

  // disputes on a few of them
  const byK = Object.fromEntries(orders.map((x) => [x.k, x]));
  if (byK[7]) { // open dispute on a shipped order
    const b = one("SELECT * FROM users WHERE id = ?", byK[7].o.buyer_id);
    setClock(NOW - 2 * DAY);
    const d = O.openDispute(b, byK[7].o.id, "The package shows signs of damage on the outside. Please confirm the item inside is intact before it ships.");
    setClock(NOW - 2 * DAY + 3 * HOUR);
    O.postDisputeMessage(admin, d, "Thanks for letting us know. We re-inspected the item, it is intact and was repacked in a new box.", "buyer");
    O.postDisputeMessage(admin, d, "Internal: photos from inspection show original packaging undamaged. Courier damage possible.", "internal");
  }
  if (byK[3]) { // resolved for the buyer: refunded
    const b = one("SELECT * FROM users WHERE id = ?", byK[3].o.buyer_id);
    setClock(byK[3].closeAt + 9 * DAY);
    const d = O.openDispute(b, byK[3].o.id, "The item stopped working after two days.");
    setClock(byK[3].closeAt + 9 * DAY + 2 * HOUR);
    O.postDisputeMessage(admin, d, "We are sorry about this. We will review the inspection report.", "buyer");
    setClock(byK[3].closeAt + 10 * DAY);
    O.resolveDispute(admin, d, { outcome: "buyer", resolution: "Item reported faulty after delivery. Full refund issued to the wallet." });
  }
  if (byK[2]) { // resolved for the seller
    const b = one("SELECT * FROM users WHERE id = ?", byK[2].o.buyer_id);
    setClock(byK[2].closeAt + 8 * DAY);
    const d = O.openDispute(b, byK[2].o.id, "I think the colour is slightly different from the photos.");
    setClock(byK[2].closeAt + 9 * DAY);
    O.resolveDispute(admin, d, { outcome: "seller", resolution: "Inspection photos match the listing. The order stands." });
  }

  // ---------------------------------------------------------------- live auctions
  const remaining = [4 * MIN, 11 * MIN, 38 * MIN, 95 * MIN, 3 * HOUR, 6 * HOUR, 9 * HOUR, 15 * HOUR, 22 * HOUR, 31 * HOUR, 2 * DAY, 2.6 * DAY, 3.4 * DAY, 4.5 * DAY, 5.5 * DAY, 6.5 * DAY, 9 * DAY, 11 * DAY, 13 * DAY];
  const liveIds = [];
  remaining.forEach((rem, k) => {
    const [item] = take(1);
    const seller = sellerFor(item, k < 3 || k === 9);
    const days = durationFor(rem / DAY + 0.4);
    const endAt = NOW + rem;
    const startAt = endAt - days * DAY;
    const id = make(item, seller, startAt, days, { reserve: k % 3 === 0 ? true : null });
    setClock(startAt);
    activateDue();
    const age = NOW - startAt;
    const n = k === 18 ? 0 : k === 16 ? 1 : Math.min(18, Math.max(2, Math.floor(age / DAY) * 2 + Math.floor(between(2, 7))));
    bidFlow(id, seller, {
      n, from: startAt + 40 * MIN, to: NOW - (k < 4 ? 1 : 15) * MIN,
      winner: k === 3 ? alex : null, include: k === 7 || k === 11 ? alex : null,
    });
    liveIds.push(id);
  });

  // ---------------------------------------------------------------- unsold, scheduled, review queue
  const unsold = [[null, 6, 3], [true, 5, 6], [null, 4, 9]];
  unsold.forEach(([reserve, daysAgo, bids], k) => {
    const [item] = take(1);
    const seller = sellerFor(item, false);
    const endAt = NOW - daysAgo * DAY;
    const startAt = endAt - 5 * DAY;
    const id = make(item, seller, startAt, 5, { reserve: reserve ? Math.round(item[3] * 100 * 6) : null });
    setClock(startAt); activateDue();
    if (k === 1) bidFlow(id, seller, { n: bids, from: startAt + 2 * HOUR, to: endAt - HOUR });
    setClock(endAt + 1000);
    O.closeAuction(id);
  });
  for (const hrs of [6, 20, 40]) {
    const [item] = take(1);
    make(item, sellerFor(item, false), NOW + hrs * HOUR, 7);
  }
  const queue = [take(1)[0], take(1)[0], take(1)[0], take(1)[0]];
  queue.forEach((item, k) => {
    setClock(NOW - Math.floor(between(1, 30)) * HOUR);
    createListing(sellerFor(item, k < 2), {
      categoryId: catId[item[1]], title: item[0], condition: item[2], images: item[4], startPrice: item[3] * 100, reservePrice: null,
      minIncrement: incOf(item[3] * 100), durationDays: [5, 7, 7, 3][k], startAt: NOW + 2 * HOUR, description: `${item[5]}\n\nThe item ships to the Bidora warehouse for inspection before it is sent to the buyer.`,
    });
  });
  const [changeItem] = take(1);
  { const id = make(changeItem, sellers[0], NOW + DAY, 7, { approve: false });
    setClock(NOW - 5 * HOUR); reviewListing(admin, id, "changes", "Please add a close-up photo of the clasp and the serial number, then submit again."); }
  const [rejectItem] = take(1);
  { const id = make(rejectItem, sellers[5], NOW + DAY, 5, { approve: false });
    setClock(NOW - 9 * HOUR); reviewListing(admin, id, "reject", "Replica items are not allowed on Bidora."); }
  const [suspItem] = take(1);
  { const days = 7; const startAt = NOW - 2 * DAY; const id = make(suspItem, sellers[8], startAt, days);
    setClock(startAt); activateDue(); bidFlow(id, sellers[8], { n: 3, from: startAt + HOUR, to: NOW - 6 * HOUR });
    setClock(NOW - 3 * HOUR); reviewListing(admin, id, "suspend", "Under review after a buyer report about the photos."); }

  // ---------------------------------------------------------------- money in progress, restrictions, watchlists
  setClock(NOW - 6 * HOUR);
  const pending1 = requestDeposit(buyers[12], { amountCents: 25000, method: "bank_transfer", reference: "TRX-88412" });
  setClock(NOW - 3 * HOUR);
  const pending2 = requestDeposit(buyers[13], { amountCents: 10000, method: "mobile_wallet", reference: "MW-20931" });
  setClock(NOW - 20 * MIN);
  requestDeposit(buyers[14], { amountCents: 7500, method: "bank_transfer", reference: "TRX-88777" });
  setClock(NOW - 2 * DAY);
  const rej = requestDeposit(buyers[15], { amountCents: 6000, method: "bank_transfer", reference: "TRX-77000" });
  setClock(NOW - 2 * DAY + HOUR);
  reviewDeposit(admin, rej.id, "reject", "The transfer reference could not be found.");
  setClock(NOW - 2 * DAY);
  O.addRestriction(admin, spare[1].id, 7, "Suspicious bidding pattern, under review.");

  setClock(NOW - 10 * MIN);
  liveIds.slice(0, 12).forEach((id, i) => { if (i % 2 === 0 || i === 3) toggleWatch(alex, id); });
  for (const b of pool.slice(0, 14)) {
    for (let w = 0; w < 3; w++) { try { toggleWatch(b, liveIds[Math.floor(R() * liveIds.length)]); } catch {} }
  }

  // ---------------------------------------------------------------- finishing touches
  setClock(null);
  all("SELECT id FROM auctions").forEach(({ id }) => run("UPDATE auctions SET views = ? WHERE id = ?", Math.floor(between(30, 900)), id));
  all("SELECT id FROM auctions WHERE status = 'live' ORDER BY bid_count DESC LIMIT 6").forEach(({ id }) => run("UPDATE auctions SET featured = 1 WHERE id = ?", id));
  run("UPDATE notifications SET read = 1 WHERE created_at < ?", NOW - 3 * DAY);
  return { users: one("SELECT COUNT(*) AS n FROM users").n, auctions: one("SELECT COUNT(*) AS n FROM auctions").n, bids: one("SELECT COUNT(*) AS n FROM bids").n, orders: one("SELECT COUNT(*) AS n FROM orders").n };
}
