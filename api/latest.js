import { latestRequest, send } from "./_shared.mjs";
export default function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
  try { return send(res, 200, latestRequest(req.query || {})); }
  catch (error) { return send(res, 503, { error: error instanceof Error ? error.message : String(error) }); }
}
