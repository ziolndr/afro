import { fieldDir, send } from "./_shared.mjs";
import { loadField } from "../lib/field.mjs";
export default function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
  try { return send(res, 200, { status: "ready", ...loadField(fieldDir).manifest }); }
  catch (error) { return send(res, 503, { status: "not_built", error: error instanceof Error ? error.message : String(error) }); }
}
