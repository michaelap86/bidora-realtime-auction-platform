import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { getSocket, resetSocket } from "./socket";

const Ctx = createContext(null);
export const useSession = () => useContext(Ctx);

// One shared clock, corrected with the server's time so countdowns agree for everyone.
let offset = 0;
const listeners = new Set();
let timer = null;
export const serverNow = () => Date.now() + offset;
export function useNow(interval = 1000) {
  const [t, setT] = useState(serverNow());
  useEffect(() => {
    const fn = () => setT(serverNow());
    listeners.add(fn);
    if (!timer) timer = setInterval(() => listeners.forEach((l) => l()), interval);
    return () => {
      listeners.delete(fn);
      if (!listeners.size && timer) { clearInterval(timer); timer = null; }
    };
  }, [interval]);
  return t;
}

export function SessionProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [user, setUser] = useState(null);
  const [bidding, setBidding] = useState(null);
  const [unread, setUnread] = useState(0);
  const [ready, setReady] = useState(false);
  const [theme, setThemeState] = useState(document.documentElement.dataset.theme || "light");
  const toastRef = useRef(null);

  const refresh = useCallback(async () => {
    const me = await api.get("/api/auth/me");
    setUser(me.user);
    setBidding(me.bidding ?? null);
    setUnread(me.unread ?? 0);
    return me;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.get("/api/config");
        offset = cfg.serverNow - Date.now();
        setConfig(cfg);
        await refresh();
      } finally {
        setReady(true);
      }
    })();
  }, [refresh]);

  // Personal live events (notifications, outbid alerts)
  useEffect(() => {
    if (!user) return;
    const s = getSocket();
    const onNote = (n) => {
      setUnread((u) => u + 1);
      toastRef.current?.(n.title, n.type === "outbid" ? "warn" : "info", n.body);
    };
    s.on("notification", onNote);
    s.emit("hello");
    return () => s.off("notification", onNote);
  }, [user?.id]);

  const login = async (email, password) => {
    const r = await api.post("/api/auth/login", { email, password });
    resetSocket();
    await refresh();
    return r.user;
  };
  const logout = async () => {
    await api.post("/api/auth/logout");
    resetSocket();
    setUser(null);
    setBidding(null);
    setUnread(0);
  };
  const setTheme = (t) => {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("bidora-theme", t); } catch {}
    setThemeState(t);
  };

  const value = useMemo(
    () => ({ config, user, bidding, unread, setUnread, ready, refresh, login, logout, theme, setTheme, toastRef }),
    [config, user, bidding, unread, ready, theme, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
