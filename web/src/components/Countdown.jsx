import { AnimatePresence, motion } from "framer-motion";
import { useNow } from "../lib/session";
import { remaining, shortLeft } from "../lib/format";
import { cx } from "./ui";

export function TimeLeft({ endAt, className, prefix = "" }) {
  const now = useNow();
  const left = endAt - now;
  const urgent = left < 3_600_000;
  return <span className={cx("tabular-nums", urgent && left > 0 ? "font-bold text-bad" : "", className)}>{prefix}{shortLeft(left)}</span>;
}

function Digit({ v }) {
  return (
    <span className="relative inline-block h-[1em] w-[0.62em] overflow-hidden text-center leading-none">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={v} initial={{ y: "70%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "-70%", opacity: 0 }} transition={{ duration: 0.28 }} className="absolute inset-0">{v}</motion.span>
      </AnimatePresence>
    </span>
  );
}

function Unit({ value, unit }) {
  const t = String(value).padStart(2, "0");
  return (
    <div className="flex flex-col items-center">
      <div className="flex min-w-[3.4rem] items-center justify-center rounded-xl border border-line bg-soft px-2 py-2.5 font-display text-2xl font-extrabold tabular-nums sm:min-w-[4rem] sm:text-3xl">
        <Digit v={t[0]} />
        <Digit v={t[1]} />
      </div>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted">{unit}</span>
    </div>
  );
}

export function BigCountdown({ endAt, startAt, status }) {
  const now = useNow();
  if (status === "scheduled") {
    const r = remaining(startAt - now);
    return (
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-brand">Starts in</p>
        <div className="flex gap-2"><Unit value={r.d} unit="days" /><Unit value={r.h} unit="hrs" /><Unit value={r.m} unit="min" /><Unit value={r.s} unit="sec" /></div>
      </div>
    );
  }
  const r = remaining(endAt - now);
  const ended = r.total <= 0 || status !== "live";
  return (
    <div>
      <p className={cx("mb-2 text-xs font-bold uppercase tracking-widest", ended ? "text-muted" : r.total < 3600 ? "text-bad" : "text-ok")}>{ended ? "Auction ended" : r.total < 3600 ? "Ending very soon" : "Time left"}</p>
      <div className={cx("flex gap-2", ended && "opacity-50")}>
        {r.d > 0 && <Unit value={r.d} unit="days" />}
        <Unit value={ended ? 0 : r.h} unit="hrs" />
        <Unit value={ended ? 0 : r.m} unit="min" />
        <Unit value={ended ? 0 : r.s} unit="sec" />
      </div>
    </div>
  );
}
