import { one, all, run, tx } from "./db.js";
import { DAY, bad, forbidden, notFound, now, settings, notify, move, money, logActivity, emit } from "./core.js";
import { alias, history } from "./auctions.js";

export const STATUS_LABEL = {
  awaiting_payment: "Awaiting payment",
  defaulted: "Payment missed",
  awaiting_shipment: "Seller to ship",
  in_transit: "On the way to warehouse",
  received: "Received, awaiting inspection",
  packing: "Passed, packing",
  shipped: "Shipped to buyer",
  delivered: "Delivered",
  completed: "Completed",
  rejected_refunded: "Failed inspection, refunded",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

export function warehouse() {
  return one("SELECT * FROM warehouses WHERE active = 1 ORDER BY id LIMIT 1");
}

export function orderEvent(orderId, actorId, event, note = null) {
  run("INSERT INTO order_events(order_id, actor_id, event, note, created_at) VALUES(?,?,?,?,?)", orderId, actorId ?? null, event, note, now());
}

const ORDER_SQL = `
  SELECT o.*, a.title, a.images, a.condition, a.bid_count,
         b.name AS buyer_name, b.email AS buyer_email, s.name AS seller_name, s.email AS seller_email, s.business_name AS seller_business,
         (SELECT COUNT(*) FROM disputes d WHERE d.order_id = o.id AND d.status IN ('open','investigating')) AS open_disputes
  FROM orders o JOIN auctions a ON a.id = o.auction_id JOIN users b ON b.id = o.buyer_id JOIN users s ON s.id = o.seller_id`;

export const getOrder = (id) => one(`${ORDER_SQL} WHERE o.id = ?`, id);
export const orderRows = (where = "", ...args) => all(`${ORDER_SQL} ${where}`, ...args);

// Each role sees only its part of the order. The buyer and the seller never see each other's details.
export function orderDto(o, role) {
  const images = JSON.parse(o.images || "[]");
  const base = {
    id: o.id,
    code: o.code,
    auctionId: o.auction_id,
    title: o.title,
    image: images[0] ?? null,
    status: o.status,
    statusLabel: STATUS_LABEL[o.status] ?? o.status,
    amountCents: o.amount_cents,
    createdAt: o.created_at,
    paymentDueAt: o.payment_due_at,
    paidAt: o.paid_at,
    disputeOpen: o.open_disputes > 0,
  };
  if (role === "buyer") {
    return {
      ...base,
      shipTo: o.ship_name ? { name: o.ship_name, phone: o.ship_phone, address: o.ship_address, city: o.ship_city } : null,
      outboundCourier: o.outbound_courier,
      outboundTracking: o.outbound_tracking,
      shippedAt: o.shipped_at,
      deliveredAt: o.delivered_at,
      inspectionResult: o.inspection_result,
      receivedAt: o.received_at,
    };
  }
  if (role === "seller") {
    return {
      ...base,
      commissionCents: o.commission_cents,
      sellerNetCents: o.seller_net_cents,
      inboundCourier: o.inbound_courier,
      inboundTracking: o.inbound_tracking,
      sellerShippedAt: o.seller_shipped_at,
      receivedAt: o.received_at,
      inspectionResult: o.inspection_result,
      inspectionNotes: o.inspection_notes,
      payoutStatus: o.payout_status,
      payoutAt: o.payout_at,
      warehouse: ["awaiting_shipment", "in_transit"].includes(o.status) ? warehouse() : undefined,
      shipRef: o.code,
    };
  }
  return {
    ...base,
    buyer: { id: o.buyer_id, name: o.buyer_name, email: o.buyer_email },
    seller: { id: o.seller_id, name: o.seller_business || o.seller_name, email: o.seller_email },
    commissionCents: o.commission_cents,
    sellerNetCents: o.seller_net_cents,
    shipTo: o.ship_name ? { name: o.ship_name, phone: o.ship_phone, address: o.ship_address, city: o.ship_city } : null,
    inboundCourier: o.inbound_courier,
    inboundTracking: o.inbound_tracking,
    sellerShippedAt: o.seller_shipped_at,
    receivedAt: o.received_at,
    binLocation: o.bin_location,
    inspectionResult: o.inspection_result,
    inspectionNotes: o.inspection_notes,
    inspectionPhotos: JSON.parse(o.inspection_photos || "[]"),
    inspectedAt: o.inspected_at,
    packagingStatus: o.packaging_status,
    outboundCourier: o.outbound_courier,
    outboundTracking: o.outbound_tracking,
    labelCode: o.label_code,
    shippedAt: o.shipped_at,
    deliveredAt: o.delivered_at,
    completedAt: o.completed_at,
    payoutStatus: o.payout_status,
    payoutAt: o.payout_at,
  };
}

export function orderTimeline(orderId) {
  return all(
    "SELECT e.event, e.note, e.created_at AS at, u.name AS actor FROM order_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.order_id = ? ORDER BY e.id",
    orderId,
  );
}

// ------------------------------------------------------------------ auction closing -> winner -> order
export function closeAuction(auctionId) {
  const cfg = settings();
  let outcome = null;
  tx(() => {
    const a = one("SELECT * FROM auctions WHERE id = ?", auctionId);
    if (!a || a.status !== "live" || a.end_at > now()) return;
    const reserveOk = a.reserve_price == null || a.current_price >= a.reserve_price;
    if (a.bid_count > 0 && reserveOk) {
      const commission = Math.round((a.current_price * cfg.commission_pct) / 100);
      const due = now() + cfg.payment_window_days * DAY;
      const r = run(
        `INSERT INTO orders(code, auction_id, buyer_id, seller_id, amount_cents, commission_cents, seller_net_cents, status, payment_due_at, created_at)
         VALUES('tmp', ?,?,?,?,?,?, 'awaiting_payment', ?, ?)`,
        a.id, a.highest_bidder_id, a.seller_id, a.current_price, commission, a.current_price - commission, due, now(),
      );
      const id = Number(r.lastInsertRowid);
      const code = `BX-${new Date().getUTCFullYear()}-${String(id).padStart(5, "0")}`;
      run("UPDATE orders SET code = ? WHERE id = ?", code, id);
      run("UPDATE auctions SET status='sold', closed_at=? WHERE id=?", now(), a.id);
      history(a.id, null, "closed", `Won at ${money(a.current_price)}`);
      orderEvent(id, null, "order_created", `Winning bid ${money(a.current_price)}`);
      notify(a.highest_bidder_id, "won", { title: a.title, amount: money(a.current_price), days: cfg.payment_window_days }, `/account/orders/${id}`);
      notify(a.seller_id, "new_bid", { title: a.title, amount: money(a.current_price), bidder: "the winner" }, `/seller/orders`);
      outcome = { sold: true, winnerId: a.highest_bidder_id, orderId: id, price: a.current_price };
    } else {
      run("UPDATE auctions SET status='unsold', closed_at=? WHERE id=?", now(), a.id);
      history(a.id, null, "closed", a.bid_count ? "Reserve price not met" : "No bids");
      outcome = { sold: false };
    }
  });
  if (outcome) {
    emit(`auction:${auctionId}`, "ended", { auctionId, ...outcome, winner: undefined });
    emit("auctions", "auction:update", { id: auctionId, status: outcome.sold ? "sold" : "unsold" });
    emit("admin", "admin:queue", { kind: "order" });
  }
  return outcome;
}

// ------------------------------------------------------------------ buyer pays
export function payOrder(buyer, orderId, ship) {
  tx(() => {
    const o = one("SELECT o.*, a.title FROM orders o JOIN auctions a ON a.id=o.auction_id WHERE o.id = ?", orderId);
    if (!o || o.buyer_id !== buyer.id) throw notFound("Order not found.");
    if (o.status !== "awaiting_payment") throw bad("This order is not waiting for payment.");
    if (o.payment_due_at <= now()) throw bad("The payment window has closed.");
    const u = one("SELECT wallet_cents FROM users WHERE id = ?", buyer.id);
    if (u.wallet_cents < o.amount_cents) throw bad(`Your wallet balance is too low. Add ${money(o.amount_cents - u.wallet_cents)} first.`, { code: "LOW_BALANCE", missing: o.amount_cents - u.wallet_cents });
    move({ userId: buyer.id, account: "wallet", type: "payment", amount: -o.amount_cents, refType: "order", refId: o.id, note: `Payment for ${o.code}` });
    move({ userId: o.seller_id, account: "pending", type: "sale_pending", amount: o.seller_net_cents, refType: "order", refId: o.id, note: `Sale ${o.code}` });
    move({ account: "platform", type: "commission", amount: o.commission_cents, refType: "order", refId: o.id, note: `Commission ${o.code}` });
    run(
      "UPDATE orders SET status='awaiting_shipment', paid_at=?, ship_name=?, ship_phone=?, ship_address=?, ship_city=? WHERE id=?",
      now(), ship.name, ship.phone, ship.address, ship.city, o.id,
    );
    orderEvent(o.id, buyer.id, "paid", `Paid ${money(o.amount_cents)} from wallet`);
    notify(buyer.id, "payment_received", { amount: money(o.amount_cents), title: o.title }, `/account/orders/${o.id}`);
    notify(o.seller_id, "ship_instructions", { title: o.title }, `/seller/orders`);
  });
  emit("admin", "admin:queue", { kind: "order" });
}

// ------------------------------------------------------------------ seller ships to the warehouse
export function sellerShip(seller, orderId, { courier, tracking }) {
  tx(() => {
    const o = one("SELECT * FROM orders WHERE id = ?", orderId);
    if (!o || o.seller_id !== seller.id) throw notFound("Order not found.");
    if (o.status !== "awaiting_shipment") throw bad("Ship only after the buyer's payment is confirmed.");
    run("UPDATE orders SET status='in_transit', inbound_courier=?, inbound_tracking=?, seller_shipped_at=? WHERE id=?", courier, tracking, now(), o.id);
    orderEvent(o.id, seller.id, "seller_shipped", `${courier} ${tracking}`);
  });
  emit("admin", "admin:queue", { kind: "warehouse" });
}

// ------------------------------------------------------------------ warehouse
export function receiveAtWarehouse(admin, orderId, { bin, notes }) {
  tx(() => {
    const o = getOrder(orderId);
    if (!o) throw notFound();
    if (o.status !== "in_transit") throw bad("This order has not been shipped by the seller yet.");
    run("UPDATE orders SET status='received', received_at=?, bin_location=? WHERE id=?", now(), bin || null, o.id);
    orderEvent(o.id, admin.id, "received", notes || `Stored at ${bin || "intake"}`);
    notify(o.seller_id, "warehouse_received", { title: o.title }, "/seller/orders");
  });
  logActivity(admin, "warehouse.receive", "order", orderId, { bin });
}

export function inspect(admin, orderId, { result, notes, photos }) {
  tx(() => {
    const o = getOrder(orderId);
    if (!o) throw notFound();
    if (o.status !== "received") throw bad("Receive the item at the warehouse before inspecting it.");
    run("UPDATE orders SET inspection_result=?, inspection_notes=?, inspection_photos=?, inspected_at=? WHERE id=?", result, notes || null, JSON.stringify(photos ?? []), now(), o.id);
    if (result === "passed") {
      run("UPDATE orders SET status='packing', packaging_status='pending' WHERE id=?", o.id);
      orderEvent(o.id, admin.id, "inspection_passed", notes);
      notify(o.seller_id, "inspection_result", { title: o.title, result: "approved", note: notes || "" }, "/seller/orders");
      notify(o.buyer_id, "warehouse_received", { title: o.title }, `/account/orders/${o.id}`);
      if (settings().auto_release_payout) releasePayoutTx(admin, o);
      else run("UPDATE orders SET payout_status='pending' WHERE id=?", o.id);
    } else {
      // Item failed: the buyer gets everything back and the seller is not paid.
      run("UPDATE orders SET status='rejected_refunded', payout_status='withheld' WHERE id=?", o.id);
      orderEvent(o.id, admin.id, "inspection_failed", notes);
      refundTx(admin, o, o.amount_cents, `Inspection failed. ${notes || ""}`.trim(), true);
      run("UPDATE users SET strikes = strikes + 1 WHERE id = ?", o.seller_id);
      notify(o.seller_id, "inspection_result", { title: o.title, result: "rejected", note: notes || "" }, "/seller/orders");
    }
  });
  logActivity(admin, `warehouse.inspection_${result}`, "order", orderId, { notes });
}

function releasePayoutTx(admin, o) {
  if (o.payout_status === "released") throw bad("The payout was already released.");
  move({ userId: o.seller_id, account: "pending", type: "payout_release", amount: -o.seller_net_cents, refType: "order", refId: o.id, note: `Release ${o.code}`, by: admin?.id });
  move({ userId: o.seller_id, account: "earnings", type: "payout", amount: o.seller_net_cents, refType: "order", refId: o.id, note: `Payout ${o.code}`, by: admin?.id });
  run("UPDATE orders SET payout_status='released', payout_at=? WHERE id=?", now(), o.id);
  run("INSERT INTO payouts(order_id, seller_id, amount_cents, status, method, created_at) VALUES(?,?,?, 'released', 'wallet', ?)", o.id, o.seller_id, o.seller_net_cents, now());
  orderEvent(o.id, admin?.id, "payout_released", money(o.seller_net_cents));
  notify(o.seller_id, "payout_released", { amount: money(o.seller_net_cents), title: o.title }, "/seller/earnings");
}
export function releasePayout(admin, orderId) {
  tx(() => {
    const o = getOrder(orderId);
    if (!o) throw notFound();
    if (o.inspection_result !== "passed") throw bad("The item must pass inspection first.");
    releasePayoutTx(admin, o);
  });
  logActivity(admin, "payout.release", "order", orderId);
}

export function setPackaging(admin, orderId, status) {
  const o = getOrder(orderId);
  if (!o) throw notFound();
  if (o.status !== "packing") throw bad("Only items that passed inspection can be packed.");
  run("UPDATE orders SET packaging_status=? WHERE id=?", status, o.id);
  orderEvent(o.id, admin.id, `packaging_${status}`);
}

export function createLabel(admin, orderId, { courier, tracking }) {
  tx(() => {
    const o = getOrder(orderId);
    if (!o) throw notFound();
    if (o.status !== "packing") throw bad("The item must be packed before it can ship.");
    run("UPDATE orders SET status='shipped', packaging_status='packed', outbound_courier=?, outbound_tracking=?, label_code=?, shipped_at=? WHERE id=?",
      courier, tracking, `LBL-${o.code.slice(3)}`, now(), o.id);
    orderEvent(o.id, admin.id, "shipped", `${courier} ${tracking}`);
    notify(o.buyer_id, "dispatched", { title: o.title, courier, tracking }, `/account/orders/${o.id}`);
  });
  logActivity(admin, "order.ship", "order", orderId, { courier, tracking });
}

export function markDelivered(actor, orderId, byBuyer = false) {
  tx(() => {
    const o = getOrder(orderId);
    if (!o) throw notFound();
    if (byBuyer && o.buyer_id !== actor.id) throw notFound("Order not found.");
    if (!["shipped", "delivered"].includes(o.status)) throw bad("This order has not shipped yet.");
    if (byBuyer) {
      run("UPDATE orders SET status='completed', delivered_at=COALESCE(delivered_at, ?), completed_at=? WHERE id=?", now(), now(), o.id);
      orderEvent(o.id, actor.id, "delivery_confirmed", "Confirmed by the buyer");
    } else {
      run("UPDATE orders SET status='delivered', delivered_at=? WHERE id=?", now(), o.id);
      orderEvent(o.id, actor.id, "delivered", "Marked delivered by the courier record");
    }
    notify(o.buyer_id, "delivered", { title: o.title }, `/account/orders/${o.id}`);
  });
}

// ------------------------------------------------------------------ refunds
function refundTx(admin, o, amount, reason, inspectionFail = false) {
  if (!inspectionFail && !["awaiting_shipment", "in_transit", "received", "packing", "shipped", "delivered", "completed"].includes(o.status)) {
    throw bad("There is no payment to refund on this order.");
  }
  if (amount <= 0 || amount > o.amount_cents) throw bad("Invalid refund amount.");
  move({ userId: o.buyer_id, account: "wallet", type: "refund", amount, refType: "order", refId: o.id, note: reason || `Refund ${o.code}`, by: admin?.id });
  move({ account: "platform", type: "commission_reversal", amount: -o.commission_cents, refType: "order", refId: o.id, note: `Reversal ${o.code}` });
  if (o.payout_status === "released") {
    const s = one("SELECT earnings_cents FROM users WHERE id = ?", o.seller_id);
    if (s.earnings_cents < o.seller_net_cents) throw bad("The seller has already withdrawn this payout.");
    move({ userId: o.seller_id, account: "earnings", type: "payout_reversal", amount: -o.seller_net_cents, refType: "order", refId: o.id, note: `Reversal ${o.code}` });
  } else {
    move({ userId: o.seller_id, account: "pending", type: "sale_reversal", amount: -o.seller_net_cents, refType: "order", refId: o.id, note: `Reversal ${o.code}` });
  }
  run("INSERT INTO refunds(order_id, user_id, amount_cents, reason, status, processed_by, created_at) VALUES(?,?,?,?, 'completed', ?, ?)", o.id, o.buyer_id, amount, reason || null, admin?.id ?? null, now());
  notify(o.buyer_id, "refund", { amount: money(amount), note: reason || "" }, `/account/orders/${o.id}`);
}
export function refundOrder(admin, orderId, reason) {
  tx(() => {
    const o = getOrder(orderId);
    if (!o) throw notFound();
    if (["refunded", "rejected_refunded"].includes(o.status)) throw bad("This order was already refunded.");
    refundTx(admin, o, o.amount_cents, reason);
    run("UPDATE orders SET status='refunded', payout_status=CASE WHEN payout_status='released' THEN 'reversed' ELSE 'withheld' END WHERE id=?", o.id);
    orderEvent(o.id, admin.id, "refunded", reason);
  });
  logActivity(admin, "order.refund", "order", orderId, { reason });
}

// ------------------------------------------------------------------ disputes
export function openDispute(user, orderId, reason) {
  let id;
  tx(() => {
    const o = getOrder(orderId);
    if (!o || (o.buyer_id !== user.id && o.seller_id !== user.id)) throw notFound("Order not found.");
    if (!["awaiting_shipment", "in_transit", "received", "packing", "shipped", "delivered", "completed"].includes(o.status)) throw bad("A dispute can only be opened on a paid order.");
    if (one("SELECT 1 AS x FROM disputes WHERE order_id=? AND opened_by=? AND status IN ('open','investigating')", o.id, user.id)) throw bad("You already have an open dispute on this order.");
    const r = run("INSERT INTO disputes(order_id, opened_by, opened_role, reason, status, created_at) VALUES(?,?,?,?, 'open', ?)", o.id, user.id, user.role, reason, now());
    id = Number(r.lastInsertRowid);
    run("INSERT INTO dispute_messages(dispute_id, author_id, author_role, audience, body, created_at) VALUES(?,?,?,?,?,?)", id, user.id, user.role, user.role, reason, now());
    orderEvent(o.id, user.id, "dispute_opened", reason.slice(0, 120));
  });
  emit("admin", "admin:queue", { kind: "dispute", id });
  return id;
}

export function disputeThread(disputeId, audience) {
  const rows = audience === "admin"
    ? all("SELECT m.*, u.name FROM dispute_messages m JOIN users u ON u.id=m.author_id WHERE dispute_id=? ORDER BY m.id", disputeId)
    : all("SELECT m.*, u.name FROM dispute_messages m JOIN users u ON u.id=m.author_id WHERE dispute_id=? AND audience=? ORDER BY m.id", disputeId, audience);
  return rows.map((m) => ({ id: m.id, authorRole: m.author_role, author: m.author_role === "admin" ? "Support team" : m.name, audience: m.audience, body: m.body, at: m.created_at }));
}

export function postDisputeMessage(user, disputeId, body, audience) {
  const d = one("SELECT d.*, o.buyer_id, o.seller_id, o.code FROM disputes d JOIN orders o ON o.id=d.order_id WHERE d.id=?", disputeId);
  if (!d) throw notFound();
  if (user.role === "admin") {
    if (!["buyer", "seller", "internal"].includes(audience)) throw bad("Choose who this message is for.");
  } else {
    if (user.id !== d.buyer_id && user.id !== d.seller_id) throw notFound();
    audience = user.id === d.buyer_id ? "buyer" : "seller";
  }
  run("INSERT INTO dispute_messages(dispute_id, author_id, author_role, audience, body, created_at) VALUES(?,?,?,?,?,?)", disputeId, user.id, user.role, audience, body, now());
  if (user.role === "admin") {
    if (d.status === "open") run("UPDATE disputes SET status='investigating' WHERE id=?", disputeId);
    if (audience !== "internal") notify(audience === "buyer" ? d.buyer_id : d.seller_id, "dispute", { code: d.code }, audience === "buyer" ? `/account/orders/${d.order_id}` : "/seller/orders");
  } else emit("admin", "admin:queue", { kind: "dispute", id: disputeId });
}

export function resolveDispute(admin, disputeId, { outcome, resolution }) {
  tx(() => {
    const d = one("SELECT d.*, o.code FROM disputes d JOIN orders o ON o.id=d.order_id WHERE d.id=?", disputeId);
    if (!d) throw notFound();
    if (!["open", "investigating"].includes(d.status)) throw bad("This dispute is already resolved.");
    if (outcome === "buyer") {
      const o = getOrder(d.order_id);
      if (!["refunded", "rejected_refunded"].includes(o.status)) {
        refundTx(admin, o, o.amount_cents, `Dispute resolved for the buyer. ${resolution}`.trim());
        run("UPDATE orders SET status='refunded', payout_status=CASE WHEN payout_status='released' THEN 'reversed' ELSE 'withheld' END WHERE id=?", o.id);
        orderEvent(o.id, admin.id, "refunded", "Dispute resolved for the buyer");
      }
    }
    run("UPDATE disputes SET status=?, resolution=?, resolved_at=? WHERE id=?", outcome === "buyer" ? "resolved_buyer" : "resolved_seller", resolution, now(), disputeId);
    const o2 = one("SELECT buyer_id, seller_id, id FROM orders WHERE id=?", d.order_id);
    notify(o2.buyer_id, "dispute", { code: d.code }, `/account/orders/${o2.id}`);
    notify(o2.seller_id, "dispute", { code: d.code }, "/seller/orders");
  });
  logActivity(admin, "dispute.resolve", "dispute", disputeId, { outcome });
}

// ------------------------------------------------------------------ missed payment: forfeit + restriction
export function defaultOrder(orderId) {
  const cfg = settings();
  let done = false;
  tx(() => {
    const o = getOrder(orderId);
    if (!o || o.status !== "awaiting_payment" || o.payment_due_at > now()) return;
    run("UPDATE orders SET status='defaulted' WHERE id=?", o.id);
    run("UPDATE auctions SET status='unsold' WHERE id=?", o.auction_id);
    history(o.auction_id, null, "winner_defaulted", "Winner did not pay in time");
    orderEvent(o.id, null, "defaulted", "Payment window expired");
    let forfeited = 0;
    if (cfg.forfeit_deposit) {
      const buyer = one("SELECT deposit_cents FROM users WHERE id = ?", o.buyer_id);
      forfeited = Math.min(buyer.deposit_cents, cfg.min_deposit_cents);
      if (forfeited > 0) {
        move({ userId: o.buyer_id, account: "deposit", type: "forfeit", amount: -forfeited, refType: "order", refId: o.id, note: `Deposit forfeited for ${o.code}` });
        move({ account: "platform", type: "forfeit_income", amount: forfeited, refType: "order", refId: o.id, note: `Forfeited deposit ${o.code}` });
      }
    }
    const until = now() + cfg.restriction_days * DAY;
    run("UPDATE users SET restricted_until=?, strikes=strikes+1 WHERE id=?", until, o.buyer_id);
    run("INSERT INTO restrictions(user_id, kind, reason, starts_at, ends_at, status, created_by, created_at) VALUES(?, 'bidding', ?, ?, ?, 'active', NULL, ?)",
      o.buyer_id, `Did not pay for ${o.code} within ${cfg.payment_window_days} days`, now(), until, now());
    notify(o.buyer_id, "restricted", { until: new Date(until).toLocaleDateString("en-US"), note: forfeited ? `Your deposit of ${money(forfeited)} was forfeited.` : "" }, "/account/wallet");
    done = true;
  });
  if (done) emit("admin", "admin:queue", { kind: "order" });
  return done;
}

export function addRestriction(admin, userId, days, reason) {
  const u = one("SELECT * FROM users WHERE id = ?", userId);
  if (!u || u.role === "admin") throw notFound("User not found.");
  const until = now() + days * DAY;
  tx(() => {
    run("INSERT INTO restrictions(user_id, kind, reason, starts_at, ends_at, status, created_by, created_at) VALUES(?, 'bidding', ?, ?, ?, 'active', ?, ?)", userId, reason, now(), until, admin.id, now());
    run("UPDATE users SET restricted_until = MAX(COALESCE(restricted_until,0), ?) WHERE id = ?", until, userId);
  });
  notify(userId, "restricted", { until: new Date(until).toLocaleDateString("en-US"), note: reason }, "/account/wallet");
  logActivity(admin, "restriction.add", "user", userId, { days, reason });
}

export function liftRestriction(admin, restrictionId) {
  tx(() => {
    const r = one("SELECT * FROM restrictions WHERE id = ?", restrictionId);
    if (!r || r.status !== "active") throw bad("This restriction is not active.");
    run("UPDATE restrictions SET status='lifted' WHERE id = ?", r.id);
    recomputeRestriction(r.user_id);
  });
  logActivity(admin, "restriction.lift", "restriction", restrictionId);
}

function recomputeRestriction(userId) {
  const active = one("SELECT MAX(ends_at) AS e FROM restrictions WHERE user_id = ? AND status = 'active' AND ends_at > ?", userId, now());
  const before = one("SELECT restricted_until FROM users WHERE id = ?", userId).restricted_until;
  run("UPDATE users SET restricted_until = ? WHERE id = ?", active?.e ?? null, userId);
  if (before && !active?.e) notify(userId, "restored", {}, "/auctions");
}

export function expireRestrictions() {
  const due = all("SELECT id, user_id FROM restrictions WHERE status = 'active' AND ends_at <= ?", now());
  for (const r of due) {
    tx(() => {
      run("UPDATE restrictions SET status='expired' WHERE id = ?", r.id);
      recomputeRestriction(r.user_id);
    });
  }
}

export { alias };
