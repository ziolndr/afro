import { searchRequest, send } from "./_shared.mjs";
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  try {
    const result = await searchRequest(req.body || {});
    return send(res, result.status, result.body);
  } catch (error) {
    return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
