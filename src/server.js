import http from "node:http";
import path from "node:path";
import os from "node:os";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createStore, applyEvent, setSessions, setActive, setPending, setStrata, setStats, snapshot } from "./state.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.MONITOR_PORT || 7788);
const HOST = process.env.MONITOR_HOST || "127.0.0.1";
const STRATA_URL = process.env.STRATA_URL || "http://127.0.0.1:8080";
const SERVICE_FILE = process.env.OPENCODE_SERVICE_FILE || path.join(os.homedir(), ".config", "opencode", "service.json");

const store = createStore();
const clients = new Set();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const auth = () => "Basic " + Buffer.from(`opencode:${store.server.password}`).toString("base64");

async function json(url, timeout = 4000) {
  const res = await fetch(url, { headers: { Authorization: auth(), Accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function strataJson(url, timeout = 3000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function loadPassword() {
  try {
    const raw = await readFile(SERVICE_FILE, "utf8");
    return JSON.parse(raw).password ?? null;
  } catch {
    return null;
  }
}

function cli(args) {
  return new Promise((resolve) => {
    execFile("opencode", args, { timeout: 8000 }, (_err, stdout) => resolve(stdout ?? ""));
  });
}

async function probe(url) {
  try {
    const info = await json(`${url}/api/info`, 2500);
    store.server.url = url;
    store.server.version = info.version ?? null;
    store.server.pid = info.pid ?? null;
    store.server.reachable = true;
    store.server.reconnecting = false;
    store.server.lastError = null;
    store.server.lastProbeAt = Date.now();
    return true;
  } catch (e) {
    store.server.reachable = false;
    store.server.lastError = String(e.message ?? e);
    return false;
  }
}

async function discover() {
  if (!store.server.password) store.server.password = await loadPassword();
  if (!store.server.password) {
    store.server.lastError = `读不到 ${SERVICE_FILE} 里的 password`;
    return;
  }
  if (store.server.url && (await probe(store.server.url))) return;

  const out = await cli(["service", "status"]);
  const m = out.match(/https?:\/\/[^\s]+/);
  if (!m) {
    store.server.lastError = "找不到 opencode 服务（opencode service status 没有返回地址）";
    store.server.reconnecting = true;
    return;
  }
  const url = m[0].replace(/\/+$/, "");
  if (url !== store.server.url) store.server.url = url;
  await probe(url);
  if (!store.server.reachable) store.server.reconnecting = true;
}

async function eventLoop() {
  let backoff = 1000;
  while (true) {
    if (!store.server.url || !store.server.password) {
      await sleep(2000);
      await discover();
      continue;
    }
    try {
      const res = await fetch(`${store.server.url}/api/event`, {
        headers: { Authorization: auth(), Accept: "text/event-stream" },
      });
      if (!res.ok) throw new Error(`event 流 HTTP ${res.status}`);
      store.server.reconnecting = false;
      backoff = 1000;

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            try {
              const ev = JSON.parse(line.slice(5).trim());
              applyEvent(store, { type: ev.type, data: ev.data ?? {}, at: Date.now() });
              broadcast({ type: "event", data: { type: ev.type, sessionID: ev.data?.sessionID ?? null } });
            } catch {
              /* 忽略无法解析的帧 */
            }
          }
        }
      }
      throw new Error("event 流结束");
    } catch (e) {
      store.server.reconnecting = true;
      store.server.lastError = String(e.message ?? e);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 15000);
      await discover();
    }
  }
}

async function pollOpencode() {
  if (!store.server.url || !store.server.password) return;
  try {
    const [sessions, active, perms, forms, shells] = await Promise.all([
      json(`${store.server.url}/api/session?limit=40&order=desc`, 5000),
      json(`${store.server.url}/api/session/active`, 4000),
      json(`${store.server.url}/api/permission/request`, 4000),
      json(`${store.server.url}/api/form`, 4000),
      json(`${store.server.url}/api/shell`, 4000),
    ]);
    setSessions(store, sessions.data ?? []);
    setActive(store, active.data ?? {});
    setPending(store, {
      permissions: (perms.data ?? []).map((p) => ({ id: p.id, sessionID: p.sessionID, action: p.action, resources: p.resources ?? [], message: p.metadata?.message ?? "" })),
      forms: (forms.data ?? []).map((f) => ({ id: f.id, sessionID: f.sessionID, title: f.title ?? "" })),
      shells: (shells.data ?? []).map((s) => ({ id: s.id, status: s.status, command: s.command, exit: s.exit ?? null })),
    });
    store.updatedAt = Date.now();
  } catch (e) {
    store.server.lastError = String(e.message ?? e);
  }
}

async function pollStrata() {
  try {
    const [metrics, status, slots, health] = await Promise.all([
      strataJson(`${STRATA_URL}/metrics`),
      strataJson(`${STRATA_URL}/status`).catch(() => null),
      strataJson(`${STRATA_URL}/slots`).catch(() => null),
      strataJson(`${STRATA_URL}/api/health`).catch(() => null),
    ]);
    setStrata(store, { url: STRATA_URL, alive: true, ...metrics, slots, status, health });
  } catch (e) {
    setStrata(store, { url: STRATA_URL, alive: false, lastError: String(e.message ?? e) });
  }
}

async function loop(fn, ms) {
  while (true) {
    await fn();
    await sleep(ms);
  }
}

function broadcast(msg) {
  const body = `event: ${msg.type}\ndata: ${JSON.stringify(msg.data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(body);
    } catch {
      clients.delete(res);
    }
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (url.pathname === "/api/stream") {
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write(`event: snap\ndata: ${JSON.stringify(snapshot(store))}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (url.pathname === "/api/snap") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(snapshot(store)));
    return;
  }

  if (url.pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ opencode: { url: store.server.url, reachable: store.server.reachable, version: store.server.version, pid: store.server.pid }, strata: { alive: store.strata.alive, url: store.strata.url }, sessions: store.sessions.size }));
    return;
  }

  const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  if (rel.includes("..")) {
    res.writeHead(400).end("bad path");
    return;
  }
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(400).end("bad path");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

httpServer.listen(PORT, HOST, () => {
  console.log(`opencode-monitor → http://${HOST}:${PORT}`);
  loop(async () => {
    await discover();
    await pollOpencode();
  }, 3000);
  loop(pollStrata, 2000);
  loop(() => {
    broadcast({ type: "snap", data: snapshot(store) });
  }, 1200);
  eventLoop();
});
