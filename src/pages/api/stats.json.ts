// GET /api/stats.json → public totals only (confirmed email signups + AT Protocol supporters). No addresses, no ZIPs.
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { json } from "../../lib/server/http";

export const prerender = false;

export const GET: APIRoute = async () => {
  const r = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM email_signups WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL) AS email,
      (SELECT COUNT(*) FROM atproto_supporters) AS atproto,
      (SELECT COUNT(*) FROM atproto_supporters WHERE supporter_uri IS NOT NULL) AS public_supporters`).first<{ email: number; atproto: number; public_supporters: number }>();
  return json({ ...r, total: (r?.email ?? 0) + (r?.atproto ?? 0) }, 200, { "cache-control": "public, max-age=300" });
};
