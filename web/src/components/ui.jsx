import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useInView } from "framer-motion";
import * as Icons from "lucide-react";
import { Loader2, X, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { STATUS_STYLE, label } from "../lib/format";

export const cx = (...a) => a.filter(Boolean).join(" ");

// Category icons arrive as kebab-case names from the API.
export function Icon({ name, className }) {
  const pascal = String(name || "tag").split("-").map((s) => s[0].toUpperCase() + s.slice(1)).join("");
  const C = Icons[pascal] ?? Icons[pascal.replace(/(\d)$/, "$1")] ?? Icons.Tag;
  return <C className={className} />;
}

export const Spinner = ({ className = "h-5 w-5" }) => <Loader2 className={cx("animate-spin", className)} />;

export function Status({ value, text, className }) {
  return <span className={cx("badge", STATUS_STYLE[value] ?? "bg-soft text-muted", className)}>{text ?? label(value)}</span>;
}

export function Skeleton({ className }) {
  return <div className={cx("skeleton", className)} />;
}

export function Empty({ icon: I = Inbox, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-soft text-muted"><I className="h-6 w-6" /></div>
      <p className="font-display text-lg font-bold">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand">{eyebrow}</p>}
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label: l, hint, error, children, className }) {
  return (
    <label className={cx("block", className)}>
      {l && <span className="label">{l}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-bad">{error}</span>}
    </label>
  );
}

// Counts up to a number when it first scrolls into view, and animates again when it changes.
export function Counter({ value, format = (v) => Math.round(v).toLocaleString("en-US"), className }) {
  const ref = useRef(null);
  const seen = useInView(ref, { once: true, margin: "-40px" });
  const prev = useRef(0);
  useEffect(() => {
    if (!seen) return;
    const c = animate(prev.current, value ?? 0, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => ref.current && (ref.current.textContent = format(v)) });
    prev.current = value ?? 0;
    return () => c.stop();
  }, [value, seen]);
  return <span ref={ref} className={className}>{format(0)}</span>;
}

export function Modal({ open, onClose, title, children, wide, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={title}
            initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.97 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={cx("card relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-b-none sm:rounded-2xl", wide ? "sm:max-w-2xl" : "sm:max-w-md")}>
            <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
              <h3 className="text-lg font-bold">{title}</h3>
              <button onClick={onClose} className="btn-ghost btn-sm !p-1.5" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="overflow-y-auto px-5 py-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-line bg-soft/40 px-5 py-3.5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Drawer({ open, onClose, title, subtitle, children, width = "max-w-xl" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90]">
          <motion.div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 340, damping: 38 }}
            className={cx("absolute right-0 top-0 flex h-full w-full flex-col border-l border-line bg-surface shadow-lift", width)}>
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0"><h3 className="truncate text-lg font-bold">{title}</h3>{subtitle && <p className="text-xs text-muted">{subtitle}</p>}</div>
              <button onClick={onClose} className="btn-ghost btn-sm !p-1.5" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cx("flex gap-1 overflow-x-auto rounded-xl bg-soft p-1", className)}>
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button key={t.value} onClick={() => onChange(t.value)} className={cx("relative shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition", on ? "text-ink" : "text-muted hover:text-ink")}>
            {on && <motion.span layoutId={`tab-${tabs[0].value}`} className="absolute inset-0 rounded-lg bg-surface shadow-card" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
            <span className="relative flex items-center gap-1.5">{t.label}{t.count != null && <span className={cx("rounded-full px-1.5 text-[11px]", on ? "bg-brand/12 text-brand" : "bg-line/70 text-muted")}>{t.count}</span>}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Pager({ total, limit, offset, onChange }) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return null;
  const cur = Math.floor(offset / limit);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
      <span>{offset + 1}–{Math.min(total, offset + limit)} of {total}</span>
      <div className="flex items-center gap-1">
        <button className="btn-ghost btn-sm" disabled={cur === 0} onClick={() => onChange((cur - 1) * limit)}><ChevronLeft className="h-4 w-4" /></button>
        <span className="px-2 font-semibold text-ink">{cur + 1} / {pages}</span>
        <button className="btn-ghost btn-sm" disabled={cur >= pages - 1} onClick={() => onChange((cur + 1) * limit)}><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function Stat({ label: l, value, hint, icon: I, tone = "brand", children }) {
  const tones = { brand: "bg-brand/12 text-brand", ok: "bg-ok/12 text-ok", accent: "bg-accent/15 text-accent", bad: "bg-bad/12 text-bad" };
  return (
    <motion.div whileHover={{ y: -2 }} className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">{l}</p>
        {I && <span className={cx("grid h-9 w-9 place-items-center rounded-xl", tones[tone])}><I className="h-[18px] w-[18px]" /></span>}
      </div>
      <p className="mt-2 font-display text-2xl font-extrabold sm:text-[28px]">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {children}
    </motion.div>
  );
}

export function Confirm({ open, title, text, confirmText = "Confirm", danger, busy, onConfirm, onClose, children }) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className={danger ? "btn-danger" : "btn-primary"} disabled={busy} onClick={onConfirm}>{busy ? <Spinner className="h-4 w-4" /> : confirmText}</button></>}>
      {text && <p className="text-sm text-muted">{text}</p>}
      {children}
    </Modal>
  );
}

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(fn)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState((s) => ({ ...s, error, loading: false })));
    return () => { alive = false; };
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

export const Fade = ({ children, delay = 0, className, y = 14 }) => (
  <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}>
    {children}
  </motion.div>
);
