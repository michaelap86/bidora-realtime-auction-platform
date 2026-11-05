import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Boxes, Check, ClipboardCheck, MapPin, MessageSquareWarning, PackageCheck, PackageOpen, Phone, Search, Send, ShieldCheck, Tag, Truck, Undo2, Warehouse as WarehouseIcon, X, Banknote } from "lucide-react";
import { api, qs } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { money, dateTime, ago, label } from "../../lib/format";
import { Drawer, Empty, Field, Modal, PageHeader, Skeleton, Spinner, Status, Tabs, useAsync, cx } from "../../components/ui";
import { AdminTable, Row, SearchBox, Toolbar, useQueueEvents } from "./kit";

const PHOTO_SETS = ["/img/products/w1.jpg", "/img/products/c1.jpg"];

// Warehouse actions for one order, shared by the orders drawer and the warehouse board.
function OrderActions({ o, onDone, compact }) {
  const toast = useToast();
  const [modal, setModal] = useState(null);
  const [f, setF] = useState({ bin: "", notes: "", result: "passed", courier: "DHL Express", tracking: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const post = async (path, body, ok) => {
    setBusy(true);
    try { await api.post(`/api/admin/orders/${o.id}/${path}`, body); toast(ok); setModal(null); onDone?.(); } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  const sz = compact ? "btn-sm" : "btn-sm";
  const s = o.status;
  const paid = ["awaiting_shipment", "in_transit", "received", "packing", "shipped", "delivered", "completed"].includes(s);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {s === "in_transit" && <button className={`btn-primary ${sz}`} onClick={() => setModal("receive")}><PackageOpen className="h-3.5 w-3.5" />Receive parcel</button>}
        {s === "received" && <button className={`btn-primary ${sz}`} onClick={() => setModal("inspect")}><ClipboardCheck className="h-3.5 w-3.5" />Inspect</button>}
        {s === "packing" && <>
          {o.packagingStatus !== "packed" && <button className={`btn-soft ${sz}`} onClick={() => post("packaging", { status: o.packagingStatus === "pending" ? "packing" : "packed" }, "Packaging updated")}><PackageCheck className="h-3.5 w-3.5" />{o.packagingStatus === "pending" ? "Start packing" : "Mark packed"}</button>}
          <button className={`btn-primary ${sz}`} onClick={() => setModal("label")}><Tag className="h-3.5 w-3.5" />Create label & ship</button>
        </>}
        {s === "shipped" && <button className={`btn-soft ${sz}`} onClick={() => post("delivered", {}, "Marked as delivered")}><Check className="h-3.5 w-3.5" />Mark delivered</button>}
        {o.inspectionResult === "passed" && o.payoutStatus === "pending" && <button className={`btn-ok ${sz}`} onClick={() => post("release-payout", {}, "Payout released")}><Banknote className="h-3.5 w-3.5" />Release payout</button>}
        {paid && <button className={`btn-danger ${sz}`} onClick={() => setModal("refund")}><Undo2 className="h-3.5 w-3.5" />Refund</button>}
      </div>
      <Modal open={modal === "receive"} onClose={() => setModal(null)} title="Receive parcel" footer={<><button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={() => post("receive", { bin: f.bin, notes: f.notes }, "Parcel received")}>{busy ? <Spinner className="h-4 w-4" /> : "Confirm receipt"}</button></>}>
        <div className="space-y-4"><p className="text-sm text-muted">{o.title} · {o.code}</p><Field label="Storage bin"><input className="input" value={f.bin} onChange={set("bin")} placeholder="e.g. A-3-2" /></Field><Field label="Notes"><textarea className="input" value={f.notes} onChange={set("notes")} placeholder="Parcel condition on arrival" /></Field></div>
      </Modal>
      <Modal open={modal === "inspect"} onClose={() => setModal(null)} title="Inspection report" wide footer={<><button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className={f.result === "passed" ? "btn-primary" : "btn-danger"} disabled={busy || f.notes.trim().length < 3} onClick={() => post("inspect", { result: f.result, notes: f.notes, photos: PHOTO_SETS }, f.result === "passed" ? "Passed. The seller payout was released." : "Failed. The buyer was refunded.")}>{busy ? <Spinner className="h-4 w-4" /> : f.result === "passed" ? "Approve item" : "Reject and refund"}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">{[["passed", ShieldCheck, "Passes", "Matches the listing. Seller is paid today."], ["failed", X, "Fails", "Buyer is refunded in full."]].map(([v, I, t, d]) => (
            <button key={v} onClick={() => setF({ ...f, result: v })} className={cx("rounded-xl border p-4 text-left transition", f.result === v ? (v === "passed" ? "border-ok bg-ok/8" : "border-bad bg-bad/8") : "border-line hover:border-brand/40")}><I className={cx("mb-2 h-5 w-5", v === "passed" ? "text-ok" : "text-bad")} /><p className="font-bold">{t}</p><p className="text-xs text-muted">{d}</p></button>))}</div>
          <Field label="Condition report"><textarea className="input min-h-[100px]" value={f.notes} onChange={set("notes")} placeholder="What you checked and found" /></Field>
          <p className="text-xs text-muted">Warehouse photos are attached to the report automatically in this demo.</p>
        </div>
      </Modal>
      <Modal open={modal === "label"} onClose={() => setModal(null)} title="Outbound shipping label" footer={<><button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn-primary" disabled={busy || f.tracking.length < 4} onClick={() => post("label", { courier: f.courier, tracking: f.tracking }, "Shipped to the buyer")}>{busy ? <Spinner className="h-4 w-4" /> : "Ship"}</button></>}>
        <div className="space-y-4">
          {o.shipTo && <div className="rounded-xl bg-soft p-4 text-sm"><p className="font-bold">{o.shipTo.name}</p><p className="text-muted">{o.shipTo.address}, {o.shipTo.city}<br />{o.shipTo.phone}</p></div>}
          <Field label="Courier"><select className="input" value={f.courier} onChange={set("courier")}>{["DHL Express", "UPS", "FedEx", "Local post"].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Tracking number"><input className="input font-mono" value={f.tracking} onChange={set("tracking")} /></Field>
        </div>
      </Modal>
      <Modal open={modal === "refund"} onClose={() => setModal(null)} title="Refund order" footer={<><button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn-danger" disabled={busy || f.reason.trim().length < 3} onClick={() => post("refund", { reason: f.reason }, "Buyer refunded")}>{busy ? <Spinner className="h-4 w-4" /> : `Refund ${money(o.amountCents)}`}</button></>}>
        <p className="mb-3 text-sm text-muted">The full amount returns to the buyer's wallet and the seller's earnings for this order are reversed.</p>
        <Field label="Reason"><textarea className="input" value={f.reason} onChange={set("reason")} /></Field>
      </Modal>
    </>
  );
}

function OrderDrawer({ id, onClose, onChanged }) {
  const { data, loading, reload } = useAsync(() => (id ? api.get(`/api/admin/orders/${id}`) : Promise.resolve(null)), [id]);
  const o = data?.order;
  const done = () => { reload(); onChanged?.(); };
  return (
    <Drawer open={!!id} onClose={onClose} title={o?.title ?? "Order"} subtitle={o && `${o.code} · ${money(o.amountCents)}`} width="max-w-2xl">
      {loading || !o ? <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-60" /></div> : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2"><Status value={o.status} text={o.statusLabel} />{o.disputeOpen && <span className="badge bg-bad/12 text-bad">Dispute open</span>}{o.payoutStatus !== "none" && <Status value={o.payoutStatus === "pending" ? "open" : o.payoutStatus} text={`Payout ${o.payoutStatus}`} />}</div>
          <OrderActions o={o} onDone={done} />
          <dl>
            <Row label="Buyer">{o.buyer.name} <span className="text-muted">· {o.buyer.email}</span></Row>
            <Row label="Seller">{o.seller.name} <span className="text-muted">· {o.seller.email}</span></Row>
            <Row label="Sale / commission / seller net">{money(o.amountCents)} / {money(o.commissionCents)} / {money(o.sellerNetCents)}</Row>
            <Row label="Payment due">{dateTime(o.paymentDueAt)}</Row>
            {o.shipTo && <Row label="Deliver to">{o.shipTo.name}, {o.shipTo.address}, {o.shipTo.city}</Row>}
            {o.inboundTracking && <Row label="Inbound">{o.inboundCourier} <span className="font-mono">{o.inboundTracking}</span></Row>}
            {o.binLocation && <Row label="Storage bin"><span className="font-mono">{o.binLocation}</span></Row>}
            {o.inspectionResult && <Row label="Inspection"><Status value={o.inspectionResult === "passed" ? "approved" : "rejected"} text={o.inspectionResult} /></Row>}
            {o.outboundTracking && <Row label="Outbound">{o.outboundCourier} <span className="font-mono">{o.outboundTracking}</span></Row>}
          </dl>
          {o.inspectionNotes && <p className="rounded-xl bg-soft p-4 text-sm text-muted"><b className="text-ink">Report:</b> {o.inspectionNotes}</p>}
          {o.inspectionPhotos.length > 0 && <div className="grid grid-cols-3 gap-2">{o.inspectionPhotos.map((p) => <img key={p} src={p} alt="Inspection" className="aspect-[4/3] rounded-xl object-cover" />)}</div>}
          <div><h4 className="mb-2 font-bold">Timeline</h4><ol className="space-y-3 border-l-2 border-line pl-4">{data.timeline.map((e, i) => <li key={i} className="relative text-sm"><span className="absolute -left-[1.4rem] top-1.5 h-2 w-2 rounded-full bg-brand" /><p className="font-semibold">{label(e.event)}{e.actor && <span className="font-normal text-muted"> · {e.actor}</span>}</p>{e.note && <p className="text-muted">{e.note}</p>}<p className="text-xs text-muted">{dateTime(e.at)}</p></li>)}</ol></div>
          {data.transactions.length > 0 && <div><h4 className="mb-2 font-bold">Ledger entries</h4><div className="card divide-y divide-line">{data.transactions.map((t) => <div key={t.id} className="flex items-center justify-between gap-3 p-3 text-sm"><div><p className="font-medium">{label(t.type)} <span className="text-xs text-muted">({t.account})</span></p><p className="text-xs text-muted">{t.note}</p></div><b className={cx("font-display tabular-nums", t.amount < 0 ? "text-bad" : "text-ok")}>{money(t.amount)}</b></div>)}</div></div>}
        </div>
      )}
    </Drawer>
  );
}

export function OrdersAdmin() {
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const { data, loading, reload } = useAsync(() => api.get(`/api/admin/orders${qs({ status, q })}`), [status, q]);
  useQueueEvents(reload, [status, q]);
  const c = data?.counts ?? {};
  const sum = Object.values(c).reduce((a, b) => a + b, 0);
  const tabs = [["all", "All", sum], ["awaiting_payment", "Awaiting payment"], ["awaiting_shipment", "Seller to ship"], ["in_transit", "In transit"], ["received", "To inspect"], ["packing", "Packing"], ["shipped", "Shipped"], ["completed", "Completed"], ["defaulted", "Missed payment"]].map(([v, l, n]) => ({ value: v, label: l, count: n ?? c[v] ?? 0 }));
  return (
    <div>
      <PageHeader title="Orders & shipping" subtitle="Winning auctions from payment to delivery. All parcels pass through the warehouse." />
      <Toolbar><Tabs value={status} onChange={setStatus} tabs={tabs} /><div className="ml-auto"><SearchBox value={q} onChange={setQ} placeholder="Order, item, buyer or seller" /></div></Toolbar>
      <AdminTable>
        <table className="tbl"><thead><tr><th>Order</th><th>Buyer</th><th>Seller</th><th className="text-right">Amount</th><th>Status</th><th>Payout</th><th>Created</th></tr></thead>
          <tbody>{loading && !data ? <tr><td colSpan={7}><Skeleton className="h-48" /></td></tr> : data.items.map((o) => (
            <tr key={o.id} className="cursor-pointer" onClick={() => setOpen(o.id)}>
              <td><div className="flex items-center gap-3"><img src={o.image} alt="" className="h-10 w-12 rounded-lg object-cover" /><div className="min-w-0"><p className="max-w-[240px] truncate font-semibold">{o.title}</p><p className="font-mono text-xs text-muted">{o.code}</p></div></div></td>
              <td className="text-muted">{o.buyer.name}</td><td className="text-muted">{o.seller.name}</td>
              <td className="text-right font-semibold tabular-nums">{money(o.amountCents)}</td>
              <td><Status value={o.status} text={o.statusLabel} />{o.disputeOpen && <span className="badge ml-1 bg-bad/12 text-bad">Dispute</span>}</td>
              <td>{o.payoutStatus === "none" ? <span className="text-xs text-muted">–</span> : <Status value={o.payoutStatus === "pending" ? "open" : o.payoutStatus} text={label(o.payoutStatus)} />}</td>
              <td className="whitespace-nowrap text-muted">{ago(o.createdAt)}</td>
            </tr>))}
            {data?.items.length === 0 && <tr><td colSpan={7}><Empty icon={Truck} title="No orders here" /></td></tr>}</tbody></table>
      </AdminTable>
      <OrderDrawer id={open} onClose={() => setOpen(null)} onChanged={reload} />
    </div>
  );
}

const COLUMNS = [
  ["expected", "Expected", "Paid, seller preparing", PackageOpen, "muted"],
  ["inTransit", "On the way", "Seller shipped to us", Truck, "brand"],
  ["received", "Inspect", "Arrived, waiting for a check", ClipboardCheck, "accent"],
  ["packing", "Pack & ship", "Passed inspection", PackageCheck, "ok"],
  ["shipped", "Out for delivery", "On its way to the buyer", Send, "brand"],
];

export function WarehouseAdmin() {
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.get("/api/admin/warehouse"), []);
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(null);
  useQueueEvents(reload, []);
  if (loading && !data) return <Skeleton className="h-96" />;
  const w = data.warehouse;
  const save = async () => {
    try { await api.put("/api/admin/warehouse", { name: edit.name, address: edit.address, city: edit.city, phone: edit.phone ?? "", instructions: edit.instructions }); toast("Warehouse details saved"); setEdit(null); reload(); } catch (e) { toast(e.message, "error"); }
  };
  return (
    <div>
      <PageHeader title="Warehouse" subtitle="Receive, inspect, pack and ship. Sellers never ship directly to buyers."
        actions={<button className="btn-soft" onClick={() => setEdit({ ...w })}><MapPin className="h-4 w-4" />Address & instructions</button>} />
      <div className="card mb-6 flex flex-wrap items-center gap-5 p-5">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><WarehouseIcon className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1"><p className="font-bold">{w.name}</p><p className="text-sm text-muted">{w.address}, {w.city} · {w.phone}</p></div>
        <div className="flex gap-6 text-center">{[["Inventory", data.inventory.length], ["To inspect", data.received.length], ["To ship", data.packing.length]].map(([l, v]) => <div key={l}><p className="font-display text-2xl font-extrabold">{v}</p><p className="text-xs font-semibold text-muted">{l}</p></div>)}</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map(([key, title, hint, I, tone]) => (
          <div key={key} className="rounded-2xl bg-soft/60 p-3">
            <div className="mb-3 flex items-center gap-2 px-1"><I className={cx("h-4 w-4", { muted: "text-muted", brand: "text-brand", accent: "text-accent", ok: "text-ok" }[tone])} /><div className="min-w-0 flex-1"><p className="text-sm font-bold leading-tight">{title}</p><p className="truncate text-[11px] text-muted">{hint}</p></div><span className="badge bg-surface text-muted">{data[key].length}</span></div>
            <div className="space-y-2.5">
              <AnimatePresence>
                {data[key].map((o) => (
                  <motion.div key={o.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="card p-3">
                    <button onClick={() => setOpen(o.id)} className="flex w-full items-center gap-2.5 text-left"><img src={o.image} alt="" className="h-11 w-14 shrink-0 rounded-lg object-cover" /><div className="min-w-0"><p className="truncate text-sm font-semibold leading-tight">{o.title}</p><p className="font-mono text-[11px] text-muted">{o.code}</p></div></button>
                    {o.binLocation && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Boxes className="h-3.5 w-3.5" />Bin <b className="font-mono text-ink">{o.binLocation}</b></p>}
                    {o.inboundTracking && key === "inTransit" && <p className="mt-2 truncate text-xs text-muted">{o.inboundCourier} <span className="font-mono">{o.inboundTracking}</span></p>}
                    {key === "shipped" && o.outboundTracking && <p className="mt-2 truncate text-xs text-muted">{o.outboundCourier} <span className="font-mono">{o.outboundTracking}</span></p>}
                    <div className="mt-2.5"><OrderActions o={o} onDone={reload} compact /></div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {data[key].length === 0 && <p className="rounded-xl border border-dashed border-line py-8 text-center text-xs text-muted">Empty</p>}
            </div>
          </div>
        ))}
      </div>

      {data.recentlyFailed.length > 0 && (
        <div className="mt-6"><h2 className="mb-2 text-lg font-bold">Recently failed inspections</h2>
          <AdminTable><table className="tbl"><thead><tr><th>Order</th><th>Seller</th><th>Report</th><th>Inspected</th></tr></thead><tbody>{data.recentlyFailed.map((o) => <tr key={o.id}><td className="font-semibold">{o.title}</td><td className="text-muted">{o.seller.name}</td><td className="max-w-[360px] truncate text-muted">{o.inspectionNotes}</td><td className="text-muted">{ago(o.inspectedAt)}</td></tr>)}</tbody></table></AdminTable></div>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Warehouse address & receiving instructions" wide footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
        {edit && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={edit.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          <Field label="Address"><input className="input" value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
          <Field label="City"><input className="input" value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field>
          <Field label="Receiving instructions shown to sellers" className="sm:col-span-2"><textarea className="input min-h-[110px]" value={edit.instructions} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} /></Field>
        </div>}
      </Modal>
      <OrderDrawer id={open} onClose={() => setOpen(null)} onChanged={reload} />
    </div>
  );
}

export function Disputes() {
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.get("/api/admin/disputes"), []);
  const [id, setId] = useState(null);
  const detail = useAsync(() => (id ? api.get(`/api/admin/disputes/${id}`) : Promise.resolve(null)), [id]);
  const [msg, setMsg] = useState("");
  const [aud, setAud] = useState("buyer");
  const [resolve, setResolve] = useState(null);
  const [text, setText] = useState("");
  useQueueEvents(() => { reload(); if (id) detail.reload(); }, [id]);
  const send = async () => {
    try { await api.post(`/api/admin/disputes/${id}/messages`, { body: msg, audience: aud }); setMsg(""); detail.reload(); reload(); } catch (e) { toast(e.message, "error"); }
  };
  const doResolve = async () => {
    try { await api.post(`/api/admin/disputes/${id}/resolve`, { outcome: resolve, resolution: text }); toast(resolve === "buyer" ? "Resolved for the buyer. Refund issued." : "Resolved for the seller"); setResolve(null); setText(""); detail.reload(); reload(); } catch (e) { toast(e.message, "error"); }
  };
  const d = detail.data;
  const openCount = data?.filter((x) => ["open", "investigating"].includes(x.status)).length ?? 0;
  return (
    <div>
      <PageHeader title="Disputes" subtitle="Buyers and sellers never talk to each other. Support handles every complaint." />
      <div className="mb-4 flex gap-3 text-sm"><span className="badge bg-bad/12 text-bad">{openCount} open</span><span className="badge bg-soft text-muted">{(data?.length ?? 0) - openCount} resolved</span></div>
      <AdminTable>
        <table className="tbl"><thead><tr><th>Opened</th><th>Order</th><th>By</th><th>Reason</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
          <tbody>{loading && !data ? <tr><td colSpan={6}><Skeleton className="h-40" /></td></tr> : data.map((x) => (
            <tr key={x.id} className="cursor-pointer" onClick={() => setId(x.id)}><td className="whitespace-nowrap text-muted">{ago(x.at)}</td><td><p className="max-w-[220px] truncate font-semibold">{x.title}</p><p className="font-mono text-xs text-muted">{x.code}</p></td><td>{x.openedBy} <span className="badge ml-1 bg-soft capitalize text-muted">{x.openedRole}</span></td><td className="max-w-[300px] truncate text-muted">{x.reason}</td><td className="text-right tabular-nums">{money(x.amount)}</td><td><Status value={x.status} /></td></tr>))}
            {data?.length === 0 && <tr><td colSpan={6}><Empty icon={MessageSquareWarning} title="No disputes" hint="Great news. Nothing needs your attention." /></td></tr>}</tbody></table>
      </AdminTable>
      <Drawer open={!!id} onClose={() => setId(null)} title={d ? `Dispute on ${d.order.title}` : "Dispute"} subtitle={d && d.dispute.code} width="max-w-2xl">
        {!d ? <Skeleton className="h-64" /> : (
          <div className="space-y-5">
            <div className="flex items-center justify-between"><Status value={d.dispute.status} />{["open", "investigating"].includes(d.dispute.status) && <div className="flex gap-2"><button className="btn-ok btn-sm" onClick={() => setResolve("buyer")}>Resolve for buyer</button><button className="btn-soft btn-sm" onClick={() => setResolve("seller")}>Resolve for seller</button></div>}</div>
            <dl><Row label="Order">{d.order.code} · {money(d.order.amountCents)}</Row><Row label="Buyer">{d.order.buyer.name}</Row><Row label="Seller">{d.order.seller.name}</Row><Row label="Order status"><Status value={d.order.status} text={d.order.statusLabel} /></Row></dl>
            {d.order.inspectionNotes && <p className="rounded-xl bg-soft p-4 text-sm text-muted"><b className="text-ink">Inspection report:</b> {d.order.inspectionNotes}</p>}
            <div className="space-y-2.5">{d.thread.map((m) => (
              <div key={m.id} className={cx("max-w-[88%] rounded-2xl px-4 py-2.5 text-sm", m.authorRole === "admin" ? (m.audience === "internal" ? "ml-auto border border-dashed border-accent/50 bg-accent/10" : "ml-auto bg-brand/10") : "bg-soft")}>
                <p className="text-xs font-bold text-muted">{m.author} <span className="font-medium">· to {m.audience}</span></p><p>{m.body}</p><p className="mt-1 text-[11px] text-muted">{ago(m.at)}</p></div>))}</div>
            {["open", "investigating"].includes(d.dispute.status) ? (
              <div className="space-y-2"><div className="flex gap-1.5">{["buyer", "seller", "internal"].map((a) => <button key={a} onClick={() => setAud(a)} className={cx("rounded-full border px-3 py-1 text-xs font-semibold capitalize transition", aud === a ? "border-brand bg-brand text-white" : "border-line text-muted hover:border-brand")}>{a === "internal" ? "Internal note" : `To ${a}`}</button>)}</div>
                <div className="flex gap-2"><input className="input" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Write a reply…" /><button className="btn-primary" disabled={!msg.trim()} onClick={send}><Send className="h-4 w-4" /></button></div></div>
            ) : d.dispute.resolution && <p className="rounded-xl bg-ok/10 p-3 text-sm"><b>Resolution:</b> {d.dispute.resolution}</p>}
          </div>
        )}
      </Drawer>
      <Modal open={!!resolve} onClose={() => setResolve(null)} title={resolve === "buyer" ? "Resolve for the buyer" : "Resolve for the seller"} footer={<><button className="btn-ghost" onClick={() => setResolve(null)}>Cancel</button><button className={resolve === "buyer" ? "btn-danger" : "btn-primary"} disabled={text.trim().length < 3} onClick={doResolve}>Confirm</button></>}>
        <p className="mb-3 text-sm text-muted">{resolve === "buyer" ? "The buyer is refunded in full and the seller's earnings for this order are reversed." : "The order stands as it is."}</p>
        <textarea className="input min-h-[90px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="Resolution shown to both parties" />
      </Modal>
    </div>
  );
}
