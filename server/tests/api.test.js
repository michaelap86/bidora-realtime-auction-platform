import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { init } from "../src/db.js";
import { setClock, resetSettingsCache } from "../src/core.js";
import { createApp } from "../src/app.js";
import { seedDemo } from "../src/seed.js";

let server;
let base;

before(async () => {
  setClock(null);
  init(":memory:");
  resetSettingsCache();
  seedDemo({});
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

class Client {
  jar = "";
  async call(method, path, body) {
    const res = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie: this.jar }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) this.jar = c.split(";")[0];
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }
  get = (p) => this.call("GET", p);
  post = (p, b = {}) => this.call("POST", p, b);
  async login(email, password = "demo1234") {
    const r = await this.post("/api/auth/login", { email, password });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data.user;
  }
}

describe("access control", () => {
  test("anonymous visitors can browse but not use private areas", async () => {
    const c = new Client();
    assert.equal((await c.get("/api/auctions?limit=3")).status, 200);
    assert.equal((await c.get("/api/buyer/summary")).status, 401);
    assert.equal((await c.get("/api/admin/overview")).status, 401);
    assert.equal((await c.post("/api/auctions/1/bids", { amount: 100000 })).status, 401);
  });

  test("buyers and sellers cannot open the admin API, and roles do not mix", async () => {
    const buyer = new Client();
    await buyer.login("buyer@bidora.demo");
    assert.equal((await buyer.get("/api/admin/overview")).status, 403);
    assert.equal((await buyer.get("/api/seller/summary")).status, 403);
    const seller = new Client();
    await seller.login("seller@bidora.demo");
    assert.equal((await seller.get("/api/buyer/wallet")).status, 403);
    assert.equal((await seller.post("/api/admin/settings", {})).status, 403);
    const sellerBid = await seller.post("/api/auctions/1/bids", { amount: 100000 });
    assert.equal(sellerBid.status, 403);
  });

  test("the admin API works for administrators", async () => {
    const admin = new Client();
    await admin.login("admin@bidora.demo");
    const o = await admin.get("/api/admin/overview");
    assert.equal(o.status, 200);
    assert.ok(o.data.kpis.liveAuctions > 10);
    for (const p of ["auctions", "users", "deposits", "orders", "warehouse", "disputes", "payouts", "refunds", "transactions", "restrictions", "settings", "emails", "logs", "reports", "bids", "categories"]) {
      const r = await admin.get(`/api/admin/${p}`);
      assert.equal(r.status, 200, `${p}: ${JSON.stringify(r.data).slice(0, 200)}`);
    }
  });

  test("wrong passwords are rejected and a forged cookie gives no access", async () => {
    const c = new Client();
    assert.equal((await c.post("/api/auth/login", { email: "buyer@bidora.demo", password: "nope" })).status, 401);
    c.jar = "bidora_session=forged.token.value";
    assert.equal((await c.get("/api/buyer/summary")).status, 401);
  });
});

describe("customer flows over the API", () => {
  test("registering, verifying, topping up and bidding", async () => {
    const c = new Client();
    const reg = await c.post("/api/auth/register", { name: "Kai Newman", email: "kai@example.com", password: "longenough1", role: "buyer" });
    assert.equal(reg.status, 201);
    const early = await c.get("/api/auctions?limit=1");
    const id = early.data.items[0].id;
    const blocked = await c.post(`/api/auctions/${id}/bids`, { amount: early.data.items[0].nextMinBid });
    assert.equal(blocked.status, 403);
    await c.post("/api/auth/verify", { token: reg.data.verifyToken });
    const dep = await c.post("/api/buyer/deposits", { amountCents: 10000, method: "card_sandbox" });
    assert.equal(dep.data.status, "approved");
    const me = await c.get("/api/auth/me");
    assert.equal(me.data.bidding.allowed, true);
    const a = (await c.get(`/api/auctions/${id}`)).data.auction;
    const ok = await c.post(`/api/auctions/${id}/bids`, { amount: a.nextMinBid });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(ok.data.currentPrice, a.nextMinBid);
    const low = await c.post(`/api/auctions/${id}/bids`, { amount: 1 });
    assert.equal(low.status, 400);
  });

  test("duplicate e-mails and weak passwords are rejected", async () => {
    const c = new Client();
    assert.equal((await c.post("/api/auth/register", { name: "Dup", email: "buyer@bidora.demo", password: "longenough1", role: "buyer" })).status, 400);
    assert.equal((await c.post("/api/auth/register", { name: "Short", email: "short@example.com", password: "123", role: "buyer" })).status, 400);
  });

  test("a seller listing needs review before the public can see it", async () => {
    const seller = new Client();
    await seller.login("seller@bidora.demo");
    const cats = (await seller.get("/api/config")).data.categories;
    const made = await seller.call("POST", "/api/seller/listings", {
      title: "Vintage lens for review", description: "A detailed description of the vintage lens, with every flaw mentioned honestly.", categoryId: cats[0].id,
      condition: "Good", images: ["/img/products/c4.jpg"], startPrice: 4000, minIncrement: 500, durationDays: 7,
    });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    const anon = new Client();
    assert.equal((await anon.get(`/api/auctions/${made.data.id}`)).status, 404);
    const admin = new Client();
    await admin.login("admin@bidora.demo");
    assert.equal((await admin.post(`/api/admin/auctions/${made.data.id}/review`, { decision: "approve" })).status, 200);
    assert.equal((await anon.get(`/api/auctions/${made.data.id}`)).status, 200);
  });

  test("a buyer cannot read another buyer's order", async () => {
    const admin = new Client();
    await admin.login("admin@bidora.demo");
    const orders = (await admin.get("/api/admin/orders")).data.items;
    const o = orders.find((x) => x.buyer.email !== "buyer@bidora.demo");
    const alex = new Client();
    await alex.login("buyer@bidora.demo");
    assert.equal((await alex.get(`/api/buyer/orders/${o.id}`)).status, 404);
  });

  test("uploads accept images only", async () => {
    const seller = new Client();
    await seller.login("seller@bidora.demo");
    const fd = new FormData();
    fd.append("images", new Blob(["not an image"], { type: "text/plain" }), "x.txt");
    const res = await fetch(`${base}/api/seller/uploads`, { method: "POST", headers: { cookie: seller.jar }, body: fd });
    assert.ok(res.status >= 400);
  });
});
