import { one, all, run, tx } from "./db.js";
import { bad, forbidden, notFound, now, settings, notify, move, money, logActivity, emit } from "./core.js";

export const METHODS = {
  card_sandbox: "Test card (sandbox, instant)",
  bank_transfer: "Bank transfer (manual review)",
  mobile_wallet: "Mobile wallet (manual review)",
};

// Money arrives in the wallet; whatever is missing from the security deposit is held back first.
function applyConfirmedDeposit(userId, amount, refId, by) {
  const cfg = settings();
  const before = one("SELECT deposit_cents FROM users WHERE id = ?", userId).deposit_cents;
  move({ userId, account: "wallet", type: "deposit", amount, refType: "deposit_request", refId, note: "Deposit confirmed", by });
  if (before < cfg.min_deposit_cents) {
    const hold = Math.min(cfg.min_deposit_cents - before, amount);
    move({ userId, account: "wallet", type: "deposit_hold", amount: -hold, refType: "deposit_request", refId, note: "Moved to security deposit", by });
    move({ userId, account: "deposit", type: "deposit_hold", amount: hold, refType: "deposit_request", refId, note: "Security deposit", by });
  }
  const after = one("SELECT deposit_cents FROM users WHERE id = ?", userId).deposit_cents;
  const enabled = before < cfg.min_deposit_cents && after >= cfg.min_deposit_cents;
  notify(userId, "deposit_confirmed", { amount: money(amount), note: enabled ? "Bidding is now enabled." : "" }, "/account/wallet");
  if (enabled) notify(userId, "bidding_enabled", {}, "/auctions");
  return enabled;
}

export function requestDeposit(user, { amountCents, method, reference }) {
  if (user.role !== "buyer") throw forbidden("Only buyers have a wallet.");
  if (!METHODS[method]) throw bad("Choose a payment method.");
  if (!Number.isInteger(amountCents) || amountCents < 100) throw bad("The minimum top-up is $1.00.");
  if (amountCents > 5_000_000) throw bad("That is above the top-up limit of $50,000.");
  const cfg = settings();
  let id;
  let auto = false;
  tx(() => {
    const r = run("INSERT INTO deposit_requests(user_id, amount_cents, method, reference, status, created_at) VALUES(?,?,?,?, 'pending', ?)", user.id, amountCents, method, reference || null, now());
    id = Number(r.lastInsertRowid);
    if (method === "card_sandbox" && cfg.auto_approve_sandbox_deposits) {
      run("UPDATE deposit_requests SET status='approved', reviewed_at=?, note='Sandbox payment' WHERE id=?", now(), id);
      applyConfirmedDeposit(user.id, amountCents, id, null);
      auto = true;
    }
  });
  logActivity(user, "deposit.request", "deposit", id, { amountCents, method });
  if (!auto) emit("admin", "admin:queue", { kind: "deposit", id });
  return { id, status: auto ? "approved" : "pending" };
}

export function reviewDeposit(admin, id, decision, note = "") {
  tx(() => {
    const d = one("SELECT * FROM deposit_requests WHERE id = ?", id);
    if (!d) throw notFound();
    if (d.status !== "pending") throw bad("This deposit was already reviewed.");
    if (decision === "approve") {
      run("UPDATE deposit_requests SET status='approved', reviewed_by=?, reviewed_at=?, note=? WHERE id=?", admin.id, now(), note || null, id);
      applyConfirmedDeposit(d.user_id, d.amount_cents, id, admin.id);
    } else if (decision === "reject") {
      run("UPDATE deposit_requests SET status='rejected', reviewed_by=?, reviewed_at=?, note=? WHERE id=?", admin.id, now(), note || null, id);
      notify(d.user_id, "deposit_confirmed", { amount: money(d.amount_cents), note: `It was not approved. ${note}` }, "/account/wallet");
    } else throw bad("Unknown decision.");
  });
  logActivity(admin, `deposit.${decision}`, "deposit", id, { note });
}

// A buyer whose wallet already holds enough money can activate bidding without a new top-up.
export function activateFromWallet(user) {
  const cfg = settings();
  tx(() => {
    const u = one("SELECT * FROM users WHERE id = ?", user.id);
    const missing = cfg.min_deposit_cents - u.deposit_cents;
    if (missing <= 0) throw bad("Your security deposit is already in place.");
    if (u.wallet_cents < missing) throw bad(`Add at least ${money(missing - u.wallet_cents)} to your wallet first.`);
    move({ userId: u.id, account: "wallet", type: "deposit_hold", amount: -missing, note: "Moved to security deposit" });
    move({ userId: u.id, account: "deposit", type: "deposit_hold", amount: missing, note: "Security deposit" });
  });
  notify(user.id, "bidding_enabled", {}, "/auctions");
}

export function userTransactions(userId, limit = 100) {
  return all("SELECT id, account, type, amount_cents AS amount, balance_after AS balance, note, created_at AS at FROM transactions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?", userId, limit);
}
