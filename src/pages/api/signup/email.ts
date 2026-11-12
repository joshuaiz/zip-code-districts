// POST /api/signup/email  { email, zip?, website? }  → stores a pending signup and sends a confirmation email.
// Double opt-in: an address only counts once its owner opens the confirmation link (/api/signup/confirm).
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { EMAIL_RE, ZIP_RE, ipHash, json, randomToken, readBody, sameOrigin } from "../../../lib/server/http";

export const prerender = false;

// secrets aren't in wrangler.jsonc, so `wrangler types` only knows them when .dev.vars exists
const secrets = env as unknown as { RESEND_API_KEY?: string; IP_HASH_SALT?: string };

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return json({ ok: false, error: "bad origin" }, 403);
  const body = await readBody(request);
  // honeypot: real people never fill the hidden "website" field
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true, confirm: true });
  const email = String(body.email ?? "").trim().toLowerCase();
  const zip = String(body.zip ?? "").trim();
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ ok: false, error: "Please enter a valid email address." }, 400);
  if (zip && !ZIP_RE.test(zip)) return json({ ok: false, error: "ZIP codes have 5 digits." }, 400);

  const ip = await ipHash(request, secrets.IP_HASH_SALT ?? "");
  if (ip) {
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM email_signups WHERE ip_hash = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')").bind(ip).first<{ n: number }>();
    if ((recent?.n ?? 0) >= 5) return json({ ok: false, error: "Too many signups from this network. Please try again later." }, 429);
  }

  await env.DB.prepare("INSERT INTO email_signups (email, zip, token, ip_hash) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET zip = COALESCE(excluded.zip, email_signups.zip), unsubscribed_at = NULL")
    .bind(email, zip || null, randomToken(), ip).run();
  const row = await env.DB.prepare("SELECT token, confirmed_at FROM email_signups WHERE email = ?").bind(email).first<{ token: string; confirmed_at: string | null }>();
  if (row?.confirmed_at) return json({ ok: true, confirm: false }); // already confirmed: say nothing more (no address probing)

  if (secrets.RESEND_API_KEY && row) {
    const link = `${env.SITE_URL}/api/signup/confirm?token=${row.token}`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${secrets.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [email],
        subject: "Confirm your ZIP Code Districts updates",
        text: `Thanks for following ZIP Code Districts.\n\nConfirm your address to start getting occasional updates:\n${link}\n\nIf you didn't sign up, ignore this email and nothing will be sent.\n\n${env.SITE_URL}/privacy`,
      }),
    });
    if (!res.ok) console.error("resend", res.status, await res.text());
  }
  return json({ ok: true, confirm: true });
};
