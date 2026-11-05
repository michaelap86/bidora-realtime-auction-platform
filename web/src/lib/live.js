import { useEffect, useSyncExternalStore } from "react";
import { getSocket } from "./socket";

// Latest known price / bid count / end time per auction, pushed by the server.
let map = new Map();
const subs = new Set();
let started = false;
const emitChange = () => subs.forEach((f) => f());

export function startLive() {
  if (started) return;
  started = true;
  const s = getSocket();
  s.on("auction:bid", (p) => {
    map = new Map(map).set(p.auctionId, { ...map.get(p.auctionId), currentPrice: p.currentPrice, bidCount: p.bidCount, endAt: p.endAt, flash: Date.now() });
    emitChange();
  });
  s.on("auction:update", (p) => {
    map = new Map(map).set(p.id, { ...map.get(p.id), status: p.status });
    emitChange();
  });
}

export function useLive(id) {
  useEffect(startLive, []);
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => map.get(id),
  );
}

// Subscribe to the site-wide bid feed.
export function useFeed(onBid) {
  useEffect(() => {
    const s = getSocket();
    s.on("feed", onBid);
    return () => s.off("feed", onBid);
  }, [onBid]);
}
