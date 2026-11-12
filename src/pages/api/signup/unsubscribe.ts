// GET /api/signup/unsubscribe?token=…  → stops all email (the same token is in every update's footer).
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const GET: APIRoute = async ({ url, redirect }) => {
  const token = url.searchParams.get("token") ?? "";
  if (/^[0-9a-f]{48}$/.test(token)) {
    await env.DB.prepare("UPDATE email_signups SET unsubscribed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE token = ?").bind(token).run();
  }
  return redirect("/?signup=unsubscribed#updates", 303);
};
