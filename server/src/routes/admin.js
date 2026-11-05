import { Router } from "express";
import { z } from "zod";
import { one, all, run } from "../db.js";
import { DAY, HOUR, HttpError, bad, notFound, now, settings, setSetting, DEFAULTS, logActivity, TEMPLATES, notify, resetSettingsCache } from "../core.js";
import { requireRole, publicUser } from "../auth.js";
import { dto, getAuction, reviewListing, adminEditListing, bidHistory, alias } from "../auctions.js";
import { reviewDeposit } from "../wallet.js";
import * as O from "../orders.js";
import { wrap, parse, page, ip } from "./common.js";

export const router = Router();
router.use(requireRole("admin"));

const day = (ms) => new Date(ms).toISOString().slice(0, 10);
function days(n) {
  const out = [];
  const end = new Date(now());
  end.setUTCHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) out.push(day(end.getTime() - i * DAY));
  return out;
}
const fillSeries = (rows, key, list, fields) =>
  list.map((d) => {
    const r = rows.find((x) => x[key] === d);
    return { day: d, ...Object.fromEntries(fields.map((f) => [f, r?.[f] ?? 0])) };
  });

// ================================================================= overview
router.get("/overview", wrap((req, res) => {
  const range = Math.min(Math.max(parseInt(req.query.days ?? "30", 10) || 30, 7), 90);
  const since = now() - range * DAY;
  const list = days(range);
  const n = (sql, ...a) => one(sql, ...a).n;
  const paid = "paid_at IS NOT NULL AND status NOT IN ('refunded','rejected_refunded')";
  const gmv = n(`SELECT COALESCE(SUM(amount_cents),0) AS n FROM orders WHERE ${paid}`);
  const prevGmv = n(`SELECT COALESCE(SUM(amount_cents),0) AS n FROM orders WHERE ${paid} AND paid_at BETWEEN ? AND ?`, since - range * DAY, since);
  const curGmv = n(`SELECT COALESCE(SUM(amount_cents),0) AS n FROM orders WHERE ${paid} AND paid_at > ?`, since);
  const commission = n("SELECT COALESCE(SUM(amount_cents),0) AS n FROM transactions WHERE account='platform' AND type IN ('commission','commission_reversal')");
  const forfeits = n("SELECT COALESCE(SUM(amount_cents),0) AS n FROM transactions WHERE account='platform' AND type='forfeit_income'");

  const revenue = fillSeries(
    all(`SELECT strftime('%Y-%m-%d', paid_at/1000,'unixepoch') AS d, SUM(amount_cents) AS gmv, COUNT(*) AS orders FROM orders WHERE ${paid} AND paid_at > ? GROUP BY d`, since).map((r) => ({ ...r, day: r.d })),
    "day", list, ["gmv", "orders"]);
  const commissionSeries = all("SELECT strftime('%Y-%m-%d', created_at/1000,'unixepoch') AS d, SUM(amount_cents) AS c FROM transactions WHERE account='platform' AND created_at > ? GROUP BY d", since);
  const bidsSeries = all("SELECT strftime('%Y-%m-%d', created_at/1000,'unixepoch') AS d, COUNT(*) AS bids FROM bids WHERE created_at > ? GROUP BY d", since);
  const usersSeries = all("SELECT strftime('%Y-%m-%d', created_at/1000,'unixepoch') AS d, COUNT(*) AS users FROM users WHERE created_at > ? AND role != 'admin' GROUP BY d", since);
  const listingsSeries = all("SELECT strftime('%Y-%m-%d', created_at/1000,'unixepoch') AS d, COUNT(*) AS listings FROM auctions WHERE created_at > ? GROUP BY d", since);
  const series = list.map((d, i) => ({
    day: d,
    gmv: revenue[i].gmv,
    orders: revenue[i].orders,
    commission: commissionSeries.find((r) => r.d === d)?.c ?? 0,
    bids: bidsSeries.find((r) => r.d === d)?.bids ?? 0,
    users: usersSeries.find((r) => r.d === d)?.users ?? 0,
    listings: listingsSeries.find((r) => r.d === d)?.listings ?? 0,
  }));

  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, bids: 0 }));
  for (const r of all("SELECT CAST(strftime('%H', created_at/1000,'unixepoch') AS INTEGER) AS h, COUNT(*) AS c FROM bids WHERE created_at > ? GROUP BY h", since)) hours[r.h].bids = r.c;

  res.json({
    range,
    kpis: {
      gmv, commission, forfeits,
      gmvChange: prevGmv ? Math.round(((curGmv - prevGmv) / prevGmv) * 100) : null,
      liveAuctions: n("SELECT COUNT(*) AS n FROM auctions WHERE status='live'"),
      endingToday: n("SELECT COUNT(*) AS n FROM auctions WHERE status='live' AND end_at < ?", now() + DAY),
      pendingReview: n("SELECT COUNT(*) AS n FROM auctions WHERE status='pending'"),
      pendingDeposits: n("SELECT COUNT(*) AS n FROM deposit_requests WHERE status='pending'"),
      openDisputes: n("SELECT COUNT(*) AS n FROM disputes WHERE status IN ('open','investigating')"),
      toInspect: n("SELECT COUNT(*) AS n FROM orders WHERE status='received'"),
      inTransit: n("SELECT COUNT(*) AS n FROM orders WHERE status='in_transit'"),
      toPack: n("SELECT COUNT(*) AS n FROM orders WHERE status='packing'"),
      awaitingPayment: n("SELECT COUNT(*) AS n FROM orders WHERE status='awaiting_payment'"),
      pendingPayoutCents: n("SELECT COALESCE(SUM(pending_cents),0) AS n FROM users"),
      walletHeldCents: n("SELECT COALESCE(SUM(wallet_cents+deposit_cents),0) AS n FROM users"),
      buyers: n("SELECT COUNT(*) AS n FROM users WHERE role='buyer'"),
      sellers: n("SELECT COUNT(*) AS n FROM users WHERE role='seller'"),
      restricted: n("SELECT COUNT(*) AS n FROM users WHERE restricted_until > ?", now()),
      bidsToday: n("SELECT COUNT(*) AS n FROM bids WHERE created_at > ?", now() - DAY),
      sellThrough: (() => {
        const sold = n("SELECT COUNT(*) AS n FROM auctions WHERE status='sold'");
        const unsold = n("SELECT COUNT(*) AS n FROM auctions WHERE status='unsold'");
        return sold + unsold ? Math.round((sold / (sold + unsold)) * 100) : 0;
      })(),
      avgBids: Math.round((one("SELECT AVG(bid_count) AS v FROM auctions WHERE status IN ('sold','unsold') AND bid_count > 0").v ?? 0) * 10) / 10,
    },
    series,
    hours,
    status: all("SELECT status, COUNT(*) AS count FROM auctions GROUP BY status ORDER BY count DESC"),
    orderStatus: all("SELECT status, COUNT(*) AS count FROM orders GROUP BY status ORDER BY count DESC").map((r) => ({ ...r, label: O.STATUS_LABEL[r.status] ?? r.status })),
    categories: all(
      `SELECT c.name, COUNT(o.id) AS orders, COALESCE(SUM(o.amount_cents),0) AS gmv FROM categories c
       LEFT JOIN auctions a ON a.category_id = c.id LEFT JOIN orders o ON o.auction_id = a.id AND o.${paid.replace(/ AND /g, " AND o.").replace("paid_at", "paid_at")}
       GROUP BY c.id ORDER BY gmv DESC`).filter((r) => r.orders > 0),
    topSellers: all(
      `SELECT u.id, COALESCE(u.business_name, u.name) AS name, COUNT(o.id) AS orders, SUM(o.amount_cents) AS gmv FROM orders o JOIN users u ON u.id = o.seller_id
       WHERE o.paid_at IS NOT NULL AND o.status NOT IN ('refunded','rejected_refunded') GROUP BY u.id ORDER BY gmv DESC LIMIT 6`),
    hotAuctions: all(
      `SELECT a.id, a.title, a.bid_count AS bids, CASE WHEN a.bid_count>0 THEN a.current_price ELSE a.start_price END AS price, a.end_at AS endAt, a.images
       FROM auctions a WHERE a.status='live' ORDER BY a.bid_count DESC LIMIT 6`).map((a) => ({ ...a, image: JSON.parse(a.images)[0] })),
    funnel: [
      ["Listings submitted", n("SELECT COUNT(*) AS n FROM auctions")],
      ["Approved", n("SELECT COUNT(*) AS n FROM auctions WHERE approved_at IS NOT NULL")],
      ["Received bids", n("SELECT COUNT(*) AS n FROM auctions WHERE bid_count > 0 AND approved_at IS NOT NULL")],
      ["Sold", n("SELECT COUNT(*) AS n FROM orders")],
      ["Paid", n("SELECT COUNT(*) AS n FROM orders WHERE paid_at IS NOT NULL")],
      ["Delivered", n("SELECT COUNT(*) AS n FROM orders WHERE status IN ('delivered','completed')")],
    ].map(([name, value]) => ({ name, value })),
    recent: all("SELECT actor_name AS actor, action, entity, entity_id AS entityId, created_at AS at FROM activity_logs ORDER BY created_at DESC, id DESC LIMIT 10"),
    cashflow: (() => {
      const weeks = [];
      for (let i = 7; i >= 0; i--) {
        const from = now() - (i + 1) * 7 * DAY;
        const to = now() - i * 7 * DAY;
        const sum = (types, acct) => one(`SELECT COALESCE(SUM(ABS(amount_cents)),0) AS n FROM transactions WHERE account='${acct}' AND type IN (${types}) AND created_at BETWEEN ? AND ?`, from, to).n;
        weeks.push({
          week: day(from),
          deposits: sum("'deposit'", "wallet"),
          payouts: sum("'payout'", "earnings"),
          refunds: sum("'refund'", "wallet"),
        });
      }
      return weeks;
    })(),
  });
}));

// ================================================================= auctions
router.get("/auctions", wrap((req, res) => {
  const { status, q } = req.query;
  const { limit, offset } = page(req.query);
  const where = [];
  const args = [];
  if (status && status !== "all") { where.push("a.status = ?"); args.push(status); }
  if (q) { where.push("(a.title LIKE ? OR s.name LIKE ? OR s.business_name LIKE ?)"); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = one(`SELECT COUNT(*) AS n FROM auctions a JOIN users s ON s.id=a.seller_id ${clause}`, ...args).n;
  const ids = all(`SELECT a.id FROM auctions a JOIN users s ON s.id=a.seller_id ${clause} ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'live' THEN 1 ELSE 2 END, a.created_at DESC LIMIT ? OFFSET ?`, ...args, limit, offset);
  const counts = Object.fromEntries(all("SELECT status, COUNT(*) AS n FROM auctions GROUP BY status").map((r) => [r.status, r.n]));
  res.json({
    total, counts,
    items: ids.map(({ id }) => {
      const a = getAuction(id);
      return { ...dto(a, req.user), seller: { id: a.seller_id, name: a.seller_business || a.seller_name, email: one("SELECT email FROM users WHERE id=?", a.seller_id).email } };
    }),
  });
}));
router.get("/auctions/:id", wrap((req, res) => {
  const a = getAuction(Number(req.params.id));
  if (!a) throw notFound();
  const seller = one("SELECT id, name, email, business_name, city, strikes FROM users WHERE id = ?", a.seller_id);
  res.json({
    auction: dto(a, req.user),
    seller,
    history: all("SELECT h.action, h.note, h.created_at AS at, u.name AS actor FROM auction_history h LEFT JOIN users u ON u.id=h.actor_id WHERE h.auction_id=? ORDER BY h.id DESC", a.id),
    bids: all("SELECT b.id, b.amount, b.created_at AS at, b.ip, u.id AS userId, u.name, u.email FROM bids b JOIN users u ON u.id=b.user_id WHERE b.auction_id=? ORDER BY b.amount DESC, b.id DESC LIMIT 100", a.id),
    order: (() => { const o = one("SELECT id FROM orders WHERE auction_id = ?", a.id); return o && O.orderDto(O.getOrder(o.id), "admin"); })(),
  });
}));
router.post("/auctions/:id/review", wrap((req, res) => {
  const b = parse(z.object({ decision: z.enum(["approve", "reject", "changes", "suspend", "restore", "remove"]), note: z.string().max(500).optional() }), req.body);
  res.json({ status: reviewListing(req.user, Number(req.params.id), b.decision, b.note ?? "") });
}));
router.patch("/auctions/:id", wrap((req, res) => {
  const b = parse(z.object({ title: z.string().trim().min(6).max(120).optional(), description: z.string().trim().min(20).max(4000).optional(), condition: z.enum(["New", "Like new", "Excellent", "Good", "Used"]).optional(), featured: z.boolean().optional(), categoryId: z.number().int().optional() }), req.body);
  adminEditListing(req.user, Number(req.params.id), b);
  res.json({ ok: true });
}));

router.get("/bids", wrap((req, res) => {
  const { limit, offset } = page(req.query);
  const rows = all(
    `SELECT b.id, b.amount, b.created_at AS at, b.ip, a.id AS auctionId, a.title, a.status, u.id AS userId, u.name, u.email,
            (SELECT COUNT(*) FROM bids x WHERE x.user_id = b.user_id AND x.created_at > b.created_at - 600000 AND x.created_at <= b.created_at) AS recent
     FROM bids b JOIN auctions a ON a.id=b.auction_id JOIN users u ON u.id=b.user_id ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?`, limit, offset);
  res.json({ total: one("SELECT COUNT(*) AS n FROM bids").n, items: rows });
}));

// ================================================================= users
router.get("/users", wrap((req, res) => {
  const { role, q, status } = req.query;
  const { limit, offset } = page(req.query);
  const where = ["1=1"];
  const args = [];
  if (role && role !== "all") { where.push("role = ?"); args.push(role); }
  if (status === "restricted") { where.push("restricted_until > ?"); args.push(now()); }
  else if (status === "suspended") where.push("status = 'suspended'");
  if (q) { where.push("(name LIKE ? OR email LIKE ? OR business_name LIKE ?)"); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = all(
    `SELECT u.*, (SELECT COUNT(*) FROM bids b WHERE b.user_id=u.id) AS bid_count,
            (SELECT COUNT(*) FROM orders o WHERE o.buyer_id=u.id OR o.seller_id=u.id) AS order_count,
            (SELECT COUNT(*) FROM auctions a WHERE a.seller_id=u.id) AS listing_count
     FROM users u WHERE ${where.join(" AND ")} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`, ...args, limit, offset);
  res.json({
    total: one(`SELECT COUNT(*) AS n FROM users WHERE ${where.join(" AND ")}`, ...args).n,
    counts: { buyer: one("SELECT COUNT(*) AS n FROM users WHERE role='buyer'").n, seller: one("SELECT COUNT(*) AS n FROM users WHERE role='seller'").n, admin: one("SELECT COUNT(*) AS n FROM users WHERE role='admin'").n },
    items: rows.map((u) => ({ ...publicUser(u), strikes: u.strikes, bidCount: u.bid_count, orderCount: u.order_count, listingCount: u.listing_count, lastLoginAt: u.last_login_at })),
  });
}));
router.get("/users/:id", wrap((req, res) => {
  const u = one("SELECT * FROM users WHERE id = ?", Number(req.params.id));
  if (!u) throw notFound("User not found.");
  res.json({
    user: { ...publicUser(u), strikes: u.strikes, lastLoginAt: u.last_login_at },
    bids: all("SELECT b.id, b.amount, b.created_at AS at, a.id AS auctionId, a.title FROM bids b JOIN auctions a ON a.id=b.auction_id WHERE b.user_id=? ORDER BY b.created_at DESC LIMIT 15", u.id),
    orders: O.orderRows("WHERE o.buyer_id = ? OR o.seller_id = ? ORDER BY o.created_at DESC LIMIT 10", u.id, u.id).map((o) => O.orderDto(o, "admin")),
    transactions: all("SELECT id, account, type, amount_cents AS amount, balance_after AS balance, note, created_at AS at FROM transactions WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 25", u.id),
    restrictions: all("SELECT id, reason, starts_at AS startsAt, ends_at AS endsAt, status FROM restrictions WHERE user_id=? ORDER BY id DESC", u.id),
  });
}));
router.post("/users/:id/status", wrap((req, res) => {
  const { status } = parse(z.object({ status: z.enum(["active", "suspended"]) }), req.body);
  const u = one("SELECT * FROM users WHERE id = ?", Number(req.params.id));
  if (!u || u.role === "admin") throw notFound("User not found.");
  if (u.is_demo) throw new HttpError(403, "The demo accounts cannot be suspended, so the next visitor can still sign in.");
  run("UPDATE users SET status = ? WHERE id = ?", status, u.id);
  logActivity(req.user, `user.${status === "suspended" ? "suspend" : "reactivate"}`, "user", u.id);
  res.json({ ok: true });
}));
router.post("/users/:id/restrict", wrap((req, res) => {
  if (one("SELECT is_demo FROM users WHERE id = ?", Number(req.params.id))?.is_demo) throw new HttpError(403, "The demo accounts cannot be restricted, so the next visitor can still bid.");
  const b = parse(z.object({ days: z.number().int().min(1).max(365), reason: z.string().trim().min(3).max(300) }), req.body);
  O.addRestriction(req.user, Number(req.params.id), b.days, b.reason);
  res.json({ ok: true });
}));

// ================================================================= restrictions
router.get("/restrictions", wrap((req, res) => {
  const rows = all(
    `SELECT r.id, r.kind, r.reason, r.starts_at AS startsAt, r.ends_at AS endsAt, r.status, r.created_by AS createdBy, u.id AS userId, u.name, u.email
     FROM restrictions r JOIN users u ON u.id=r.user_id ORDER BY (r.status='active') DESC, r.id DESC LIMIT 100`);
  res.json(rows.map((r) => ({ ...r, auto: r.createdBy == null })));
}));
router.post("/restrictions/:id/lift", wrap((req, res) => { O.liftRestriction(req.user, Number(req.params.id)); res.json({ ok: true }); }));

// ================================================================= deposits & money
router.get("/deposits", wrap((req, res) => {
  const { status } = req.query;
  const rows = all(
    `SELECT d.id, d.amount_cents AS amount, d.method, d.reference, d.status, d.note, d.created_at AS at, d.reviewed_at AS reviewedAt, u.id AS userId, u.name, u.email
     FROM deposit_requests d JOIN users u ON u.id=d.user_id ${status && status !== "all" ? "WHERE d.status = ?" : ""} ORDER BY (d.status='pending') DESC, d.created_at DESC LIMIT 150`, ...(status && status !== "all" ? [status] : []));
  res.json({ items: rows, counts: Object.fromEntries(all("SELECT status, COUNT(*) AS n FROM deposit_requests GROUP BY status").map((r) => [r.status, r.n])) });
}));
router.post("/deposits/:id/review", wrap((req, res) => {
  const b = parse(z.object({ decision: z.enum(["approve", "reject"]), note: z.string().max(300).optional() }), req.body);
  reviewDeposit(req.user, Number(req.params.id), b.decision, b.note ?? "");
  res.json({ ok: true });
}));

router.get("/transactions", wrap((req, res) => {
  const { type, q } = req.query;
  const { limit, offset } = page(req.query);
  const where = ["1=1"];
  const args = [];
  if (type && type !== "all") { where.push("t.type = ?"); args.push(type); }
  if (q) { where.push("(u.name LIKE ? OR u.email LIKE ? OR t.note LIKE ?)"); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = all(
    `SELECT t.id, t.account, t.type, t.amount_cents AS amount, t.note, t.created_at AS at, t.ref_type AS refType, t.ref_id AS refId, u.name, u.email
     FROM transactions t LEFT JOIN users u ON u.id=t.user_id WHERE ${where.join(" AND ")} ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`, ...args, limit, offset);
  res.json({
    total: one(`SELECT COUNT(*) AS n FROM transactions t LEFT JOIN users u ON u.id=t.user_id WHERE ${where.join(" AND ")}`, ...args).n,
    types: all("SELECT DISTINCT type FROM transactions ORDER BY type").map((r) => r.type),
    items: rows,
  });
}));

router.get("/payouts", wrap((req, res) => {
  const waiting = O.orderRows("WHERE o.inspection_result = 'passed' AND o.payout_status = 'pending' ORDER BY o.inspected_at").map((o) => O.orderDto(o, "admin"));
  const pendingSales = O.orderRows("WHERE o.payout_status = 'none' AND o.status IN ('awaiting_shipment','in_transit','received') ORDER BY o.paid_at DESC").map((o) => O.orderDto(o, "admin"));
  const released = all(
    `SELECT p.id, p.amount_cents AS amount, p.status, p.created_at AS at, o.id AS orderId, o.code, a.title, u.name AS seller
     FROM payouts p JOIN orders o ON o.id=p.order_id JOIN auctions a ON a.id=o.auction_id JOIN users u ON u.id=p.seller_id ORDER BY p.created_at DESC LIMIT 100`);
  res.json({ waiting, pendingSales, released, totals: {
    released: one("SELECT COALESCE(SUM(amount_cents),0) AS n FROM payouts WHERE status='released'").n,
    pending: one("SELECT COALESCE(SUM(pending_cents),0) AS n FROM users").n,
    sameDay: (() => {
      const rows = all("SELECT o.inspected_at AS i, p.created_at AS p FROM payouts p JOIN orders o ON o.id=p.order_id WHERE o.inspected_at IS NOT NULL");
      return rows.length ? Math.round((rows.filter((r) => day(r.p) === day(r.i)).length / rows.length) * 100) : 100;
    })(),
  } });
}));
router.get("/refunds", wrap((req, res) => {
  res.json(all(
    `SELECT r.id, r.amount_cents AS amount, r.reason, r.status, r.created_at AS at, o.id AS orderId, o.code, a.title, u.name AS buyer
     FROM refunds r JOIN orders o ON o.id=r.order_id JOIN auctions a ON a.id=o.auction_id JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 100`));
}));

// ================================================================= orders & warehouse
router.get("/orders", wrap((req, res) => {
  const { status, q } = req.query;
  const where = [];
  const args = [];
  if (status && status !== "all") { where.push("o.status = ?"); args.push(status); }
  if (q) { where.push("(o.code LIKE ? OR a.title LIKE ? OR b.name LIKE ? OR s.name LIKE ?)"); args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = O.orderRows(`${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY o.created_at DESC LIMIT 200`, ...args);
  res.json({
    items: rows.map((o) => O.orderDto(o, "admin")),
    counts: Object.fromEntries(all("SELECT status, COUNT(*) AS n FROM orders GROUP BY status").map((r) => [r.status, r.n])),
    labels: O.STATUS_LABEL,
  });
}));
router.get("/orders/:id", wrap((req, res) => {
  const o = O.getOrder(Number(req.params.id));
  if (!o) throw notFound("Order not found.");
  const disputes = all("SELECT id, status, reason, resolution, opened_role AS openedRole, created_at AS at FROM disputes WHERE order_id = ? ORDER BY id DESC", o.id);
  res.json({ order: O.orderDto(o, "admin"), timeline: O.orderTimeline(o.id), disputes, warehouse: O.warehouse(), transactions: all("SELECT id, account, type, amount_cents AS amount, note, created_at AS at FROM transactions WHERE ref_type='order' AND ref_id=? ORDER BY created_at, id", o.id) });
}));
const act = (path, schema, fn) =>
  router.post(`/orders/:id/${path}`, wrap((req, res) => { fn(req.user, Number(req.params.id), parse(schema, req.body)); res.json({ ok: true }); }));
act("receive", z.object({ bin: z.string().trim().max(30).optional(), notes: z.string().max(300).optional() }), (u, id, b) => O.receiveAtWarehouse(u, id, b));
act("inspect", z.object({ result: z.enum(["passed", "failed"]), notes: z.string().trim().min(3, "Add inspection notes.").max(500), photos: z.array(z.string()).max(8).optional() }), (u, id, b) => O.inspect(u, id, b));
act("packaging", z.object({ status: z.enum(["pending", "packing", "packed"]) }), (u, id, b) => O.setPackaging(u, id, b.status));
act("label", z.object({ courier: z.string().trim().min(2).max(40), tracking: z.string().trim().min(4).max(60) }), (u, id, b) => O.createLabel(u, id, b));
act("delivered", z.object({}), (u, id) => O.markDelivered(u, id, false));
act("release-payout", z.object({}), (u, id) => O.releasePayout(u, id));
act("refund", z.object({ reason: z.string().trim().min(3).max(300) }), (u, id, b) => O.refundOrder(u, id, b.reason));

router.get("/warehouse", wrap((req, res) => {
  const stage = (status) => O.orderRows("WHERE o.status = ? ORDER BY COALESCE(o.received_at, o.seller_shipped_at, o.paid_at)", status).map((o) => O.orderDto(o, "admin"));
  res.json({
    warehouse: O.warehouse(),
    expected: stage("awaiting_shipment"),
    inTransit: stage("in_transit"),
    received: stage("received"),
    packing: stage("packing"),
    shipped: stage("shipped"),
    inventory: O.orderRows("WHERE o.status IN ('received','packing') ORDER BY o.received_at DESC").map((o) => O.orderDto(o, "admin")),
    recentlyFailed: O.orderRows("WHERE o.status = 'rejected_refunded' ORDER BY o.inspected_at DESC LIMIT 5").map((o) => O.orderDto(o, "admin")),
  });
}));
router.put("/warehouse", wrap((req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(80), address: z.string().trim().min(3).max(160), city: z.string().trim().min(2).max(80), phone: z.string().trim().max(30).optional(), instructions: z.string().trim().min(10).max(1000) }), req.body);
  const w = O.warehouse();
  run("UPDATE warehouses SET name=?, address=?, city=?, phone=?, instructions=? WHERE id=?", b.name, b.address, b.city, b.phone ?? null, b.instructions, w.id);
  logActivity(req.user, "warehouse.update", "warehouse", w.id);
  res.json({ ok: true });
}));

// ================================================================= disputes
router.get("/disputes", wrap((req, res) => {
  const rows = all(
    `SELECT d.id, d.status, d.reason, d.resolution, d.opened_role AS openedRole, d.created_at AS at, d.resolved_at AS resolvedAt,
            o.id AS orderId, o.code, a.title, o.amount_cents AS amount, u.name AS openedBy
     FROM disputes d JOIN orders o ON o.id=d.order_id JOIN auctions a ON a.id=o.auction_id JOIN users u ON u.id=d.opened_by
     ORDER BY (d.status IN ('open','investigating')) DESC, d.created_at DESC LIMIT 100`);
  res.json(rows);
}));
router.get("/disputes/:id", wrap((req, res) => {
  const d = one("SELECT d.*, o.code, o.id AS order_id FROM disputes d JOIN orders o ON o.id=d.order_id WHERE d.id = ?", Number(req.params.id));
  if (!d) throw notFound();
  res.json({ dispute: d, order: O.orderDto(O.getOrder(d.order_id), "admin"), thread: O.disputeThread(d.id, "admin") });
}));
router.post("/disputes/:id/messages", wrap((req, res) => {
  const b = parse(z.object({ body: z.string().trim().min(1).max(800), audience: z.enum(["buyer", "seller", "internal"]) }), req.body);
  O.postDisputeMessage(req.user, Number(req.params.id), b.body, b.audience);
  res.status(201).json({ ok: true });
}));
router.post("/disputes/:id/resolve", wrap((req, res) => {
  const b = parse(z.object({ outcome: z.enum(["buyer", "seller"]), resolution: z.string().trim().min(3).max(400) }), req.body);
  O.resolveDispute(req.user, Number(req.params.id), b);
  res.json({ ok: true });
}));

// ================================================================= configuration
router.get("/settings", wrap((req, res) => res.json({ settings: settings(), defaults: DEFAULTS })));
router.put("/settings", wrap((req, res) => {
  const b = parse(z.object({
    site_name: z.string().trim().min(2).max(40).optional(),
    min_deposit_cents: z.number().int().min(0).max(5_000_000).optional(),
    commission_pct: z.number().min(0).max(50).optional(),
    payment_window_days: z.number().int().min(1).max(14).optional(),
    restriction_days: z.number().int().min(0).max(180).optional(),
    forfeit_deposit: z.number().int().min(0).max(1).optional(),
    durations: z.array(z.number().int().min(1).max(60)).min(1).max(8).optional(),
    anti_snipe_window_sec: z.number().int().min(0).max(1800).optional(),
    anti_snipe_extension_sec: z.number().int().min(0).max(1800).optional(),
    default_min_increment_cents: z.number().int().min(100).max(1_000_000).optional(),
    auto_release_payout: z.number().int().min(0).max(1).optional(),
    auto_approve_sandbox_deposits: z.number().int().min(0).max(1).optional(),
    reminder_hours: z.number().int().min(1).max(72).optional(),
  }), req.body);
  if (req.user.is_demo && ((b.min_deposit_cents ?? 0) > 50_000 || (b.commission_pct ?? 0) > 25 || (b.payment_window_days ?? 0) > 7 || (b.anti_snipe_extension_sec ?? 0) > 600)) {
    throw new HttpError(400, "In the public demo the settings are kept in a sensible range (deposit up to $500, commission up to 25%, payment window up to 7 days).");
  }
  for (const [k, v] of Object.entries(b)) setSetting(k, v);
  logActivity(req.user, "settings.update", "settings", null, b, ip(req));
  res.json({ settings: settings() });
}));

router.get("/categories", wrap((req, res) => res.json(all("SELECT c.*, (SELECT COUNT(*) FROM auctions a WHERE a.category_id=c.id) AS auctions FROM categories c ORDER BY sort, id"))));
router.post("/categories", wrap((req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(40), icon: z.string().trim().max(30).default("tag") }), req.body);
  const slug = b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (one("SELECT 1 AS x FROM categories WHERE slug=?", slug)) throw bad("A category with this name already exists.");
  const sort = (one("SELECT MAX(sort) AS m FROM categories").m ?? 0) + 1;
  const r = run("INSERT INTO categories(name, slug, icon, sort) VALUES(?,?,?,?)", b.name, slug, b.icon, sort);
  logActivity(req.user, "category.create", "category", Number(r.lastInsertRowid));
  res.status(201).json({ id: Number(r.lastInsertRowid) });
}));
router.patch("/categories/:id", wrap((req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(40).optional(), active: z.boolean().optional() }), req.body);
  if (b.name !== undefined) run("UPDATE categories SET name=? WHERE id=?", b.name, Number(req.params.id));
  if (b.active !== undefined) run("UPDATE categories SET active=? WHERE id=?", b.active ? 1 : 0, Number(req.params.id));
  res.json({ ok: true });
}));

router.get("/emails", wrap((req, res) => {
  res.json({
    templates: all("SELECT * FROM email_templates ORDER BY label, key").map((t) => ({ ...t, enabled: !!t.enabled })),
    outbox: all("SELECT id, to_email AS recipient, subject, body, template, status, created_at AS at FROM emails ORDER BY created_at DESC, id DESC LIMIT 60"),
    sentToday: one("SELECT COUNT(*) AS n FROM emails WHERE created_at > ?", now() - DAY).n,
  });
}));
router.put("/emails/:key", wrap((req, res) => {
  const b = parse(z.object({ subject: z.string().trim().min(2).max(120), body: z.string().trim().min(2).max(800), enabled: z.boolean() }), req.body);
  if (!TEMPLATES[req.params.key]) throw notFound("Template not found.");
  run("UPDATE email_templates SET subject=?, body=?, enabled=? WHERE key=?", b.subject, b.body, b.enabled ? 1 : 0, req.params.key);
  logActivity(req.user, "email.template", "template", null, { key: req.params.key });
  res.json({ ok: true });
}));

router.get("/logs", wrap((req, res) => {
  const { limit, offset } = page(req.query);
  const { q } = req.query;
  const where = q ? "WHERE actor_name LIKE ? OR action LIKE ? OR entity LIKE ?" : "";
  const args = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
  res.json({
    total: one(`SELECT COUNT(*) AS n FROM activity_logs ${where}`, ...args).n,
    items: all(`SELECT id, actor_name AS actor, action, entity, entity_id AS entityId, meta, ip, created_at AS at FROM activity_logs ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, ...args, limit, offset),
  });
}));

// ================================================================= financial reports
function reportRange(q) {
  const to = q.to ? Date.parse(q.to) + DAY - 1 : now();
  const from = q.from ? Date.parse(q.from) : to - 30 * DAY;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw bad("Pick a valid date range.");
  return { from, to };
}
router.get("/reports", wrap((req, res) => {
  const { from, to } = reportRange(req.query);
  const sum = (account, types) => one(`SELECT COALESCE(SUM(amount_cents),0) AS n FROM transactions WHERE account=? AND type IN (${types.map(() => "?").join(",")}) AND created_at BETWEEN ? AND ?`, account, ...types, from, to).n;
  const totals = {
    gmv: one("SELECT COALESCE(SUM(amount_cents),0) AS n FROM orders WHERE paid_at BETWEEN ? AND ?", from, to).n,
    commission: sum("platform", ["commission", "commission_reversal"]),
    forfeits: sum("platform", ["forfeit_income"]),
    deposits: sum("wallet", ["deposit"]),
    payouts: sum("earnings", ["payout"]),
    refunds: sum("wallet", ["refund"]),
    orders: one("SELECT COUNT(*) AS n FROM orders WHERE paid_at BETWEEN ? AND ?", from, to).n,
    avgOrder: Math.round(one("SELECT COALESCE(AVG(amount_cents),0) AS n FROM orders WHERE paid_at BETWEEN ? AND ?", from, to).n),
  };
  const d = (col, tbl, where = "1=1") => all(`SELECT strftime('%Y-%m-%d', ${col}/1000,'unixepoch') AS d, SUM(amount_cents) AS v FROM ${tbl} WHERE ${where} AND ${col} BETWEEN ? AND ? GROUP BY d`, from, to);
  const gmv = d("paid_at", "orders");
  const tx = (acct, types) => d("created_at", "transactions", `account='${acct}' AND type IN (${types.map((t) => `'${t}'`).join(",")})`);
  const dep = tx("wallet", ["deposit"]), pay = tx("earnings", ["payout"]), ref = tx("wallet", ["refund"]), com = tx("platform", ["commission", "commission_reversal"]);
  const list = [];
  for (let t = new Date(from).setUTCHours(0, 0, 0, 0); t <= to; t += DAY) list.push(day(t));
  const get = (rows, k) => Math.abs(rows.find((r) => r.d === k)?.v ?? 0);
  res.json({
    from, to, totals,
    series: list.map((k) => ({ day: k, gmv: get(gmv, k), commission: get(com, k), deposits: get(dep, k), payouts: get(pay, k), refunds: get(ref, k) })),
    byType: all("SELECT type, COUNT(*) AS count, SUM(amount_cents) AS total FROM transactions WHERE created_at BETWEEN ? AND ? GROUP BY type ORDER BY ABS(SUM(amount_cents)) DESC", from, to),
    byCategory: all(
      `SELECT c.name, COUNT(o.id) AS orders, COALESCE(SUM(o.amount_cents),0) AS gmv, COALESCE(SUM(o.commission_cents),0) AS commission FROM orders o
       JOIN auctions a ON a.id=o.auction_id JOIN categories c ON c.id=a.category_id WHERE o.paid_at BETWEEN ? AND ? GROUP BY c.id ORDER BY gmv DESC`, from, to),
  });
}));
router.get("/reports/export.csv", wrap((req, res) => {
  const { from, to } = reportRange(req.query);
  const rows = all(
    `SELECT t.id, datetime(t.created_at/1000,'unixepoch') AS at, COALESCE(u.email,'platform') AS account_owner, t.account, t.type, t.amount_cents/100.0 AS amount, COALESCE(t.note,'') AS note
     FROM transactions t LEFT JOIN users u ON u.id=t.user_id WHERE t.created_at BETWEEN ? AND ? ORDER BY t.created_at`, from, to);
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = ["id,time_utc,owner,account,type,amount,note", ...rows.map((r) => [r.id, r.at, r.account_owner, r.account, r.type, r.amount.toFixed(2), r.note].map(esc).join(","))].join("\n");
  logActivity(req.user, "report.export", "report", null, { from, to }, ip(req));
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="transactions-${day(from)}-${day(to)}.csv"`);
  res.send(csv);
}));
