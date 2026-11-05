import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import { useSession } from "./session";

const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);
const ICON = { ok: CheckCircle2, info: Info, warn: TriangleAlert, error: XCircle };
const TONE = { ok: "text-ok", info: "text-brand", warn: "text-accent", error: "text-bad" };

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const session = useSession();
  const push = useCallback((title, type = "ok", body) => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l.slice(-3), { id, title, type, body }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), type === "error" ? 6000 : 4200);
  }, []);
  useEffect(() => { if (session) session.toastRef.current = push; }, [session, push]);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end">
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const Icon = ICON[t.type] ?? Info;
            return (
              <motion.div key={t.id} layout initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="glass pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3 shadow-lift">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${TONE[t.type]}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t.title}</p>
                  {t.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.body}</p>}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
