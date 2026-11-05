import express from "express";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { Server as SocketServer } from "socket.io";
import { one } from "./db.js";
import { hub, now } from "./core.js";
import { loadUser, requireAuth, COOKIE } from "./auth.js";
import { router as publicRouter } from "./routes/public.js";
import { buyer, seller, bids } from "./routes/account.js";
import { router as adminRouter } from "./routes/admin.js";
import { errorHandler } from "./routes/common.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());
  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());
  app.use("/api", rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests." } }));
  app.use("/api", loadUser);

  app.get("/api/health", (_req, res) => res.json({ ok: true, time: now() }));
  app.use("/api", publicRouter);
  app.use("/api", bids);
  app.use("/api/buyer", requireAuth, buyer);
  app.use("/api/seller", requireAuth, seller);
  app.use("/api/admin", requireAuth, adminRouter);
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

  const uploads = path.join(process.env.DATA_DIR || "data", "uploads");
  fs.mkdirSync(uploads, { recursive: true });
  app.use("/uploads", express.static(uploads, { maxAge: "7d", setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff") }));
  const pub = path.join(here, "..", "public");
  app.use(express.static(pub, { maxAge: "1h", index: false }));
  app.get(/^\/(?!api|uploads|socket\.io).*/, (_req, res) => {
    const index = path.join(pub, "index.html");
    if (fs.existsSync(index)) res.sendFile(index);
    else res.status(200).type("text").send("API is running. Build the web app to see the site.");
  });
  app.use(errorHandler);
  return app;
}

// Live updates: everyone can watch auctions, signed-in people also get their own events, admins get the review queue.
export function attachSockets(httpServer) {
  const io = new SocketServer(httpServer, { path: "/socket.io", serveClient: false, cors: { origin: false } });
  hub.io = io;
  io.on("connection", (socket) => {
    let user = null;
    try {
      const cookie = (socket.handshake.headers.cookie ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
      if (cookie) {
        const { uid } = jwt.verify(decodeURIComponent(cookie.slice(COOKIE.length + 1)), process.env.SESSION_SECRET || "dev-only-secret-change-me");
        user = one("SELECT id, role, status FROM users WHERE id = ?", uid);
        if (user?.status !== "active") user = null;
      }
    } catch { /* anonymous */ }
    socket.join("auctions");
    socket.join("feed");
    if (user) socket.join(`user:${user.id}`);
    if (user?.role === "admin") socket.join("admin");
    socket.on("watch", (id) => { if (Number.isInteger(id)) socket.join(`auction:${id}`); });
    socket.on("unwatch", (id) => { if (Number.isInteger(id)) socket.leave(`auction:${id}`); });
  });
  return io;
}
