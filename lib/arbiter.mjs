const LOCAL_EMBED = "http://127.0.0.1:8000/v1/embed";
const PUBLIC_EMBED = "https://api.arbiter.traut.ai/public/embed";

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function embedEndpoints() {
  const configured = String(process.env.ARBITER_EMBED_URL || process.env.AFRO_ARBITER_EMBED_URL || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return process.env.VERCEL
    ? unique([...configured, PUBLIC_EMBED, LOCAL_EMBED])
    : unique([...configured, LOCAL_EMBED, PUBLIC_EMBED]);
}

function normalizeVectors(payload, expectedCount) {
  const direct = [payload, payload?.vectors, payload?.embeddings, payload?.data, payload?.result?.vectors, payload?.result?.embeddings];
  for (const candidate of direct) {
    if (!Array.isArray(candidate)) continue;
    if (candidate.length === expectedCount && candidate.every((row) => Array.isArray(row))) {
      const vectors = candidate.map((row) => row.map(Number));
      if (vectors.every((row) => row.length > 0 && row.every(Number.isFinite))) return vectors;
    }
    if (expectedCount === 1 && candidate.length > 0 && candidate.every((value) => Number.isFinite(Number(value)))) {
      return [candidate.map(Number)];
    }
    if (candidate.length === expectedCount && candidate.every((row) => row && typeof row === "object")) {
      const vectors = candidate.map((row) => row.embedding ?? row.vector ?? row.values);
      if (vectors.every((row) => Array.isArray(row) && row.length > 0)) return vectors.map((row) => row.map(Number));
    }
  }
  const single = payload?.embedding ?? payload?.vector ?? payload?.data?.embedding ?? payload?.data?.vector;
  if (expectedCount === 1 && Array.isArray(single)) return [single.map(Number)];
  throw new Error("ARBITER returned an unknown embedding response shape");
}

async function postEmbed(endpoint, texts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.ARBITER_API_KEY ? { authorization: `Bearer ${process.env.ARBITER_API_KEY}` } : {})
      },
      body: JSON.stringify({ texts, use_freq: true }),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`${response.status} ${response.statusText}${text ? ` · ${text.slice(0, 160)}` : ""}`);
    }
    const payload = await response.json();
    return normalizeVectors(payload, texts.length);
  } finally {
    clearTimeout(timer);
  }
}

export async function embedTexts(texts, { timeoutMs = 120000 } = {}) {
  if (!Array.isArray(texts) || texts.length === 0) throw new Error("embedTexts requires at least one text");
  const errors = [];
  for (const endpoint of embedEndpoints()) {
    try {
      const vectors = await postEmbed(endpoint, texts, timeoutMs);
      const dimension = vectors[0]?.length || 0;
      if (!dimension || vectors.some((row) => row.length !== dimension)) throw new Error("Inconsistent vector dimensions");
      return { vectors, endpoint, dimension };
    } catch (error) {
      errors.push(`${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No ARBITER embedding endpoint succeeded. ${errors.join(" | ")}`);
}
