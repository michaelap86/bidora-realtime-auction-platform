import { useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { motion } from "framer-motion";
import { Banknote, ClipboardCheck, Clock, Flame, Gavel, HandCoins, MessageSquareWarning, PackageSearch, Percent, ShieldAlert, Store, Trophy, Truck, Users, Wallet, Activity } from "lucide-react";
import { api } from "../../lib/api";
import { money, num, shortDay, ago, label, dateTime } from "../../lib/format";
import { Skeleton, Tabs, useAsync, Spinner, cx } from "../../components/ui";
import { TimeLeft } from "../../components/Countdown";
import { ChartCard, Kpi, tooltipProps, useColors, useQueueEvents } from "./kit";

const cents = (v) => v / 100;
const usd = (v) => `$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)}`;

const ACTION_LABEL = {
  "listing.approve": "approved a listing", "listing.reject": "rejected a listing", "listing.changes": "asked for changes on a listing", "listing.suspend": "suspended an auction",
  "deposit.approve": "approved a deposit", "deposit.reject": "rejected a deposit", "warehouse.receive": "received a parcel", "warehouse.inspection_passed": "passed an inspection",
  "warehouse.inspection_failed": "failed an inspection", "payout.release": "released a payout", "order.ship": "shipped an order", "order.refund": "refunded an order",
  "dispute.resolve": "resolved a dispute", "restriction.add": "restricted a user", "restriction.lift": "lifted a restriction", "settings.update": "changed the settings",
  "user.login": "signed in", "user.register": "joined", "order.pay": "paid an order", "deposit.request": "requested a deposit", "category.create": "added a category",
};

export default function Dashboard() {
  const [range, setRange] = useState("30");
  const { data, loading, reload } = useAsync(() => api.get(`/api/admin/overview?days=${range}`), [range]);
  const c = useColors();
  useQueueEvents(reload, []);
  if (loading && !data) return <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div><Skeleton className="h-80" /></div>;
  const k = data.kpis;
  const s = data.series;
  const spark = (f) => s.slice(-14).map((d) => ({ v: f(d) }));
  const statusColors = { live: c.ok, scheduled: c.brand, pending: c.accent, sold: c.brand2, unsold: c.muted, rejected: c.bad, suspended: c.bad, changes_requested: c.accent, removed: c.muted };
  const orderColors = [c.brand, c.brand2, c.ok, c.accent, c.bad, c.muted];
  const total = (key) => s.reduce((a, d) => a + d[key], 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold sm:text-3xl">Dashboard</h1><p className="text-sm text-muted">Marketplace performance, money in motion and what needs attention.</p></div>
        <Tabs value={range} onChange={setRange} tabs={[{ value: "14", label: "14 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["/admin/approvals", ClipboardCheck, "Listings to review", k.pendingReview, "accent"],
          ["/admin/deposits", HandCoins, "Deposits to confirm", k.pendingDeposits, "brand"],
          ["/admin/warehouse", PackageSearch, "Awaiting inspection", k.toInspect, "ok"],
          ["/admin/disputes", MessageSquareWarning, "Open disputes", k.openDisputes, "bad"],
        ].map(([to, I, l, v, tone]) => (
          <Link key={to} to={to} className="card group flex items-center gap-4 p-4 transition hover:shadow-lift">
            <span className={cx("grid h-11 w-11 place-items-center rounded-xl", { accent: "bg-accent/15 text-accent", brand: "bg-brand/12 text-brand", ok: "bg-ok/12 text-ok", bad: "bg-bad/12 text-bad" }[tone])}><I className="h-5 w-5" /></span>
            <div className="flex-1"><p className="font-display text-2xl font-extrabold leading-none">{v}</p><p className="mt-1 text-xs font-semibold text-muted">{l}</p></div>
            <span className="text-xs font-semibold text-brand opacity-0 transition group-hover:opacity-100">Open →</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Gross sales" value={k.gmv} format={(v) => money(v, { compact: true })} delta={k.gmvChange} hint="vs previous period" icon={Banknote} tone="brand" spark={spark((d) => d.gmv / 100)} sparkColor={c.brand} />
        <Kpi label="Marketplace revenue" value={k.commission + k.forfeits} format={(v) => money(v, { compact: true })} hint={`${money(k.forfeits, { round: true })} from forfeited deposits`} icon={Percent} tone="ok" spark={spark((d) => d.commission / 100)} sparkColor={c.ok} />
        <Kpi label="Live auctions" value={k.liveAuctions} hint={`${k.endingToday} ending in 24h`} icon={Gavel} tone="accent" spark={spark((d) => d.listings)} sparkColor={c.accent} />
        <Kpi label="Bids today" value={k.bidsToday} hint={`${k.avgBids} avg bids per auction`} icon={Flame} tone="bad" spark={spark((d) => d.bids)} sparkColor={c.bad} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <ChartCard title="Sales and revenue" subtitle={`${money(total("gmv"), { compact: true })} in sales · ${total("orders")} paid orders`} height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={s.map((d) => ({ ...d, day: shortDay(d.day), gmv: cents(d.gmv), commission: Math.max(0, cents(d.commission)) }))} margin={{ left: -6, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.brand} stopOpacity={0.4} /><stop offset="100%" stopColor={c.brand} stopOpacity={0} /></linearGradient>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.ok} stopOpacity={0.35} /><stop offset="100%" stopColor={c.ok} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={c.line} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} tick={{ fill: c.muted, fontSize: 11 }} />
              <YAxis domain={[0, "auto"]} tickLine={false} axisLine={false} tickFormatter={usd} width={48} tick={{ fill: c.muted, fontSize: 11 }} />
              <Tooltip {...tooltipProps(c)} formatter={(v, n) => [`$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, n]} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" name="Gross sales" dataKey="gmv" stroke={c.brand} strokeWidth={2.5} fill="url(#g1)" animationDuration={1000} />
              <Area type="monotone" name="Commission" dataKey="commission" stroke={c.ok} strokeWidth={2.5} fill="url(#g2)" animationDuration={1200} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Auctions by status" subtitle={`${data.status.reduce((a, b) => a + b.count, 0)} listings in total`} height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.status.map((d) => ({ name: label(d.status), value: d.count, key: d.status }))} dataKey="value" innerRadius="58%" outerRadius="86%" paddingAngle={3} cornerRadius={6} stroke="none" animationDuration={900}>
                {data.status.map((d) => <Cell key={d.status} fill={statusColors[d.status] ?? c.muted} />)}
              </Pie>
              <Tooltip {...tooltipProps(c)} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Bidding activity" subtitle="Bids per day and new members" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={s.map((d) => ({ ...d, day: shortDay(d.day) }))} margin={{ left: -14, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={c.line} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} tick={{ fill: c.muted, fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} width={40} tick={{ fill: c.muted, fontSize: 11 }} />
              <Tooltip {...tooltipProps(c)} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar name="Bids" dataKey="bids" fill={c.brand} radius={[5, 5, 0, 0]} animationDuration={900} />
              <Line name="New members" type="monotone" dataKey="users" stroke={c.accent} strokeWidth={2.5} dot={false} animationDuration={1200} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="When people bid" subtitle="Bids by hour of day (UTC)" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.hours} margin={{ left: -14, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={c.line} />
              <XAxis dataKey="hour" tickLine={false} axisLine={false} tickFormatter={(h) => `${h}h`} interval={2} tick={{ fill: c.muted, fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} width={40} tick={{ fill: c.muted, fontSize: 11 }} />
              <Tooltip {...tooltipProps(c)} labelFormatter={(h) => `${h}:00`} />
              <Bar name="Bids" dataKey="bids" radius={[5, 5, 0, 0]} animationDuration={900}>
                {data.hours.map((h) => <Cell key={h.hour} fill={h.bids === Math.max(...data.hours.map((x) => x.bids)) ? c.brand2 : c.brand} fillOpacity={0.55 + 0.45 * (h.bids / Math.max(1, ...data.hours.map((x) => x.bids)))} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Sales by category" subtitle="Gross sales, paid orders" height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.categories.map((d) => ({ ...d, gmv: cents(d.gmv) }))} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={c.line} />
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={usd} tick={{ fill: c.muted, fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={104} tick={{ fill: c.ink, fontSize: 12 }} />
              <Tooltip {...tooltipProps(c)} formatter={(v) => [`$${v.toLocaleString()}`, "Sales"]} />
              <Bar dataKey="gmv" radius={[0, 6, 6, 0]} animationDuration={1000}>{data.categories.map((_, i) => <Cell key={i} fill={[c.brand, c.brand2, c.accent, c.ok][i % 4]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Conversion funnel" subtitle="From listing to delivered" height={0}>
          <div className="space-y-3 pt-1">
            {data.funnel.map((f, i) => {
              const max = data.funnel[0].value || 1;
              return (
                <div key={f.name}>
                  <div className="mb-1 flex justify-between text-xs"><span className="font-semibold">{f.name}</span><span className="text-muted"><b className="text-ink">{f.value}</b> · {Math.round((f.value / max) * 100)}%</span></div>
                  <div className="h-3 overflow-hidden rounded-full bg-soft"><motion.div initial={{ width: 0 }} whileInView={{ width: `${(f.value / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }} className="h-full rounded-full" style={{ backgroundImage: `linear-gradient(90deg, ${c.brand}, ${c.brand2})`, opacity: 1 - i * 0.1 }} /></div>
                </div>
              );
            })}
            <p className="pt-2 text-xs text-muted">Sell-through rate: <b className="text-ink">{k.sellThrough}%</b> of ended auctions found a buyer.</p>
          </div>
        </ChartCard>
        <ChartCard title="Order pipeline" subtitle="Where orders are right now" height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.orderStatus.map((d) => ({ name: d.label, value: d.count }))} dataKey="value" innerRadius="52%" outerRadius="84%" paddingAngle={2} cornerRadius={5} stroke="none" animationDuration={900}>
                {data.orderStatus.map((_, i) => <Cell key={i} fill={orderColors[i % orderColors.length]} fillOpacity={1 - Math.floor(i / orderColors.length) * 0.35} />)}
              </Pie>
              <Tooltip {...tooltipProps(c)} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <ChartCard title="Weekly cash flow" subtitle="Money in (deposits), money out (payouts and refunds)" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.cashflow.map((w) => ({ week: shortDay(w.week), Deposits: cents(w.deposits), Payouts: cents(w.payouts), Refunds: cents(w.refunds) }))} margin={{ left: -6, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={c.line} />
              <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fill: c.muted, fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={usd} width={48} tick={{ fill: c.muted, fontSize: 11 }} />
              <Tooltip {...tooltipProps(c)} formatter={(v) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Deposits" fill={c.ok} radius={[4, 4, 0, 0]} animationDuration={900} />
              <Bar dataKey="Payouts" fill={c.brand} radius={[4, 4, 0, 0]} animationDuration={900} />
              <Bar dataKey="Refunds" fill={c.bad} radius={[4, 4, 0, 0]} animationDuration={900} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <div className="card p-5">
          <h3 className="mb-3 text-base font-bold">Balances</h3>
          <dl className="space-y-3 text-sm">
            {[[Wallet, "Held in wallets and deposits", money(k.walletHeldCents), "brand"], [Clock, "Seller payouts pending", money(k.pendingPayoutCents), "accent"], [Users, "Buyers", num(k.buyers), "ok"], [Store, "Sellers", num(k.sellers), "brand"], [ShieldAlert, "Bidding restricted", num(k.restricted), "bad"], [Truck, "In transit / to pack", `${k.inTransit} / ${k.toPack}`, "accent"]].map(([I, l, v, t]) => (
              <div key={l} className="flex items-center gap-3"><span className={cx("grid h-9 w-9 place-items-center rounded-lg", { brand: "bg-brand/12 text-brand", accent: "bg-accent/15 text-accent", ok: "bg-ok/12 text-ok", bad: "bg-bad/12 text-bad" }[t])}><I className="h-4 w-4" /></span><dt className="flex-1 text-muted">{l}</dt><dd className="font-display font-extrabold">{v}</dd></div>
            ))}
          </dl>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-base font-bold"><Trophy className="h-4 w-4 text-accent" />Top sellers</h3>
          <ol className="space-y-3">{data.topSellers.map((t, i) => (
            <li key={t.id} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-soft text-xs font-bold text-muted">{i + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{t.name}</p><p className="text-xs text-muted">{t.orders} orders</p></div><p className="font-display font-extrabold">{money(t.gmv, { compact: true, round: true })}</p></li>
          ))}</ol>
        </div>
        <div className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-base font-bold"><Flame className="h-4 w-4 text-bad" />Hottest auctions</h3>
          <ol className="space-y-3">{data.hotAuctions.map((a) => (
            <li key={a.id}><Link to={`/auctions/${a.id}`} className="flex items-center gap-3 rounded-lg transition hover:bg-soft"><img src={a.image} alt="" className="h-10 w-12 rounded-lg object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{a.title}</p><p className="text-xs text-muted">{a.bids} bids · <TimeLeft endAt={a.endAt} /></p></div><p className="font-display font-extrabold">{money(a.price, { round: true })}</p></Link></li>
          ))}</ol>
        </div>
        <div className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-base font-bold"><Activity className="h-4 w-4 text-brand" />Recent activity</h3>
          <ul className="space-y-3">{data.recent.map((r, i) => (
            <li key={i} className="flex items-start gap-3 text-sm"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" /><div className="min-w-0 flex-1"><p><b>{r.actor}</b> <span className="text-muted">{ACTION_LABEL[r.action] ?? r.action}</span></p><p className="text-xs text-muted">{ago(r.at)}</p></div></li>
          ))}</ul>
          <Link to="/admin/logs" className="mt-4 inline-block text-xs font-semibold text-brand hover:underline">View all activity →</Link>
        </div>
      </div>
    </div>
  );
}
