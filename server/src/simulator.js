// Keeps the public demo lively: every so often a made-up bidder raises a live auction by one step.
import { one, all } from "./db.js";
import { placeBid } from "./auctions.js";

export function startSimulator() {
  const loop = () => {
    const delay = 18_000 + Math.random() * 30_000;
    setTimeout(() => {
      try {
        const a = one(
          `SELECT id, seller_id, highest_bidder_id, start_price, current_price, bid_count FROM auctions
           WHERE status = 'live' AND end_at > strftime('%s','now')*1000 + 60000 AND (bid_count = 0 OR current_price < start_price * 3)
           ORDER BY RANDOM() LIMIT 1`);
        if (a) {
          const bidder = one(
            `SELECT * FROM users WHERE role = 'buyer' AND is_demo = 0 AND deposit_cents >= 5000 AND (restricted_until IS NULL OR restricted_until < ?)
             AND id != ? AND id != ? ORDER BY RANDOM() LIMIT 1`, Date.now(), a.seller_id, a.highest_bidder_id ?? 0);
          if (bidder) {
            const cur = one("SELECT current_price, bid_count, start_price, min_increment FROM auctions WHERE id = ?", a.id);
            const amount = cur.bid_count ? cur.current_price + cur.min_increment : cur.start_price;
            placeBid(bidder, a.id, amount, "198.51.100.1");
          }
        }
      } catch {
        /* a rejected bid is fine, try again next time */
      }
      loop();
    }, delay).unref?.();
  };
  loop();
}
