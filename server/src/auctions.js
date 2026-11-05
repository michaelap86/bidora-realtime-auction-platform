import { one, all, run, tx } from "./db.js";
import { DAY, HOUR, HttpError, bad, forbidden, notFound, now, settings, emit, notify, money, logActivity } from "./core.js";
import { biddingStatus } from "./auth.js";

export const LIVE_STATES = ["live"];

// A stable, anonymous alias for showing a bidder in public: "m***a".
export function alias(user) {
  const n = String(user?.name ?? "?").trim();
  if (n.length < 2) return `${n}***`;
  return `${n[0].toLowerCase()}***${n[n.length - 1].toLowerCase()}`;
}

export function history(auctionId, actorId, action, note = null) {
  run("INSERT INTO auction_history(auction_id, actor_id, action, note, created_at) VALUES(?,?,?,?,?)", auctionId, actorId ?? null, action, note, now());
}

const BASE = `
  SELECT a.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
         s.name AS seller_name, s.business_name AS seller_business, s.city AS seller_city, s.created_at AS seller_since,
         h.name AS bidder_name
  FROM auctions a
  JOIN categories c ON c.id = a.category_id
  JOIN users s ON s.id = a.seller_id
  LEFT JOIN users h ON h.id = a.highest_bidder_id`;

// What anyone may see about an auction. Seller contact details are never part of this.
export function dto(a, viewer = null) {
  const out = {
    id: a.id,
    title: a.title,
    description: a.description,
    condition: a.condition,
    images: JSON.parse(a.images || "[]"),
    category: { id: a.category_id, name: a.category_name, slug: a.category_slug, icon: a.category_icon },
    startPrice: a.start_price,
    reservePriceSet: a.reserve_price != null,
    reserveMet: a.reserve_price == null ? null : a.current_price >= a.reserve_price && a.bid_count > 0,
    minIncrement: a.min_increment,
    currentPrice: a.bid_count ? a.current_price : a.start_price,
    nextMinBid: a.bid_count ? a.current_price + a.min_increment : a.start_price,
    bidCount: a.bid_count,
    highestBidder: a.bidder_name ? alias({ name: a.bidder_name }) : null,
    durationDays: a.duration_days,
    startAt: a.start_at,
    endAt: a.end_at,
    extensions: a.extensions,
    status: a.status,
    featured: !!a.featured,
    views: a.views,
    watchers: one("SELECT COUNT(*) AS n FROM watchlist WHERE auction_id = ?", a.id).n,
    seller: { name: a.seller_business || a.seller_name.split(" ")[0] + " " + (a.seller_name.split(" ")[1]?.[0] ?? "") + ".", city: a.seller_city, since: a.seller_since },
    createdAt: a.created_at,
  };
  if (viewer) {
    out.mine = {
      isHighest: a.highest_bidder_id === viewer.id,
      watching: !!one("SELECT 1 AS x FROM watchlist WHERE user_id = ? AND auction_id = ?", viewer.id, a.id),
      isSeller: a.seller_id === viewer.id,
    };
    if (a.seller_id === viewer.id || viewer.role === "admin") {
      out.adminNote = a.admin_note;
      out.reservePrice = a.reserve_price;
      out.sellerId = a.seller_id;
    }
  }
  return out;
}

export const getAuction = (id) => one(`${BASE} WHERE a.id = ?`, id);

const SORTS = {
  ending: "a.end_at ASC",
  newest: "a.created_at DESC",
  price_asc: "(CASE WHEN a.bid_count>0 THEN a.current_price ELSE a.start_price END) ASC",
  price_desc: "(CASE WHEN a.bid_count>0 THEN a.current_price ELSE a.start_price END) DESC",
  bids: "a.bid_count DESC",
  popular: "a.views DESC",
};

export function listPublic(q, viewer) {
  const where = [];
  const args = [];
  const status = q.status || "live";
  if (status === "live") where.push("a.status = 'live'");
  else if (status === "upcoming") where.push("a.status = 'scheduled'");
  else if (status === "ended") where.push("a.status IN ('sold','unsold')");
  else where.push("a.status IN ('live','scheduled','sold','unsold')");
  if (q.q) {
    where.push("(a.title LIKE ? OR a.description LIKE ?)");
    args.push(`%${q.q}%`, `%${q.q}%`);
  }
  if (q.category) {
    where.push("c.slug = ?");
    args.push(q.category);
  }
  if (q.condition) {
    where.push("a.condition = ?");
    args.push(q.condition);
  }
  const price = "(CASE WHEN a.bid_count>0 THEN a.current_price ELSE a.start_price END)";
  if (Number.isFinite(+q.min) && q.min !== "" && q.min != null) {
    where.push(`${price} >= ?`);
    args.push(Math.round(+q.min * 100));
  }
  if (Number.isFinite(+q.max) && q.max !== "" && q.max != null) {
    where.push(`${price} <= ?`);
    args.push(Math.round(+q.max * 100));
  }
  if (q.featured) where.push("a.featured = 1");
  if (q.endingWithin) {
    where.push("a.end_at <= ?");
    args.push(now() + Number(q.endingWithin) * HOUR);
  }
  const order = SORTS[q.sort] ?? SORTS.ending;
  const limit = Math.min(Math.max(parseInt(q.limit ?? "12", 10) || 12, 1), 48);
  const offset = Math.max(parseInt(q.offset ?? "0", 10) || 0, 0);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = one(`SELECT COUNT(*) AS n FROM auctions a JOIN categories c ON c.id=a.category_id ${clause}`, ...args).n;
  const rows = all(`${BASE} ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, limit, offset);
  return { total, items: rows.map((r) => dto(r, viewer)) };
}

// ------------------------------------------------------------------ seller creates / edits a listing
export function createListing(seller, input) {
  const cfg = settings();
  if (!cfg.durations.includes(input.durationDays)) throw bad("Choose one of the available durations.");
  if (input.reservePrice != null && input.reservePrice < input.startPrice) throw bad("The reserve price cannot be lower than the starting price.");
  if (!one("SELECT 1 AS x FROM categories WHERE id = ? AND active = 1", input.categoryId)) throw bad("Unknown category.");
  const startAt = Math.max(input.startAt ?? now(), now());
  const id = tx(() => {
    const r = run(
      `INSERT INTO auctions(seller_id, category_id, title, description, condition, images, start_price, reserve_price, min_increment,
         current_price, duration_days, start_at, end_at, original_end_at, status, created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?)`,
      seller.id,
      input.categoryId,
      input.title,
      input.description,
      input.condition,
      JSON.stringify(input.images),
      input.startPrice,
      input.reservePrice ?? null,
      input.minIncrement,
      input.startPrice,
      input.durationDays,
      startAt,
      startAt + input.durationDays * DAY,
      startAt + input.durationDays * DAY,
      now(),
    );
    history(r.lastInsertRowid, seller.id, "submitted", "Submitted for review");
    return Number(r.lastInsertRowid);
  });
  emit("admin", "admin:queue", { kind: "listing", id });
  return id;
}

export function resubmitListing(seller, id, input) {
  const a = getAuction(id);
  if (!a || a.seller_id !== seller.id) throw notFound();
  if (!["changes_requested", "rejected", "pending"].includes(a.status)) throw bad("This listing can no longer be edited.");
  const cfg = settings();
  if (!cfg.durations.includes(input.durationDays)) throw bad("Choose one of the available durations.");
  const startAt = Math.max(input.startAt ?? now(), now());
  run(
    `UPDATE auctions SET category_id=?, title=?, description=?, condition=?, images=?, start_price=?, reserve_price=?, min_increment=?, current_price=?,
       duration_days=?, start_at=?, end_at=?, original_end_at=?, status='pending' WHERE id=?`,
    input.categoryId,
    input.title,
    input.description,
    input.condition,
    JSON.stringify(input.images),
    input.startPrice,
    input.reservePrice ?? null,
    input.minIncrement,
    input.startPrice,
    input.durationDays,
    startAt,
    startAt + input.durationDays * DAY,
    startAt + input.durationDays * DAY,
    id,
  );
  history(id, seller.id, "resubmitted", "Updated and sent for review again");
  emit("admin", "admin:queue", { kind: "listing", id });
}

// ------------------------------------------------------------------ admin review
export function reviewListing(admin, id, decision, note = "") {
  const a = getAuction(id);
  if (!a) throw notFound();
  if (!["pending", "changes_requested"].includes(a.status) && decision !== "suspend" && decision !== "remove" && decision !== "restore") {
    throw bad("This listing is not waiting for review.");
  }
  let status;
  if (decision === "approve") {
    let start = a.start_at;
    if (start < now()) start = now();
    const end = start + a.duration_days * DAY;
    status = start <= now() ? "live" : "scheduled";
    run("UPDATE auctions SET status=?, start_at=?, end_at=?, original_end_at=?, approved_at=?, admin_note=? WHERE id=?", status, start, end, end, now(), note || null, id);
  } else if (decision === "reject") {
    status = "rejected";
    run("UPDATE auctions SET status='rejected', admin_note=? WHERE id=?", note || null, id);
  } else if (decision === "changes") {
    status = "changes_requested";
    run("UPDATE auctions SET status='changes_requested', admin_note=? WHERE id=?", note || null, id);
  } else if (decision === "suspend") {
    if (!["live", "scheduled"].includes(a.status)) throw bad("Only live or scheduled auctions can be suspended.");
    status = "suspended";
    run("UPDATE auctions SET status='suspended', admin_note=? WHERE id=?", note || null, id);
  } else if (decision === "restore") {
    if (a.status !== "suspended") throw bad("This auction is not suspended.");
    status = a.start_at > now() ? "scheduled" : "live";
    run("UPDATE auctions SET status=?, admin_note=? WHERE id=?", status, note || null, id);
  } else if (decision === "remove") {
    if (a.bid_count > 0 && ["live", "suspended"].includes(a.status)) throw bad("An auction with bids cannot be removed. Suspend it instead.");
    status = "removed";
    run("UPDATE auctions SET status='removed', admin_note=? WHERE id=?", note || null, id);
  } else throw bad("Unknown decision.");
  history(id, admin.id, decision, note || null);
  logActivity(admin, `listing.${decision}`, "auction", id, { note });
  const verb = { approve: "approved", reject: "rejected", changes: "returned with change requests", suspend: "suspended", restore: "restored", remove: "removed" }[decision];
  notify(a.seller_id, "listing_review", { title: a.title, result: verb, note }, `/seller/listings`);
  emit("auctions", "auction:update", { id, status });
  return status;
}

export function adminEditListing(admin, id, patch) {
  const a = getAuction(id);
  if (!a) throw notFound();
  const fields = { title: "title", description: "description", condition: "condition", featured: "featured" };
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(fields)) {
    if (patch[k] !== undefined) {
      sets.push(`${col} = ?`);
      args.push(k === "featured" ? (patch[k] ? 1 : 0) : patch[k]);
    }
  }
  if (patch.categoryId !== undefined) {
    sets.push("category_id = ?");
    args.push(patch.categoryId);
  }
  if (!sets.length) throw bad("Nothing to change.");
  run(`UPDATE auctions SET ${sets.join(", ")} WHERE id = ?`, ...args, id);
  history(id, admin.id, "edited", Object.keys(patch).join(", "));
  logActivity(admin, "listing.edit", "auction", id, patch);
}

// ------------------------------------------------------------------ the bidding engine
export function placeBid(user, auctionId, amount, ip) {
  const cfg = settings();
  if (!Number.isInteger(amount) || amount <= 0) throw bad("Enter a valid bid amount.");
  if (amount > 1_000_000_000) throw bad("That bid is too large.");
  let result;
  tx(() => {
    const a = one("SELECT * FROM auctions WHERE id = ?", auctionId);
    if (!a) throw notFound("Auction not found.");
    const fresh = one("SELECT * FROM users WHERE id = ?", user.id);
    const perm = biddingStatus(fresh, cfg.min_deposit_cents);
    if (!perm.allowed) throw new HttpError(403, perm.reason, { code: perm.needDeposit ? "DEPOSIT_REQUIRED" : "NOT_ALLOWED" });
    if (a.status !== "live" || a.end_at <= now()) throw bad("This auction is not accepting bids.");
    if (a.seller_id === fresh.id) throw forbidden("You cannot bid on your own listing.");
    if (a.highest_bidder_id === fresh.id) throw bad("You are already the highest bidder.");
    const last = one("SELECT created_at FROM bids WHERE user_id = ? ORDER BY id DESC LIMIT 1", fresh.id);
    if (last && now() - last.created_at >= 0 && now() - last.created_at < cfg.bid_cooldown_ms) throw new HttpError(429, "Slow down a little before placing another bid.");
    const min = a.bid_count ? a.current_price + a.min_increment : a.start_price;
    if (amount < min) throw bad(`Your bid must be at least ${money(min)}.`, { minBid: min });

    let endAt = a.end_at;
    let extended = false;
    if (a.end_at - now() <= cfg.anti_snipe_window_sec * 1000) {
      endAt = a.end_at + cfg.anti_snipe_extension_sec * 1000;
      extended = true;
    }
    const prev = a.highest_bidder_id;
    const ins = run("INSERT INTO bids(auction_id,user_id,amount,ip,created_at) VALUES(?,?,?,?,?)", a.id, fresh.id, amount, ip ?? null, now());
    run("UPDATE auctions SET current_price=?, bid_count=bid_count+1, highest_bidder_id=?, end_at=?, extensions=extensions+?, ending_notified=CASE WHEN ?>? THEN 0 ELSE ending_notified END WHERE id=?",
      amount, fresh.id, endAt, extended ? 1 : 0, endAt, a.end_at, a.id);
    if (prev && prev !== fresh.id) notify(prev, "outbid", { title: a.title, amount: money(amount) }, `/auctions/${a.id}`);
    notify(a.seller_id, "new_bid", { title: a.title, amount: money(amount), bidder: alias(fresh) }, `/auctions/${a.id}`);
    result = { id: Number(ins.lastInsertRowid), auctionId: a.id, amount, bidder: alias(fresh), at: now(), endAt, extended, bidCount: a.bid_count + 1, title: a.title, previous: prev };
  });
  const payload = { auctionId: result.auctionId, currentPrice: amount, nextMinBid: amount + one("SELECT min_increment FROM auctions WHERE id=?", auctionId).min_increment, bidCount: result.bidCount, endAt: result.endAt, extended: result.extended, highestBidder: result.bidder, bid: { id: result.id, amount, bidder: result.bidder, at: result.at } };
  emit(`auction:${auctionId}`, "bid", payload);
  emit("auctions", "auction:bid", { auctionId, currentPrice: amount, bidCount: result.bidCount, endAt: result.endAt });
  emit("feed", "feed", { kind: "bid", auctionId, title: result.title, amount, bidder: result.bidder, at: result.at });
  return payload;
}

export function bidHistory(auctionId, limit = 50) {
  return all(
    `SELECT b.id, b.amount, b.created_at AS at, u.name FROM bids b JOIN users u ON u.id = b.user_id
     WHERE b.auction_id = ? ORDER BY b.amount DESC, b.id DESC LIMIT ?`,
    auctionId,
    limit,
  ).map((b) => ({ id: b.id, amount: b.amount, at: b.at, bidder: alias({ name: b.name }) }));
}

export function toggleWatch(user, auctionId) {
  if (!one("SELECT 1 AS x FROM auctions WHERE id = ?", auctionId)) throw notFound();
  const has = one("SELECT 1 AS x FROM watchlist WHERE user_id = ? AND auction_id = ?", user.id, auctionId);
  if (has) run("DELETE FROM watchlist WHERE user_id = ? AND auction_id = ?", user.id, auctionId);
  else run("INSERT INTO watchlist(user_id, auction_id, created_at) VALUES(?,?,?)", user.id, auctionId, now());
  return !has;
}
