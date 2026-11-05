import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Bell, CheckCircle2, CircleDollarSign, Clock, CreditCard, Gavel, Heart, Landmark, LayoutDashboard, Package, ShieldAlert, ShieldCheck, Smartphone, Trophy, User, Wallet, Truck, Warehouse, Search, MessageSquareWarning, Send } from "lucide-react";
import { api } from "../lib/api";
import { useSession, useNow } from "../lib/session";
import { useToast } from "../lib/toast";
import { money, dateTime, dateOnly, ago, shortLeft, label } from "../lib/format";
import { AuctionCard } from "../components/AuctionCard";
import { TimeLeft } from "../components/Countdown";
import { Shell } from "../components/Layout";
import { Counter, Empty, Field, Modal, PageHeader, Skeleton, Spinner, Stat, Status, Tabs, useAsync, cx } from "../components/ui";

export function AccountLayout() {
  const { unread } = useSession();
  const nav = [
    { to: "/account", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/account/bids", label: "My bids", icon: Gavel },
    { to: "/account/watchlist", label: "Watchlist", icon: Heart },
    { to: "/account/orders", label: "Orders", icon: Package },
    { to: "/account/wallet", label: "Wallet & deposit", icon: Wallet },
    { to: "/account/notifications", label: "Notifications", icon: Bell, badge: unread || null },
    { to: "/account/profile", label: "Profile", icon: User },
  ];
  return <Shell title="My account" nav={nav} />;
}

const Loading = () => <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;

export function Overview() {
  const { data, loading } = useAsync(() => api.get("/api/buyer/summary"), []);
  const orders = useAsync(() => api.get("/api/buyer/orders"), []);
  const bids = useAsync(() => api.get("/api/buyer/bids"), []);
  if (loading || !data) return <Loading />;
  const b = data.bidding;
  const toPay = orders.data?.filter((o) => o.status === "awaiting_payment") ?? [];
  return (
    <div>
      <PageHeader eyebrow="Welcome back" title={data.user.name} subtitle="Here is what's happening with your bids and orders." />
      {!b.allowed && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-accent/30 bg-accent/10 p-5">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/20 text-accent"><AlertTriangle className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><p className="font-bold">{b.needDeposit ? "Bidding is locked" : "Bidding is paused"}</p><p className="text-sm text-muted">{b.needDeposit ? `Add a refundable security deposit of ${money(data.minDepositCents, { round: true })} to unlock bidding.` : b.reason}{b.until && <> Until {dateOnly(b.until)}.</>}</p></div>
          {b.needDeposit && <Link to="/account/wallet" className="btn-primary">Add deposit</Link>}
        </motion.div>
      )}
      {toPay.map((o) => (
        <motion.div key={o.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-brand/30 bg-brand/5 p-5">
          <img src={o.image} alt="" className="h-14 w-14 rounded-xl object-cover" />
          <div className="min-w-0 flex-1"><p className="flex items-center gap-2 font-bold"><Trophy className="h-4 w-4 text-accent" />You won {o.title}</p><p className="text-sm text-muted">Pay {money(o.amountCents)} within <TimeLeft endAt={o.paymentDueAt} className="font-bold text-ink" /> or your deposit is forfeited.</p></div>
          <Link to={`/account/orders/${o.id}`} className="btn-primary">Pay now <ArrowRight className="h-4 w-4" /></Link>
        </motion.div>
      ))}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Wallet" value={<Counter value={data.user.walletCents} format={(v) => money(v)} />} icon={Wallet} hint={`Deposit held: ${money(data.user.depositCents, { round: true })}`} />
        <Stat label="Active bids" value={data.activeBids} icon={Gavel} tone="accent" hint={`${data.winning} winning right now`} />
        <Stat label="Watching" value={data.watching} icon={Heart} tone="bad" hint="Saved auctions" />
        <Stat label="Items won" value={data.won} icon={Trophy} tone="ok" hint={`${money(data.spentCents, { round: true })} spent`} />
      </div>
      <h2 className="mb-3 mt-9 text-lg font-bold">Your latest bids</h2>
      {bids.loading ? <Skeleton className="h-40" /> : bids.data?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{bids.data.slice(0, 3).map((x, i) => <div key={x.auction.id} className="relative"><AuctionCard a={x.auction} index={i} /><span className={cx("badge absolute -top-2 right-3 z-10 shadow", x.state === "winning" || x.state === "won" ? "bg-ok text-white" : x.state === "outbid" ? "bg-bad text-white" : "bg-ink/80 text-white")}>{x.state === "winning" ? "Winning" : x.state === "won" ? "Won" : x.state === "outbid" ? "Outbid" : "Closed"}</span></div>)}</div>
      ) : <div className="card"><Empty icon={Gavel} title="No bids yet" hint="Find something you love and place your first bid." action={<Link to="/auctions" className="btn-primary">Browse auctions</Link>} /></div>}
    </div>
  );
}

export function MyBids() {
  const { data, loading } = useAsync(() => api.get("/api/buyer/bids"), []);
  const [tab, setTab] = useState("all");
  if (loading) return <Loading />;
  const list = (data ?? []).filter((x) => tab === "all" || (tab === "active" ? ["winning", "outbid"].includes(x.state) : tab === "won" ? x.state === "won" : ["lost", "closed"].includes(x.state)));
  const count = (f) => (data ?? []).filter(f).length;
  return (
    <div>
      <PageHeader title="My bids" subtitle="Every auction you have bid on." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "all", label: "All", count: data?.length }, { value: "active", label: "Active", count: count((x) => ["winning", "outbid"].includes(x.state)) }, { value: "won", label: "Won", count: count((x) => x.state === "won") }, { value: "lost", label: "Lost", count: count((x) => ["lost", "closed"].includes(x.state)) }]} />
      <div className="mt-5">
        {list.length === 0 ? <div className="card"><Empty icon={Gavel} title="Nothing here" hint="Auctions you bid on will appear here." /></div> : (
          <div className="card divide-y divide-line overflow-hidden">
            {list.map((x) => (
              <Link key={x.auction.id} to={`/auctions/${x.auction.id}`} className="flex items-center gap-4 p-4 transition hover:bg-soft/60">
                <img src={x.auction.images[0]} alt="" className="h-16 w-20 rounded-xl object-cover" />
                <div className="min-w-0 flex-1"><p className="truncate font-bold">{x.auction.title}</p><p className="text-sm text-muted">Your top bid {money(x.myBid)} · {x.myBids} {x.myBids === 1 ? "bid" : "bids"}</p></div>
                <div className="hidden text-right sm:block"><p className="font-display font-extrabold">{money(x.auction.currentPrice)}</p><p className="text-xs text-muted">{x.auction.status === "live" ? <TimeLeft endAt={x.auction.endAt} /> : "Ended"}</p></div>
                <span className={cx("badge", x.state === "winning" || x.state === "won" ? "bg-ok/12 text-ok" : x.state === "outbid" ? "bg-bad/12 text-bad" : "bg-soft text-muted")}>{label(x.state)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Watchlist() {
  const { data, loading } = useAsync(() => api.get("/api/buyer/watchlist"), []);
  if (loading) return <Loading />;
  return (
    <div>
      <PageHeader title="Watchlist" subtitle="Auctions you saved. We'll remind you when they are about to end." />
      {data?.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{data.map((a, i) => <AuctionCard key={a.id} a={a} index={i} />)}</div> : <div className="card"><Empty icon={Heart} title="No saved auctions" hint="Tap the heart on any auction to save it." action={<Link to="/auctions" className="btn-primary">Browse auctions</Link>} /></div>}
    </div>
  );
}

const TX_LABEL = { deposit: "Top-up", deposit_hold: "Security deposit", payment: "Order payment", refund: "Refund", forfeit: "Deposit forfeited", sale_pending: "Sale", payout: "Payout", payout_release: "Released", sale_reversal: "Sale reversed", payout_reversal: "Payout reversed" };

export function WalletPage() {
  const { user, refresh, config } = useSession();
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.get("/api/buyer/wallet"), []);
  const [amount, setAmount] = useState("100");
  const [method, setMethod] = useState("card_sandbox");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  if (loading || !data) return <Loading />;
  const missing = Math.max(0, data.minDepositCents - data.depositCents);
  const pct = Math.min(100, Math.round((data.depositCents / data.minDepositCents) * 100));
  const icons = { card_sandbox: CreditCard, bank_transfer: Landmark, mobile_wallet: Smartphone };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post("/api/buyer/deposits", { amountCents: Math.round(parseFloat(amount) * 100), method, reference: ref || undefined });
      toast(r.status === "approved" ? "Deposit confirmed" : "Deposit submitted", r.status === "approved" ? "ok" : "info", r.status === "approved" ? "Your wallet was topped up instantly (sandbox)." : "An admin will review your transfer shortly.");
      setRef("");
      await refresh();
      reload();
    } catch (err) { toast(err.message, "error"); } finally { setBusy(false); }
  };
  const activate = async () => {
    try { await api.post("/api/buyer/deposit/activate"); toast("Bidding enabled", "ok"); await refresh(); reload(); } catch (err) { toast(err.message, "error"); }
  };
  return (
    <div>
      <PageHeader title="Wallet & deposit" subtitle="Top up to pay for wins. A refundable security deposit unlocks bidding." />
      {data.restrictions.some((r) => r.status === "active") && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-bad/30 bg-bad/10 p-4"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-bad" /><div><p className="font-bold text-bad">Bidding is restricted</p>{data.restrictions.filter((r) => r.status === "active").map((r) => <p key={r.id} className="text-sm text-muted">{r.reason}. Ends {dateOnly(r.endsAt)}.</p>)}</div></div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Available balance</p>
          <p className="mt-1 font-display text-4xl font-extrabold"><Counter value={data.walletCents} format={(v) => money(v)} /></p>
          <p className="mt-2 text-sm text-muted">Used to pay for the auctions you win.</p>
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-muted">Security deposit</p>{data.bidding.allowed ? <span className="badge bg-ok/12 text-ok"><CheckCircle2 className="h-3.5 w-3.5" />Bidding enabled</span> : <span className="badge bg-accent/15 text-accent">Locked</span>}</div>
          <p className="mt-1 font-display text-4xl font-extrabold">{money(data.depositCents)}<span className="text-lg font-semibold text-muted"> / {money(data.minDepositCents, { round: true })}</span></p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-soft"><motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} className="h-full rounded-full" style={{ backgroundImage: "linear-gradient(90deg, rgb(var(--brand)), rgb(var(--brand2)))" }} /></div>
          {missing > 0 && data.walletCents >= missing && <button onClick={activate} className="btn-soft btn-sm mt-3">Use my balance for the deposit ({money(missing)})</button>}
        </div>
      </div>

      <div className="card mt-6 p-6">
        <h2 className="text-lg font-bold">Add money</h2>
        <form onSubmit={submit} className="mt-4 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <Field label="Amount (USD)"><input className="input font-display text-lg font-bold" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
            <div className="mt-2 flex flex-wrap gap-1.5">{[50, 100, 250, 500, 1000].map((v) => <button type="button" key={v} onClick={() => setAmount(String(v))} className={cx("rounded-full border px-3 py-1 text-xs font-semibold transition", amount === String(v) ? "border-brand bg-brand text-white" : "border-line text-muted hover:border-brand hover:text-brand")}>${v}</button>)}</div>
            {missing > 0 && <p className="mt-3 text-xs text-muted">The first {money(missing, { round: true })} goes to your security deposit, the rest to your wallet.</p>}
          </div>
          <div>
            <p className="label">Payment method</p>
            <div className="grid gap-2">
              {Object.entries(data.methods).map(([k, v]) => { const I = icons[k]; return (
                <button type="button" key={k} onClick={() => setMethod(k)} className={cx("flex items-center gap-3 rounded-xl border p-3 text-left transition", method === k ? "border-brand bg-brand/5" : "border-line hover:border-brand/50")}>
                  <span className={cx("grid h-9 w-9 place-items-center rounded-lg", method === k ? "bg-brand text-white" : "bg-soft text-muted")}><I className="h-[18px] w-[18px]" /></span>
                  <span className="text-sm font-semibold">{v}</span>
                </button>); })}
            </div>
            {method !== "card_sandbox" && <Field className="mt-3" label="Transfer reference"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Your bank or wallet transaction ID" required /></Field>}
            <button className="btn-primary btn-lg mt-4 w-full" disabled={busy}>{busy ? <Spinner /> : method === "card_sandbox" ? "Pay with test card" : "Submit for review"}</button>
            {method === "card_sandbox" && <p className="mt-2 text-center text-xs text-muted">Sandbox mode: no real card is charged.</p>}
          </div>
        </form>
      </div>

      {data.requests.length > 0 && (
        <div className="card mt-6 overflow-hidden">
          <h2 className="border-b border-line px-5 py-4 text-lg font-bold">Deposit requests</h2>
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Date</th><th>Method</th><th>Reference</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
            <tbody>{data.requests.map((r) => <tr key={r.id}><td>{dateTime(r.at)}</td><td>{data.methods[r.method]?.split(" (")[0]}</td><td className="text-muted">{r.reference ?? "–"}</td><td className="text-right font-semibold">{money(r.amount)}</td><td><Status value={r.status} /></td></tr>)}</tbody></table></div>
        </div>
      )}
      <div className="card mt-6 overflow-hidden">
        <h2 className="border-b border-line px-5 py-4 text-lg font-bold">Transactions</h2>
        {data.transactions.length === 0 ? <Empty icon={CircleDollarSign} title="No transactions yet" /> : (
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Date</th><th>Type</th><th>Note</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{data.transactions.filter((t) => !(t.account === "deposit" && t.type === "deposit_hold")).map((t) => <tr key={t.id}><td className="whitespace-nowrap">{dateTime(t.at)}</td><td>{TX_LABEL[t.type] ?? label(t.type)}</td><td className="max-w-[260px] truncate text-muted">{t.note}</td><td className={cx("text-right font-semibold tabular-nums", t.amount < 0 ? "text-bad" : "text-ok")}>{t.amount > 0 ? "+" : ""}{money(t.amount)}</td></tr>)}</tbody></table></div>
        )}
      </div>
    </div>
  );
}

export function Orders() {
  const { data, loading } = useAsync(() => api.get("/api/buyer/orders"), []);
  if (loading) return <Loading />;
  return (
    <div>
      <PageHeader title="Orders" subtitle="Items you won, from payment to delivery." />
      {data?.length ? (
        <div className="space-y-3">
          {data.map((o, i) => (
            <motion.div key={o.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Link to={`/account/orders/${o.id}`} className="card flex items-center gap-4 p-4 transition hover:shadow-lift">
                <img src={o.image} alt="" className="h-16 w-20 rounded-xl object-cover" />
                <div className="min-w-0 flex-1"><p className="truncate font-bold">{o.title}</p><p className="text-sm text-muted">{o.code} · {dateOnly(o.createdAt)}</p></div>
                <div className="hidden text-right sm:block"><p className="font-display font-extrabold">{money(o.amountCents)}</p>{o.status === "awaiting_payment" && <p className="text-xs font-semibold text-accent">Due in <TimeLeft endAt={o.paymentDueAt} /></p>}</div>
                <Status value={o.status} text={o.statusLabel} />
              </Link>
            </motion.div>
          ))}
        </div>
      ) : <div className="card"><Empty icon={Package} title="No orders yet" hint="When you win an auction, it shows up here." action={<Link to="/auctions" className="btn-primary">Find something</Link>} /></div>}
    </div>
  );
}

const STEPS = ["Won", "Paid", "Seller ships", "At warehouse", "Inspected", "Shipped", "Delivered"];
const STAGE = { awaiting_payment: 1, awaiting_shipment: 2, in_transit: 3, received: 4, packing: 5, shipped: 6, delivered: 7, completed: 7 };

function Stepper({ status }) {
  const cur = STAGE[status];
  if (cur == null) return null;
  return (
    <div className="overflow-x-auto"><ol className="flex min-w-[640px] items-start">
      {STEPS.map((s, i) => {
        const done = i < cur;
        const active = i === cur && status !== "completed";
        return (
          <li key={s} className="relative flex-1">
            {i > 0 && <span className="absolute left-0 right-1/2 top-4 h-0.5 -translate-y-1/2 bg-line"><motion.span initial={{ width: 0 }} animate={{ width: i <= cur ? "100%" : 0 }} transition={{ duration: 0.6, delay: i * 0.08 }} className="block h-full bg-brand" /></span>}
            {i < STEPS.length - 1 && <span className="absolute left-1/2 right-0 top-4 h-0.5 -translate-y-1/2 bg-line"><motion.span initial={{ width: 0 }} animate={{ width: i < cur ? "100%" : 0 }} transition={{ duration: 0.6, delay: i * 0.08 }} className="block h-full bg-brand" /></span>}
            <div className="relative flex flex-col items-center gap-2">
              <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ delay: i * 0.05, type: "spring", stiffness: 400, damping: 20 }} className={cx("relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-bold", done || (i === cur && status === "completed") ? "border-brand bg-brand text-white" : active ? "border-brand bg-surface text-brand" : "border-line bg-surface text-muted")}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                {active && <span className="absolute inset-0 animate-ping rounded-full bg-brand/30" />}
              </motion.span>
              <span className={cx("text-center text-xs font-semibold", done || active ? "text-ink" : "text-muted")}>{s}</span>
            </div>
          </li>
        );
      })}
    </ol></div>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const toast = useToast();
  const nav = useNavigate();
  const { refresh } = useSession();
  const { data, loading, reload, error } = useAsync(() => api.get(`/api/buyer/orders/${id}`), [id]);
  const [ship, setShip] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dispute, setDispute] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  if (error) return <Navigate to="/account/orders" replace />;
  if (loading || !data) return <Loading />;
  const { order: o, timeline, user } = data;
  const f = ship ?? { name: user.name, phone: user.phone ?? "", address: user.address ?? "", city: user.city ?? "" };
  const set = (k) => (e) => setShip({ ...f, [k]: e.target.value });
  const act = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast(ok); await refresh(); reload(); } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  const pay = (e) => { e.preventDefault(); act(() => api.post(`/api/buyer/orders/${o.id}/pay`, f), "Payment received"); };
  const wallet = user.walletCents;
  const short = o.amountCents - wallet;
  return (
    <div>
      <button onClick={() => nav("/account/orders")} className="btn-ghost -ml-3 mb-2">← Orders</button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4"><img src={o.image} alt="" className="h-20 w-24 rounded-2xl object-cover" />
          <div><p className="text-xs font-bold uppercase tracking-widest text-muted">{o.code}</p><Link to={`/auctions/${o.auctionId}`} className="text-2xl font-extrabold hover:text-brand">{o.title}</Link><p className="mt-1 font-display text-xl font-extrabold">{money(o.amountCents)}</p></div></div>
        <Status value={o.status} text={o.statusLabel} className="!px-3.5 !py-1.5 !text-sm" />
      </div>

      <div className="card mt-6 p-6"><Stepper status={o.status} /></div>

      {o.status === "awaiting_payment" && (
        <motion.form onSubmit={pay} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card mt-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Pay for your item</h2><p className="flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accent"><Clock className="h-3.5 w-3.5" />Due in <TimeLeft endAt={o.paymentDueAt} /></p></div>
          <p className="mt-1 text-sm text-muted">Deliver to the address below. We ship it after the seller sends it to our warehouse and it passes inspection.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><input className="input" value={f.name} onChange={set("name")} required /></Field>
            <Field label="Phone"><input className="input" value={f.phone} onChange={set("phone")} required /></Field>
            <Field label="Address" className="sm:col-span-2"><input className="input" value={f.address} onChange={set("address")} required minLength={5} /></Field>
            <Field label="City"><input className="input" value={f.city} onChange={set("city")} required /></Field>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-soft p-4">
            <div><p className="text-xs font-bold uppercase tracking-wide text-muted">Wallet balance</p><p className="font-display text-xl font-extrabold">{money(wallet)}</p></div>
            {short > 0 ? <Link to="/account/wallet" className="btn-soft">Add {money(short)} first</Link> : <button className="btn-primary btn-lg" disabled={busy}>{busy ? <Spinner /> : <>Pay {money(o.amountCents)}</>}</button>}
          </div>
        </motion.form>
      )}
      {o.status === "defaulted" && <div className="mt-6 rounded-2xl border border-bad/30 bg-bad/10 p-5 text-sm"><p className="font-bold text-bad">Payment deadline missed</p><p className="mt-1 text-muted">The order was cancelled, your deposit was forfeited and bidding is paused for a while. You can add a new deposit once the restriction ends.</p></div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-lg font-bold">Delivery</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            {o.shipTo && <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted">Ship to</dt><dd className="font-medium">{o.shipTo.name}<br />{o.shipTo.address}, {o.shipTo.city}<br />{o.shipTo.phone}</dd></div>}
            {o.outboundTracking ? <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted">Tracking</dt><dd className="font-medium">{o.outboundCourier} · <span className="font-mono">{o.outboundTracking}</span></dd></div> : <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted">Tracking</dt><dd className="text-muted">Available once it ships</dd></div>}
            {o.shippedAt && <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted">Shipped</dt><dd>{dateTime(o.shippedAt)}</dd></div>}
            {o.inspectionResult && <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted">Inspection</dt><dd><Status value={o.inspectionResult === "passed" ? "approved" : "rejected"} text={o.inspectionResult === "passed" ? "Passed" : "Failed, refunded"} /></dd></div>}
          </dl>
          {o.status === "shipped" || o.status === "delivered" ? <button className="btn-primary mt-5 w-full" disabled={busy} onClick={() => act(() => api.post(`/api/buyer/orders/${o.id}/confirm`), "Delivery confirmed")}>I received it</button> : null}
          {!["awaiting_payment", "defaulted", "refunded", "rejected_refunded"].includes(o.status) && !data.dispute && <button onClick={() => setDispute(true)} className="btn-ghost mt-3 w-full"><MessageSquareWarning className="h-4 w-4" />Report a problem</button>}
        </div>
        <div className="card p-6">
          <h2 className="text-lg font-bold">Timeline</h2>
          <ol className="mt-4 space-y-4">
            {[...timeline].reverse().map((e, i) => (
              <li key={i} className="relative pl-6 text-sm"><span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-brand" />{i < timeline.length - 1 && <span className="absolute left-[4px] top-4 h-[calc(100%+0.5rem)] w-px bg-line" />}
                <p className="font-semibold">{label(e.event)}</p>{e.note && <p className="text-muted">{e.note}</p>}<p className="text-xs text-muted">{dateTime(e.at)}</p></li>
            ))}
          </ol>
        </div>
      </div>

      {data.dispute && (
        <div className="card mt-6 p-6">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Support conversation</h2><Status value={data.dispute.status} /></div>
          <div className="mt-4 space-y-3">
            {data.dispute.thread.map((m) => <div key={m.id} className={cx("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm", m.authorRole === "admin" ? "bg-brand/10" : "ml-auto bg-soft")}><p className="text-xs font-bold text-muted">{m.author}</p><p>{m.body}</p><p className="mt-1 text-[11px] text-muted">{ago(m.at)}</p></div>)}
          </div>
          {["open", "investigating"].includes(data.dispute.status) ? (
            <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!msg.trim()) return; act(async () => { await api.post(`/api/buyer/disputes/${data.dispute.id}/messages`, { body: msg }); setMsg(""); }, "Message sent"); }}>
              <input className="input" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Write to support…" /><button className="btn-primary" disabled={busy}><Send className="h-4 w-4" /></button>
            </form>
          ) : data.dispute.resolution && <p className="mt-4 rounded-xl bg-ok/10 p-3 text-sm"><b>Resolution:</b> {data.dispute.resolution}</p>}
        </div>
      )}

      <Modal open={dispute} onClose={() => setDispute(false)} title="Report a problem" footer={<><button className="btn-ghost" onClick={() => setDispute(false)}>Cancel</button><button className="btn-primary" disabled={busy || reason.trim().length < 10} onClick={() => act(async () => { await api.post(`/api/buyer/orders/${o.id}/dispute`, { reason }); setDispute(false); setReason(""); }, "Support has been notified")}>Send to support</button></>}>
        <p className="mb-3 text-sm text-muted">Describe what's wrong. Our team will review the inspection photos and get back to you. You never need to contact the seller.</p>
        <textarea className="input min-h-[120px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What happened?" />
      </Modal>
    </div>
  );
}

export function NotificationsPage() {
  const { data, loading } = useAsync(() => api.get("/api/me/notifications"), []);
  const nav = useNavigate();
  if (loading) return <Loading />;
  return (
    <div>
      <PageHeader title="Notifications" subtitle="Every update about your bids, payments and orders. Copies go to your e-mail." />
      {data?.length ? <div className="card divide-y divide-line overflow-hidden">{data.map((n) => <button key={n.id} onClick={() => n.link && nav(n.link)} className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-soft/60"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" /><div className="min-w-0 flex-1"><p className="font-semibold">{n.title}</p><p className="text-sm text-muted">{n.body}</p></div><span className="shrink-0 text-xs text-muted">{ago(n.at)}</span></button>)}</div> : <div className="card"><Empty icon={Bell} title="All quiet" hint="Notifications will show up here." /></div>}
    </div>
  );
}

export function Profile() {
  const { user, refresh } = useSession();
  const toast = useToast();
  const [f, setF] = useState({ name: user.name, phone: user.phone ?? "", city: user.city ?? "", address: user.address ?? "", businessName: user.businessName ?? "", bio: user.bio ?? "" });
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.patch("/api/me", f); await refresh(); toast("Profile saved"); } catch (err) { toast(err.message, "error"); } finally { setBusy(false); }
  };
  const twoFa = async () => { await api.patch("/api/me", { twoFactor: !user.twoFactor }); await refresh(); toast(user.twoFactor ? "Two-factor authentication off" : "Two-factor authentication on", "info"); };
  const changePw = async (e) => {
    e.preventDefault();
    try { await api.post("/api/me/password", pw); setPw({ current: "", next: "" }); toast("Password changed"); } catch (err) { toast(err.message, "error"); }
  };
  return (
    <div>
      <PageHeader title="Profile & security" subtitle="Your details stay private. Other members never see your e-mail or phone." />
      <form onSubmit={save} className="card grid gap-4 p-6 sm:grid-cols-2">
        <Field label="Full name"><input className="input" value={f.name} onChange={set("name")} required /></Field>
        <Field label="E-mail"><input className="input opacity-70" value={user.email} disabled /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="City"><input className="input" value={f.city} onChange={set("city")} /></Field>
        <Field label="Address" className="sm:col-span-2"><input className="input" value={f.address} onChange={set("address")} /></Field>
        {user.role === "seller" && <><Field label="Shop name"><input className="input" value={f.businessName} onChange={set("businessName")} /></Field><Field label="About your shop" className="sm:col-span-2"><textarea className="input min-h-[90px]" value={f.bio} onChange={set("bio")} /></Field></>}
        <div className="sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy ? <Spinner /> : "Save changes"}</button></div>
      </form>
      <div className="card mt-6 flex flex-wrap items-center justify-between gap-4 p-6"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-ok/12 text-ok"><ShieldCheck className="h-5 w-5" /></span><div><p className="font-bold">Two-factor authentication</p><p className="text-sm text-muted">An extra code when you sign in from a new device.</p></div></div><button onClick={twoFa} className={user.twoFactor ? "btn-soft" : "btn-primary"}>{user.twoFactor ? "Turn off" : "Turn on"}</button></div>
      <form onSubmit={changePw} className="card mt-6 grid gap-4 p-6 sm:grid-cols-2">
        <h2 className="text-lg font-bold sm:col-span-2">Change password</h2>
        <Field label="Current password"><input className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
        <Field label="New password"><input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={8} /></Field>
        <div className="sm:col-span-2"><button className="btn-soft">Update password</button></div>
      </form>
    </div>
  );
}
