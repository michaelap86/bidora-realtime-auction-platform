import { useState } from "react";
import { Ban, CheckCircle2, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { api, qs } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { money, dateTime, dateOnly, ago, label } from "../../lib/format";
import { Drawer, Empty, Field, Modal, PageHeader, Pager, Skeleton, Spinner, Status, Tabs, useAsync, cx } from "../../components/ui";
import { AdminTable, Row, SearchBox, Toolbar, useQueueEvents } from "./kit";

function RestrictModal({ user, onClose, onDone }) {
  const toast = useToast();
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await api.post(`/api/admin/users/${user.id}/restrict`, { days: Number(days), reason }); toast("Bidding restricted"); onDone(); onClose(); } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!user} onClose={onClose} title={`Restrict ${user?.name ?? ""}`} footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-danger" disabled={busy || reason.length < 3} onClick={go}>{busy ? <Spinner className="h-4 w-4" /> : "Restrict bidding"}</button></>}>
      <div className="space-y-4">
        <Field label="Duration (days)"><div className="flex flex-wrap gap-2">{[3, 7, 15, 30, 90].map((d) => <button key={d} onClick={() => setDays(d)} className={cx("rounded-xl border px-3.5 py-1.5 text-sm font-semibold transition", Number(days) === d ? "border-brand bg-brand text-white" : "border-line hover:border-brand")}>{d}</button>)}</div></Field>
        <Field label="Reason (the user is notified)"><textarea className="input min-h-[90px]" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <p className="text-xs text-muted">Bidding stops immediately and is restored automatically when the period ends.</p>
      </div>
    </Modal>
  );
}

function UserDrawer({ id, onClose, onChanged }) {
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => (id ? api.get(`/api/admin/users/${id}`) : Promise.resolve(null)), [id]);
  const [restrict, setRestrict] = useState(false);
  const u = data?.user;
  const refresh = () => { reload(); onChanged?.(); };
  const setStatus = async (status) => { await api.post(`/api/admin/users/${u.id}/status`, { status }); toast(status === "suspended" ? "Account suspended" : "Account reactivated"); refresh(); };
  const lift = async (rid) => { await api.post(`/api/admin/restrictions/${rid}/lift`); toast("Restriction lifted"); refresh(); };
  return (
    <Drawer open={!!id} onClose={onClose} title={u?.name ?? "User"} subtitle={u && `${u.email} · ${u.role}`} width="max-w-2xl">
      {loading || !u ? <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-52" /></div> : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Status value={u.status === "active" ? "approved" : "rejected"} text={u.status === "active" ? "Active" : "Suspended"} />
            {u.restrictedUntil && <span className="badge bg-bad/12 text-bad"><ShieldAlert className="h-3 w-3" />Restricted until {dateOnly(u.restrictedUntil)}</span>}
            {u.emailVerified ? <span className="badge bg-ok/12 text-ok">E-mail verified</span> : <span className="badge bg-accent/15 text-accent">Unverified</span>}
          </div>
          {u.role !== "admin" && <div className="flex flex-wrap gap-2">
            {u.role === "buyer" && <button className="btn-danger btn-sm" onClick={() => setRestrict(true)}><ShieldAlert className="h-3.5 w-3.5" />Restrict bidding</button>}
            {u.status === "active" ? <button className="btn-soft btn-sm" onClick={() => setStatus("suspended")}><Ban className="h-3.5 w-3.5" />Suspend account</button> : <button className="btn-ok btn-sm" onClick={() => setStatus("active")}><CheckCircle2 className="h-3.5 w-3.5" />Reactivate</button>}
          </div>}
          <dl>
            <Row label="Member since">{dateOnly(u.createdAt)}</Row>
            <Row label="Last sign-in">{u.lastLoginAt ? ago(u.lastLoginAt) : "never"}</Row>
            <Row label="Phone / city">{u.phone || "–"} · {u.city || "–"}</Row>
            {u.role === "buyer" && <><Row label="Wallet">{money(u.walletCents)}</Row><Row label="Security deposit">{money(u.depositCents)}</Row></>}
            {u.role === "seller" && <><Row label="Pending earnings">{money(u.pendingCents)}</Row><Row label="Available">{money(u.earningsCents)}</Row></>}
            <Row label="Strikes">{u.strikes}</Row>
          </dl>
          {data.restrictions.length > 0 && <div><h4 className="mb-2 font-bold">Restrictions</h4><div className="card divide-y divide-line">{data.restrictions.map((r) => <div key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm"><div><p className="font-medium">{r.reason}</p><p className="text-xs text-muted">{dateOnly(r.startsAt)} → {dateOnly(r.endsAt)}</p></div><div className="flex items-center gap-2"><Status value={r.status} />{r.status === "active" && <button className="btn-ok btn-sm" onClick={() => lift(r.id)}>Lift</button>}</div></div>)}</div></div>}
          {data.orders.length > 0 && <div><h4 className="mb-2 font-bold">Orders</h4><div className="card divide-y divide-line">{data.orders.map((o) => <div key={o.id} className="flex items-center justify-between gap-3 p-3 text-sm"><div className="min-w-0"><p className="truncate font-medium">{o.title}</p><p className="text-xs text-muted">{o.code}</p></div><div className="flex items-center gap-3"><b className="font-display">{money(o.amountCents, { round: true })}</b><Status value={o.status} text={o.statusLabel} /></div></div>)}</div></div>}
          {data.bids.length > 0 && <div><h4 className="mb-2 font-bold">Recent bids</h4><div className="card divide-y divide-line">{data.bids.map((b) => <div key={b.id} className="flex items-center justify-between gap-3 p-3 text-sm"><Link to={`/auctions/${b.auctionId}`} className="min-w-0 truncate hover:text-brand">{b.title}</Link><span className="shrink-0"><b className="font-display">{money(b.amount)}</b> <span className="text-xs text-muted">{ago(b.at)}</span></span></div>)}</div></div>}
          <div><h4 className="mb-2 font-bold">Latest transactions</h4><div className="card divide-y divide-line">{data.transactions.slice(0, 8).map((t) => <div key={t.id} className="flex items-center justify-between gap-3 p-3 text-sm"><div><p className="font-medium">{label(t.type)}</p><p className="text-xs text-muted">{t.note} · {dateTime(t.at)}</p></div><b className={cx("font-display tabular-nums", t.amount < 0 ? "text-bad" : "text-ok")}>{t.amount > 0 ? "+" : ""}{money(t.amount)}</b></div>)}{data.transactions.length === 0 && <p className="p-5 text-center text-sm text-muted">No transactions</p>}</div></div>
        </div>
      )}
      <RestrictModal user={restrict ? u : null} onClose={() => setRestrict(false)} onDone={refresh} />
    </Drawer>
  );
}

export function UsersAdmin() {
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(null);
  const limit = 15;
  const { data, loading, reload } = useAsync(() => api.get(`/api/admin/users${qs({ role, status, q, limit, offset })}`), [role, status, q, offset]);
  const c = data?.counts ?? {};
  return (
    <div>
      <PageHeader title="Users" subtitle="Buyers, individual sellers and administrators." />
      <Toolbar>
        <Tabs value={role} onChange={(v) => { setRole(v); setOffset(0); }} tabs={[{ value: "all", label: "All" }, { value: "buyer", label: "Buyers", count: c.buyer }, { value: "seller", label: "Sellers", count: c.seller }, { value: "admin", label: "Admins", count: c.admin }]} />
        <select className="input !w-auto !py-2" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}><option value="">Any status</option><option value="restricted">Restricted</option><option value="suspended">Suspended</option></select>
        <div className="ml-auto"><SearchBox value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Search name, e-mail or shop" /></div>
      </Toolbar>
      <AdminTable>
        <table className="tbl"><thead><tr><th>User</th><th>Role</th><th>Status</th><th className="text-right">Wallet / earnings</th><th className="text-right">Bids</th><th className="text-right">Orders</th><th>Joined</th></tr></thead>
          <tbody>
            {loading && !data ? <tr><td colSpan={7}><Skeleton className="h-48" /></td></tr> : data.items.map((u) => (
              <tr key={u.id} className="cursor-pointer" onClick={() => setOpen(u.id)}>
                <td><div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-bold text-brand">{u.name[0]}</span><div className="min-w-0"><p className="truncate font-semibold">{u.businessName || u.name}</p><p className="truncate text-xs text-muted">{u.email}</p></div></div></td>
                <td><span className="badge bg-soft capitalize text-muted">{u.role}</span></td>
                <td>{u.status === "suspended" ? <Status value="rejected" text="Suspended" /> : u.restrictedUntil ? <Status value="suspended" text="Restricted" /> : <Status value="approved" text="Active" />}</td>
                <td className="text-right tabular-nums">{u.role === "seller" ? money(u.earningsCents + u.pendingCents) : u.role === "buyer" ? money(u.walletCents + u.depositCents) : "–"}</td>
                <td className="text-right tabular-nums">{u.bidCount}</td>
                <td className="text-right tabular-nums">{u.orderCount}</td>
                <td className="whitespace-nowrap text-muted">{dateOnly(u.createdAt)}</td>
              </tr>
            ))}
            {data?.items.length === 0 && <tr><td colSpan={7}><Empty icon={Users} title="No users found" /></td></tr>}
          </tbody></table>
        {data && <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />}
      </AdminTable>
      <UserDrawer id={open} onClose={() => setOpen(null)} onChanged={reload} />
    </div>
  );
}

export function Restrictions() {
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.get("/api/admin/restrictions"), []);
  const lift = async (id) => { try { await api.post(`/api/admin/restrictions/${id}/lift`); toast("Restriction lifted"); reload(); } catch (e) { toast(e.message, "error"); } };
  const active = data?.filter((r) => r.status === "active").length ?? 0;
  return (
    <div>
      <PageHeader title="Account restrictions" subtitle="Applied automatically when a winner misses the payment deadline, or manually by an admin. They lift themselves when the period ends." />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[["Active now", active, "bad"], ["Automatic (missed payment)", data?.filter((r) => r.auto).length ?? 0, "accent"], ["Manual", data?.filter((r) => !r.auto).length ?? 0, "brand"]].map(([l, v, t]) => (
          <div key={l} className="card p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted">{l}</p><p className={cx("mt-1 font-display text-3xl font-extrabold", { bad: "text-bad", accent: "text-accent", brand: "text-brand" }[t])}>{v}</p></div>
        ))}
      </div>
      <AdminTable>
        <table className="tbl"><thead><tr><th>User</th><th>Reason</th><th>Source</th><th>Period</th><th>Status</th><th /></tr></thead>
          <tbody>
            {loading && !data ? <tr><td colSpan={6}><Skeleton className="h-40" /></td></tr> : data.map((r) => (
              <tr key={r.id}><td><p className="font-semibold">{r.name}</p><p className="text-xs text-muted">{r.email}</p></td><td className="max-w-[320px] text-muted">{r.reason}</td><td><span className="badge bg-soft text-muted">{r.auto ? "Automatic" : "Admin"}</span></td><td className="whitespace-nowrap text-muted">{dateOnly(r.startsAt)} → {dateOnly(r.endsAt)}</td><td><Status value={r.status} /></td><td className="text-right">{r.status === "active" && <button className="btn-ok btn-sm" onClick={() => lift(r.id)}><ShieldCheck className="h-3.5 w-3.5" />Lift</button>}</td></tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={6}><Empty icon={ShieldCheck} title="No restrictions" /></td></tr>}
          </tbody></table>
      </AdminTable>
    </div>
  );
}
