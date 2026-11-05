import { Router } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { one, all, run } from "../db.js";
import { HttpError, bad, notFound, now, settings, notify, logActivity, DAY } from "../core.js";
import { hashPassword, checkPassword, setSession, clearSession, publicUser, requireAuth, biddingStatus, touchLogin } from "../auth.js";
import { dto, getAuction, listPublic, bidHistory } from "../auctions.js";
import { wrap, parse, ip } from "./common.js";

export const router = Router();
const DEMO_MODE = () => process.env.DEMO_MODE !== "0";

const authLimit = rateLimit({ windowMs: 10 * 60_000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts. Try again in a few minutes." } });

// ------------------------------------------------------------ site information
router.get("/config", wrap((req, res) => {
  const s = settings();
  res.json({
    siteName: s.site_name,
    currency: s.currency,
    minDepositCents: s.min_deposit_cents,
    commissionPct: s.commission_pct,
    paymentWindowDays: s.payment_window_days,
    restrictionDays: s.restriction_days,
    durations: s.durations,
    antiSnipeWindowSec: s.anti_snipe_window_sec,
    antiSnipeExtensionSec: s.anti_snipe_extension_sec,
    defaultIncrementCents: s.default_min_increment_cents,
    maxImages: s.max_images,
    demoMode: DEMO_MODE(),
    serverNow: now(),
    categories: all(
      `SELECT c.id, c.name, c.slug, c.icon,
        (SELECT COUNT(*) FROM auctions a WHERE a.category_id = c.id AND a.status = 'live') AS live
       FROM categories c WHERE c.active = 1 ORDER BY c.sort, c.id`),
  });
}));

router.get("/stats", wrap((req, res) => {
  res.json({
    live: one("SELECT COUNT(*) AS n FROM auctions WHERE status = 'live'").n,
    bids: one("SELECT COUNT(*) AS n FROM bids").n,
    members: one("SELECT COUNT(*) AS n FROM users WHERE role != 'admin'").n,
    sellers: one("SELECT COUNT(*) AS n FROM users WHERE role = 'seller'").n,
    soldCents: one("SELECT COALESCE(SUM(amount_cents),0) AS n FROM orders WHERE paid_at IS NOT NULL AND status NOT IN ('refunded','rejected_refunded')").n,
    sold: one("SELECT COUNT(*) AS n FROM orders WHERE paid_at IS NOT NULL").n,
  });
}));

router.get("/feed", wrap((req, res) => {
  const rows = all(
    `SELECT b.id, b.amount, b.created_at AS at, a.id AS auctionId, a.title, u.name
     FROM bids b JOIN auctions a ON a.id = b.auction_id JOIN users u ON u.id = b.user_id
     ORDER BY b.created_at DESC, b.id DESC LIMIT 14`);
  res.json(rows.map((r) => ({ id: r.id, amount: r.amount, at: r.at, auctionId: r.auctionId, title: r.title, bidder: `${r.name[0].toLowerCase()}***${r.name.trim().slice(-1).toLowerCase()}` })));
}));

router.get("/auctions", wrap((req, res) => res.json(listPublic(req.query, req.user))));

router.get("/auctions/:id", wrap((req, res) => {
  const a = getAuction(Number(req.params.id));
  const mine = req.user && (a?.seller_id === req.user.id || req.user.role === "admin");
  if (!a || (!["live", "scheduled", "sold", "unsold"].includes(a.status) && !mine)) throw notFound("Auction not found.");
  run("UPDATE auctions SET views = views + 1 WHERE id = ?", a.id);
  const related = all(
    `SELECT a.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon, s.name AS seller_name, s.business_name AS seller_business,
            s.city AS seller_city, s.created_at AS seller_since, h.name AS bidder_name
     FROM auctions a JOIN categories c ON c.id=a.category_id JOIN users s ON s.id=a.seller_id LEFT JOIN users h ON h.id=a.highest_bidder_id
     WHERE a.category_id = ? AND a.id != ? AND a.status = 'live' ORDER BY a.end_at LIMIT 4`, a.category_id, a.id).map((r) => dto(r, req.user));
  const out = dto(a, req.user);
  if (a.status === "sold") {
    const o = one("SELECT status FROM orders WHERE auction_id = ?", a.id);
    out.orderStatus = o?.status;
  }
  res.json({ auction: out, bids: bidHistory(a.id, 40), related, serverNow: now() });
}));

router.get("/auctions/:id/bids", wrap((req, res) => res.json(bidHistory(Number(req.params.id), 100))));

// ------------------------------------------------------------ accounts
const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(8, "Use at least 8 characters.").max(100),
  role: z.enum(["buyer", "seller"]),
  businessName: z.string().trim().max(80).optional(),
});

function verifyToken(user) {
  return jwt.sign({ uid: user.id, purpose: "verify" }, process.env.SESSION_SECRET || "dev-only-secret-change-me", { expiresIn: "2d" });
}

router.post("/auth/register", authLimit, wrap((req, res) => {
  const b = parse(registerSchema, req.body);
  if (one("SELECT 1 AS x FROM users WHERE email = ?", b.email)) throw bad("An account with this e-mail already exists.");
  const r = run(
    "INSERT INTO users(email, name, password_hash, role, email_verified, business_name, created_at) VALUES(?,?,?,?,0,?,?)",
    b.email, b.name, hashPassword(b.password), b.role, b.businessName || null, now(),
  );
  const user = one("SELECT * FROM users WHERE id = ?", r.lastInsertRowid);
  notify(user.id, "welcome", {}, "/");
  notify(user.id, "verify", {}, "/verify");
  setSession(res, user);
  logActivity(user, "user.register", "user", user.id, { role: user.role }, ip(req));
  res.status(201).json({ user: publicUser(user), verifyToken: DEMO_MODE() ? verifyToken(user) : undefined });
}));

router.post("/auth/verify", wrap((req, res) => {
  const { token } = parse(z.object({ token: z.string() }), req.body);
  let uid;
  try {
    const p = jwt.verify(token, process.env.SESSION_SECRET || "dev-only-secret-change-me");
    if (p.purpose !== "verify") throw new Error("wrong token");
    uid = p.uid;
  } catch {
    throw bad("This verification link is invalid or has expired.");
  }
  run("UPDATE users SET email_verified = 1 WHERE id = ?", uid);
  res.json({ ok: true });
}));

router.post("/auth/resend", authLimit, requireAuth, wrap((req, res) => {
  notify(req.user.id, "verify", {}, "/verify");
  res.json({ ok: true, verifyToken: DEMO_MODE() ? verifyToken(req.user) : undefined });
}));

router.post("/auth/login", authLimit, wrap((req, res) => {
  const { email, password } = parse(z.object({ email: z.string().trim().toLowerCase(), password: z.string() }), req.body);
  const user = one("SELECT * FROM users WHERE email = ?", email);
  if (!user || !checkPassword(password, user.password_hash)) throw new HttpError(401, "E-mail or password is incorrect.");
  if (user.status !== "active") throw new HttpError(403, "This account is suspended. Contact support.");
  setSession(res, user);
  touchLogin(user.id);
  logActivity(user, "user.login", "user", user.id, null, ip(req));
  res.json({ user: publicUser(user) });
}));

router.post("/auth/logout", wrap((req, res) => {
  clearSession(res);
  res.json({ ok: true });
}));

router.get("/auth/me", wrap((req, res) => {
  if (!req.user) return res.json({ user: null });
  const s = settings();
  res.json({
    user: publicUser(req.user),
    bidding: biddingStatus(req.user, s.min_deposit_cents),
    unread: one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0", req.user.id).n,
  });
}));

// ------------------------------------------------------------ own profile and notifications
router.patch("/me", requireAuth, wrap((req, res) => {
  const b = parse(z.object({
    name: z.string().trim().min(2).max(60).optional(),
    phone: z.string().trim().max(30).optional(),
    city: z.string().trim().max(60).optional(),
    address: z.string().trim().max(160).optional(),
    businessName: z.string().trim().max(80).optional(),
    bio: z.string().trim().max(400).optional(),
    twoFactor: z.boolean().optional(),
  }), req.body);
  const map = { name: "name", phone: "phone", city: "city", address: "address", businessName: "business_name", bio: "bio", twoFactor: "two_factor" };
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(map)) {
    if (b[k] !== undefined) { sets.push(`${col} = ?`); args.push(k === "twoFactor" ? (b[k] ? 1 : 0) : b[k]); }
  }
  if (sets.length) run(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, ...args, req.user.id);
  res.json({ user: publicUser(one("SELECT * FROM users WHERE id = ?", req.user.id)) });
}));

router.post("/me/password", requireAuth, wrap((req, res) => {
  const b = parse(z.object({ current: z.string(), next: z.string().min(8).max(100) }), req.body);
  if (req.user.is_demo) throw new HttpError(403, "Demo accounts keep their password so the next visitor can sign in.");
  if (!checkPassword(b.current, req.user.password_hash)) throw bad("Your current password is incorrect.");
  run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(b.next), req.user.id);
  res.json({ ok: true });
}));

router.get("/me/notifications", requireAuth, wrap((req, res) => {
  const rows = all("SELECT id, type, title, body, link, read, created_at AS at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 60", req.user.id);
  res.json(rows.map((r) => ({ ...r, read: !!r.read })));
}));
router.post("/me/notifications/read", requireAuth, wrap((req, res) => {
  run("UPDATE notifications SET read = 1 WHERE user_id = ?", req.user.id);
  res.json({ ok: true });
}));
