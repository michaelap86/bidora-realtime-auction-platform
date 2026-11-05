import { io } from "socket.io-client";

let socket;
export function getSocket() {
  if (!socket) socket = io({ path: "/socket.io", transports: ["websocket", "polling"], autoConnect: true });
  return socket;
}
export function resetSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
