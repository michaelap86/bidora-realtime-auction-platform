// Buyer and seller dashboards.
import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { z } from "zod";
import { one, all, run } from "../db.js";
import { bad, notFound, now, settings, logActivity } from "../core.js";
import { requireRole, publicUser, biddingStatus } from "../auth.js";
import { dto, getAuction, placeBid, toggleWatch, createListing, resubmitListing } from "../auctions.js";
import { requestDeposit, activateFromWallet, userTransactions, METHODS } from "../wallet.js";
import * as O from "../orders.js";
import { wrap, parse, ip } from "./common.js";

export const buyer = Router();
export const seller = Router();
export const bids = Router();
buyer.use(requireRole("buyer"));
seller.use(requireRole("seller"));

// ================================================================= bidding (any signed-in buyer)
bids.post("/auctions/:id/bids", requireRole("buyer"), wrap((req, res) => {
  const { amount } = parse(z.object({ amount: z.number().int() }), req.body);
  res.json(placeBid(req.user, Number(req.params.id), amount, ip(req)));
}));
bids.post("/auctions/:id/watch", requireRole("buyer", "seller"), wrap((req, res) => {
  res.json({ watching: toggleWatch(req.user, Number(req.params.id)) });
}));

// ================================================================= buyer
buyer.get("/summary", wrap((req, res) => {
  const u = one("SELECT * FROM users WHERE id = ?", req.user.id);
  const cfg = settings();
  const live = all(
    `SELECT DISTINCT a.id FROM bids b JOIN auctions a ON a.id = b.auction_id WHERE b.user_id = ? AND a.status = 'live'`, u.id);
  const winning = all("SELECT id FROM auctions WHERE status = 'live' AND highest_bidder_id = ?", u.id).length;
  res.json({
    user: publicUser(u),
    bidding: biddingStatus(u, cfg.min_deposit_cents),
    minDepositCents: cfg.min_deposit_cents,
    activeBids: live.length,
    winning,
    watching: one("SELECT COUNT(*) AS n FROM watchlist WHERE user_id = ?", u.id).n,
    toPay: one("SELECT COUNT(*) AS n FROM orders WHERE buyer_id = ? AND status = 'awaiting_payment'", u.id).n,
    won: one("SELECT COUNT(*) AS n FROM orders WHERE buyer_id = ?", u.id).n,
    spentCents: one("SELECT COALESCE(SUM(amount_cents),0) AS n FROM orders WHERE buyer_id = ? AND paid_at IS NOT NULL AND status NOT IN ('refunded','rejected_refunded')", u.id).n,
  });
}));

buyer.get("/bids", wrap((req, res) => {
  const rows = all(
    `SELECT a.id, MAX(b.amount) AS myBid, COUNT(b.id) AS myBids FROM bids b JOIN auctions a ON a.id = b.auction_id
     WHERE b.user_id = ? GROUP BY a.id ORDER BY MAX(b.created_at) DESC LIMIT 60`, req.user.id);
  res.json(rows.map((r) => {
    const a = dto(getAuction(r.id), req.user);
    const state = a.status === "live" ? (a.mine.isHighest ? "winning" : "outbid") : a.status === "sold" ? (a.mine.isHighest ? "won" : "lost") : "closed";
    return { auction: a, myBid: r.myBid, myBids: r.myBids, state };
  }));
}));

buyer.get("/watchlist", wrap((req, res) => {
  const rows = all("SELECT auction_id FROM watchlist WHERE user_id = ? ORDER BY created_at DESC", req.user.id);
  res.json(rows.map((r) => dto(getAuction(r.auction_id), req.user)));
}));

buyer.get("/wallet", wrap((req, res) => {
  const u = one("SELECT * FROM users WHERE id = ?", req.user.id);
  const cfg = settings();
  res.json({
    walletCents: u.wallet_cents,
    depositCents: u.deposit_cents,
    minDepositCents: cfg.min_deposit_cents,
    bidding: biddingStatus(u, cfg.min_deposit_cents),
    methods: METHODS,
    transactions: userTransactions(u.id),
    requests: all("SELECT id, amount_cents AS amount, method, reference, status, note, created_at AS at FROM deposit_requests WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 30", u.id),
    restrictions: all("SELECT id, reason, starts_at AS startsAt, ends_at AS endsAt, status FROM restrictions WHERE user_id = ? ORDER BY id DESC LIMIT 10", u.id),
  });
}));
buyer.post("/deposits", wrap((req, res) => {
  const b = parse(z.object({ amountCents: z.number().int(), method: z.string(), reference: z.string().max(60).optional() }), req.body);
  res.status(201).json(requestDeposit(req.user, b));
}));
buyer.post("/deposit/activate", wrap((req, res) => {
  activateFromWallet(req.user);
  res.json({ ok: true });
}));

buyer.get("/orders", wrap((req, res) => {
  res.json(O.orderRows("WHERE o.buyer_id = ? ORDER BY o.created_at DESC", req.user.id).map((o) => O.orderDto(o, "buyer")));
}));
buyer.get("/orders/:id", wrap((req, res) => {
  const o = O.getOrder(Number(req.params.id));
  if (!o || o.buyer_id !== req.user.id) throw notFound("Order not found.");
  const dispute = one("SELECT id, status, resolution FROM disputes WHERE order_id = ? ORDER BY id DESC LIMIT 1", o.id);
  res.json({
    order: O.orderDto(o, "buyer"),
    timeline: O.orderTimeline(o.id).map(({ actor, ...e }) => e),
    dispute: dispute && { ...dispute, thread: O.disputeThread(dispute.id, "buyer") },
    user: publicUser(one("SELECT * FROM users WHERE id = ?", req.user.id)),
  });
}));
buyer.post("/orders/:id/pay", wrap((req, res) => {
  const ship = parse(z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().min(5).max(30), address: z.string().trim().min(5).max(200), city: z.string().trim().min(2).max(80) }), req.body);
  O.payOrder(req.user, Number(req.params.id), ship);
  logActivity(req.user, "order.pay", "order", Number(req.params.id), null, ip(req));
  res.json({ ok: true });
}));
buyer.post("/orders/:id/confirm", wrap((req, res) => {
  O.markDelivered(req.user, Number(req.params.id), true);
  res.json({ ok: true });
}));
buyer.post("/orders/:id/dispute", wrap((req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(10, "Please describe the problem in a few words.").max(800) }), req.body);
  res.status(201).json({ id: O.openDispute(req.user, Number(req.params.id), reason) });
}));
buyer.post("/disputes/:id/messages", wrap((req, res) => {
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(800) }), req.body);
  O.postDisputeMessage(req.user, Number(req.params.id), body);
  res.status(201).json({ ok: true });
}));

// ================================================================= seller
const UPLOAD_DIR = () => path.join(process.env.DATA_DIR || "data", "uploads");
const upload = multer({
  storage: multer.diskStorage({
    destination: (_r, _f, cb) => { fs.mkdirSync(UPLOAD_DIR(), { recursive: true }); cb(null, UPLOAD_DIR()); },
    filename: (_r, f, cb) => cb(null, `${crypto.randomBytes(10).toString("hex")}${{ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[f.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (_r, f, cb) => cb(["image/jpeg", "image/png", "image/webp"].includes(f.mimetype) ? null : bad("Only JPG, PNG or WebP images are allowed."), ["image/jpeg", "image/png", "image/webp"].includes(f.mimetype)),
});
seller.post("/uploads", upload.array("images", 6), wrap((req, res) => {
  res.status(201).json({ urls: (req.files ?? []).map((f) => `/uploads/${f.filename}`) });
}));

const listingSchema = z.object({
  title: z.string().trim().min(6, "Give the listing a clear title.").max(120),
  description: z.string().trim().min(30, "Describe the item in at least a few sentences.").max(4000),
  categoryId: z.number().int(),
  condition: z.enum(["New", "Like new", "Excellent", "Good", "Used"]),
  images: z.array(z.string().regex(/^\/(uploads|img\/products)\/[\w.-]+$/)).min(1, "Add at least one photo.").max(6),
  startPrice: z.number().int().min(100, "The starting price must be at least $1.00."),
  reservePrice: z.number().int().nullable().optional(),
  minIncrement: z.number().int().min(100, "The increment must be at least $1.00."),
  durationDays: z.number().int(),
  startAt: z.number().int().optional(),
});

seller.get("/summary", wrap((req, res) => {
  const u = one("SELECT * FROM users WHERE id = ?", req.user.id);
  const count = (where) => one(`SELECT COUNT(*) AS n FROM auctions WHERE seller_id = ? AND ${where}`, u.id).n;
  res.json({
    user: publicUser(u),
    live: count("status = 'live'"),
    pending: count("status IN ('pending','changes_requested')"),
    scheduled: count("status = 'scheduled'"),
    sold: one("SELECT COUNT(*) AS n FROM orders WHERE seller_id = ? AND paid_at IS NOT NULL", u.id).n,
    toShip: one("SELECT COUNT(*) AS n FROM orders WHERE seller_id = ? AND status = 'awaiting_shipment'", u.id).n,
    totalSalesCents: one("SELECT COALESCE(SUM(amount_cents),0) AS n FROM orders WHERE seller_id = ? AND paid_at IS NOT NULL AND status NOT IN ('refunded','rejected_refunded')", u.id).n,
    commissionCents: one("SELECT COALESCE(SUM(commission_cents),0) AS n FROM orders WHERE seller_id = ? AND paid_at IS NOT NULL AND status NOT IN ('refunded','rejected_refunded')", u.id).n,
    pendingCents: u.pending_cents,
    availableCents: u.earnings_cents,
    bidsReceived: one("SELECT COUNT(*) AS n FROM bids b JOIN auctions a ON a.id = b.auction_id WHERE a.seller_id = ?", u.id).n,
    daily: all(
      `SELECT strftime('%Y-%m-%d', paid_at/1000, 'unixepoch') AS day, SUM(seller_net_cents) AS net
       FROM orders WHERE seller_id = ? AND paid_at IS NOT NULL AND paid_at > ? AND status NOT IN ('refunded','rejected_refunded') GROUP BY day ORDER BY day`, u.id, now() - 30 * 86400000),
  });
}));

seller.get("/listings", wrap((req, res) => {
  const rows = all("SELECT id FROM auctions WHERE seller_id = ? ORDER BY created_at DESC", req.user.id);
  res.json(rows.map((r) => {
    const a = getAuction(r.id);
    const d = dto(a, req.user);
    d.history = all("SELECT action, note, created_at AS at FROM auction_history WHERE auction_id = ? ORDER BY id DESC LIMIT 6", a.id);
    return d;
  }));
}));
seller.post("/listings", wrap((req, res) => {
  const input = parse(listingSchema, req.body);
  res.status(201).json({ id: createListing(req.user, input) });
}));
seller.put("/listings/:id", wrap((req, res) => {
  const input = parse(listingSchema, req.body);
  resubmitListing(req.user, Number(req.params.id), input);
  res.json({ ok: true });
}));

seller.get("/orders", wrap((req, res) => {
  res.json(O.orderRows("WHERE o.seller_id = ? ORDER BY o.created_at DESC", req.user.id).map((o) => O.orderDto(o, "seller")));
}));
seller.post("/orders/:id/ship", wrap((req, res) => {
  const b = parse(z.object({ courier: z.string().trim().min(2).max(40), tracking: z.string().trim().min(4).max(60) }), req.body);
  O.sellerShip(req.user, Number(req.params.id), b);
  res.json({ ok: true });
}));
seller.post("/disputes/:id/messages", wrap((req, res) => {
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(800) }), req.body);
  O.postDisputeMessage(req.user, Number(req.params.id), body);
  res.status(201).json({ ok: true });
}));

seller.get("/earnings", wrap((req, res) => {
  const u = one("SELECT * FROM users WHERE id = ?", req.user.id);
  res.json({
    pendingCents: u.pending_cents,
    availableCents: u.earnings_cents,
    paidOutCents: one("SELECT COALESCE(SUM(amount_cents),0) AS n FROM payouts WHERE seller_id = ? AND status = 'released'", u.id).n,
    commissionCents: one("SELECT COALESCE(SUM(commission_cents),0) AS n FROM orders WHERE seller_id = ? AND paid_at IS NOT NULL AND status NOT IN ('refunded','rejected_refunded')", u.id).n,
    payouts: all(
      `SELECT p.id, p.amount_cents AS amount, p.status, p.created_at AS at, o.code, a.title FROM payouts p
       JOIN orders o ON o.id = p.order_id JOIN auctions a ON a.id = o.auction_id WHERE p.seller_id = ? ORDER BY p.created_at DESC LIMIT 50`, u.id),
    transactions: userTransactions(u.id),
  });
}));
