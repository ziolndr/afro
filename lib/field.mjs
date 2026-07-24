import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const cache = new Map();

function fileStamp(file) {
  const stat = fs.statSync(file);
  return `${stat.mtimeMs}:${stat.size}`;
}

export function fieldPaths(fieldDir) {
  return {
    manifest: path.join(fieldDir, "manifest.json"),
    metadata: path.join(fieldDir, "metadata.jsonl.gz"),
    vectors: path.join(fieldDir, "vectors.f32"),
    norms: path.join(fieldDir, "norms.f32")
  };
}

export function fieldExists(fieldDir) {
  const files = fieldPaths(fieldDir);
  return Object.values(files).every((file) => fs.existsSync(file));
}

export function loadField(fieldDir) {
  const files = fieldPaths(fieldDir);
  if (!fieldExists(fieldDir)) throw new Error(`AFRO field has not been built in ${fieldDir}`);
  const stamp = Object.values(files).map(fileStamp).join("|");
  const existing = cache.get(fieldDir);
  if (existing?.stamp === stamp) return existing.field;

  const manifest = JSON.parse(fs.readFileSync(files.manifest, "utf8"));
  const metadataText = zlib.gunzipSync(fs.readFileSync(files.metadata)).toString("utf8").trim();
  const metadata = metadataText ? metadataText.split("\n").map((line) => JSON.parse(line)) : [];
  const vectorBuffer = fs.readFileSync(files.vectors);
  const normBuffer = fs.readFileSync(files.norms);
  const vectors = new Float32Array(vectorBuffer.buffer.slice(vectorBuffer.byteOffset, vectorBuffer.byteOffset + vectorBuffer.byteLength));
  const norms = new Float32Array(normBuffer.buffer.slice(normBuffer.byteOffset, normBuffer.byteOffset + normBuffer.byteLength));

  if (metadata.length !== manifest.count || norms.length !== manifest.count || vectors.length !== manifest.count * manifest.dimension) {
    throw new Error("AFRO field files do not match the manifest");
  }
  const field = { manifest, metadata, vectors, norms };
  cache.set(fieldDir, { stamp, field });
  return field;
}

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function recordMatches(record, filters = {}) {
  const category = normalized(filters.category);
  const country = normalized(filters.country);
  const type = normalized(filters.type);
  if (category && !(record.categories || []).some((value) => normalized(value) === category)) return false;
  if (country && !(record.countries || []).some((value) => normalized(value) === country)) return false;
  if (type && normalized(record.type) !== type) return false;
  return true;
}

export function searchField(field, queryVector, { k = 24, category = "", country = "", type = "" } = {}) {
  const { manifest, metadata, vectors, norms } = field;
  if (!Array.isArray(queryVector) || queryVector.length !== manifest.dimension) {
    throw new Error(`Expected a ${manifest.dimension}D ARBITER query vector`);
  }
  let qSquared = 0;
  for (const value of queryVector) qSquared += value * value;
  const qNorm = Math.sqrt(qSquared) || 1;
  const scored = [];
  for (let row = 0; row < metadata.length; row += 1) {
    const record = metadata[row];
    if (!recordMatches(record, { category, country, type })) continue;
    let dot = 0;
    const offset = row * manifest.dimension;
    for (let dim = 0; dim < manifest.dimension; dim += 1) dot += queryVector[dim] * vectors[offset + dim];
    const resonance = dot / (qNorm * (norms[row] || 1));
    if (scored.length < k) {
      scored.push({ row, resonance });
      scored.sort((a, b) => b.resonance - a.resonance);
    } else if (resonance > scored[scored.length - 1].resonance) {
      scored[scored.length - 1] = { row, resonance };
      scored.sort((a, b) => b.resonance - a.resonance);
    }
  }
  return scored.map(({ row, resonance }, index) => ({ ...metadata[row], rank: index + 1, resonance }));
}

export function latestField(field, { k = 18, category = "", country = "", type = "" } = {}) {
  return field.metadata.filter((record) => recordMatches(record, { category, country, type })).slice(0, k);
}
