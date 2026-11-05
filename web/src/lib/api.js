export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || "Something went wrong.");
    this.status = status;
    this.data = data || {};
  }
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const type = res.headers.get("content-type") || "";
  const data = type.includes("json") ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) throw new ApiError(res.status, typeof data === "object" ? data : { error: String(data) });
  return data;
}

export const api = {
  get: (url) => request("GET", url),
  post: (url, body = {}) => request("POST", url, body),
  put: (url, body) => request("PUT", url, body),
  patch: (url, body) => request("PATCH", url, body),
  upload: (url, files) => {
    const fd = new FormData();
    for (const f of files) fd.append("images", f);
    return request("POST", url, fd);
  },
};

export const qs = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};
