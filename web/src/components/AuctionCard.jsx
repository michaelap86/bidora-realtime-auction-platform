import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, Gavel, Heart, Clock } from "lucide-react";
import { useLive } from "../lib/live";
import { useNow, useSession } from "../lib/session";
import { api } from "../lib/api";
import { money } from "../lib/format";
import { useToast } from "../lib/toast";
import { TimeLeft } from "./Countdown";
import { cx } from "./ui";

export function AuctionCard({ a, index = 0 }) {
  const live = useLive(a.id);
  const { user } = useSession();
  const toast = useToast();
  const now = useNow(30_000);
  const [watching, setWatching] = useState(a.mine?.watching ?? false);
  const price = live?.currentPrice ?? a.currentPrice;
  const bids = live?.bidCount ?? a.bidCount;
  const endAt = live?.endAt ?? a.endAt;
  const status = live?.status ?? a.status;
  const ended = status === "sold" || status === "unsold";

  const toggle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return toast("Sign in to save auctions", "info");
    try {
      const r = await api.post(`/api/auctions/${a.id}/watch`);
      setWatching(r.watching);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.45, delay: Math.min(index, 8) * 0.045, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -6 }}
      className="group h-full"
    >
      <Link to={`/auctions/${a.id}`} className="card block h-full overflow-hidden transition-shadow duration-300 group-hover:shadow-lift">
        <div className="relative aspect-[4/3] overflow-hidden bg-soft">
          <img src={a.images[0]} alt={a.title} loading="lazy" className={cx("h-full w-full object-cover transition duration-700 ease-out group-hover:scale-110", ended && "grayscale-[.5]")} />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {status === "live" && (
              <span className="badge bg-ok text-white shadow"><span className="h-1.5 w-1.5 animate-ring rounded-full bg-white" />Live</span>
            )}
            {status === "scheduled" && <span className="badge bg-brand text-white shadow">Upcoming</span>}
            {ended && <span className="badge bg-ink/80 text-white">{status === "sold" ? "Sold" : "Ended"}</span>}
            {status === "live" && endAt - now < 3_600_000 && (
              <span className="badge bg-bad text-white shadow"><Flame className="h-3 w-3" />Ending soon</span>
            )}
          </div>
          <button onClick={toggle} aria-label="Save to watchlist" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-surface/90 shadow transition hover:scale-110 active:scale-90">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={watching ? "y" : "n"} initial={{ scale: 0.4 }} animate={{ scale: 1 }} exit={{ scale: 0.4 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
                <Heart className={cx("h-[18px] w-[18px]", watching ? "fill-bad text-bad" : "text-ink")} />
              </motion.span>
            </AnimatePresence>
          </button>
          <span className="absolute bottom-3 left-3 rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-semibold shadow">{a.category.name}</span>
        </div>
        <div className="p-4">
          <h3 className="line-clamp-2 min-h-[2.6rem] text-[15px] font-bold leading-snug">{a.title}</h3>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{ended ? (status === "sold" ? "Sold for" : "Final bid") : bids ? "Current bid" : "Starting bid"}</p>
              <motion.p key={price} initial={{ scale: 1.12, color: "rgb(var(--ok))" }} animate={{ scale: 1, color: "rgb(var(--ink))" }} transition={{ duration: 0.8 }} className="origin-left font-display text-xl font-extrabold tabular-nums">
                {money(price, { round: true })}
              </motion.p>
            </div>
            <div className="text-right text-xs text-muted">
              <p className="flex items-center justify-end gap-1"><Gavel className="h-3.5 w-3.5" />{bids} {bids === 1 ? "bid" : "bids"}</p>
              {!ended && (
                <p className="mt-0.5 flex items-center justify-end gap-1 font-semibold text-ink"><Clock className="h-3.5 w-3.5 text-muted" /><TimeLeft endAt={endAt} /></p>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export function CardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton aspect-[4/3] rounded-none" />
      <div className="space-y-3 p-4">
        <div className="skeleton h-4 w-4/5" />
        <div className="skeleton h-4 w-2/5" />
        <div className="skeleton h-6 w-1/3" />
      </div>
    </div>
  );
}
