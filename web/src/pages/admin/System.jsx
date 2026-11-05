import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Gavel, Mail, Percent, RotateCcw, Save, ShieldAlert, Timer, Wallet, History, Send, Inbox } from "lucide-react";
import { api, qs } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { money, dateTime, ago } from "../../lib/format";
import { Empty, Field, Modal, PageHeader, Pager, Skeleton, Spinner, Tabs, useAsync, cx } from "../../components/ui";
import { AdminTable, SearchBox, Toolbar } from "./kit";

function Toggle({ on, onChange, label, hint }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-line p-4 text-left transition hover:border-brand/40">
      <div><p className="font-semibold">{label}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</div>
      <span className={cx("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-brand" : "bg-line")}><motion.span layout transition={{ type: "spring", stiffness: 600, damping: 32 }} className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow", on ? "right-0.5" : "left-0.5")} /></span>
    </button>
  );
}

function NumberField({ label, hint, value, onChange, suffix, prefix, step = 1 }) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        {prefix && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">{prefix}</span>}
        <input type="number" step={step} className={cx("input font-semibold", prefix && "!pl-8", suffix && "!pr-16")} value={value} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
        {suffix && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">{suffix}</span>}
      </div>
    </Field>
  );
}

export function SettingsAdmin() {
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.get("/api/admin/settings"), []);
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setS({ ...data.settings }); }, [data]);
  if (loading || !s) return <Skeleton className="h-96" />;
  const set = (k) => (v) => setS({ ...s, [k]: v });
  const dirty = JSON.stringify(s) !== JSON.stringify(data.settings);
  const save = async () => {
    setBusy(true);
    try {
      const body = {
        site_name: s.site_name, min_deposit_cents: Math.round(s.min_deposit_cents), commission_pct: Number(s.commission_pct), payment_window_days: Number(s.payment_window_days), restriction_days: Number(s.restriction_days),
        forfeit_deposit: s.forfeit_deposit ? 1 : 0, durations: s.durations, anti_snipe_window_sec: Number(s.anti_snipe_window_sec), anti_snipe_extension_sec: Number(s.anti_snipe_extension_sec),
        default_min_increment_cents: Math.round(s.default_min_increment_cents), auto_release_payout: s.auto_release_payout ? 1 : 0, auto_approve_sandbox_deposits: s.auto_approve_sandbox_deposits ? 1 : 0, reminder_hours: Number(s.reminder_hours),
      };
      await api.put("/api/admin/settings", body);
      toast("Settings saved", "ok", "New rules apply immediately.");
      reload();
    } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  const reset = () => setS({ ...data.defaults });
  const dur = s.durations.join(", ");
  return (
    <div>
      <PageHeader title="Rules & settings" subtitle="Every business rule is configurable. Changes apply immediately to new bids, orders and deadlines."
        actions={<><button className="btn-ghost" onClick={reset}><RotateCcw className="h-4 w-4" />Defaults</button><button className="btn-primary" disabled={!dirty || busy} onClick={save}>{busy ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}Save changes</button></>} />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card space-y-4 p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Wallet className="h-5 w-5 text-brand" />Deposit & payments</h2>
          <NumberField label="Minimum security deposit" prefix="$" value={s.min_deposit_cents / 100} onChange={(v) => set("min_deposit_cents")(Math.round(v * 100))} hint="Buyers must hold this before they can bid." />
          <NumberField label="Marketplace commission" suffix="%" value={s.commission_pct} onChange={set("commission_pct")} step={0.5} hint="Deducted from each sale price." />
          <NumberField label="Winner payment window" suffix="days" value={s.payment_window_days} onChange={set("payment_window_days")} hint="How long the winning buyer has to pay in full." />
          <Toggle on={!!s.forfeit_deposit} onChange={(v) => set("forfeit_deposit")(v ? 1 : 0)} label="Forfeit the deposit on a missed payment" hint="The minimum deposit is moved to the marketplace." />
          <Toggle on={!!s.auto_release_payout} onChange={(v) => set("auto_release_payout")(v ? 1 : 0)} label="Release seller payout automatically" hint="The same day an item passes inspection. Turn off to approve each payout by hand." />
          <Toggle on={!!s.auto_approve_sandbox_deposits} onChange={(v) => set("auto_approve_sandbox_deposits")(v ? 1 : 0)} label="Instant test-card deposits (demo)" hint="Lets visitors try the wallet without waiting for an admin." />
        </section>
        <section className="card space-y-4 p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldAlert className="h-5 w-5 text-bad" />Restrictions</h2>
          <NumberField label="Bidding restriction after a missed payment" suffix="days" value={s.restriction_days} onChange={set("restriction_days")} hint="Applied automatically, lifted automatically." />
          <NumberField label="Payment reminder" suffix="hours before" value={s.reminder_hours} onChange={set("reminder_hours")} hint="When the winner is reminded about the deadline." />
          <h2 className="flex items-center gap-2 pt-3 text-lg font-bold"><Timer className="h-5 w-5 text-accent" />Anti-sniping</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Trigger window" suffix="sec" value={s.anti_snipe_window_sec} onChange={set("anti_snipe_window_sec")} hint="A bid this close to the end extends it." />
            <NumberField label="Extension" suffix="sec" value={s.anti_snipe_extension_sec} onChange={set("anti_snipe_extension_sec")} hint="Added to the end time. 0 turns it off." />
          </div>
        </section>
        <section className="card space-y-4 p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Gavel className="h-5 w-5 text-brand" />Listings</h2>
          <Field label="Allowed auction durations (days)" hint="Comma separated. Sellers choose from these.">
            <input className="input font-semibold" value={dur} onChange={(e) => set("durations")(e.target.value.split(",").map((x) => parseInt(x.trim(), 10)).filter((x) => x > 0))} />
          </Field>
          <div className="flex flex-wrap gap-2">{s.durations.map((d) => <span key={d} className="badge bg-brand/10 py-1.5 text-brand">{d} days</span>)}</div>
          <NumberField label="Default bid increment" prefix="$" value={s.default_min_increment_cents / 100} onChange={(v) => set("default_min_increment_cents")(Math.round(v * 100))} />
        </section>
        <section className="card space-y-4 p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Percent className="h-5 w-5 text-ok" />Branding</h2>
          <Field label="Marketplace name"><input className="input font-semibold" value={s.site_name} onChange={(e) => set("site_name")(e.target.value)} /></Field>
          <div className="rounded-xl bg-soft p-4 text-sm text-muted">Currency: <b className="text-ink">USD</b>. Time zone: <b className="text-ink">UTC</b>. Rules above apply to everyone, including auctions already running, whenever they are evaluated.</div>
        </section>
      </div>
    </div>
  );
}

export function EmailsAdmin() {
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.get("/api/admin/emails"), []);
  const [tab, setTab] = useState("templates");
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const save = async () => {
    try { await api.put(`/api/admin/emails/${edit.key}`, { subject: edit.subject, body: edit.body, enabled: edit.enabled }); toast("Template saved"); setEdit(null); reload(); } catch (e) { toast(e.message, "error"); }
  };
  const flip = async (t) => { await api.put(`/api/admin/emails/${t.key}`, { subject: t.subject, body: t.body, enabled: !t.enabled }); reload(); };
  return (
    <div>
      <PageHeader title="E-mail notifications" subtitle="Every notification also appears inside the app. Edit the e-mail copy, or switch a template off." />
      <Toolbar><Tabs value={tab} onChange={setTab} tabs={[{ value: "templates", label: "Templates", count: data?.templates.length }, { value: "outbox", label: "Sent e-mails", count: data?.sentToday }]} /></Toolbar>
      {loading && !data ? <Skeleton className="h-80" /> : tab === "templates" ? (
        <AdminTable><table className="tbl"><thead><tr><th>Event</th><th>Subject</th><th>Enabled</th><th /></tr></thead>
          <tbody>{data.templates.map((t) => (
            <tr key={t.key}><td><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-brand/10 text-brand"><Mail className="h-4 w-4" /></span><div><p className="font-semibold">{t.label}</p><p className="font-mono text-[11px] text-muted">{t.key}</p></div></div></td><td className="max-w-[320px] truncate text-muted">{t.subject}</td>
              <td><button onClick={() => flip(t)} className={cx("relative h-6 w-11 rounded-full transition", t.enabled ? "bg-brand" : "bg-line")}><span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", t.enabled ? "left-[22px]" : "left-0.5")} /></button></td>
              <td className="text-right"><button className="btn-soft btn-sm" onClick={() => setEdit({ ...t })}>Edit</button></td></tr>))}</tbody></table></AdminTable>
      ) : (
        <AdminTable><table className="tbl"><thead><tr><th>Sent</th><th>To</th><th>Subject</th><th>Template</th></tr></thead>
          <tbody>{data.outbox.map((m) => <tr key={m.id} className="cursor-pointer" onClick={() => setView(m)}><td className="whitespace-nowrap text-muted">{ago(m.at)}</td><td>{m.recipient}</td><td className="max-w-[320px] truncate font-semibold">{m.subject}</td><td><span className="badge bg-soft text-muted">{m.template}</span></td></tr>)}
            {data.outbox.length === 0 && <tr><td colSpan={4}><Empty icon={Inbox} title="No e-mails yet" /></td></tr>}</tbody></table></AdminTable>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.label ?? "Template"} wide footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={save}>Save template</button></>}>
        {edit && <div className="space-y-4"><Field label="Subject"><input className="input" value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></Field><Field label="Message" hint="Placeholders like {{name}}, {{title}} and {{amount}} are filled in when the e-mail is sent."><textarea className="input min-h-[130px]" value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field></div>}
      </Modal>
      <Modal open={!!view} onClose={() => setView(null)} title={view?.subject ?? ""}>
        {view && <div className="space-y-3 text-sm"><p className="text-muted">To: <b className="text-ink">{view.recipient}</b> · {dateTime(view.at)}</p><p className="rounded-xl bg-soft p-4">{view.body}</p></div>}
      </Modal>
    </div>
  );
}

export function Logs() {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 25;
  const { data, loading } = useAsync(() => api.get(`/api/admin/logs${qs({ q, limit, offset })}`), [q, offset]);
  return (
    <div>
      <PageHeader title="Activity log" subtitle="A permanent record of who did what, and when." />
      <Toolbar><div className="ml-auto"><SearchBox value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Search actor or action" /></div></Toolbar>
      <AdminTable>
        <table className="tbl"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th><th>IP</th></tr></thead>
          <tbody>{loading && !data ? <tr><td colSpan={6}><Skeleton className="h-64" /></td></tr> : data.items.map((l) => (
            <tr key={l.id}><td className="whitespace-nowrap text-muted">{dateTime(l.at)}</td><td className="font-semibold">{l.actor}</td><td><span className="badge bg-brand/10 font-mono text-[11px] text-brand">{l.action}</span></td><td className="text-muted">{l.entity ? `${l.entity} #${l.entityId ?? ""}` : "–"}</td><td className="max-w-[280px] truncate font-mono text-xs text-muted">{l.meta ?? ""}</td><td className="font-mono text-xs text-muted">{l.ip ?? "–"}</td></tr>))}
            {data?.items.length === 0 && <tr><td colSpan={6}><Empty icon={History} title="Nothing logged" /></td></tr>}</tbody></table>
        {data && <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />}
      </AdminTable>
    </div>
  );
}
