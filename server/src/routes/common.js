import { z, ZodError } from "zod";
import { HttpError } from "../core.js";

export const wrap = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res, next);
    if (out && typeof out.then === "function") out.catch(next);
  } catch (e) {
    next(e);
  }
};

export function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    const issue = r.error.issues[0];
    const field = issue.path.join(".") || "request";
    throw new HttpError(400, `${field}: ${issue.message}`, { field });
  }
  return r.data;
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    const { status, message, ...extra } = err;
    delete extra.stack;
    return res.status(status).json({ error: message, ...extra });
  }
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? "Invalid request." });
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "That image is larger than 5 MB." });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side." });
}

export const id = z.coerce.number().int().positive();
export const money = z.number().int().min(0);
export const page = (q) => ({
  limit: Math.min(Math.max(parseInt(q.limit ?? "25", 10) || 25, 1), 200),
  offset: Math.max(parseInt(q.offset ?? "0", 10) || 0, 0),
});
export const ip = (req) => req.ip;
