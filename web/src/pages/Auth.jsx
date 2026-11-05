import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Gavel, MailCheck, ShieldCheck, Store, User2, Crown, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { useToast } from "../lib/toast";
import { Field, Spinner, cx } from "../components/ui";
import { Logo } from "../components/Layout";

const HOME = { buyer: "/account", seller: "/seller", admin: "/admin" };

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_460px]">
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="hidden lg:block">
        <Logo />
        <h2 className="mt-10 text-5xl font-extrabold leading-[1.05]">Where great finds go to the <span className="gradient-text">highest bidder.</span></h2>
        <ul className="mt-8 space-y-4 text-muted">
          {[[Gavel, "Real-time bidding with anti-sniping protection"], [ShieldCheck, "Every item inspected at our warehouse"], [Sparkles, "Sellers paid the same day an item passes"]].map(([I, t], i) => (
            <motion.li key={t} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand"><I className="h-5 w-5" /></span>{t}</motion.li>
          ))}
        </ul>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="card p-7 sm:p-9">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
        {footer && <p className="mt-6 text-center text-sm text-muted">{footer}</p>}
      </motion.div>
    </div>
  );
}

export function Login() {
  const { login, config, user } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const [p] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (user) nav(p.get("next") || HOME[user.role], { replace: true }); }, [user]);

  const submit = async (e, creds) => {
    e?.preventDefault();
    const c = creds ?? { email, password };
    setBusy(true);
    setError("");
    try {
      const u = await login(c.email, c.password);
      toast(`Welcome back, ${u.name.split(" ")[0]}!`);
      nav(p.get("next") || HOME[u.role], { replace: true });
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };
  const demo = [
    [User2, "Buyer", "Alex Morgan", "buyer@bidora.demo", "Bids, wallet, orders"],
    [Store, "Seller", "Nora Vale", "seller@bidora.demo", "Listings, shipping, payouts"],
    [Crown, "Admin", "Avery Stone", "admin@bidora.demo", "The full control panel"],
  ];
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to bid, sell and manage your account." footer={<>New here? <Link to="/register" className="font-semibold text-brand hover:underline">Create a free account</Link></>}>
      {config?.demoMode && (
        <div className="mb-6">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand"><Sparkles className="h-3.5 w-3.5" />One-click demo</p>
          <div className="grid gap-2">
            {demo.map(([I, role, name, mail, hint]) => (
              <button key={role} disabled={busy} onClick={() => submit(null, { email: mail, password: "demo1234" })} className="group flex items-center gap-3 rounded-xl border border-line bg-soft/50 px-3.5 py-3 text-left transition hover:border-brand hover:bg-brand/5 disabled:opacity-60">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand transition group-hover:bg-brand group-hover:text-white"><I className="h-5 w-5" /></span>
                <span className="flex-1"><span className="block text-sm font-bold">{role} <span className="font-medium text-muted">· {name}</span></span><span className="block text-xs text-muted">{hint}</span></span>
                <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-1 group-hover:text-brand" />
              </button>
            ))}
          </div>
          <div className="my-5 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or use your own account<span className="h-px flex-1 bg-line" /></div>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-mail"><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Password"><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-bad/10 px-3.5 py-2.5 text-sm font-medium text-bad">{error}</motion.p>}
        <button className="btn-primary btn-lg w-full" disabled={busy}>{busy ? <Spinner /> : "Sign in"}</button>
      </form>
    </AuthShell>
  );
}

export function Register() {
  const { refresh, user } = useSession();
  const nav = useNavigate();
  const [p] = useSearchParams();
  const [role, setRole] = useState(p.get("role") === "seller" ? "seller" : "buyer");
  const [f, setF] = useState({ name: "", email: "", password: "", businessName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (user && !busy) nav(`/verify`, { replace: true }); }, [user]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/api/auth/register", { ...f, role, businessName: f.businessName || undefined });
      sessionStorage.setItem("bidora-verify", r.verifyToken ?? "");
      await refresh();
      nav("/verify", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Create your account" subtitle="Free for buyers and individual sellers. No company papers needed." footer={<>Already a member? <Link to="/login" className="font-semibold text-brand hover:underline">Sign in</Link></>}>
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-soft p-1">
        {[["buyer", User2, "I want to buy"], ["seller", Store, "I want to sell"]].map(([v, I, l]) => (
          <button key={v} type="button" onClick={() => setRole(v)} className={cx("relative flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition", role === v ? "text-ink" : "text-muted")}>
            {role === v && <motion.span layoutId="role" className="absolute inset-0 rounded-lg bg-surface shadow-card" />}
            <span className="relative flex items-center gap-2"><I className="h-4 w-4" />{l}</span>
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name"><input className="input" value={f.name} onChange={set("name")} required minLength={2} /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={set("email")} required /></Field>
        <Field label="Password" hint="At least 8 characters"><input className="input" type="password" value={f.password} onChange={set("password")} required minLength={8} /></Field>
        {role === "seller" && <Field label="Shop name (optional)"><input className="input" value={f.businessName} onChange={set("businessName")} placeholder="Shown to buyers instead of your name" /></Field>}
        {error && <p className="rounded-xl bg-bad/10 px-3.5 py-2.5 text-sm font-medium text-bad">{error}</p>}
        <button className="btn-primary btn-lg w-full" disabled={busy}>{busy ? <Spinner /> : "Create account"}</button>
      </form>
    </AuthShell>
  );
}

export function Verify() {
  const { user, refresh, config } = useSession();
  const nav = useNavigate();
  const [p] = useSearchParams();
  const [state, setState] = useState("idle");
  const token = p.get("token") || sessionStorage.getItem("bidora-verify") || "";
  const done = async (t) => {
    setState("busy");
    try { await api.post("/api/auth/verify", { token: t }); await refresh(); setState("ok"); } catch { setState("error"); }
  };
  useEffect(() => { if (p.get("token")) done(p.get("token")); }, []);
  const resend = async () => {
    const r = await api.post("/api/auth/resend");
    if (r.verifyToken) sessionStorage.setItem("bidora-verify", r.verifyToken);
    nav(0);
  };
  if (!user) return <AuthShell title="Verify your e-mail" subtitle="Sign in first."><Link to="/login" className="btn-primary w-full">Sign in</Link></AuthShell>;
  if (user.emailVerified || state === "ok") {
    return (
      <AuthShell title="You're all set" subtitle="Your e-mail address is verified.">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }} className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-ok/15 text-ok"><MailCheck className="h-9 w-9" /></motion.div>
        <Link to={user.role === "buyer" ? "/account/wallet" : "/seller"} className="btn-primary btn-lg w-full">{user.role === "buyer" ? "Add your deposit to start bidding" : "Go to seller dashboard"}</Link>
        <Link to="/auctions" className="btn-ghost mt-2 w-full">Browse auctions</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Check your inbox" subtitle={`We sent a confirmation link to ${user.email}.`}>
      <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-brand/10 text-brand"><MailCheck className="h-9 w-9" /></div>
      {config?.demoMode && token ? (
        <div className="rounded-xl border border-brand/25 bg-brand/5 p-4 text-sm">
          <p className="font-semibold">Demo mode: no real e-mail is sent.</p>
          <p className="mt-1 text-muted">Press the button to act as if you clicked the link in the message.</p>
          <button className="btn-primary mt-3 w-full" onClick={() => done(token)} disabled={state === "busy"}>{state === "busy" ? <Spinner /> : "Verify my e-mail"}</button>
        </div>
      ) : <p className="text-center text-sm text-muted">Open the message and press the link to continue.</p>}
      {state === "error" && <p className="mt-3 rounded-xl bg-bad/10 px-3.5 py-2.5 text-sm text-bad">That link has expired. Send a new one.</p>}
      <button onClick={resend} className="btn-ghost mt-3 w-full">Send a new link</button>
    </AuthShell>
  );
}

export function HowItWorks() {
  const rows = [
    ["Create an account", "Sign up free as a buyer or an individual seller. Sellers do not need company papers."],
    ["Add a security deposit", "Buyers deposit a refundable minimum once. It unlocks bidding. It is only forfeited if you win and do not pay in time."],
    ["Bid in real time", "Prices update live for everyone. A bid in the final minutes extends the clock, so nobody can sneak in at the last second."],
    ["Pay within 3 days", "Winners pay the full price from their wallet. Miss the deadline and the deposit is forfeited and bidding pauses for 15 days."],
    ["We inspect everything", "Sellers ship to our warehouse only after payment is confirmed. We check, photograph and verify each item."],
    ["Same-day seller payout", "When the item passes inspection, the seller's earnings are released the same day. If it fails, the buyer is refunded."],
    ["Delivery to your door", "We pack it and send it with tracking. Confirm delivery, or contact support if something is wrong."],
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-widest text-brand">Step by step</p>
      <h1 className="mt-1 text-4xl font-extrabold">How Bidora works</h1>
      <p className="mt-3 text-lg text-muted">A marketplace built around trust: nobody ships to anybody directly, and everybody is paid fairly.</p>
      <ol className="relative mt-10 space-y-5 border-l-2 border-line pl-8">
        {rows.map(([t, d], i) => (
          <motion.li key={t} initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45 }} className="relative">
            <span className="absolute -left-[3.05rem] grid h-9 w-9 place-items-center rounded-full border-4 border-bg font-display text-sm font-extrabold text-white" style={{ backgroundImage: "linear-gradient(135deg, rgb(var(--brand)), rgb(var(--brand2)))" }}>{i + 1}</span>
            <div className="card p-5"><h3 className="text-lg font-bold">{t}</h3><p className="mt-1 text-muted">{d}</p></div>
          </motion.li>
        ))}
      </ol>
      <div className="mt-10 flex gap-3"><Link to="/auctions" className="btn-primary btn-lg">Browse auctions</Link><Link to="/register?role=seller" className="btn-soft btn-lg">Start selling</Link></div>
    </div>
  );
}
