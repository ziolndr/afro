import path from "node:path";
import { embedTexts } from "../lib/arbiter.mjs";
import { latestField, loadField, searchField } from "../lib/field.mjs";

export const fieldDir = path.join(process.cwd(), "data");

export function send(res, status, payload) {
  res.status(status).setHeader("cache-control", "no-store").json(payload);
}

export async function searchRequest(payload) {
  const text = String(payload?.text || "").trim();
  if (text.length < 2) return { status: 400, body: { error: "Search text is required." } };
  const started = Date.now();
  const embedded = await embedTexts([text], { timeoutMs: 30000 });
  const field = loadField(fieldDir);
  const results = searchField(field, embedded.vectors[0], {
    k: Math.min(60, Math.max(1, Number(payload.k || 24))),
    category: payload.category || "",
    country: payload.country || "",
    type: payload.type || ""
  });
  return { status: 200, body: { text, results, meta: { count: field.manifest.count, dimension: field.manifest.dimension, engine: "ARBITER", embedEndpoint: embedded.endpoint, latencyMs: Date.now() - started } } };
}

export function latestRequest(query = {}) {
  const field = loadField(fieldDir);
  const k = Math.min(60, Math.max(1, Number(query.k || 18)));
  return { results: latestField(field, { k, category: query.category || "" }), count: field.manifest.count };
}
