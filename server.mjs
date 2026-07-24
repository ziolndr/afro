#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { embedTexts } from "./lib/arbiter.mjs";
import { fieldExists, latestField, loadField, searchField } from "./lib/field.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const fieldDir = path.resolve(process.env.AFRO_FIELD_DIR || path.join(__dirname, "data"));
const port = Number(process.env.PORT || process.env.AFRO_PORT || 8796);
const host =
  process.env.HOST ||
  (process.env.RENDER === "true" ? "0.0.0.0" : "127.0.0.1");

const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"
};

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "cache-control": "no-store" });
  res.end(body);
}

async function bodyJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const target = path.resolve(publicDir, relative);
  return target.startsWith(publicDir) ? target : null;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
    if (req.method === "GET" && url.pathname === "/field/health") {
      return json(res, 200, { ok: true, fieldReady: fieldExists(fieldDir), product: "AFRO — powered by ARBITER" });
    }
    if (req.method === "GET" && url.pathname === "/field/v1/manifest") {
      if (!fieldExists(fieldDir)) return json(res, 200, { status: "not_built", product: "AFRO — powered by ARBITER" });
      return json(res, 200, { status: "ready", ...loadField(fieldDir).manifest });
    }
    if (req.method === "GET" && url.pathname === "/field/v1/latest") {
      if (!fieldExists(fieldDir)) return json(res, 503, { error: "AFRO field has not been built. Run npm run build-field." });
      const field = loadField(fieldDir);
      const k = Math.min(60, Math.max(1, Number(url.searchParams.get("k") || 18)));
      return json(res, 200, { results: latestField(field, { k, category: url.searchParams.get("category") || "" }), count: field.manifest.count });
    }
    if (req.method === "POST" && url.pathname === "/field/v1/search") {
      if (!fieldExists(fieldDir)) return json(res, 503, { error: "AFRO field has not been built. Run npm run build-field." });
      const payload = await bodyJson(req);
      const text = String(payload.text || "").trim();
      if (text.length < 2) return json(res, 400, { error: "Search text is required." });
      const started = Date.now();
      const embedded = await embedTexts([text], { timeoutMs: 30000 });
      const field = loadField(fieldDir);
      const results = searchField(field, embedded.vectors[0], {
        k: Math.min(60, Math.max(1, Number(payload.k || 24))),
        category: payload.category || "",
        country: payload.country || "",
        type: payload.type || ""
      });
      return json(res, 200, {
        text,
        results,
        meta: { count: field.manifest.count, dimension: field.manifest.dimension, engine: "ARBITER", embedEndpoint: embedded.endpoint, latencyMs: Date.now() - started }
      });
    }

    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "Method not allowed" });
    let file = safeStaticPath(url.pathname);
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(publicDir, "index.html");
    const stat = fs.statSync(file);
    res.writeHead(200, {
      "content-type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
      "content-length": stat.size,
      "cache-control": [".html", ".css", ".js"].includes(path.extname(file).toLowerCase()) ? "no-store, max-age=0" : "public, max-age=31536000, immutable"
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, host, () => {
  console.log("AFRO — SEARCH AFRICA BY MEANING");
  console.log("────────────────────────────────────────");
  console.log(`site:  http://${host}:${port}`);
  console.log(`field: ${fieldExists(fieldDir) ? "READY" : "NOT BUILT"} · ${fieldDir}`);
});
