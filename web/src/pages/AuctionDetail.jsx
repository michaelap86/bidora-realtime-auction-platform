import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, BadgeCheck, ChevronLeft, ChevronRight, Eye, Gavel, Heart, Lock, MapPin, ShieldCheck, Timer, Trophy, Truck, Users, Warehouse, Wallet, ZoomIn, AlertTriangle, Clock } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useSession, useNow } from "../lib/session";
import { useToast } from "../lib/toast";
import { money, ago, dateTime, dateOnly } from "../lib/format";
import { BigCountdown } from "../components/Countdown";
import { AuctionCard } from "../components/AuctionCard";
import { Modal, Skeleton, Spinner, Status, Tabs, cx } from "../components/ui";

function Gallery({ images, title }) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  useEffect(() => setI(0), [images[0]]);
  const go = (d) => setI((x) => (x + d + images.length) % images.length);
  return (
    <div>
      <div className="card group relative aspect-[4/3] overflow-hidden bg-soft">
        <AnimatePresence mode="wait" initial={false}>
          <motion.img key={images[i]} src={images[i]} alt={title} initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="absolute inset-0 h-full w-full object-cover" />
        </AnimatePresence>
        <button onClick={() => setZoom(true)} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-surface/90 opacity-0 shadow transition group-hover:opacity-100" aria-label="Zoom"><ZoomIn className="h-5 w-5" /></button>
        {images.length > 1 && (
          <>
            <button onClick={() => go(-1)} className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-surface/90 opacity-0 shadow transition group-hover:opacity-100" aria-label="Previous"><ChevronLeft className="h-5 w-5" /></button>
            <button onClick={() => go(1)} className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-surface/90 opacity-0 shadow transition group-hover:opacity-100" aria-label="Next"><ChevronRight className="h-5 w-5" /></button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">{images.map((_, k) => <span key={k} className={cx("h-1.5 rounded-full bg-white/90 transition-all", k === i ? "w-5" : "w-1.5 opacity-60")} />)}</div>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="mt-3 grid grid-cols-5 gap-2.5">
          {images.map((src, k) => (
            <button key={src + k} onClick={() => setI(k)} className={cx("aspect-[4/3] overflow-hidden rounded-xl border-2 bg-soft transition", k === i ? "border-brand" : "border-transparent opacity-70 hover:opacity-100")}>
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <Modal open={zoom} onClose={() => setZoom(false)} title={title} wide>
        <img src={images[i]} alt={title} className="w-full rounded-xl" />
      </Modal>
    </div>
  );
}

export default function AuctionDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user, bidding, config, refresh } = useSession();
  const now = useNow();
  const [a, setA] = useState(null);
  const [bids, setBids] = useState([]);
  const [related, setRelated] = useState([]);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("details");
  const [amount, setAmount] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outbid, setOutbid] = useState(false);
  const [extended, setExtended] = useState(0);
  const [needDeposit, setNeedDeposit] = useState(false);
  const flash = useRef(0);

  const load = useCallback(async () => {
    try {
      const d = await api.get(`/api/auctions/${id}`);
      setA(d.auction);
      setBids(d.bids);
      setRelated(d.related);
      setAmount("");
      setOutbid(false);
    } catch (e) { setErr(e); }
  }, [id]);
  useEffect(() => { setA(null); setErr(null); load(); window.scrollTo({ top: 0 }); }, [id, user?.id]);

  // live updates for this auction only
  useEffect(() => {
    const s = getSocket();
    const num = Number(id);
    const join = () => s.emit("watch", num);
    join();
    s.on("connect", join);
    const onBid = (p) => {
      if (p.auctionId !== num) return;
      flash.current = Date.now();
      const own = user ? `${user.name.trim()[0].toLowerCase()}***${user.name.trim().slice(-1).toLowerCase()}` : null;
      const mineNow = !!own && p.highestBidder === own;
      setA((o) => {
        if (!o) return o;
        if (o.mine?.isHighest && !mineNow) setOutbid(true);
        if (mineNow) setOutbid(false);
        return { ...o, currentPrice: p.currentPrice, nextMinBid: p.nextMinBid, bidCount: p.bidCount, endAt: p.endAt, highestBidder: p.highestBidder, extensions: o.extensions + (p.extended ? 1 : 0), mine: o.mine ? { ...o.mine, isHighest: mineNow } : o.mine };
      });
      setBids((b) => [p.bid, ...b.filter((x) => x.id !== p.bid.id)].slice(0, 60));
      if (p.extended) { setExtended((n) => n + 1); toast("Time extended", "info", `A late bid added ${config?.antiSnipeExtensionSec ?? 120} seconds.`); }
    };
    const onEnd = (p) => { if (p.auctionId === num) load(); };
    s.on("bid", onBid);
    s.on("ended", onEnd);
    return () => { s.emit("unwatch", num); s.off("connect", join); s.off("bid", onBid); s.off("ended", onEnd); };
  }, [id, user?.id]);

  const ended = a && (a.status === "sold" || a.status === "unsold");
  const live = a?.status === "live" && a.endAt > now;
  const min = a?.nextMinBid ?? 0;
  const inc = a?.minIncrement ?? 0;
  const parsed = Math.round(parseFloat(amount.replace(/[^0-9.]/g, "")) * 100);
  const value = Number.isFinite(parsed) ? parsed : 0;

  const place = async () => {
    setBusy(true);
    try {
      await api.post(`/api/auctions/${a.id}/bids`, { amount: value });
      setConfirm(false);
      setAmount("");
      setOutbid(false);
      setA((o) => ({ ...o, mine: { ...o.mine, isHighest: true } }));
      toast("You're the highest bidder!", "ok", `Your bid of ${money(value)} was placed.`);
      refresh();
    } catch (e) {
      setConfirm(false);
      if (e instanceof ApiError && e.data.code === "DEPOSIT_REQUIRED") setNeedDeposit(true);
      else toast(e.message, "error");
      if (e.data?.minBid) setAmount((e.data.minBid / 100).toFixed(2));
    } finally { setBusy(false); }
  };
  const watch = async () => {
    if (!user) return toast("Sign in to save auctions", "info");
    const r = await api.post(`/api/auctions/${a.id}/watch`);
    setA((o) => ({ ...o, mine: { ...o.mine, watching: r.watching }, watchers: o.watchers + (r.watching ? 1 : -1) }));
  };

  const mine = a?.mine;
  const myBidsTop = useMemo(() => (mine?.isHighest ? "winning" : outbid ? "outbid" : null), [mine?.isHighest, outbid]);

  if (err) return <div className="mx-auto max-w-lg px-4 py-24 text-center"><p className="font-display text-2xl font-extrabold">Auction not found</p><p className="mt-2 text-muted">It may have been removed or is still under review.</p><Link to="/auctions" className="btn-primary mt-6">Browse auctions</Link></div>;
  if (!a) return <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.1fr_1fr]"><Skeleton className="aspect-[4/3]" /><div className="space-y-4"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-24" /><Skeleton className="h-56" /></div></div>;

  const quick = [min, min + inc, min + inc * 2, min + inc * 5];
  const canBid = user?.role === "buyer";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <button onClick={() => nav(-1)} className="btn-ghost -ml-3 mb-3"><ArrowLeft className="h-4 w-4" />Back</button>
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div><Gallery images={a.images} title={a.title} /></div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/auctions?category=${a.category.slug}`} className="badge bg-soft text-muted hover:text-ink">{a.category.name}</Link>
            <span className="badge bg-soft text-muted">{a.condition}</span>
            {a.status === "live" && <span className="badge bg-ok/12 text-ok"><span className="h-1.5 w-1.5 animate-ring rounded-full bg-ok" />Live</span>}
            {a.status !== "live" && <Status value={a.status} />}
            {a.featured && <span className="badge bg-accent/15 text-accent">Featured</span>}
          </div>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">{a.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
            <span className="flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-brand" />{a.seller.name}</span>
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{a.seller.city}</span>
            <span className="flex items-center gap-1.5"><Eye className="h-4 w-4" />{a.views.toLocaleString()} views</span>
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{a.watchers} watching</span>
          </div>

          <div className="card mt-6 overflow-hidden">
            <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted">{ended ? (a.status === "sold" ? "Sold for" : "Final bid") : a.bidCount ? "Current bid" : "Starting bid"}</p>
                <motion.p key={a.currentPrice} initial={{ scale: 1.15, color: "rgb(var(--ok))" }} animate={{ scale: 1, color: "rgb(var(--ink))" }} transition={{ duration: 0.9 }} className="mt-1 origin-left font-display text-4xl font-extrabold tabular-nums sm:text-5xl">{money(a.currentPrice)}</motion.p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                  <span className="flex items-center gap-1.5 font-semibold text-ink"><Gavel className="h-4 w-4 text-brand" />{a.bidCount} {a.bidCount === 1 ? "bid" : "bids"}</span>
                  {a.highestBidder && <span>by <b className="text-ink">{a.highestBidder}</b></span>}
                </div>
                {a.reservePriceSet && (
                  <p className={cx("mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold", a.reserveMet ? "bg-ok/12 text-ok" : "bg-accent/15 text-accent")}>
                    <Lock className="h-3.5 w-3.5" />{a.reserveMet ? "Reserve price met" : "Reserve price not met yet"}
                  </p>
                )}
              </div>
              <BigCountdown endAt={a.endAt} startAt={a.startAt} status={a.status} />
            </div>

            <AnimatePresence>
              {extended > 0 && live && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <p className="flex items-center gap-2 bg-accent/10 px-6 py-2.5 text-xs font-semibold text-accent"><Timer className="h-4 w-4" />Anti-sniping: a late bid extended this auction ({a.extensions}×).</p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="border-t border-line bg-soft/40 p-5 sm:p-6">
              {ended && (
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand/12 text-brand"><Trophy className="h-5 w-5" /></span>
                  <div><p className="font-bold">{a.status === "sold" ? "This auction has ended" : "Ended without a sale"}</p><p className="text-sm text-muted">{a.status === "sold" ? (mine?.isHighest ? "You won! Pay within the deadline from your orders page." : "The winning bidder is completing payment.") : "The reserve price was not met."}</p></div>
                  {a.status === "sold" && mine?.isHighest && <Link to="/account/orders" className="btn-primary ml-auto">Pay now</Link>}
                </div>
              )}
              {a.status === "scheduled" && <p className="flex items-center gap-2 text-sm font-semibold text-brand"><Clock className="h-4 w-4" />Bidding opens {dateTime(a.startAt)}. Save it to get notified.</p>}
              {live && !user && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted">Sign in to place a bid on this item.</p>
                  <div className="flex gap-2"><Link to={`/login?next=/auctions/${a.id}`} className="btn-soft">Sign in</Link><Link to="/register" className="btn-primary">Join free</Link></div>
                </div>
              )}
              {live && user && !canBid && <p className="text-sm text-muted">{mine?.isSeller ? "This is your own listing." : "Only buyer accounts can place bids."}</p>}
              {live && canBid && (
                <div>
                  <AnimatePresence mode="wait">
                    {myBidsTop === "winning" && <motion.p key="w" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 flex items-center gap-2 rounded-xl bg-ok/12 px-3.5 py-2.5 text-sm font-bold text-ok"><Trophy className="h-4 w-4" />You're the highest bidder</motion.p>}
                    {myBidsTop === "outbid" && <motion.p key="o" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 flex items-center gap-2 rounded-xl bg-bad/12 px-3.5 py-2.5 text-sm font-bold text-bad"><AlertTriangle className="h-4 w-4" />You've been outbid. Bid again to take the lead.</motion.p>}
                  </AnimatePresence>
                  {bidding && !bidding.allowed ? (
                    <div className="rounded-xl border border-accent/30 bg-accent/10 p-4">
                      <p className="flex items-center gap-2 text-sm font-bold text-accent"><Wallet className="h-4 w-4" />{bidding.needDeposit ? "Add your security deposit to start bidding" : bidding.reason}</p>
                      {bidding.needDeposit && <p className="mt-1 text-xs text-muted">A refundable deposit of {money(config.minDepositCents, { round: true })} is required once. It is only lost if you win and don't pay on time.</p>}
                      <Link to="/account/wallet" className="btn-primary btn-sm mt-3">{bidding.needDeposit ? "Add deposit" : "Open wallet"}</Link>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 flex flex-wrap gap-2">
                        {quick.map((q, k) => (
                          <motion.button whileTap={{ scale: 0.94 }} key={k} onClick={() => setAmount((q / 100).toFixed(2))} className={cx("rounded-full border px-3.5 py-1.5 text-sm font-semibold transition", value === q ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-brand hover:text-brand")}>{money(q, { round: true })}</motion.button>
                        ))}
                      </div>
                      <form onSubmit={(e) => { e.preventDefault(); if (value < min) return toast(`Your bid must be at least ${money(min)}.`, "error"); setConfirm(true); }} className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-display text-lg font-bold text-muted">$</span>
                          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={(min / 100).toFixed(2)} aria-label="Your bid" className="input !rounded-2xl !py-3.5 !pl-9 font-display text-lg font-bold tabular-nums" />
                        </div>
                        <button className="btn-primary btn-lg"><Gavel className="h-5 w-5" />Place bid</button>
                      </form>
                      <p className="mt-2.5 text-xs text-muted">Minimum bid {money(min)} · increment {money(inc)}. Bids in the last {Math.round((config?.antiSnipeWindowSec ?? 120) / 60)} min extend the auction.</p>
                    </>
                  )}
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <button onClick={watch} className="btn-ghost btn-sm"><Heart className={cx("h-4 w-4", mine?.watching && "fill-bad text-bad")} />{mine?.watching ? "Saved" : "Save"}</button>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[[Warehouse, "Warehouse inspected", "Checked & photographed before delivery"], [ShieldCheck, "Buyer protection", "Refund if it fails inspection"], [Truck, "Tracked delivery", "Packed and shipped by us"]].map(([I, t, d]) => (
              <div key={t} className="card flex items-start gap-3 p-4"><I className="mt-0.5 h-5 w-5 shrink-0 text-brand" /><div><p className="text-sm font-bold">{t}</p><p className="text-xs text-muted">{d}</p></div></div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: "details", label: "Details" }, { value: "bids", label: "Bid history", count: bids.length }, { value: "shipping", label: "Shipping & payment" }]} />
          <div className="mt-5">
            {tab === "details" && (
              <div className="card p-6">
                <h2 className="text-lg font-bold">About this item</h2>
                <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-muted">{a.description}</p>
                <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 text-sm sm:grid-cols-4">
                  {[["Condition", a.condition], ["Category", a.category.name], ["Starting bid", money(a.startPrice, { round: true })], ["Increment", money(a.minIncrement, { round: true })], ["Started", dateOnly(a.startAt)], ["Ends", dateTime(a.endAt)], ["Seller since", dateOnly(a.seller.since)], ["Duration", `${a.durationDays} days`]].map(([k, v]) => (
                    <div key={k}><dt className="text-xs font-semibold uppercase tracking-wide text-muted">{k}</dt><dd className="mt-0.5 font-semibold">{v}</dd></div>
                  ))}
                </dl>
              </div>
            )}
            {tab === "bids" && (
              <div className="card overflow-hidden">
                {bids.length === 0 ? <p className="px-6 py-12 text-center text-sm text-muted">No bids yet. Be the first!</p> : (
                  <ul>
                    <AnimatePresence initial={false}>
                      {bids.map((b, i) => (
                        <motion.li layout key={b.id} initial={{ opacity: 0, x: -20, backgroundColor: "rgb(var(--ok) / .15)" }} animate={{ opacity: 1, x: 0, backgroundColor: "rgb(var(--ok) / 0)" }} transition={{ duration: 0.6 }} className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-3.5 last:border-0">
                          <div className="flex items-center gap-3"><span className={cx("grid h-9 w-9 place-items-center rounded-full text-sm font-bold", i === 0 ? "bg-ok/15 text-ok" : "bg-soft text-muted")}>{b.bidder[0]}</span><div><p className="text-sm font-semibold">{b.bidder}{i === 0 && <span className="badge ml-2 bg-ok/12 text-ok">Highest</span>}</p><p className="text-xs text-muted">{ago(b.at, now)}</p></div></div>
                          <p className="font-display text-lg font-extrabold tabular-nums">{money(b.amount)}</p>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </div>
            )}
            {tab === "shipping" && (
              <div className="card space-y-4 p-6 text-sm text-muted">
                <p><b className="text-ink">How delivery works.</b> After you win, you pay from your wallet within {config.paymentWindowDays} days. The seller ships the item to our warehouse, where we inspect and photograph it. Once it passes, we pack it and send it to you with tracking.</p>
                <p><b className="text-ink">If inspection fails.</b> You are refunded in full to your wallet.</p>
                <p><b className="text-ink">Privacy.</b> Buyers and sellers never see each other's contact details. All questions go through support.</p>
                <p><b className="text-ink">Missed the payment deadline?</b> The security deposit is forfeited and bidding is paused for {config.restrictionDays} days.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-5 text-2xl font-extrabold">More in {a.category.name}</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{related.map((r, i) => <AuctionCard key={r.id} a={r} index={i} />)}</div>
        </section>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Confirm your bid"
        footer={<><button className="btn-ghost" onClick={() => setConfirm(false)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={place}>{busy ? <Spinner className="h-4 w-4" /> : <>Bid {money(value)}</>}</button></>}>
        <p className="text-sm text-muted">You are bidding on</p>
        <p className="font-bold">{a.title}</p>
        <p className="my-4 font-display text-4xl font-extrabold">{money(value)}</p>
        <p className="rounded-xl bg-soft p-3 text-xs text-muted">Bids are binding. If you win, you must pay within {config.paymentWindowDays} days, otherwise your {money(config.minDepositCents, { round: true })} deposit is forfeited and bidding is paused for {config.restrictionDays} days.</p>
      </Modal>
      <Modal open={needDeposit} onClose={() => setNeedDeposit(false)} title="Security deposit needed"
        footer={<><button className="btn-ghost" onClick={() => setNeedDeposit(false)}>Later</button><Link to="/account/wallet" className="btn-primary">Add deposit</Link></>}>
        <p className="text-sm text-muted">Bidding needs a one-time security deposit of {money(config.minDepositCents, { round: true })}. It stays yours as long as you pay for the items you win.</p>
      </Modal>
    </div>
  );
}
