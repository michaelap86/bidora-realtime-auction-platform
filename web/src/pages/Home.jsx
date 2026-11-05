import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, BadgeCheck, Banknote, Gavel, PackageCheck, Search, ShieldCheck, Timer, Truck, Warehouse, Zap, Users, Flame, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { useFeed } from "../lib/live";
import { money, num, ago } from "../lib/format";
import { AuctionCard, CardSkeleton } from "../components/AuctionCard";
import { TimeLeft } from "../components/Countdown";
import { Counter, Fade, Icon, useAsync } from "../components/ui";

function HeroStack({ items }) {
  const [a, b, c] = items;
  if (!a) return <div className="skeleton aspect-[4/5] w-full max-w-md" />;
  const Card = ({ x, className, delay, rotate }) => (
    <motion.div initial={{ opacity: 0, y: 40, rotate: 0 }} animate={{ opacity: 1, y: 0, rotate }} transition={{ delay, duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className={`absolute ${className}`}>
      <div className="animate-floaty" style={{ animationDelay: `${delay * 3}s` }}>
        <Link to={`/auctions/${x.id}`} className="card block w-56 overflow-hidden shadow-lift transition hover:scale-[1.03] sm:w-60">
          <div className="relative aspect-[4/3]"><img src={x.images[0]} alt={x.title} className="h-full w-full object-cover" />
            <span className="badge absolute left-2.5 top-2.5 bg-ok text-white"><span className="h-1.5 w-1.5 animate-ring rounded-full bg-white" />Live</span>
          </div>
          <div className="p-3"><p className="line-clamp-1 text-sm font-bold">{x.title}</p>
            <div className="mt-1.5 flex items-center justify-between text-xs"><span className="font-display text-base font-extrabold">{money(x.currentPrice, { round: true })}</span><TimeLeft endAt={x.endAt} className="text-muted" /></div></div>
        </Link>
      </div>
    </motion.div>
  );
  return (
    <div className="relative mx-auto h-[430px] w-full max-w-[440px] sm:h-[500px]">
      <div className="absolute inset-6 rounded-[2.5rem] opacity-60 blur-3xl" style={{ backgroundImage: "linear-gradient(135deg, rgb(var(--brand) / .5), rgb(var(--brand2) / .45))" }} />
      <Card x={a} className="left-0 top-4 z-10" delay={0.1} rotate={-5} />
      {b && <Card x={b} className="right-0 top-36 z-20 sm:top-40" delay={0.3} rotate={4} />}
      {c && <Card x={c} className="bottom-0 left-6 z-30" delay={0.5} rotate={-2} />}
    </div>
  );
}

function Ticker({ items }) {
  if (!items.length) return null;
  const row = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-line bg-surface/70 py-3">
      <div className="absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-bg to-transparent" />
      <div className="absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-bg to-transparent" />
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap text-sm">
        {row.map((b, i) => (
          <Link key={`${b.id}-${i}`} to={`/auctions/${b.auctionId}`} className="flex items-center gap-2 text-muted hover:text-ink">
            <Gavel className="h-4 w-4 text-brand" /><span className="font-semibold text-ink">{b.bidder}</span> bid <span className="font-bold text-ok">{money(b.amount, { round: true })}</span> on <span className="max-w-[220px] truncate">{b.title}</span><span className="text-xs">· {ago(b.at)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const STEPS = [
  [Search, "Find something great", "Browse live auctions across 12 categories, or save items to your watchlist."],
  [Gavel, "Place your bid", "Bid in real time. If someone bids in the last minutes, the clock extends so nobody gets sniped."],
  [Warehouse, "We inspect it", "The seller ships to our warehouse. We check, photograph and verify every item before it moves on."],
  [PackageCheck, "Delivered to you", "We pack it and send it to you. Sellers are paid the same day the item passes inspection."],
];

export default function Home() {
  const { config, user } = useSession();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const ending = useAsync(() => api.get("/api/auctions?sort=ending&limit=8"), []);
  const hot = useAsync(() => api.get("/api/auctions?sort=bids&limit=4&featured=1"), []);
  const stats = useAsync(() => api.get("/api/stats"), []);
  const [feed, setFeed] = useState([]);
  useAsync(async () => { setFeed(await api.get("/api/feed")); return 1; }, []);
  const onBid = useCallback((e) => setFeed((f) => [{ id: `${e.auctionId}-${e.at}`, ...e }, ...f].slice(0, 14)), []);
  useFeed(onBid);

  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 60]);

  return (
    <div>
      <section className="relative overflow-hidden">
        <motion.div style={{ y }} className="pointer-events-none absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full opacity-30 blur-3xl" aria-hidden>
          <div className="h-full w-full rounded-full" style={{ backgroundImage: "conic-gradient(from 90deg, rgb(var(--brand)), rgb(var(--brand2)), rgb(var(--accent)), rgb(var(--brand)))" }} />
        </motion.div>
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-20">
          <div>
            <motion.span initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="badge mb-5 bg-brand/10 text-brand"><Zap className="h-3.5 w-3.5" />Real-time bidding · warehouse verified</motion.span>
            <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.7, ease: [0.16, 1, 0.3, 1] }} className="text-4xl font-extrabold leading-[1.05] sm:text-6xl">
              Bid live. Win <span className="gradient-text">verified</span> finds.
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.7 }} className="mt-5 max-w-xl text-lg text-muted">
              Watches, cameras, sneakers, jewelry and more from individual sellers. Every winning item passes through our warehouse, so you get exactly what was listed.
            </motion.p>
            <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.7 }} onSubmit={(e) => { e.preventDefault(); nav(`/auctions?q=${encodeURIComponent(q)}`); }} className="mt-8 flex max-w-xl gap-2 rounded-2xl border border-line bg-surface p-2 shadow-lift">
              <div className="relative flex-1"><Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try “chronograph” or “mirrorless”" className="w-full bg-transparent py-3 pl-11 pr-3 text-[15px] outline-none placeholder:text-muted/70" /></div>
              <button className="btn-primary btn-lg !rounded-xl">Search</button>
            </motion.form>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-ok" />Inspected before delivery</span>
              <span className="flex items-center gap-2"><Timer className="h-4 w-4 text-brand" />Anti-sniping protection</span>
              <span className="flex items-center gap-2"><Banknote className="h-4 w-4 text-accent" />Secure wallet</span>
            </motion.div>
          </div>
          <HeroStack items={hot.data?.items ?? ending.data?.items?.slice(0, 3) ?? []} />
        </div>
      </section>

      <Ticker items={feed} />

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            [Gavel, "Live auctions", stats.data?.live, num, "brand"],
            [Flame, "Bids placed", stats.data?.bids, num, "accent"],
            [Users, "Members", stats.data?.members, num, "ok"],
            [BadgeCheck, "Items sold", stats.data?.soldCents, (v) => money(v, { compact: true, round: true }), "brand"],
          ].map(([I, l, v, f, tone], i) => (
            <Fade key={l} delay={i * 0.06}>
              <div className="card flex items-center gap-4 p-5">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl ${tone === "accent" ? "bg-accent/15 text-accent" : tone === "ok" ? "bg-ok/12 text-ok" : "bg-brand/12 text-brand"}`}><I className="h-6 w-6" /></span>
                <div><p className="font-display text-2xl font-extrabold"><Counter value={v ?? 0} format={f} /></p><p className="text-xs font-semibold uppercase tracking-wide text-muted">{l}</p></div>
              </div>
            </Fade>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <Fade><div className="mb-6 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-brand">Browse</p><h2 className="text-2xl font-extrabold sm:text-3xl">Shop by category</h2></div>
          <Link to="/auctions" className="btn-ghost">All auctions <ArrowRight className="h-4 w-4" /></Link></div></Fade>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(config?.categories ?? []).map((c, i) => (
            <Fade key={c.id} delay={i * 0.03}>
              <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.97 }}>
                <Link to={`/auctions?category=${c.slug}`} className="card group flex flex-col items-center gap-2.5 p-4 text-center transition-shadow hover:shadow-lift">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-soft text-brand transition group-hover:scale-110 group-hover:bg-brand group-hover:text-white"><Icon name={c.icon} className="h-6 w-6" /></span>
                  <span className="text-sm font-bold leading-tight">{c.name}</span>
                  <span className="text-xs text-muted">{c.live} live</span>
                </Link>
              </motion.div>
            </Fade>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
        <Fade><div className="mb-6 flex items-end justify-between"><div><p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-bad"><Flame className="h-3.5 w-3.5" />Don't miss out</p><h2 className="text-2xl font-extrabold sm:text-3xl">Ending soon</h2></div>
          <Link to="/auctions?sort=ending" className="btn-ghost">See all <ArrowRight className="h-4 w-4" /></Link></div></Fade>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ending.loading ? Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />) : ending.data?.items.map((a, i) => <AuctionCard key={a.id} a={a} index={i} />)}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6">
        <Fade><div className="text-center"><p className="text-xs font-bold uppercase tracking-widest text-brand">Simple and safe</p><h2 className="mt-1 text-2xl font-extrabold sm:text-4xl">How Bidora works</h2></div></Fade>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([I, t, d], i) => (
            <Fade key={t} delay={i * 0.08}>
              <div className="card relative h-full p-6">
                <span className="absolute right-5 top-4 font-display text-5xl font-extrabold text-line">{i + 1}</span>
                <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl text-white shadow-glow" style={{ backgroundImage: "linear-gradient(135deg, rgb(var(--brand)), rgb(var(--brand2)))" }}><I className="h-6 w-6" /></span>
                <h3 className="text-lg font-bold">{t}</h3><p className="mt-2 text-sm text-muted">{d}</p>
              </div>
            </Fade>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6">
        <Fade>
          <div className="relative overflow-hidden rounded-[2rem] p-8 text-white sm:p-14" style={{ backgroundImage: "linear-gradient(135deg, #3b2bb8, #6d4cff 55%, #c026d3)" }}>
            <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
            <div className="relative grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
              <div>
                <h2 className="text-3xl font-extrabold sm:text-4xl">Got something to sell?</h2>
                <p className="mt-3 max-w-lg text-white/80">List it as an individual. No company papers needed. We review every listing, handle inspection and shipping, and pay you the same day your item passes.</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link to={user?.role === "seller" ? "/seller/listings/new" : "/register"} className="btn bg-white !text-brand hover:bg-white/90 btn-lg">Start selling <ArrowRight className="h-4 w-4" /></Link>
                  <Link to="/how-it-works" className="btn btn-lg border border-white/30 text-white hover:bg-white/10">Learn more</Link>
                </div>
              </div>
              <ul className="space-y-3 text-sm">
                {[[BadgeCheck, "Individuals welcome, no business papers"], [Truck, "We pack and ship to the winner"], [Banknote, "Same-day payout after inspection"], [Sparkles, "You set the reserve and the increment"]].map(([I, t]) => (
                  <li key={t} className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 backdrop-blur"><I className="h-5 w-5 shrink-0" />{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </Fade>
      </section>
    </div>
  );
}
