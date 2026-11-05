import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ClipboardCheck, Eye, FilePenLine, Gavel, Pause, Play, Plus, Star, Trash2, X, Tags } from "lucide-react";
import { api, qs } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { getSocket } from "../../lib/socket";
import { money, dateTime, ago, label } from "../../lib/format";
import { Drawer, Empty, Field, Modal, PageHeader, Pager, Skeleton, Spinner, Status, Tabs, useAsync, cx, Icon } from "../../components/ui";
import { TimeLeft } from "../../components/Countdown";
import { AdminTable, Row, SearchBox, Toolbar, useQueueEvents } from "./kit";

function ReviewActions({ a, onDone, size = "" }) {
  const toast = useToast();
  const [ask, setAsk] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (decision, n = "") => {
    setBusy(true);
    try { await api.post(`/api/admin/auctions/${a.id}/review`, { decision, note: n }); toast(`Listing ${decision === "approve" ? "approved" : decision === "reject" ? "rejected" : decision === "changes" ? "sent back for changes" : decision === "suspend" ? "suspended" : decision === "restore" ? "restored" : "removed"}`); setAsk(null); setNote(""); onDone?.(); } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  const s = a.status;
  const btn = `btn-sm ${size}`;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {["pending", "changes_requested"].includes(s) && <>
          <button className={`btn-ok ${btn}`} disabled={busy} onClick={() => run("approve")}><Check className="h-3.5 w-3.5" />Approve</button>
          <button className={`btn-soft ${btn}`} onClick={() => setAsk("changes")}><FilePenLine className="h-3.5 w-3.5" />Request changes</button>
          <button className={`btn-danger ${btn}`} onClick={() => setAsk("reject")}><X className="h-3.5 w-3.5" />Reject</button>
        </>}
        {["live", "scheduled"].includes(s) && <button className={`btn-danger ${btn}`} onClick={() => setAsk("suspend")}><Pause className="h-3.5 w-3.5" />Suspend</button>}
        {s === "suspended" && <button className={`btn-ok ${btn}`} disabled={busy} onClick={() => run("restore")}><Play className="h-3.5 w-3.5" />Restore</button>}
        {["rejected", "pending", "changes_requested", "scheduled", "unsold", "suspended"].includes(s) && a.bidCount === 0 && <button className={`btn-ghost ${btn}`} onClick={() => setAsk("remove")}><Trash2 className="h-3.5 w-3.5" />Remove</button>}
      </div>
      <Modal open={!!ask} onClose={() => setAsk(null)} title={{ changes: "Request changes", reject: "Reject listing", suspend: "Suspend auction", remove: "Remove listing" }[ask]}
        footer={<><button className="btn-ghost" onClick={() => setAsk(null)}>Cancel</button><button className={ask === "changes" ? "btn-primary" : "btn-danger"} disabled={busy || (ask !== "remove" && note.trim().length < 3)} onClick={() => run(ask, note)}>{busy ? <Spinner className="h-4 w-4" /> : "Confirm"}</button></>}>
        <p className="mb-3 text-sm text-muted">{ask === "remove" ? "The listing will be removed from the marketplace." : "The seller sees this message in their dashboard and by e-mail."}</p>
        <textarea className="input min-h-[100px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder={ask === "changes" ? "What should the seller fix?" : "Reason"} />
      </Modal>
    </>
  );
}

export function AuctionDrawer({ id, onClose, onChanged }) {
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => (id ? api.get(`/api/admin/auctions/${id}`) : Promise.resolve(null)), [id]);
  const done = () => { reload(); onChanged?.(); };
  const a = data?.auction;
  return (
    <Drawer open={!!id} onClose={onClose} title={a?.title ?? "Auction"} subtitle={a && `#${a.id} · ${a.category.name}`} width="max-w-2xl">
      {loading || !a ? <div className="space-y-3"><Skeleton className="h-52" /><Skeleton className="h-32" /></div> : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-2">{a.images.map((s) => <img key={s} src={s} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />)}</div>
          <div className="flex flex-wrap items-center gap-2"><Status value={a.status} />{a.featured && <span className="badge bg-accent/15 text-accent">Featured</span>}<Link to={`/auctions/${a.id}`} className="badge bg-soft text-muted hover:text-ink"><Eye className="h-3 w-3" />Public page</Link></div>
          <ReviewActions a={a} onDone={done} size="" />
          <p className="whitespace-pre-line rounded-xl bg-soft p-4 text-sm text-muted">{a.description}</p>
          <dl>
            <Row label="Seller">{data.seller.business_name || data.seller.name} <span className="text-muted">· {data.seller.email}</span></Row>
            <Row label="Seller strikes">{data.seller.strikes}</Row>
            <Row label="Condition">{a.condition}</Row>
            <Row label="Starting bid / reserve">{money(a.startPrice)} / {a.reservePrice ? money(a.reservePrice) : "none"}</Row>
            <Row label="Increment">{money(a.minIncrement)}</Row>
            <Row label="Current price">{money(a.currentPrice)} ({a.bidCount} bids)</Row>
            <Row label="Schedule">{dateTime(a.startAt)} → {dateTime(a.endAt)} ({a.durationDays} days)</Row>
            <Row label="Anti-sniping extensions">{a.extensions}</Row>
            {data.order && <Row label="Order"><Status value={data.order.status} text={data.order.statusLabel} /> <span className="font-mono text-xs">{data.order.code}</span></Row>}
          </dl>
          <div className="flex gap-2">
            <button className="btn-soft btn-sm" onClick={async () => { await api.patch(`/api/admin/auctions/${a.id}`, { featured: !a.featured }); toast(a.featured ? "Removed from featured" : "Marked as featured"); done(); }}><Star className="h-3.5 w-3.5" />{a.featured ? "Unfeature" : "Feature on home"}</button>
          </div>
          <div>
            <h4 className="mb-2 font-bold">Bids ({data.bids.length})</h4>
            <div className="card divide-y divide-line overflow-hidden">{data.bids.slice(0, 12).map((b) => <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><div><p className="font-semibold">{b.name}</p><p className="text-xs text-muted">{b.email} · {b.ip} · {ago(b.at)}</p></div><b className="font-display">{money(b.amount)}</b></div>)}{data.bids.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No bids</p>}</div>
          </div>
          <div>
            <h4 className="mb-2 font-bold">History</h4>
            <ol className="space-y-3 border-l-2 border-line pl-4">{data.history.map((h, i) => <li key={i} className="relative text-sm"><span className="absolute -left-[1.4rem] top-1.5 h-2 w-2 rounded-full bg-brand" /><p className="font-semibold">{label(h.action)}{h.actor && <span className="font-normal text-muted"> · {h.actor}</span>}</p>{h.note && <p className="text-muted">{h.note}</p>}<p className="text-xs text-muted">{dateTime(h.at)}</p></li>)}</ol>
          </div>
        </div>
      )}
    </Drawer>
  );
}

export function Approvals() {
  const { data, loading, reload } = useAsync(() => api.get("/api/admin/auctions?status=pending&limit=50"), []);
  const [open, setOpen] = useState(null);
  useQueueEvents(reload, []);
  return (
    <div>
      <PageHeader title="Review queue" subtitle="Every seller listing must be approved before it becomes visible." />
      {loading && !data ? <Skeleton className="h-64" /> : data.items.length === 0 ? <div className="card"><Empty icon={ClipboardCheck} title="Inbox zero" hint="No listings are waiting for review." /></div> : (
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          <AnimatePresence>
            {data.items.map((a, i) => (
              <motion.div key={a.id} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ delay: i * 0.04 }} className="card overflow-hidden">
                <div className="grid grid-cols-3 gap-0.5">{a.images.slice(0, 3).map((s) => <img key={s} src={s} alt="" className="aspect-square w-full object-cover" />)}</div>
                <div className="space-y-3 p-5">
                  <div><button onClick={() => setOpen(a.id)} className="text-left text-lg font-bold leading-snug hover:text-brand">{a.title}</button><p className="mt-1 text-sm text-muted">{a.seller.name} · {a.category.name} · {a.condition}</p></div>
                  <p className="line-clamp-3 text-sm text-muted">{a.description}</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm"><span>Start <b>{money(a.startPrice, { round: true })}</b></span><span>Reserve <b>{a.reservePrice ? money(a.reservePrice, { round: true }) : "none"}</b></span><span><b>{a.durationDays}</b> days</span><span>+{money(a.minIncrement, { round: true })}</span></div>
                  <p className="text-xs text-muted">Submitted {ago(a.createdAt)}</p>
                  <ReviewActions a={a} onDone={reload} />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      <AuctionDrawer id={open} onClose={() => setOpen(null)} onChanged={reload} />
    </div>
  );
}

export function AuctionsAdmin() {
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(null);
  const limit = 15;
  const { data, loading, reload } = useAsync(() => api.get(`/api/admin/auctions${qs({ status, q, limit, offset })}`), [status, q, offset]);
  useQueueEvents(reload, [status, q, offset]);
  const c = data?.counts ?? {};
  const all = Object.values(c).reduce((a, b) => a + b, 0);
  const tabs = [["all", "All", all], ["live", "Live", c.live], ["pending", "Pending", c.pending], ["scheduled", "Scheduled", c.scheduled], ["sold", "Sold", c.sold], ["unsold", "Unsold", c.unsold], ["suspended", "Suspended", c.suspended], ["rejected", "Rejected", c.rejected]].map(([value, l, count]) => ({ value, label: l, count: count ?? 0 }));
  return (
    <div>
      <PageHeader title="All auctions" subtitle="Search, review, edit and moderate every listing on the marketplace." />
      <Toolbar><Tabs value={status} onChange={(v) => { setStatus(v); setOffset(0); }} tabs={tabs} /><div className="ml-auto"><SearchBox value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Search title or seller" /></div></Toolbar>
      <AdminTable>
        <table className="tbl"><thead><tr><th>Item</th><th>Seller</th><th>Status</th><th className="text-right">Price</th><th className="text-right">Bids</th><th>Ends</th><th /></tr></thead>
          <tbody>
            {loading && !data ? <tr><td colSpan={7}><Skeleton className="h-40" /></td></tr> : data.items.map((a) => (
              <tr key={a.id} className="cursor-pointer" onClick={() => setOpen(a.id)}>
                <td><div className="flex items-center gap-3"><img src={a.images[0]} alt="" className="h-11 w-14 rounded-lg object-cover" /><div className="min-w-0"><p className="max-w-[280px] truncate font-semibold">{a.title}</p><p className="text-xs text-muted">#{a.id} · {a.category.name}</p></div></div></td>
                <td className="text-muted">{a.seller.name}</td>
                <td><Status value={a.status} /></td>
                <td className="text-right font-semibold tabular-nums">{money(a.currentPrice)}</td>
                <td className="text-right tabular-nums">{a.bidCount}</td>
                <td className="whitespace-nowrap text-muted">{a.status === "live" ? <TimeLeft endAt={a.endAt} /> : dateTime(a.endAt)}</td>
                <td className="text-right"><button className="btn-ghost btn-sm">Manage</button></td>
              </tr>
            ))}
            {data?.items.length === 0 && <tr><td colSpan={7}><Empty title="No auctions match" /></td></tr>}
          </tbody></table>
        {data && <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />}
      </AdminTable>
      <AuctionDrawer id={open} onClose={() => setOpen(null)} onChanged={reload} />
    </div>
  );
}

export function BidsMonitor() {
  const { data, loading, reload } = useAsync(() => api.get("/api/admin/bids?limit=60"), []);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    const s = getSocket();
    const fn = () => { setFlash((n) => n + 1); reload(); };
    s.on("feed", fn);
    return () => s.off("feed", fn);
  }, []);
  return (
    <div>
      <PageHeader title="Live bids" subtitle="Every bid as it happens. Rapid bidders are flagged for review." actions={<span className="badge bg-ok/12 text-ok"><span className="h-1.5 w-1.5 animate-ring rounded-full bg-ok" />Streaming{flash > 0 && ` · ${flash} new`}</span>} />
      <AdminTable>
        <table className="tbl"><thead><tr><th>Time</th><th>Bidder</th><th>Auction</th><th className="text-right">Amount</th><th>IP</th><th>Flags</th></tr></thead>
          <tbody>
            {loading && !data ? <tr><td colSpan={6}><Skeleton className="h-48" /></td></tr> : <AnimatePresence initial={false}>{data.items.map((b) => (
              <motion.tr key={b.id} layout initial={{ opacity: 0, backgroundColor: "rgb(var(--ok) / .2)" }} animate={{ opacity: 1, backgroundColor: "rgb(var(--ok) / 0)" }} transition={{ duration: 0.8 }}>
                <td className="whitespace-nowrap text-muted">{ago(b.at)}</td>
                <td><p className="font-semibold">{b.name}</p><p className="text-xs text-muted">{b.email}</p></td>
                <td><Link to={`/auctions/${b.auctionId}`} className="line-clamp-1 max-w-[280px] hover:text-brand">{b.title}</Link></td>
                <td className="text-right font-display font-extrabold tabular-nums">{money(b.amount)}</td>
                <td className="font-mono text-xs text-muted">{b.ip}</td>
                <td>{b.recent >= 6 ? <span className="badge bg-bad/12 text-bad">Rapid bidding</span> : <span className="text-xs text-muted">–</span>}</td>
              </motion.tr>))}</AnimatePresence>}
          </tbody></table>
      </AdminTable>
    </div>
  );
}

export function Categories() {
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.get("/api/admin/categories"), []);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("tag");
  const add = async (e) => {
    e.preventDefault();
    try { await api.post("/api/admin/categories", { name, icon }); setName(""); toast("Category added"); reload(); } catch (err) { toast(err.message, "error"); }
  };
  const toggle = async (c) => { await api.patch(`/api/admin/categories/${c.id}`, { active: !c.active }); reload(); };
  return (
    <div>
      <PageHeader title="Categories" subtitle="Organise what can be sold. Inactive categories disappear from the marketplace." />
      <form onSubmit={add} className="card mb-5 flex flex-wrap items-end gap-3 p-5">
        <Field label="New category" className="min-w-[220px] flex-1"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="e.g. Vinyl records" /></Field>
        <Field label="Icon name"><input className="input !w-44" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="tag" /></Field>
        <button className="btn-primary"><Plus className="h-4 w-4" />Add</button>
      </form>
      <AdminTable>
        <table className="tbl"><thead><tr><th>Category</th><th>Slug</th><th className="text-right">Auctions</th><th>Status</th><th /></tr></thead>
          <tbody>{loading && !data ? <tr><td colSpan={5}><Skeleton className="h-40" /></td></tr> : data.map((c) => (
            <tr key={c.id}><td><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-brand/10 text-brand"><Icon name={c.icon} className="h-[18px] w-[18px]" /></span><b>{c.name}</b></div></td><td className="font-mono text-xs text-muted">{c.slug}</td><td className="text-right tabular-nums">{c.auctions}</td><td><Status value={c.active ? "active_cat" : "inactive"} text={c.active ? "Active" : "Hidden"} className={c.active ? "!bg-ok/12 !text-ok" : ""} /></td><td className="text-right"><button className="btn-soft btn-sm" onClick={() => toggle(c)}>{c.active ? "Hide" : "Show"}</button></td></tr>
          ))}</tbody></table>
      </AdminTable>
    </div>
  );
}
