import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal, Search, X, SearchX } from "lucide-react";
import { api, qs } from "../lib/api";
import { useSession } from "../lib/session";
import { AuctionCard, CardSkeleton } from "../components/AuctionCard";
import { Drawer, Empty, Icon, Tabs, cx } from "../components/ui";

const CONDITIONS = ["New", "Like new", "Excellent", "Good", "Used"];
const SORTS = [
  ["ending", "Ending soonest"], ["newest", "Newest listed"], ["price_asc", "Price: low to high"], ["price_desc", "Price: high to low"], ["bids", "Most bids"], ["popular", "Most viewed"],
];

function Filters({ p, set, config }) {
  const [min, setMin] = useState(p.get("min") ?? "");
  const [max, setMax] = useState(p.get("max") ?? "");
  useEffect(() => { setMin(p.get("min") ?? ""); setMax(p.get("max") ?? ""); }, [p]);
  const cat = p.get("category");
  const cond = p.get("condition");
  return (
    <div className="space-y-7">
      <div>
        <p className="label">Category</p>
        <div className="space-y-0.5">
          <button onClick={() => set({ category: null })} className={cx("flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", !cat ? "bg-brand/10 text-brand" : "text-muted hover:bg-soft hover:text-ink")}>All categories</button>
          {config?.categories.map((c) => (
            <button key={c.id} onClick={() => set({ category: c.slug })} className={cx("flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold transition", cat === c.slug ? "bg-brand/10 text-brand" : "text-muted hover:bg-soft hover:text-ink")}>
              <Icon name={c.icon} className="h-4 w-4" />{c.name}<span className="ml-auto text-xs font-medium opacity-70">{c.live}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="label">Condition</p>
        <div className="flex flex-wrap gap-1.5">
          {CONDITIONS.map((c) => (
            <button key={c} onClick={() => set({ condition: cond === c ? null : c })} className={cx("rounded-full border px-3 py-1 text-xs font-semibold transition", cond === c ? "border-brand bg-brand text-white" : "border-line text-muted hover:border-brand hover:text-brand")}>{c}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="label">Price (USD)</p>
        <form onSubmit={(e) => { e.preventDefault(); set({ min: min || null, max: max || null }); }} className="flex items-center gap-2">
          <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="numeric" placeholder="Min" className="input" />
          <span className="text-muted">–</span>
          <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="numeric" placeholder="Max" className="input" />
          <button className="btn-soft !px-3">Go</button>
        </form>
      </div>
    </div>
  );
}

export default function Auctions() {
  const { config } = useSession();
  const [p, setP] = useSearchParams();
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [filters, setFilters] = useState(false);
  const [q, setQ] = useState(p.get("q") ?? "");
  const status = p.get("status") ?? "live";
  const sort = p.get("sort") ?? "ending";
  const key = p.toString();
  const PAGE = 12;

  const set = (patch) => {
    const n = new URLSearchParams(p);
    for (const [k, v] of Object.entries(patch)) (v == null || v === "" ? n.delete(k) : n.set(k, v));
    setP(n, { replace: true });
  };
  useEffect(() => {
    setQ(p.get("q") ?? "");
  }, [p.get("q")]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/api/auctions${qs({ q: p.get("q"), category: p.get("category"), condition: p.get("condition"), min: p.get("min"), max: p.get("max"), status, sort, endingWithin: p.get("endingWithin"), featured: p.get("featured"), limit: PAGE })}`)
      .then((d) => alive && setData(d))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [key]);

  const loadMore = async () => {
    setMore(true);
    try {
      const d = await api.get(`/api/auctions${qs({ q: p.get("q"), category: p.get("category"), condition: p.get("condition"), min: p.get("min"), max: p.get("max"), status, sort, endingWithin: p.get("endingWithin"), limit: PAGE, offset: data.items.length })}`);
      setData((o) => ({ ...d, items: [...o.items, ...d.items] }));
    } finally { setMore(false); }
  };

  const active = useMemo(() => ["category", "condition", "min", "max", "q", "endingWithin"].filter((k) => p.get(k)), [key]);
  const catName = config?.categories.find((c) => c.slug === p.get("category"))?.name;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">{catName ?? "All auctions"}</h1>
          <p className="mt-1 text-sm text-muted">{loading ? "Loading…" : `${data.total} ${data.total === 1 ? "auction" : "auctions"}`}{p.get("q") && <> matching “{p.get("q")}”</>}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={status} onChange={(v) => set({ status: v === "live" ? null : v })} tabs={[{ value: "live", label: "Live" }, { value: "upcoming", label: "Upcoming" }, { value: "ended", label: "Ended" }]} />
          <select value={sort} onChange={(e) => set({ sort: e.target.value === "ending" ? null : e.target.value })} className="input !w-auto !py-2">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={() => setFilters(true)} className="btn-soft lg:hidden"><SlidersHorizontal className="h-4 w-4" />Filters</button>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); set({ q }); }} className="relative mb-5">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title or description" className="input !pl-11" />
      </form>

      <AnimatePresence>
        {active.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-5 flex flex-wrap gap-2 overflow-hidden">
            {active.map((k) => (
              <button key={k} onClick={() => set({ [k]: null })} className="badge gap-1.5 bg-brand/10 py-1.5 text-brand hover:bg-brand/20">
                {k === "category" ? catName : k === "endingWithin" ? "Ending within 24h" : `${k}: ${p.get(k)}`}<X className="h-3 w-3" />
              </button>
            ))}
            <button onClick={() => setP({}, { replace: true })} className="text-xs font-semibold text-muted hover:text-ink">Clear all</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="gap-8 lg:grid lg:grid-cols-[250px_1fr]">
        <aside className="hidden lg:block"><div className="card sticky top-24 p-5"><Filters p={p} set={set} config={config} /></div></aside>
        <div>
          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}</div>
          ) : data.items.length === 0 ? (
            <div className="card"><Empty icon={SearchX} title="No auctions found" hint="Try removing a filter or searching for something else." action={<button className="btn-primary" onClick={() => setP({}, { replace: true })}>Reset filters</button>} /></div>
          ) : (
            <>
              <motion.div layout className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence mode="popLayout">{data.items.map((a, i) => <AuctionCard key={a.id} a={a} index={i} />)}</AnimatePresence>
              </motion.div>
              {data.items.length < data.total && (
                <div className="mt-8 text-center"><button className="btn-soft btn-lg" onClick={loadMore} disabled={more}>{more ? "Loading…" : `Show more (${data.total - data.items.length} left)`}</button></div>
              )}
            </>
          )}
        </div>
      </div>

      <Drawer open={filters} onClose={() => setFilters(false)} title="Filters" width="max-w-sm"><Filters p={p} set={set} config={config} /></Drawer>
    </div>
  );
}
