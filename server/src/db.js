import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('buyer','seller','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  email_verified INTEGER NOT NULL DEFAULT 1,
  phone TEXT, city TEXT, address TEXT,
  business_name TEXT, bio TEXT,
  two_factor INTEGER NOT NULL DEFAULT 0,
  wallet_cents INTEGER NOT NULL DEFAULT 0,
  deposit_cents INTEGER NOT NULL DEFAULT 0,
  pending_cents INTEGER NOT NULL DEFAULT 0,
  earnings_cents INTEGER NOT NULL DEFAULT 0,
  restricted_until INTEGER,
  strikes INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, icon TEXT NOT NULL DEFAULT 'tag',
  sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS auctions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL REFERENCES users(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  title TEXT NOT NULL, description TEXT NOT NULL,
  condition TEXT NOT NULL,
  images TEXT NOT NULL DEFAULT '[]',
  start_price INTEGER NOT NULL, reserve_price INTEGER, min_increment INTEGER NOT NULL,
  current_price INTEGER NOT NULL DEFAULT 0,
  bid_count INTEGER NOT NULL DEFAULT 0,
  highest_bidder_id INTEGER REFERENCES users(id),
  duration_days INTEGER NOT NULL,
  start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, original_end_at INTEGER NOT NULL,
  extensions INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT, featured INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  ending_notified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, approved_at INTEGER, closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_auctions_status_end ON auctions(status, end_at);
CREATE INDEX IF NOT EXISTS idx_auctions_seller ON auctions(seller_id);
CREATE TABLE IF NOT EXISTS auction_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id INTEGER NOT NULL REFERENCES auctions(id),
  actor_id INTEGER, action TEXT NOT NULL, note TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id INTEGER NOT NULL REFERENCES auctions(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'valid',
  ip TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bids_auction ON bids(auction_id, amount DESC);
CREATE INDEX IF NOT EXISTS idx_bids_user ON bids(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS watchlist (
  user_id INTEGER NOT NULL, auction_id INTEGER NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, auction_id)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, account TEXT NOT NULL, type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL, balance_after INTEGER,
  ref_type TEXT, ref_id INTEGER, note TEXT, created_by INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type, created_at);
CREATE TABLE IF NOT EXISTS deposit_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL, method TEXT NOT NULL, reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending', note TEXT,
  reviewed_by INTEGER, reviewed_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  auction_id INTEGER NOT NULL UNIQUE REFERENCES auctions(id),
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  seller_id INTEGER NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL, commission_cents INTEGER NOT NULL, seller_net_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  payment_due_at INTEGER NOT NULL, paid_at INTEGER,
  ship_name TEXT, ship_phone TEXT, ship_address TEXT, ship_city TEXT,
  inbound_courier TEXT, inbound_tracking TEXT, seller_shipped_at INTEGER,
  received_at INTEGER, bin_location TEXT,
  inspection_result TEXT, inspection_notes TEXT, inspection_photos TEXT NOT NULL DEFAULT '[]', inspected_at INTEGER,
  packaging_status TEXT NOT NULL DEFAULT 'none',
  outbound_courier TEXT, outbound_tracking TEXT, label_code TEXT, shipped_at INTEGER,
  delivered_at INTEGER, completed_at INTEGER,
  payout_status TEXT NOT NULL DEFAULT 'none', payout_at INTEGER,
  reminder_sent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  actor_id INTEGER, event TEXT NOT NULL, note TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  seller_id INTEGER NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'released',
  method TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  user_id INTEGER NOT NULL, amount_cents INTEGER NOT NULL,
  reason TEXT, status TEXT NOT NULL DEFAULT 'completed', processed_by INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  opened_by INTEGER NOT NULL REFERENCES users(id), opened_role TEXT NOT NULL,
  reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', resolution TEXT,
  created_at INTEGER NOT NULL, resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS dispute_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispute_id INTEGER NOT NULL REFERENCES disputes(id),
  author_id INTEGER NOT NULL, author_role TEXT NOT NULL,
  audience TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS restrictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL, reason TEXT NOT NULL,
  starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', created_by INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  link TEXT, read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read, created_at DESC);
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, template TEXT,
  status TEXT NOT NULL DEFAULT 'sent', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS email_templates (
  key TEXT PRIMARY KEY, label TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER, actor_name TEXT, action TEXT NOT NULL, entity TEXT, entity_id INTEGER,
  meta TEXT, ip TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_time ON activity_logs(created_at DESC);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL, phone TEXT,
  instructions TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
`;

export function openDb(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  return db;
}

// One shared connection; better-sqlite3 is synchronous, so a transaction is naturally serialised.
export const state = { db: null };
export function init(file) {
  state.db = openDb(file);
  return state.db;
}
export const db = new Proxy(
  {},
  {
    get(_, prop) {
      const value = state.db[prop];
      return typeof value === "function" ? value.bind(state.db) : value;
    },
  },
);
export const one = (sql, ...p) => state.db.prepare(sql).get(...p);
export const all = (sql, ...p) => state.db.prepare(sql).all(...p);
export const run = (sql, ...p) => state.db.prepare(sql).run(...p);
export const tx = (fn) => state.db.transaction(fn).immediate();
