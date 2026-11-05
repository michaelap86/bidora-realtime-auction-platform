// Everything that must happen on its own: starting and closing auctions, payment deadlines, restrictions.
import { all, run, tx } from "./db.js";
import { HOUR, DAY, now, settings, notify, emit } from "./core.js";
import { closeAuction, defaultOrder, expireRestrictions, orderEvent } from "./orders.js";

export function activateDue() {
  const due = all("SELECT id FROM auctions WHERE status = 'scheduled' AND start_at <= ?", now());
  for (const a of due) {
    run("UPDATE auctions SET status = 'live' WHERE id = ?", a.id);
    emit("auctions", "auction:update", { id: a.id, status: "live" });
  }
}

export function tick() {
  const cfg = settings();
  activateDue();

  for (const a of all("SELECT id FROM auctions WHERE status = 'live' AND end_at <= ?", now())) closeAuction(a.id);

  // "ending soon" for the highest bidder and everyone watching
  for (const a of all("SELECT id, title, highest_bidder_id FROM auctions WHERE status = 'live' AND ending_notified = 0 AND end_at - ? <= ?", now(), HOUR)) {
    const people = new Set(all("SELECT user_id FROM watchlist WHERE auction_id = ?", a.id).map((r) => r.user_id));
    if (a.highest_bidder_id) people.add(a.highest_bidder_id);
    for (const uid of people) notify(uid, "ending_soon", { title: a.title }, `/auctions/${a.id}`);
    run("UPDATE auctions SET ending_notified = 1 WHERE id = ?", a.id);
  }

  // payment deadlines: reminder first, then forfeit and restrict
  for (const o of all("SELECT o.id, o.buyer_id, o.payment_due_at, o.reminder_sent, a.title FROM orders o JOIN auctions a ON a.id = o.auction_id WHERE o.status = 'awaiting_payment'")) {
    if (o.payment_due_at <= now()) defaultOrder(o.id);
    else if (!o.reminder_sent && o.payment_due_at - now() <= cfg.reminder_hours * HOUR) {
      tx(() => {
        run("UPDATE orders SET reminder_sent = 1 WHERE id = ?", o.id);
        notify(o.buyer_id, "payment_reminder", { title: o.title, due: new Date(o.payment_due_at).toLocaleString("en-US") }, `/account/orders/${o.id}`);
      });
    }
  }

  expireRestrictions();

  // delivered orders complete themselves if the buyer does nothing for three days
  for (const o of all("SELECT id FROM orders WHERE status = 'delivered' AND delivered_at <= ?", now() - 3 * DAY)) {
    run("UPDATE orders SET status = 'completed', completed_at = ? WHERE id = ?", now(), o.id);
    orderEvent(o.id, null, "auto_completed", "No problem reported within 3 days");
  }
}

let timer = null;
export function startScheduler(ms = 1000) {
  stopScheduler();
  timer = setInterval(() => {
    try {
      tick();
    } catch (e) {
      console.error("scheduler error", e);
    }
  }, ms);
  timer.unref?.();
}
export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
