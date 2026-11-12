// GET /api/signup/confirm?token=…  → confirms an email signup, then back to the home page.
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const GET: APIRoute = async ({ url, redirect }) => {
  const token = url.searchParams.get("token") ?? "";
  if (/^[0-9a-f]{48}$/.test(token)) {
    await env.DB.prepare("UPDATE email_signups SET confirmed_at = COALESCE(confirmed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), unsubscribed_at = NULL WHERE token = ?").bind(token).run();
  }
  return redirect("/?signup=confirmed#updates", 303);
};
