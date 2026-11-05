// The public demo returns to its starting state every night, whatever visitors did in between.
import fs from "node:fs";
import path from "node:path";
import { seedDemo } from "./seed.js";

const dataDir = () => process.env.DATA_DIR || "data";
const marker = () => path.join(dataDir(), "demo-reset.txt");
const RESET_HOUR_UTC = 0;
const RESET_MINUTE_UTC = 10;

export function resetDemo() {
  const result = seedDemo({ adminPassword: process.env.ADMIN_PASSWORD || null });
  // photos uploaded by visitors are removed together with the data
  const uploads = path.join(dataDir(), "uploads");
  if (fs.existsSync(uploads)) {
    for (const f of fs.readdirSync(uploads)) {
      try { fs.rmSync(path.join(uploads, f), { force: true }); } catch { /* ignore */ }
    }
  }
  fs.writeFileSync(marker(), String(Date.now()));
  return result;
}

export function lastResetAt() {
  try {
    return Number(fs.readFileSync(marker(), "utf8")) || 0;
  } catch {
    return 0;
  }
}

export function recordFirstSeed() {
  fs.writeFileSync(marker(), String(Date.now()));
}

export function msUntilNextReset(from = new Date()) {
  const next = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), RESET_HOUR_UTC, RESET_MINUTE_UTC);
  return (next > from.getTime() ? next : next + 86_400_000) - from.getTime();
}

// If the server was off at reset time, reset as soon as it starts again.
export function resetIfOverdue(maxAgeMs = 26 * 3_600_000) {
  const last = lastResetAt();
  if (!last) {
    recordFirstSeed(); // an older database without a marker: start counting from now
    return false;
  }
  if (Date.now() - last > maxAgeMs) {
    resetDemo();
    return true;
  }
  return false;
}

export function scheduleNightlyReset(log = console.log) {
  const arm = () => {
    setTimeout(() => {
      try {
        resetDemo();
        log("demo data reset");
      } catch (e) {
        console.error("demo reset failed", e);
      }
      arm();
    }, msUntilNextReset()).unref?.();
  };
  arm();
  // safety net: also check every hour, in case the timer was delayed (sleep, clock changes)
  setInterval(() => {
    try {
      if (resetIfOverdue(25 * 3_600_000)) log("demo data reset (catch-up)");
    } catch (e) {
      console.error("demo reset failed", e);
    }
  }, 3_600_000).unref?.();
}
