export const money = (cents, opts = {}) => {
  const v = (cents ?? 0) / 100;
  const whole = opts.compact && Math.abs(v) >= 10000;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: whole || (opts.round && Number.isInteger(v)) ? 0 : 2, maximumFractionDigits: whole ? 1 : 2, notation: whole ? "compact" : "standard" });
};
export const num = (n) => (n ?? 0).toLocaleString("en-US");
export const pct = (n) => `${n > 0 ? "+" : ""}${n}%`;

export function remaining(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60, total: s };
}
export function shortLeft(ms) {
  const r = remaining(ms);
  if (r.total <= 0) return "Ended";
  if (r.d > 0) return `${r.d}d ${r.h}h`;
  if (r.h > 0) return `${r.h}h ${r.m}m`;
  if (r.m > 0) return `${r.m}m ${String(r.s).padStart(2, "0")}s`;
  return `${r.s}s`;
}
export function ago(ts, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
export const dateTime = (ts) => (ts ? new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "–");
export const dateOnly = (ts) => (ts ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "–");
export const shortDay = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const STATUS_STYLE = {
  live: "bg-ok/12 text-ok", scheduled: "bg-brand/12 text-brand", pending: "bg-accent/15 text-accent", changes_requested: "bg-accent/15 text-accent",
  rejected: "bg-bad/12 text-bad", suspended: "bg-bad/12 text-bad", removed: "bg-bad/12 text-bad", sold: "bg-brand/12 text-brand", unsold: "bg-soft text-muted",
  awaiting_payment: "bg-accent/15 text-accent", defaulted: "bg-bad/12 text-bad", awaiting_shipment: "bg-brand/12 text-brand", in_transit: "bg-brand/12 text-brand",
  received: "bg-accent/15 text-accent", packing: "bg-brand/12 text-brand", shipped: "bg-brand/12 text-brand", delivered: "bg-ok/12 text-ok", completed: "bg-ok/12 text-ok",
  rejected_refunded: "bg-bad/12 text-bad", refunded: "bg-bad/12 text-bad", cancelled: "bg-soft text-muted",
  approved: "bg-ok/12 text-ok", open: "bg-accent/15 text-accent", investigating: "bg-brand/12 text-brand", resolved_buyer: "bg-ok/12 text-ok", resolved_seller: "bg-ok/12 text-ok",
  active: "bg-bad/12 text-bad", expired: "bg-soft text-muted", lifted: "bg-ok/12 text-ok", released: "bg-ok/12 text-ok", withheld: "bg-bad/12 text-bad", none: "bg-soft text-muted",
};
export const LABELS = {
  changes_requested: "Changes requested", awaiting_payment: "Awaiting payment", defaulted: "Payment missed", awaiting_shipment: "Seller to ship", in_transit: "In transit",
  received: "Awaiting inspection", packing: "Packing", rejected_refunded: "Failed inspection", resolved_buyer: "Resolved: buyer", resolved_seller: "Resolved: seller",
};
export const label = (s) => LABELS[s] ?? (s ? s[0].toUpperCase() + s.slice(1).replaceAll("_", " ") : "");
