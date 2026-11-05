import { useEffect, useId, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useSession } from "../../lib/session";
import { getSocket } from "../../lib/socket";
import { cx, Counter } from "../../components/ui";

// Charts need real colour values, so read the theme's CSS variables.
export function useColors() {
  const { theme } = useSession();
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => `rgb(${cs.getPropertyValue(`--${n}`).trim().replace(/ /g, ",")})`;
    return { brand: v("brand"), brand2: v("brand2"), accent: v("accent"), ok: v("ok"), bad: v("bad"), muted: v("muted"), line: v("line"), ink: v("ink"), surface: v("surface"), soft: v("soft") };
  }, [theme]);
}

export const tooltipProps = (c) => ({
  contentStyle: { borderRadius: 12, border: `1px solid ${c.line}`, background: c.surface, boxShadow: "0 12px 32px -12px rgb(0 0 0 / .35)", fontSize: 12 },
  labelStyle: { fontWeight: 700, color: c.ink },
  cursor: { stroke: c.line },
});

export function ChartCard({ title, subtitle, actions, children, className, height = 280 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45 }} className={cx("card p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="text-base font-bold">{title}</h3>{subtitle && <p className="text-xs text-muted">{subtitle}</p>}</div>
        {actions}
      </div>
      {height ? <div style={{ height }}>{children}</div> : children}
    </motion.div>
  );
}

export function Spark({ data, color, dataKey = "v" }) {
  const gid = `sp${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.4} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${gid})`} isAnimationActive animationDuration={900} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Kpi({ label, value, format, delta, hint, icon: I, tone = "brand", spark, sparkColor, to }) {
  const tones = { brand: "bg-brand/12 text-brand", ok: "bg-ok/12 text-ok", accent: "bg-accent/15 text-accent", bad: "bg-bad/12 text-bad" };
  const Wrapper = to ? "a" : "div";
  return (
    <motion.div whileHover={{ y: -3 }} className="card relative overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
          <p className="mt-1.5 truncate font-display text-[26px] font-extrabold leading-tight">{typeof value === "number" ? <Counter value={value} format={format} /> : value}</p>
        </div>
        {I && <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tones[tone])}><I className="h-5 w-5" /></span>}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta != null && <span className={cx("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-bold", delta >= 0 ? "bg-ok/12 text-ok" : "bg-bad/12 text-bad")}>{delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(delta)}%</span>}
        {hint && <span className="text-muted">{hint}</span>}
      </div>
      {spark && <div className="-mx-1 mt-2"><Spark data={spark} color={sparkColor} /></div>}
    </motion.div>
  );
}

// Reload a list when the server says something in the admin queue changed.
export function useQueueEvents(reload, deps = []) {
  useEffect(() => {
    const s = getSocket();
    const fn = () => reload();
    s.on("admin:queue", fn);
    return () => s.off("admin:queue", fn);
  }, deps);
}

export function Toolbar({ children }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

export function SearchBox({ value, onChange, placeholder = "Search…" }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => { const t = setTimeout(() => onChange(v), 300); return () => clearTimeout(t); }, [v]);
  return <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="input !w-64 !py-2" />;
}

export const AdminTable = ({ children, className }) => <div className={cx("card overflow-hidden", className)}><div className="overflow-x-auto">{children}</div></div>;

export function Row({ label, children }) {
  return <div className="flex items-start justify-between gap-4 border-b border-line/70 py-2.5 text-sm last:border-0"><dt className="shrink-0 text-muted">{label}</dt><dd className="text-right font-medium">{children}</dd></div>;
}

export const PIE = ["brand", "brand2", "accent", "ok", "bad", "muted"];
