import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, ChevronDown, Gavel, LogOut, Menu, Moon, Search, Sun, X, LayoutDashboard, ShieldCheck, Sparkles } from "lucide-react";
import { useSession } from "../lib/session";
import { api } from "../lib/api";
import { ago } from "../lib/format";
import { cx, Spinner } from "./ui";

export function Logo({ className }) {
  return (
    <Link to="/" className={cx("flex items-center gap-2.5", className)}>
      <span className="grid h-9 w-9 place-items-center rounded-xl text-white shadow-glow" style={{ backgroundImage: "linear-gradient(135deg, rgb(var(--brand)), rgb(var(--brand2)))" }}>
        <Gavel className="h-[18px] w-[18px]" />
      </span>
      <span className="font-display text-xl font-extrabold tracking-tight">Bidora</span>
    </Link>
  );
}

function useOutside(ref, fn) {
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && fn();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, fn]);
}

function Notifications() {
  const { unread, setUnread } = useSession();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const ref = useRef(null);
  const nav = useNavigate();
  useOutside(ref, () => setOpen(false));
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setItems(await api.get("/api/me/notifications"));
      if (unread) {
        api.post("/api/me/notifications/read").then(() => setUnread(0));
      }
    }
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="btn-ghost relative !p-2.5" aria-label="Notifications">
        <Bell className="h-[18px] w-[18px]" />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ duration: 0.18 }}
            className="card absolute right-0 top-full z-50 mt-2 w-[min(92vw,380px)] origin-top-right overflow-hidden shadow-lift">
            <div className="border-b border-line px-4 py-3 text-sm font-bold">Notifications</div>
            <div className="max-h-[60vh] overflow-y-auto">
              {!items && <div className="grid place-items-center py-10"><Spinner /></div>}
              {items?.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">Nothing yet. Bid on something!</p>}
              {items?.map((n) => (
                <button key={n.id} onClick={() => { setOpen(false); if (n.link) nav(n.link); }} className={cx("block w-full border-b border-line/60 px-4 py-3 text-left transition hover:bg-soft", !n.read && "bg-brand/5")}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold">{n.title}</p>
                    <span className="shrink-0 text-[11px] text-muted">{ago(n.at)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();
  useOutside(ref, () => setOpen(false));
  const home = { buyer: "/account", seller: "/seller", admin: "/admin" }[user.role];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition hover:bg-soft">
        <span className="grid h-8 w-8 place-items-center rounded-lg text-sm font-bold text-white" style={{ backgroundImage: "linear-gradient(135deg, rgb(var(--brand)), rgb(var(--brand2)))" }}>{user.name[0]}</span>
        <span className="hidden max-w-[110px] truncate text-sm font-semibold md:block">{user.name.split(" ")[0]}</span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ duration: 0.18 }}
            className="card absolute right-0 top-full z-50 mt-2 w-60 origin-top-right p-1.5 shadow-lift">
            <div className="px-3 py-2.5">
              <p className="truncate text-sm font-bold">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
              <span className="badge mt-2 bg-brand/12 capitalize text-brand">{user.role}</span>
            </div>
            <button onClick={() => { setOpen(false); nav(home); }} className="btn-ghost w-full !justify-start"><LayoutDashboard className="h-4 w-4" />{user.role === "admin" ? "Admin panel" : user.role === "seller" ? "Seller dashboard" : "My account"}</button>
            <button onClick={async () => { setOpen(false); await logout(); nav("/"); }} className="btn-ghost w-full !justify-start"><LogOut className="h-4 w-4" />Sign out</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useSession();
  return (
    <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="btn-ghost !p-2.5" aria-label="Toggle theme">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
          {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

const linkCls = ({ isActive }) => cx("rounded-lg px-3 py-2 text-sm font-semibold transition", isActive ? "text-brand" : "text-muted hover:text-ink");

export function Navbar() {
  const { user } = useSession();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => setMenu(false), [loc.pathname]);
  const submit = (e) => {
    e.preventDefault();
    nav(`/auctions?q=${encodeURIComponent(q)}`);
  };
  return (
    <header className="glass sticky top-0 z-40 border-x-0 border-t-0">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Logo />
        <nav className="ml-4 hidden items-center lg:flex">
          <NavLink to="/auctions" className={linkCls}>Auctions</NavLink>
          <NavLink to="/how-it-works" className={linkCls}>How it works</NavLink>
          {user?.role === "seller" && <NavLink to="/seller/listings/new" className={linkCls}>Sell an item</NavLink>}
        </nav>
        <form onSubmit={submit} className="relative mx-auto hidden max-w-md flex-1 md:block">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search watches, cameras, sneakers…" className="input !rounded-full !bg-soft !pl-10" />
        </form>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <ThemeToggle />
          {user ? (
            <>
              <Notifications />
              <UserMenu />
            </>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link to="/login" className="btn-ghost">Sign in</Link>
              <Link to="/register" className="btn-primary">Join free</Link>
            </div>
          )}
          <button className="btn-ghost !p-2.5 lg:hidden" onClick={() => setMenu(!menu)} aria-label="Menu">{menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      <AnimatePresence>
        {menu && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-line lg:hidden">
            <div className="space-y-1 px-4 py-3">
              <form onSubmit={submit} className="relative mb-2 md:hidden">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search auctions…" className="input !pl-10" />
              </form>
              <NavLink to="/auctions" className="block rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-soft">Auctions</NavLink>
              <NavLink to="/how-it-works" className="block rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-soft">How it works</NavLink>
              {!user && (
                <div className="flex gap-2 pt-2">
                  <Link to="/login" className="btn-soft flex-1">Sign in</Link>
                  <Link to="/register" className="btn-primary flex-1">Join free</Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

export function DemoStrip() {
  const { user, config } = useSession();
  if (!config?.demoMode || user) return null;
  return (
    <div className="border-b border-line bg-brand/8 text-center text-xs text-ink">
      <Link to="/login" className="inline-flex items-center gap-1.5 px-4 py-2 font-medium hover:underline">
        <Sparkles className="h-3.5 w-3.5 text-brand" />
        Live demo marketplace. Sign in as a buyer, a seller or the admin with one click.
      </Link>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-surface/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-muted">Live auctions for watches, cameras, sneakers and more. Every item is inspected at our warehouse before it reaches the winner.</p>
          <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-ok"><ShieldCheck className="h-4 w-4" />Warehouse-verified. Seller paid after inspection.</p>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">Marketplace</p>
          <ul className="space-y-2 text-sm"><li><Link className="hover:text-brand" to="/auctions">Browse auctions</Link></li><li><Link className="hover:text-brand" to="/auctions?sort=newest">New arrivals</Link></li><li><Link className="hover:text-brand" to="/auctions?endingWithin=24">Ending today</Link></li></ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">Learn</p>
          <ul className="space-y-2 text-sm"><li><Link className="hover:text-brand" to="/how-it-works">How it works</Link></li><li><Link className="hover:text-brand" to="/register">Become a seller</Link></li><li><Link className="hover:text-brand" to="/login">Sign in</Link></li></ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">About this demo</p>
          <p className="text-sm text-muted">A portfolio project. All members, items and money are made up. Product photos are from Unsplash.</p>
        </div>
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-muted">© {new Date().getFullYear()} Bidora demo marketplace</div>
    </footer>
  );
}

export function PublicLayout() {
  const loc = useLocation();
  useEffect(() => window.scrollTo({ top: 0 }), [loc.pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <DemoStrip />
      <Navbar />
      <main className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  );
}

export function RequireRole({ role, children }) {
  const { user, ready } = useSession();
  const loc = useLocation();
  if (!ready) return <div className="grid min-h-[50vh] place-items-center"><Spinner className="h-7 w-7 text-brand" /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (user.role !== role) return <Navigate to={{ buyer: "/account", seller: "/seller", admin: "/admin" }[user.role]} replace />;
  return children;
}

// Sidebar layout for the buyer, seller and admin areas.
export function Shell({ title, nav, children, accent }) {
  const loc = useLocation();
  return (
    <div className="mx-auto max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[230px_1fr] lg:py-10">
      <aside className="mb-6 lg:mb-0">
        <div className="lg:sticky lg:top-24">
          <p className="mb-3 hidden px-3 text-xs font-bold uppercase tracking-widest text-muted lg:block">{title}</p>
          <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx("relative flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition", isActive ? "text-brand" : "text-muted hover:bg-soft hover:text-ink")}>
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId={`shell-${title}`} className="absolute inset-0 rounded-xl bg-brand/10" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                    <n.icon className="relative h-[18px] w-[18px]" />
                    <span className="relative whitespace-nowrap">{n.label}</span>
                    {n.badge ? <span className="relative ml-auto rounded-full bg-bad px-1.5 text-[10px] font-bold text-white">{n.badge}</span> : null}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          {accent}
        </div>
      </aside>
      <motion.section key={loc.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="min-w-0">
        {children ?? <Outlet />}
      </motion.section>
    </div>
  );
}
