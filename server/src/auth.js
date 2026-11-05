import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { one, run } from "./db.js";
import { HttpError, now } from "./core.js";

export const COOKIE = "bidora_session";
const SECRET = () => process.env.SESSION_SECRET || "dev-only-secret-change-me";
const TTL_SECONDS = 60 * 60 * 24 * 7;

export const hashPassword = (pw) => bcrypt.hashSync(pw, 10);
export const checkPassword = (pw, hash) => bcrypt.compareSync(pw, hash);

export function issueToken(user) {
  return jwt.sign({ uid: user.id, role: user.role }, SECRET(), { expiresIn: TTL_SECONDS });
}
export function setSession(res, user) {
  res.cookie(COOKIE, issueToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "1",
    maxAge: TTL_SECONDS * 1000,
    path: "/",
  });
}
export const clearSession = (res) => res.clearCookie(COOKIE, { path: "/" });

export const publicUser = (u) =>
  u && {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    emailVerified: !!u.email_verified,
    phone: u.phone,
    city: u.city,
    address: u.address,
    businessName: u.business_name,
    bio: u.bio,
    twoFactor: !!u.two_factor,
    walletCents: u.wallet_cents,
    depositCents: u.deposit_cents,
    pendingCents: u.pending_cents,
    earningsCents: u.earnings_cents,
    restrictedUntil: u.restricted_until && u.restricted_until > now() ? u.restricted_until : null,
    isDemo: !!u.is_demo,
    createdAt: u.created_at,
  };

// Attach the signed-in user (if any) to the request.
export function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const { uid } = jwt.verify(token, SECRET());
      const user = one("SELECT * FROM users WHERE id = ?", uid);
      if (user && user.status === "active") req.user = user;
    } catch {
      /* expired or forged: treat as signed out */
    }
  }
  next();
}
export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, "Please sign in."));
  next();
}
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, "Please sign in."));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, "You do not have access to this."));
  next();
};

// Bidding needs a confirmed security deposit and no active restriction.
export function biddingStatus(user, minDepositCents) {
  if (user.role !== "buyer") return { allowed: false, reason: "Only buyer accounts can bid." };
  if (!user.email_verified) return { allowed: false, reason: "Verify your e-mail address first." };
  if (user.restricted_until && user.restricted_until > now()) {
    return { allowed: false, reason: "Bidding is restricted on your account.", until: user.restricted_until };
  }
  if (user.deposit_cents < minDepositCents) {
    return { allowed: false, reason: "A security deposit is required before you can bid.", needDeposit: true };
  }
  return { allowed: true };
}

export function touchLogin(userId) {
  run("UPDATE users SET last_login_at = ? WHERE id = ?", now(), userId);
}
