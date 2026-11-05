import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Banknote, ChevronsUpDown, ClipboardCheck, ExternalLink, Gavel, HandCoins, History, LayoutDashboard, LogOut, Mail, Menu, MessageSquareWarning, Package, ReceiptText, Settings, ShieldAlert, Tags, Undo2, Users, Warehouse, X, ChartColumn } from "lucide-react";
import { useSession } from "../../lib/session";
import { getSocket } from "../../lib/socket";
import { api } from "../../lib/api";
import { Logo, ThemeToggle } from "../../components/Layout";
import { cx } from "../../components/ui";
import Dashboard from "./Dashboard";
import { Approvals, AuctionsAdmin, BidsMonitor, Categories } from "./Auctions";
import { UsersAdmin, Restrictions } from "./People";
import { Deposits, Payouts, Refunds, Transactions, Reports } from "./Money";
import { OrdersAdmin, WarehouseAdmin, Disputes } from "./Operations";
import { SettingsAdmin, EmailsAdmin, Logs } from "./System";

const NAV = [
  ["Overview", [["/admin", "Dashboard", LayoutDashboard, null, true]]],
  ["Marketplace", [["/admin/approvals", "Review queue", ClipboardCheck, "pendingReview"], ["/admin/auctions", "All auctions", Gavel], ["/admin/bids", "Live bids", Activity], ["/admin/categories", "Categories", Tags]]],
  ["People", [["/admin/users", "Users", Users], ["/admin/restrictions", "Restrictions", ShieldAlert, "restricted"]]],
  ["Money", [["/admin/deposits", "Deposits", HandCoins, "pendingDeposits"], ["/admin/payouts", "Seller payouts", Banknote], ["/admin/refunds", "Refunds", Undo2], ["/admin/transactions", "Transactions", ReceiptText], ["/admin/reports", "Financial reports", ChartColumn]]],
  ["Operations", [["/admin/orders", "Orders & shipping", Package], ["/admin/warehouse", "Warehouse", Warehouse, "toInspect"], ["/admin/disputes", "Disputes", MessageSquareWarning, "openDisputes"]]],
  ["System", [["/admin/settings", "Rules & settings", Settings], ["/admin/emails", "E-mail notifications", Mail], ["/admin/logs", "Activity log", History]]],
];
const TITLES = Object.fromEntries(NAV.flatMap(([, items]) => items.map(([to, label]) => [to, label])));

function Sidebar({ badges, onNavigate }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center px-5"><Logo /><span className="badge ml-2 bg-brand/12 text-brand">Admin</span></div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2">
        {NAV.map(([group, items]) => (
          <div key={group}>
            <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-widest text-muted/80">{group}</p>
            {items.map(([to, label, Icon, badge, end]) => (
              <NavLink key={to} to={to} end={end} onClick={onNavigate} className={({ isActive }) => cx("group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition", isActive ? "text-brand" : "text-muted hover:bg-soft hover:text-ink")}>
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="admin-nav" className="absolute inset-0 rounded-xl bg-brand/10" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                    <Icon className="relative h-[18px] w-[18px]" />
                    <span className="relative">{label}</span>
                    {badge && badges?.[badge] > 0 && <span className="relative ml-auto rounded-full bg-bad px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{badges[badge]}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3"><Link to="/" className="btn-ghost w-full !justify-start text-xs"><ExternalLink className="h-4 w-4" />View the public site</Link></div>
    </div>
  );
}

export default function AdminApp() {
  const { user, logout } = useSession();
  const loc = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [badges, setBadges] = useState({});
  const [pulse, setPulse] = useState(0);
  const ref = useRef(null);

  const loadBadges = () => api.get("/api/admin/overview?days=7").then((d) => setBadges(d.kpis)).catch(() => {});
  useEffect(() => { loadBadges(); }, []);
  useEffect(() => {
    const s = getSocket();
    const fn = () => { setPulse((p) => p + 1); loadBadges(); };
    s.on("admin:queue", fn);
    return () => s.off("admin:queue", fn);
  }, []);
  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setMenu(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const title = TITLES[loc.pathname] ?? TITLES[loc.pathname.replace(/\/$/, "")] ?? "Admin";

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-line bg-surface/80 backdrop-blur lg:block"><Sidebar badges={badges} /></aside>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: "spring", stiffness: 360, damping: 38 }} className="absolute inset-y-0 left-0 w-[264px] border-r border-line bg-surface"><Sidebar badges={badges} onNavigate={() => setOpen(false)} /></motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="min-w-0">
        <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-x-0 border-t-0 px-4 sm:px-6">
          <button className="btn-ghost !p-2.5 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0"><p className="truncate font-display text-lg font-extrabold">{title}</p></div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden items-center gap-2 rounded-full bg-ok/10 px-3 py-1.5 text-xs font-bold text-ok sm:flex"><span className="h-2 w-2 animate-ring rounded-full bg-ok" />Live{pulse > 0 && <motion.span key={pulse} initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-full bg-ok/20 px-1.5">+{pulse}</motion.span>}</span>
            <ThemeToggle />
            <div className="relative" ref={ref}>
              <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition hover:bg-soft">
                <span className="grid h-8 w-8 place-items-center rounded-lg text-sm font-bold text-white" style={{ backgroundImage: "linear-gradient(135deg, rgb(var(--brand)), rgb(var(--brand2)))" }}>{user.name[0]}</span>
                <span className="hidden text-left sm:block"><span className="block text-sm font-semibold leading-tight">{user.name}</span><span className="block text-[11px] leading-tight text-muted">Administrator</span></span>
                <ChevronsUpDown className="h-4 w-4 text-muted" />
              </button>
              <AnimatePresence>
                {menu && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="card absolute right-0 top-full z-50 mt-2 w-56 p-1.5 shadow-lift">
                    <Link to="/" className="btn-ghost w-full !justify-start"><ExternalLink className="h-4 w-4" />View site</Link>
                    <button onClick={async () => { await logout(); nav("/"); }} className="btn-ghost w-full !justify-start"><LogOut className="h-4 w-4" />Sign out</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8">
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="approvals" element={<Approvals />} />
              <Route path="auctions" element={<AuctionsAdmin />} />
              <Route path="bids" element={<BidsMonitor />} />
              <Route path="categories" element={<Categories />} />
              <Route path="users" element={<UsersAdmin />} />
              <Route path="restrictions" element={<Restrictions />} />
              <Route path="deposits" element={<Deposits />} />
              <Route path="payouts" element={<Payouts />} />
              <Route path="refunds" element={<Refunds />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="reports" element={<Reports />} />
              <Route path="orders" element={<OrdersAdmin />} />
              <Route path="warehouse" element={<WarehouseAdmin />} />
              <Route path="disputes" element={<Disputes />} />
              <Route path="settings" element={<SettingsAdmin />} />
              <Route path="emails" element={<EmailsAdmin />} />
              <Route path="logs" element={<Logs />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
