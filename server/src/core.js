// Shared helpers: settings, activity log, notifications and e-mail outbox, wallet ledger, live events.
import { one, all, run } from "./db.js";

export const DAY = 86_400_000;
export const HOUR = 3_600_000;
let clock = null; // the seed script travels back in time through this
export const now = () => clock ?? Date.now();
export const setClock = (t) => { clock = t; };

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}
export const bad = (msg, extra) => new HttpError(400, msg, extra);
export const forbidden = (msg = "You do not have access to this.") => new HttpError(403, msg);
export const notFound = (msg = "Not found.") => new HttpError(404, msg);

// ---------------------------------------------------------------- settings
export const DEFAULTS = {
  site_name: "Bidora",
  currency: "USD",
  min_deposit_cents: 5000,
  commission_pct: 10,
  payment_window_days: 3,
  restriction_days: 15,
  forfeit_deposit: 1,
  durations: [3, 5, 7, 14],
  anti_snipe_window_sec: 120,
  anti_snipe_extension_sec: 120,
  default_min_increment_cents: 500,
  auto_release_payout: 1,
  auto_approve_sandbox_deposits: 1,
  reminder_hours: 24,
  max_images: 6,
  bid_cooldown_ms: 700,
};
let cache = null;
export function settings() {
  if (!cache) {
    cache = { ...DEFAULTS };
    for (const r of all("SELECT key, value FROM settings")) {
      try {
        cache[r.key] = JSON.parse(r.value);
      } catch {
        cache[r.key] = r.value;
      }
    }
  }
  return cache;
}
export function setSetting(key, value) {
  if (!(key in DEFAULTS)) throw bad(`Unknown setting: ${key}`);
  run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, JSON.stringify(value));
  cache = null;
}
export const resetSettingsCache = () => (cache = null);

// ---------------------------------------------------------------- live events (Socket.IO is attached at start)
export const hub = { io: null };
export function emit(room, event, payload) {
  hub.io?.to(room).emit(event, payload);
}

// ---------------------------------------------------------------- activity log
export function logActivity(actor, action, entity, entityId, meta, ip) {
  run(
    "INSERT INTO activity_logs(actor_id, actor_name, action, entity, entity_id, meta, ip, created_at) VALUES(?,?,?,?,?,?,?,?)",
    actor?.id ?? null,
    actor?.name ?? "System",
    action,
    entity ?? null,
    entityId ?? null,
    meta ? JSON.stringify(meta) : null,
    ip ?? null,
    now(),
  );
}

// ---------------------------------------------------------------- notifications + e-mail outbox
export const TEMPLATES = {
  welcome: ["Account registration", "Welcome to {{site}}", "Hi {{name}}, your account is ready. Confirm your e-mail address to start."],
  verify: ["E-mail verification", "Confirm your e-mail", "Hi {{name}}, confirm your e-mail address to activate your account."],
  deposit_confirmed: ["Deposit confirmation", "Deposit confirmed", "Your deposit of {{amount}} was confirmed. {{note}}"],
  bidding_enabled: ["Bidding permission activated", "You can bid now", "Your security deposit is in place. Bidding is enabled on your account."],
  new_bid: ["New bid received", "New bid on {{title}}", "{{bidder}} bid {{amount}} on your auction “{{title}}”."],
  outbid: ["Outbid notification", "You were outbid on {{title}}", "Someone placed a higher bid on “{{title}}”. The price is now {{amount}}."],
  ending_soon: ["Auction ending soon", "{{title}} ends soon", "“{{title}}” ends in less than an hour."],
  won: ["Auction won", "You won {{title}}", "You won “{{title}}” for {{amount}}. Pay within {{days}} days to keep your deposit."],
  payment_reminder: ["Payment deadline reminder", "Payment due soon", "Pay for “{{title}}” before {{due}}, otherwise your deposit is forfeited."],
  payment_received: ["Payment confirmation", "Payment received", "We received your payment of {{amount}} for “{{title}}”."],
  ship_instructions: ["Seller shipping instructions", "Ship {{title}} to our warehouse", "The buyer paid. Ship the item to the warehouse and add the tracking number. Never ship to the buyer."],
  warehouse_received: ["Warehouse product received", "Item received at the warehouse", "“{{title}}” arrived at the warehouse and is waiting for inspection."],
  inspection_result: ["Inspection approved or rejected", "Inspection {{result}}", "Inspection of “{{title}}”: {{result}}. {{note}}"],
  payout_released: ["Seller payout released", "Payout released", "{{amount}} for “{{title}}” was added to your available balance."],
  dispatched: ["Order dispatched", "Your order is on its way", "“{{title}}” was dispatched with {{courier}}, tracking {{tracking}}."],
  delivered: ["Delivery confirmation", "Delivered", "“{{title}}” was delivered. Thanks for using {{site}}."],
  refund: ["Refund and dispute updates", "Refund processed", "{{amount}} was refunded to your wallet. {{note}}"],
  dispute: ["Refund and dispute updates", "Dispute update", "There is an update on the dispute for order {{code}}."],
  restricted: ["Account restriction", "Bidding restricted", "Your bidding is restricted until {{until}}. {{note}}"],
  restored: ["Account restoration", "Bidding restored", "Your account can place bids again."],
  listing_review: ["Listing review", "Your listing: {{result}}", "Your listing “{{title}}” was {{result}}. {{note}}"],
};
export function seedTemplates() {
  for (const [key, [label, subject, body]] of Object.entries(TEMPLATES)) {
    run("INSERT OR IGNORE INTO email_templates(key,label,subject,body,enabled) VALUES(?,?,?,?,1)", key, label, subject, body);
  }
}
const fill = (text, vars) => String(text).replace(/{{(\w+)}}/g, (_, k) => (vars[k] ?? ""));
export const money = (cents) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function notify(userId, type, vars = {}, link = null) {
  const user = one("SELECT id, email, name FROM users WHERE id = ?", userId);
  const tpl = one("SELECT * FROM email_templates WHERE key = ?", type);
  if (!user || !tpl) return;
  const data = { site: settings().site_name, name: user.name, ...vars };
  const title = fill(tpl.subject, data);
  const body = fill(tpl.body, data).trim();
  run("INSERT INTO notifications(user_id,type,title,body,link,read,created_at) VALUES(?,?,?,?,?,0,?)", userId, type, title, body, link, now());
  if (tpl.enabled) {
    run("INSERT INTO emails(to_email,subject,body,template,status,created_at) VALUES(?,?,?,?, 'sent', ?)", user.email, title, body, type, now());
  }
  emit(`user:${userId}`, "notification", { type, title, body, link });
}

// ---------------------------------------------------------------- wallet ledger
// Every movement of money writes a row here; the cached balances on `users` always change in the same transaction.
const COLUMN = { wallet: "wallet_cents", deposit: "deposit_cents", pending: "pending_cents", earnings: "earnings_cents" };
export function move({ userId = null, account, type, amount, refType = null, refId = null, note = null, by = null }) {
  let after = null;
  if (userId && COLUMN[account]) {
    run(`UPDATE users SET ${COLUMN[account]} = ${COLUMN[account]} + ? WHERE id = ?`, amount, userId);
    after = one(`SELECT ${COLUMN[account]} AS v FROM users WHERE id = ?`, userId).v;
    if (after < 0) throw bad("Insufficient balance.");
  }
  run(
    "INSERT INTO transactions(user_id,account,type,amount_cents,balance_after,ref_type,ref_id,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    userId,
    account,
    type,
    amount,
    after,
    refType,
    refId,
    note,
    by,
    now(),
  );
}
