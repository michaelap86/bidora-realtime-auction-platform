import { useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Banknote, Check, Download, HandCoins, Landmark, Percent, ReceiptText, Smartphone, CreditCard, Timer, Undo2, X } from "lucide-react";
import { api, qs } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { money, dateTime, ago, label, shortDay } from "../../lib/format";
import { Empty, Modal, PageHeader, Pager, Skeleton, Spinner, Stat, Status, Tabs, useAsync, cx } from "../../components/ui";
import { AdminTable, ChartCard, SearchBox, Toolbar, tooltipProps, useColors, useQueueEvents } from "./kit";

const METHOD = { card_sandbox: [CreditCard, "Test card"], bank_transfer: [Landmark, "Bank transfer"], mobile_wallet: [Smartphone, "Mobile wallet"] };

export function Deposits() {
  const toast = useToast();
  const [status, setStatus] = useState("pending");
  const { data, loading, reload } = useAsync(() => api.get(`/api/admin/deposits?status=${status}`), [status]);
  const [reject, setReject] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useQueueEvents(reload, [status]);
  const review = async (id, decision, n = "") => {
    setBusy(true);
    try { await api.post(`/api/admin/deposits/${id}/review`, { decision, note: n }); toast(decision === "approve" ? "Deposit approved, wallet credited" : "Deposit rejected"); setReject(null); setNote(""); reload(); } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  const c = data?.counts ?? {};
  return (
    <div>
      <PageHeader title="Deposits" subtitle="Approve manual deposits to credit wallets. Approving enables bidding automatically once the minimum is reached." />
      <Toolbar><Tabs value={status} onChange={setStatus} tabs={[{ value: "pending", label: "Pending", count: c.pending ?? 0 }, { value: "approved", label: "Approved", count: c.approved ?? 0 }, { value: "rejected", label: "Rejected", count: c.rejected ?? 0 }, { value: "all", label: "All" }]} /></Toolbar>
      <AdminTable>
        <table className="tbl"><thead><tr><th>Requested</th><th>Member</th><th>Method</th><th>Reference</th><th className="text-right">Amount</th><th>Status</th><th /></tr></thead>
          <tbody>
            {loading && !data ? <tr><td colSpan={7}><Skeleton className="h-40" /></td></tr> : data.items.map((d) => { const [I, name] = METHOD[d.method] ?? [Landmark, d.method]; return (
              <tr key={d.id}>
                <td className="whitespace-nowrap text-muted">{ago(d.at)}</td>
                <td><p className="font-semibold">{d.name}</p><p className="text-xs text-muted">{d.email}</p></td>
                <td><span className="flex items-center gap-2"><I className="h-4 w-4 text-muted" />{name}</span></td>
                <td className="font-mono text-xs text-muted">{d.reference ?? "–"}</td>
                <td className="text-right font-display font-extrabold tabular-nums">{money(d.amount)}</td>
                <td><Status value={d.status} />{d.note && <p className="mt-1 max-w-[180px] truncate text-xs text-muted">{d.note}</p>}</td>
                <td className="text-right">{d.status === "pending" && <div className="flex justify-end gap-2"><button className="btn-ok btn-sm" disabled={busy} onClick={() => review(d.id, "approve")}><Check className="h-3.5 w-3.5" />Approve</button><button className="btn-danger btn-sm" onClick={() => setReject(d)}><X className="h-3.5 w-3.5" />Reject</button></div>}</td>
              </tr>); })}
            {data?.items.length === 0 && <tr><td colSpan={7}><Empty icon={HandCoins} title="Nothing to review" hint="Manual deposits will appear here." /></td></tr>}
          </tbody></table>
      </AdminTable>
      <Modal open={!!reject} onClose={() => setReject(null)} title="Reject deposit" footer={<><button className="btn-ghost" onClick={() => setReject(null)}>Cancel</button><button className="btn-danger" disabled={busy || note.length < 3} onClick={() => review(reject.id, "reject", note)}>Reject</button></>}>
        <p className="mb-3 text-sm text-muted">Tell {reject?.name} why ({money(reject?.amount ?? 0)}). They receive it as a notification and an e-mail.</p>
        <textarea className="input min-h-[90px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The transfer reference could not be found." />
      </Modal>
    </div>
  );
}

function OrderLine({ o, right }) {
  return (
    <tr><td><div className="flex items-center gap-3"><img src={o.image} alt="" className="h-10 w-12 rounded-lg object-cover" /><div className="min-w-0"><p className="max-w-[260px] truncate font-semibold">{o.title}</p><p className="font-mono text-xs text-muted">{o.code}</p></div></div></td>
      <td className="text-muted">{o.seller.name}</td><td className="text-right tabular-nums">{money(o.amountCents)}</td><td className="text-right tabular-nums text-muted">{money(o.commissionCents)}</td><td className="text-right font-display font-extrabold tabular-nums">{money(o.sellerNetCents)}</td><td className="text-right">{right}</td></tr>
  );
}

export function Payouts() {
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.get("/api/admin/payouts"), []);
  const [busy, setBusy] = useState(0);
  const release = async (id) => { setBusy(id); try { await api.post(`/api/admin/orders/${id}/release-payout`); toast("Payout released to the seller"); reload(); } catch (e) { toast(e.message, "error"); } finally { setBusy(0); } };
  if (loading && !data) return <Skeleton className="h-96" />;
  return (
    <div>
      <PageHeader title="Seller payouts" subtitle="Earnings are released the same day an item passes warehouse inspection." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Released, all time" value={money(data.totals.released, { compact: true })} icon={Banknote} tone="ok" />
        <Stat label="Held until inspection" value={money(data.totals.pending, { compact: true })} icon={Timer} tone="accent" hint="Escrow for sellers" />
        <Stat label="Same-day payouts" value={`${data.totals.sameDay}%`} icon={Percent} hint="Released on the inspection day" />
      </div>
      {data.waiting.length > 0 && (
        <div className="mb-6"><h2 className="mb-2 text-lg font-bold">Ready to release</h2>
          <AdminTable><table className="tbl"><thead><tr><th>Order</th><th>Seller</th><th className="text-right">Sale</th><th className="text-right">Commission</th><th className="text-right">Payout</th><th /></tr></thead>
            <tbody>{data.waiting.map((o) => <OrderLine key={o.id} o={o} right={<button className="btn-primary btn-sm" disabled={busy === o.id} onClick={() => release(o.id)}>{busy === o.id ? <Spinner className="h-3.5 w-3.5" /> : "Release now"}</button>} />)}</tbody></table></AdminTable></div>
      )}
      <h2 className="mb-2 text-lg font-bold">Held in escrow (not yet inspected)</h2>
      <AdminTable className="mb-6"><table className="tbl"><thead><tr><th>Order</th><th>Seller</th><th className="text-right">Sale</th><th className="text-right">Commission</th><th className="text-right">Will receive</th><th>Stage</th></tr></thead>
        <tbody>{data.pendingSales.map((o) => <OrderLine key={o.id} o={o} right={<Status value={o.status} text={o.statusLabel} />} />)}{data.pendingSales.length === 0 && <tr><td colSpan={6}><Empty title="Nothing in escrow" /></td></tr>}</tbody></table></AdminTable>
      <h2 className="mb-2 text-lg font-bold">Released payouts</h2>
      <AdminTable><table className="tbl"><thead><tr><th>Released</th><th>Order</th><th>Item</th><th>Seller</th><th className="text-right">Amount</th></tr></thead>
        <tbody>{data.released.map((p) => <tr key={p.id}><td className="whitespace-nowrap text-muted">{dateTime(p.at)}</td><td className="font-mono text-xs">{p.code}</td><td className="max-w-[260px] truncate">{p.title}</td><td>{p.seller}</td><td className="text-right font-semibold text-ok">{money(p.amount)}</td></tr>)}</tbody></table></AdminTable>
    </div>
  );
}

export function Refunds() {
  const { data, loading } = useAsync(() => api.get("/api/admin/refunds"), []);
  const total = (data ?? []).reduce((a, r) => a + r.amount, 0);
  return (
    <div>
      <PageHeader title="Refunds" subtitle="Money returned to buyers after failed inspections, disputes or manual refunds." />
      <div className="mb-5 grid gap-4 sm:grid-cols-2"><Stat label="Total refunded" value={money(total)} icon={Undo2} tone="bad" /><Stat label="Refunds" value={data?.length ?? 0} icon={ReceiptText} /></div>
      <AdminTable><table className="tbl"><thead><tr><th>Date</th><th>Order</th><th>Item</th><th>Buyer</th><th>Reason</th><th className="text-right">Amount</th></tr></thead>
        <tbody>{loading && !data ? <tr><td colSpan={6}><Skeleton className="h-40" /></td></tr> : data.map((r) => <tr key={r.id}><td className="whitespace-nowrap text-muted">{dateTime(r.at)}</td><td className="font-mono text-xs">{r.code}</td><td className="max-w-[220px] truncate">{r.title}</td><td>{r.buyer}</td><td className="max-w-[280px] truncate text-muted">{r.reason}</td><td className="text-right font-semibold text-bad">{money(r.amount)}</td></tr>)}
          {data?.length === 0 && <tr><td colSpan={6}><Empty icon={Undo2} title="No refunds" /></td></tr>}</tbody></table></AdminTable>
    </div>
  );
}

export function Transactions() {
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const { data, loading } = useAsync(() => api.get(`/api/admin/transactions${qs({ type, q, limit, offset })}`), [type, q, offset]);
  return (
    <div>
      <PageHeader title="Financial ledger" subtitle="Every movement of money, with a full audit trail. Entries are never edited or deleted." />
      <Toolbar>
        <select className="input !w-auto !py-2" value={type} onChange={(e) => { setType(e.target.value); setOffset(0); }}><option value="all">All types</option>{data?.types.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select>
        <div className="ml-auto"><SearchBox value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Search member or note" /></div>
      </Toolbar>
      <AdminTable>
        <table className="tbl"><thead><tr><th>Time</th><th>Member</th><th>Account</th><th>Type</th><th>Note</th><th className="text-right">Amount</th></tr></thead>
          <tbody>{loading && !data ? <tr><td colSpan={6}><Skeleton className="h-64" /></td></tr> : data.items.map((t) => (
            <tr key={t.id}><td className="whitespace-nowrap text-muted">{dateTime(t.at)}</td><td>{t.name ? <><p className="font-semibold">{t.name}</p><p className="text-xs text-muted">{t.email}</p></> : <span className="badge bg-brand/12 text-brand">Platform</span>}</td><td><span className="badge bg-soft capitalize text-muted">{t.account}</span></td><td>{label(t.type)}</td><td className="max-w-[260px] truncate text-muted">{t.note}</td><td className={cx("text-right font-semibold tabular-nums", t.amount < 0 ? "text-bad" : "text-ok")}>{t.amount > 0 ? "+" : ""}{money(t.amount)}</td></tr>
          ))}</tbody></table>
        {data && <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />}
      </AdminTable>
    </div>
  );
}

export function Reports() {
  const c = useColors();
  const today = new Date().toISOString().slice(0, 10);
  const ago30 = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(ago30);
  const [to, setTo] = useState(today);
  const { data, loading, error } = useAsync(() => api.get(`/api/admin/reports${qs({ from, to })}`), [from, to]);
  const preset = (d) => { setFrom(new Date(Date.now() - (d - 1) * 86400000).toISOString().slice(0, 10)); setTo(today); };
  const t = data?.totals;
  const series = data?.series.map((d) => ({ ...d, day: shortDay(d.day), gmv: d.gmv / 100, commission: Math.max(0, d.commission / 100), deposits: d.deposits / 100, payouts: d.payouts / 100, refunds: d.refunds / 100 })) ?? [];
  const usd = (v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)}`;
  return (
    <div>
      <PageHeader title="Financial reports" subtitle="Pick a period to see sales, revenue and money flow. Export the full ledger as CSV."
        actions={<a href={`/api/admin/reports/export.csv${qs({ from, to })}`} className="btn-primary"><Download className="h-4 w-4" />Export CSV</a>} />
      <Toolbar>
        {[[7, "7 days"], [30, "30 days"], [90, "90 days"]].map(([d, l]) => <button key={d} className="btn-soft btn-sm" onClick={() => preset(d)}>{l}</button>)}
        <input type="date" className="input !w-auto !py-2" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-muted">to</span>
        <input type="date" className="input !w-auto !py-2" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
      </Toolbar>
      {error && <p className="mb-4 rounded-xl bg-bad/10 p-3 text-sm text-bad">{error.message}</p>}
      {loading && !data ? <Skeleton className="h-96" /> : data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Gross sales" value={money(t.gmv, { compact: true })} icon={Banknote} hint={`${t.orders} orders · avg ${money(t.avgOrder, { round: true })}`} />
            <Stat label="Commission earned" value={money(t.commission, { compact: true })} icon={Percent} tone="ok" hint={`+ ${money(t.forfeits, { round: true })} forfeited deposits`} />
            <Stat label="Deposits received" value={money(t.deposits, { compact: true })} icon={HandCoins} tone="accent" />
            <Stat label="Payouts / refunds" value={`${money(t.payouts, { compact: true })} / ${money(t.refunds, { compact: true })}`} icon={Undo2} tone="bad" />
          </div>
          <ChartCard title="Sales and commission by day" height={300}>
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={series} margin={{ left: -6, right: 8, top: 8 }}>
              <defs><linearGradient id="r1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.brand} stopOpacity={0.4} /><stop offset="100%" stopColor={c.brand} stopOpacity={0} /></linearGradient><linearGradient id="r2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.ok} stopOpacity={0.4} /><stop offset="100%" stopColor={c.ok} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={c.line} /><XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={24} tick={{ fill: c.muted, fontSize: 11 }} /><YAxis tickLine={false} axisLine={false} tickFormatter={usd} width={48} tick={{ fill: c.muted, fontSize: 11 }} />
              <Tooltip {...tooltipProps(c)} formatter={(v) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" name="Gross sales" dataKey="gmv" stroke={c.brand} strokeWidth={2.5} fill="url(#r1)" /><Area type="monotone" name="Commission" dataKey="commission" stroke={c.ok} strokeWidth={2.5} fill="url(#r2)" />
            </AreaChart></ResponsiveContainer>
          </ChartCard>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Money in and out" subtitle="Deposits, payouts and refunds" height={260}>
              <ResponsiveContainer width="100%" height="100%"><BarChart data={series} margin={{ left: -6, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={c.line} /><XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={24} tick={{ fill: c.muted, fontSize: 11 }} /><YAxis tickLine={false} axisLine={false} tickFormatter={usd} width={48} tick={{ fill: c.muted, fontSize: 11 }} />
                <Tooltip {...tooltipProps(c)} formatter={(v) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="deposits" name="Deposits" fill={c.ok} radius={[3, 3, 0, 0]} /><Bar dataKey="payouts" name="Payouts" fill={c.brand} radius={[3, 3, 0, 0]} /><Bar dataKey="refunds" name="Refunds" fill={c.bad} radius={[3, 3, 0, 0]} />
              </BarChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Revenue by category" subtitle="Gross sales in the period" height={260}>
              {data.byCategory.length === 0 ? <Empty title="No sales in this period" /> : (
                <ResponsiveContainer width="100%" height="100%"><PieChart>
                  <Pie data={data.byCategory.map((d) => ({ name: d.name, value: d.gmv / 100 }))} dataKey="value" innerRadius="55%" outerRadius="85%" paddingAngle={2} cornerRadius={5} stroke="none">{data.byCategory.map((_, i) => <Cell key={i} fill={[c.brand, c.brand2, c.accent, c.ok, c.bad, c.muted][i % 6]} />)}</Pie>
                  <Tooltip {...tooltipProps(c)} formatter={(v) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart></ResponsiveContainer>
              )}
            </ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <AdminTable><h3 className="border-b border-line px-5 py-4 font-bold">Categories</h3><table className="tbl"><thead><tr><th>Category</th><th className="text-right">Orders</th><th className="text-right">Sales</th><th className="text-right">Commission</th></tr></thead><tbody>{data.byCategory.map((r) => <tr key={r.name}><td className="font-semibold">{r.name}</td><td className="text-right">{r.orders}</td><td className="text-right tabular-nums">{money(r.gmv)}</td><td className="text-right tabular-nums text-ok">{money(r.commission)}</td></tr>)}</tbody></table></AdminTable>
            <AdminTable><h3 className="border-b border-line px-5 py-4 font-bold">Ledger summary</h3><table className="tbl"><thead><tr><th>Type</th><th className="text-right">Entries</th><th className="text-right">Net amount</th></tr></thead><tbody>{data.byType.map((r) => <tr key={r.type}><td>{label(r.type)}</td><td className="text-right">{r.count}</td><td className={cx("text-right tabular-nums", r.total < 0 ? "text-bad" : "text-ok")}>{money(r.total)}</td></tr>)}</tbody></table></AdminTable>
          </div>
        </div>
      )}
    </div>
  );
}
