import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Banknote, Clock, ImagePlus, LayoutDashboard, ListChecks, Package, PackagePlus, Plus, Trash2, Truck, Wallet, Warehouse, X, CheckCircle2, AlertCircle, Gavel, TrendingUp, UploadCloud } from "lucide-react";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { useToast } from "../lib/toast";
import { money, dateTime, dateOnly, shortDay, label } from "../lib/format";
import { Shell } from "../components/Layout";
import { TimeLeft } from "../components/Countdown";
import { Counter, Empty, Field, Modal, PageHeader, Skeleton, Spinner, Stat, Status, Tabs, useAsync, cx } from "../components/ui";

export function SellerLayout() {
  const nav = [
    { to: "/seller", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/seller/listings", label: "My listings", icon: ListChecks },
    { to: "/seller/listings/new", label: "New listing", icon: PackagePlus },
    { to: "/seller/orders", label: "Sales & shipping", icon: Truck },
    { to: "/seller/earnings", label: "Earnings", icon: Wallet },
    { to: "/account/notifications", label: "Notifications", icon: Clock },
    { to: "/account/profile", label: "Profile", icon: Package },
  ];
  return <Shell title="Seller" nav={nav} />;
}
const Loading = () => <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;

export function SellerDashboard() {
  const { data, loading } = useAsync(() => api.get("/api/seller/summary"), []);
  const toShip = useAsync(() => api.get("/api/seller/orders"), []);
  if (loading || !data) return <Loading />;
  const chart = data.daily.map((d) => ({ day: shortDay(d.day), net: d.net / 100 }));
  const todo = (toShip.data ?? []).filter((o) => o.status === "awaiting_shipment");
  return (
    <div>
      <PageHeader eyebrow="Seller dashboard" title={data.user.businessName || data.user.name} subtitle="Your listings, sales and earnings at a glance."
        actions={<Link to="/seller/listings/new" className="btn-primary"><Plus className="h-4 w-4" />New listing</Link>} />
      {todo.length > 0 && (
        <div className="mb-6 rounded-2xl border border-brand/30 bg-brand/5 p-5">
          <p className="flex items-center gap-2 font-bold"><Truck className="h-5 w-5 text-brand" />{todo.length} {todo.length === 1 ? "item is" : "items are"} paid and waiting for you to ship to the warehouse</p>
          <Link to="/seller/orders" className="btn-primary btn-sm mt-3">Open shipping instructions</Link>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Available" value={<Counter value={data.availableCents} format={(v) => money(v)} />} icon={Banknote} tone="ok" hint="Released after inspection" />
        <Stat label="Pending" value={<Counter value={data.pendingCents} format={(v) => money(v)} />} icon={Clock} tone="accent" hint="Paid, not yet inspected" />
        <Stat label="Live listings" value={data.live} icon={Gavel} hint={`${data.pending} in review · ${data.scheduled} scheduled`} />
        <Stat label="Items sold" value={data.sold} icon={TrendingUp} tone="ok" hint={`${money(data.totalSalesCents, { compact: true })} in sales`} />
      </div>
      <div className="card mt-6 p-6">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Net earnings, last 30 days</h2><span className="text-sm text-muted">{data.bidsReceived} bids received in total</span></div>
        {chart.length === 0 ? <Empty icon={TrendingUp} title="No sales in this period" hint="Your earnings will be charted here." /> : (
          <div className="h-64"><ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ left: -10, right: 8, top: 8 }}>
              <defs><linearGradient id="se" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgb(var(--brand))" stopOpacity={0.45} /><stop offset="100%" stopColor="rgb(var(--brand))" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} width={52} />
              <Tooltip formatter={(v) => [`$${v.toLocaleString()}`, "Net"]} contentStyle={{ borderRadius: 12, border: "1px solid rgb(var(--line))", background: "rgb(var(--surface))" }} />
              <Area type="monotone" dataKey="net" stroke="rgb(var(--brand))" strokeWidth={2.5} fill="url(#se)" animationDuration={900} />
            </AreaChart></ResponsiveContainer></div>
        )}
      </div>
      <p className="mt-4 text-xs text-muted">Marketplace commission so far: {money(data.commissionCents)}. Net earnings = sale price minus commission.</p>
    </div>
  );
}

export function SellerListings() {
  const { data, loading } = useAsync(() => api.get("/api/seller/listings"), []);
  const [tab, setTab] = useState("all");
  if (loading) return <Loading />;
  const groups = { all: () => true, live: (a) => a.status === "live" || a.status === "scheduled", review: (a) => ["pending", "changes_requested", "rejected"].includes(a.status), ended: (a) => ["sold", "unsold"].includes(a.status) };
  const list = data.filter(groups[tab]);
  const c = (k) => data.filter(groups[k]).length;
  return (
    <div>
      <PageHeader title="My listings" subtitle="Every listing is reviewed before it goes live." actions={<Link to="/seller/listings/new" className="btn-primary"><Plus className="h-4 w-4" />New listing</Link>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "all", label: "All", count: c("all") }, { value: "live", label: "Live", count: c("live") }, { value: "review", label: "In review", count: c("review") }, { value: "ended", label: "Ended", count: c("ended") }]} />
      <div className="mt-5 space-y-3">
        {list.length === 0 && <div className="card"><Empty icon={ListChecks} title="No listings here" action={<Link to="/seller/listings/new" className="btn-primary">Create a listing</Link>} /></div>}
        {list.map((a, i) => (
          <motion.div key={a.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="card p-4">
            <div className="flex flex-wrap items-center gap-4">
              <img src={a.images[0]} alt="" className="h-20 w-24 rounded-xl object-cover" />
              <div className="min-w-0 flex-1"><Link to={["live", "scheduled", "sold", "unsold"].includes(a.status) ? `/auctions/${a.id}` : `/seller/listings/${a.id}/edit`} className="line-clamp-1 font-bold hover:text-brand">{a.title}</Link>
                <p className="text-sm text-muted">{money(a.currentPrice)} · {a.bidCount} bids{a.status === "live" && <> · ends <TimeLeft endAt={a.endAt} /></>}</p></div>
              <Status value={a.status} />
              {["changes_requested", "rejected", "pending"].includes(a.status) && <Link to={`/seller/listings/${a.id}/edit`} className="btn-soft btn-sm">Edit</Link>}
            </div>
            {a.adminNote && ["changes_requested", "rejected", "suspended"].includes(a.status) && <p className="mt-3 flex items-start gap-2 rounded-xl bg-accent/10 p-3 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><span><b>Review note:</b> {a.adminNote}</span></p>}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const SAMPLES = ["w1", "w3", "c1", "c6", "a1", "t2", "h2", "h5", "b1", "j1", "m2", "r2", "d2", "g2", "k1", "f1"];
const CONDITIONS = ["New", "Like new", "Excellent", "Good", "Used"];

export function ListingForm() {
  const { id } = useParams();
  const { config } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const existing = useAsync(() => (id ? api.get("/api/seller/listings") : Promise.resolve(null)), [id]);
  const [f, setF] = useState({ title: "", description: "", categoryId: "", condition: "Excellent", start: "100", reserve: "", inc: "5", days: 7, startAt: "" });
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const file = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    const a = existing.data?.find((x) => x.id === Number(id));
    if (a) {
      setF({ title: a.title, description: a.description, categoryId: a.category.id, condition: a.condition, start: String(a.startPrice / 100), reserve: a.reservePrice ? String(a.reservePrice / 100) : "", inc: String(a.minIncrement / 100), days: a.durationDays, startAt: "" });
      setImages(a.images);
    }
  }, [existing.data]);

  const addFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const r = await api.upload("/api/seller/uploads", Array.from(files).slice(0, config.maxImages - images.length));
      setImages((i) => [...i, ...r.urls].slice(0, config.maxImages));
    } catch (e) { toast(e.message, "error"); } finally { setUploading(false); }
  };
  const addSample = (s) => images.length < config.maxImages && !images.includes(`/img/products/${s}.jpg`) && setImages((i) => [...i, `/img/products/${s}.jpg`]);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const body = {
      title: f.title, description: f.description, categoryId: Number(f.categoryId), condition: f.condition, images,
      startPrice: Math.round(parseFloat(f.start) * 100), reservePrice: f.reserve ? Math.round(parseFloat(f.reserve) * 100) : null,
      minIncrement: Math.round(parseFloat(f.inc) * 100), durationDays: Number(f.days), startAt: f.startAt ? new Date(f.startAt).getTime() : undefined,
    };
    try {
      if (id) await api.put(`/api/seller/listings/${id}`, body); else await api.post("/api/seller/listings", body);
      toast("Submitted for review", "ok", "An admin will approve it shortly.");
      nav("/seller/listings");
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title={id ? "Edit listing" : "New listing"} subtitle="Add clear photos and an honest description. Your item goes live after an admin approves it." />
      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="card space-y-4 p-6">
            <h2 className="text-lg font-bold">Item details</h2>
            <Field label="Title"><input className="input" value={f.title} onChange={set("title")} required minLength={6} placeholder="e.g. Steelcore Automatic Diver, 200m" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category"><select className="input" value={f.categoryId} onChange={set("categoryId")} required><option value="">Choose…</option>{config.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <Field label="Condition"><select className="input" value={f.condition} onChange={set("condition")}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></Field>
            </div>
            <Field label="Description" hint={`${f.description.length}/4000 · mention size, defects, what is included`}><textarea className="input min-h-[150px]" value={f.description} onChange={set("description")} required minLength={30} /></Field>
          </div>

          <div className="card p-6">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Photos <span className="text-sm font-medium text-muted">({images.length}/{config.maxImages})</span></h2>
              <button type="button" onClick={() => file.current?.click()} className="btn-soft btn-sm" disabled={uploading || images.length >= config.maxImages}>{uploading ? <Spinner className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}Upload</button></div>
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }} className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              <AnimatePresence>
                {images.map((src, i) => (
                  <motion.div key={src} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="group relative aspect-square overflow-hidden rounded-xl bg-soft">
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    {i === 0 && <span className="badge absolute left-1.5 top-1.5 bg-ink/80 text-white">Cover</span>}
                    <button type="button" onClick={() => setImages(images.filter((x) => x !== src))} className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-surface/90 opacity-0 shadow transition group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
                  </motion.div>
                ))}
              </AnimatePresence>
              {images.length === 0 && <button type="button" onClick={() => file.current?.click()} className="col-span-3 grid aspect-[3/1] place-items-center rounded-xl border-2 border-dashed border-line text-sm text-muted transition hover:border-brand hover:text-brand sm:col-span-6"><span className="flex items-center gap-2"><ImagePlus className="h-5 w-5" />Drop photos here or click to upload (JPG, PNG, WebP, max 5 MB)</span></button>}
            </div>
            <p className="label mt-5">Demo: use a sample photo</p>
            <div className="flex gap-2 overflow-x-auto pb-1">{SAMPLES.map((s) => <button type="button" key={s} onClick={() => addSample(s)} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line opacity-80 transition hover:opacity-100 hover:ring-2 hover:ring-brand"><img src={`/img/products/${s}.jpg`} alt="" className="h-full w-full object-cover" /></button>)}</div>
          </div>

          <div className="card space-y-4 p-6">
            <h2 className="text-lg font-bold">Pricing & schedule</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Starting bid ($)"><input className="input" inputMode="decimal" value={f.start} onChange={set("start")} required /></Field>
              <Field label="Reserve price ($)" hint="Optional. Hidden from bidders."><input className="input" inputMode="decimal" value={f.reserve} onChange={set("reserve")} /></Field>
              <Field label="Bid increment ($)"><input className="input" inputMode="decimal" value={f.inc} onChange={set("inc")} required /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Duration"><div className="flex flex-wrap gap-2">{config.durations.map((d) => <button type="button" key={d} onClick={() => setF({ ...f, days: d })} className={cx("rounded-xl border px-4 py-2 text-sm font-semibold transition", Number(f.days) === d ? "border-brand bg-brand text-white" : "border-line hover:border-brand")}>{d} days</button>)}</div></Field>
              <Field label="Start (optional)" hint="Leave empty to start as soon as it's approved."><input className="input" type="datetime-local" value={f.startAt} onChange={set("startAt")} /></Field>
            </div>
          </div>
          {err && <p className="rounded-xl bg-bad/10 px-4 py-3 text-sm font-medium text-bad">{err}</p>}
          <div className="flex gap-3"><button className="btn-primary btn-lg" disabled={busy || uploading}>{busy ? <Spinner /> : id ? "Resubmit for review" : "Submit for review"}</button><button type="button" className="btn-ghost btn-lg" onClick={() => nav("/seller/listings")}>Cancel</button></div>
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <p className="label">Live preview</p>
            <div className="card overflow-hidden">
              <div className="aspect-[4/3] bg-soft">{images[0] ? <img src={images[0]} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-muted"><ImagePlus className="h-8 w-8" /></div>}</div>
              <div className="p-4"><p className="line-clamp-2 min-h-[2.6rem] font-bold">{f.title || "Your title"}</p>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Starting bid</p><p className="font-display text-xl font-extrabold">{money(Math.round((parseFloat(f.start) || 0) * 100), { round: true })}</p>
                <p className="mt-2 text-xs text-muted">{f.days} days · +{money(Math.round((parseFloat(f.inc) || 0) * 100), { round: true })} per bid</p></div>
            </div>
            <p className="mt-3 text-xs text-muted">The marketplace commission ({config.commissionPct}%) is deducted from the final price when you are paid.</p>
          </div>
        </aside>
      </form>
    </div>
  );
}

export function SellerOrders() {
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.get("/api/seller/orders"), []);
  const [ship, setShip] = useState(null);
  const [f, setF] = useState({ courier: "DHL", tracking: "" });
  const [busy, setBusy] = useState(false);
  if (loading) return <Loading />;
  const send = async () => {
    setBusy(true);
    try { await api.post(`/api/seller/orders/${ship.id}/ship`, f); toast("Marked as shipped to the warehouse"); setShip(null); setF({ courier: "DHL", tracking: "" }); reload(); } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader title="Sales & shipping" subtitle="Ship only after the buyer has paid. Always to our warehouse, never to the buyer." />
      {data.length === 0 ? <div className="card"><Empty icon={Package} title="No sales yet" hint="When one of your auctions sells, it appears here." /></div> : (
        <div className="space-y-4">
          {data.map((o) => (
            <div key={o.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-4">
                <img src={o.image} alt="" className="h-16 w-20 rounded-xl object-cover" />
                <div className="min-w-0 flex-1"><p className="truncate font-bold">{o.title}</p><p className="text-sm text-muted">{o.code} · sold for {money(o.amountCents)} · you receive <b className="text-ink">{money(o.sellerNetCents)}</b></p></div>
                <Status value={o.status} text={o.statusLabel} />
              </div>
              {o.status === "awaiting_payment" && <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Clock className="h-4 w-4" />Waiting for the buyer to pay. Don't ship yet.</p>}
              {o.status === "awaiting_shipment" && o.warehouse && (
                <div className="mt-4 rounded-xl border border-brand/25 bg-brand/5 p-4">
                  <p className="flex items-center gap-2 font-bold"><Warehouse className="h-4 w-4 text-brand" />Ship to our warehouse</p>
                  <p className="mt-2 text-sm">{o.warehouse.name}<br />{o.warehouse.address}, {o.warehouse.city}<br />{o.warehouse.phone}</p>
                  <p className="mt-2 text-sm text-muted">Write <b className="text-ink">{o.shipRef}</b> on the parcel. {o.warehouse.instructions}</p>
                  <button className="btn-primary mt-3" onClick={() => setShip(o)}><Truck className="h-4 w-4" />I've shipped it</button>
                </div>
              )}
              {o.inboundTracking && <p className="mt-3 text-sm text-muted">Inbound: {o.inboundCourier} <span className="font-mono">{o.inboundTracking}</span> · sent {dateTime(o.sellerShippedAt)}</p>}
              {o.status === "received" && <p className="mt-3 flex items-center gap-2 text-sm text-muted"><CheckCircle2 className="h-4 w-4 text-ok" />Received at the warehouse. Inspection is next.</p>}
              {o.inspectionResult && <p className={cx("mt-3 rounded-xl p-3 text-sm", o.inspectionResult === "passed" ? "bg-ok/10 text-ink" : "bg-bad/10 text-ink")}><b>{o.inspectionResult === "passed" ? "Inspection passed." : "Inspection failed."}</b> {o.inspectionNotes}</p>}
              {o.payoutStatus === "released" && <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-ok"><Banknote className="h-4 w-4" />{money(o.sellerNetCents)} released {dateOnly(o.payoutAt)}</p>}
              {o.disputeOpen && <p className="mt-3 text-sm font-semibold text-accent">A dispute is open. Support will contact you if they need anything.</p>}
            </div>
          ))}
        </div>
      )}
      <Modal open={!!ship} onClose={() => setShip(null)} title="Add tracking number" footer={<><button className="btn-ghost" onClick={() => setShip(null)}>Cancel</button><button className="btn-primary" disabled={busy || f.tracking.length < 4} onClick={send}>{busy ? <Spinner className="h-4 w-4" /> : "Confirm shipment"}</button></>}>
        <div className="space-y-4"><Field label="Courier"><select className="input" value={f.courier} onChange={(e) => setF({ ...f, courier: e.target.value })}>{["DHL", "UPS", "FedEx", "Local post", "Other"].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Tracking number"><input className="input font-mono" value={f.tracking} onChange={(e) => setF({ ...f, tracking: e.target.value })} /></Field></div>
      </Modal>
    </div>
  );
}

export function Earnings() {
  const { data, loading } = useAsync(() => api.get("/api/seller/earnings"), []);
  if (loading) return <Loading />;
  return (
    <div>
      <PageHeader title="Earnings" subtitle="Payouts are released the same day an item passes warehouse inspection." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Available" value={money(data.availableCents)} icon={Banknote} tone="ok" />
        <Stat label="Pending" value={money(data.pendingCents)} icon={Clock} tone="accent" hint="Waiting for inspection" />
        <Stat label="Paid out" value={money(data.paidOutCents, { compact: true })} icon={Wallet} hint="All time" />
        <Stat label="Commission" value={money(data.commissionCents, { compact: true })} icon={Gavel} tone="bad" hint="Deducted from sales" />
      </div>
      <div className="card mt-6 overflow-hidden">
        <h2 className="border-b border-line px-5 py-4 text-lg font-bold">Payout history</h2>
        {data.payouts.length === 0 ? <Empty icon={Banknote} title="No payouts yet" /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Released</th><th>Order</th><th>Item</th><th className="text-right">Amount</th></tr></thead>
          <tbody>{data.payouts.map((p) => <tr key={p.id}><td className="whitespace-nowrap">{dateTime(p.at)}</td><td className="font-mono text-xs">{p.code}</td><td className="max-w-[260px] truncate">{p.title}</td><td className="text-right font-semibold text-ok">{money(p.amount)}</td></tr>)}</tbody></table></div>}
      </div>
      <div className="card mt-6 overflow-hidden">
        <h2 className="border-b border-line px-5 py-4 text-lg font-bold">Transactions</h2>
        <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Date</th><th>Type</th><th>Note</th><th className="text-right">Amount</th></tr></thead>
          <tbody>{data.transactions.map((t) => <tr key={t.id}><td className="whitespace-nowrap">{dateTime(t.at)}</td><td>{label(t.type)}</td><td className="max-w-[240px] truncate text-muted">{t.note}</td><td className={cx("text-right font-semibold tabular-nums", t.amount < 0 ? "text-bad" : "text-ok")}>{t.amount > 0 ? "+" : ""}{money(t.amount)}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  );
}
