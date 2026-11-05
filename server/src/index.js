import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { init, one } from "./db.js";
import { createApp, attachSockets } from "./app.js";
import { startScheduler } from "./scheduler.js";
import { seedDemo } from "./seed.js";
import { recordFirstSeed, resetIfOverdue, scheduleNightlyReset } from "./demoReset.js";
import { startSimulator } from "./simulator.js";

const PORT = Number(process.env.PORT || 8130);
const DATA_DIR = process.env.DATA_DIR || "data";
fs.mkdirSync(DATA_DIR, { recursive: true });

// Without a configured secret, create one once and keep it next to the database.
if (!process.env.SESSION_SECRET) {
  const keyFile = path.join(DATA_DIR, "session.key");
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(48).toString("hex"), { mode: 0o600 });
  process.env.SESSION_SECRET = fs.readFileSync(keyFile, "utf8").trim();
}
init(process.env.DB_PATH || path.join(DATA_DIR, "bidora.db"));

if (!one("SELECT 1 AS x FROM users LIMIT 1")) {
  const r = seedDemo({ adminPassword: process.env.ADMIN_PASSWORD || null });
  recordFirstSeed();
  console.log("seeded demo data", r);
} else if (process.env.NIGHTLY_RESET !== "0") {
  if (resetIfOverdue()) console.log("demo data reset (server was off at reset time)");
}

const server = http.createServer(createApp());
attachSockets(server);
startScheduler(1000);
if (process.env.SIMULATE !== "0") startSimulator();

// The public demo returns to its starting state every night at 00:10 UTC.
if (process.env.NIGHTLY_RESET !== "0") scheduleNightlyReset();

server.listen(PORT, () => console.log(`Bidora listening on :${PORT}`));
