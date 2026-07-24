#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { embedTexts } from "../lib/arbiter.mjs";
import { collectAfroContent } from "../lib/wordpress.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const sourceUrl = argument("--source", process.env.AFRO_SOURCE_URL || "https://www.afromag.co.za");
const outputDir = path.resolve(argument("--output", process.env.AFRO_FIELD_DIR || path.join(root, "data")));
const batchSize = Math.max(1, Number(argument("--batch-size", process.env.ARBITER_EMBED_BATCH || 32)));
const includePages = !process.argv.includes("--posts-only");
const includeMediaRecords = process.argv.includes("--include-media-records");

function formatCount(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function writeAtomic(file, data) {
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, data);
  fs.renameSync(temp, file);
}

function counts(records, key) {
  const map = new Map();
  for (const record of records) {
    const values = Array.isArray(record[key]) ? record[key] : [record[key]].filter(Boolean);
    for (const value of values) map.set(value, (map.get(value) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
}

console.log("AFRO — COMPLETE ARBITER FIELD BUILD");
console.log("────────────────────────────────────────────────────────");
console.log(`source: ${sourceUrl}`);
console.log(`field:  ${outputDir}`);
console.log(`embed:  ${process.env.ARBITER_EMBED_URL || process.env.AFRO_ARBITER_EMBED_URL || "local ARBITER → public fallback"}`);
console.log();

const collected = await collectAfroContent({
  sourceUrl,
  includePages,
  includeMediaRecords,
  progress: ({ restBase, restNamespace, page, totalPages, loaded, total, skipped, error }) => {
    const label = String(restBase || "content").padEnd(14);
    if (skipped) {
      process.stdout.write(`\rcollecting ${label} SKIPPED · ${error?.status || "route error"} · ${restNamespace || "wp/v2"}/${restBase}\n`);
      return;
    }
    process.stdout.write(`\rcollecting ${label} page ${String(page).padStart(3)}/${String(totalPages).padEnd(3)} · ${formatCount(loaded)}/${formatCount(total)}   `);
  }
});
process.stdout.write("\n");

if (collected.records.length === 0) {
  const discovered = (collected.types || []).map((type) => `${type.slug}:${type.restBase}`).join(", ") || "none";
  throw new Error(`Afro Magazine returned no public records. Content endpoints attempted: ${discovered}`);
}
console.log(`collected ${formatCount(collected.records.length)} searchable records`);
console.log(`media library ${formatCount(collected.raw.media.length)} objects preserved in raw export`);
if (collected.failures?.length) {
  console.log(`skipped ${formatCount(collected.failures.length)} advertised plugin route${collected.failures.length === 1 ? "" : "s"} that were not publicly readable`);
}
console.log();

const vectors = [];
let dimension = 0;
let engineEndpoint = "";
for (let start = 0; start < collected.records.length; start += batchSize) {
  const batch = collected.records.slice(start, start + batchSize);
  const result = await embedTexts(batch.map((record) => record.semanticText));
  dimension ||= result.dimension;
  engineEndpoint ||= result.endpoint;
  if (result.dimension !== dimension) throw new Error(`ARBITER dimension changed from ${dimension} to ${result.dimension}`);
  vectors.push(...result.vectors);
  const complete = Math.min(collected.records.length, start + batch.length);
  process.stdout.write(`\rembedding ${formatCount(complete)}/${formatCount(collected.records.length)} · ${dimension}D · ${result.endpoint}   `);
}
process.stdout.write("\n");

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(path.join(outputDir, "raw"), { recursive: true });

const vectorBuffer = Buffer.allocUnsafe(vectors.length * dimension * 4);
const normBuffer = Buffer.allocUnsafe(vectors.length * 4);
for (let row = 0; row < vectors.length; row += 1) {
  let squared = 0;
  for (let dim = 0; dim < dimension; dim += 1) {
    const value = Number(vectors[row][dim]);
    vectorBuffer.writeFloatLE(value, (row * dimension + dim) * 4);
    squared += value * value;
  }
  normBuffer.writeFloatLE(Math.sqrt(squared) || 1, row * 4);
}

const metadataLines = collected.records.map((record) => {
  const { semanticText, ...metadata } = record;
  return JSON.stringify(metadata);
}).join("\n") + "\n";
const rawPayload = JSON.stringify({
  source: collected.baseUrl,
  fetchedAt: new Date().toISOString(),
  types: collected.types,
  content: collected.raw
});

const manifest = {
  product: "AFRO — powered by ARBITER",
  source: collected.baseUrl,
  builtAt: new Date().toISOString(),
  count: collected.records.length,
  dimension,
  engine: "ARBITER",
  engineEndpoint,
  contentTypes: counts(collected.records, "type"),
  categories: counts(collected.records, "categories"),
  countries: counts(collected.records, "countries"),
  dateNewest: collected.records.map((record) => record.date).filter(Boolean).sort().at(-1) || null,
  dateOldest: collected.records.map((record) => record.date).filter(Boolean).sort().at(0) || null,
  rawMediaCount: collected.raw.media.length,
  skippedRoutes: collected.failures || [],
  sourcePreserving: true,
  files: {
    metadata: "metadata.jsonl.gz",
    vectors: "vectors.f32",
    norms: "norms.f32",
    raw: "raw/wordpress-export.json.gz"
  }
};

writeAtomic(path.join(outputDir, "vectors.f32"), vectorBuffer);
writeAtomic(path.join(outputDir, "norms.f32"), normBuffer);
writeAtomic(path.join(outputDir, "metadata.jsonl.gz"), zlib.gzipSync(metadataLines, { level: 9 }));
writeAtomic(path.join(outputDir, "raw", "wordpress-export.json.gz"), zlib.gzipSync(rawPayload, { level: 9 }));
writeAtomic(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log();
console.log(`FIELD READY · ${formatCount(manifest.count)} records · ${manifest.dimension}D`);
console.log(`vectors:  ${(vectorBuffer.length / 1024).toFixed(1)} KB`);
console.log(`metadata: ${(fs.statSync(path.join(outputDir, "metadata.jsonl.gz")).size / 1024).toFixed(1)} KB compressed`);
console.log(`raw:      ${(fs.statSync(path.join(outputDir, "raw", "wordpress-export.json.gz")).size / 1024).toFixed(1)} KB compressed`);
