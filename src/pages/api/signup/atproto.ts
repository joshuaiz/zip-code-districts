// POST /api/signup/atproto  { did, followUri?, supporterUri?, zip? }
// Called by /oauth/callback after the person (signed in with their own account) followed the project and/or added a
// supporter record. The server holds no tokens: it checks those records exist in their repo before storing anything.
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isDid, resolveHandle, verifySignup } from "../../../lib/server/atproto";
import { ZIP_RE, json, readBody, sameOrigin } from "../../../lib/server/http";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return json({ ok: false, error: "bad origin" }, 403);
  const body = await readBody(request);
  const zip = String(body.zip ?? "").trim();
  if (!isDid(body.did)) return json({ ok: false, error: "bad did" }, 400);
  if (zip && !ZIP_RE.test(zip)) return json({ ok: false, error: "ZIP codes have 5 digits." }, 400);

  const projectDid = env.PROJECT_DID || (await resolveHandle(env.PROJECT_HANDLE));
  let v;
  try {
    v = await verifySignup(body.did, projectDid, body.followUri, body.supporterUri);
  } catch (e) {
    return json({ ok: false, error: "Couldn't look up your account. Please try again." }, 502);
  }
  if (!v.followUri && !v.supporterUri) return json({ ok: false, error: "We couldn't find your follow or supporter record yet. Please try again in a moment." }, 409);

  await env.DB.prepare(`INSERT INTO atproto_supporters (did, handle, zip, follow_uri, supporter_uri) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(did) DO UPDATE SET handle = excluded.handle, zip = COALESCE(excluded.zip, atproto_supporters.zip),
        follow_uri = COALESCE(excluded.follow_uri, atproto_supporters.follow_uri),
        supporter_uri = COALESCE(excluded.supporter_uri, atproto_supporters.supporter_uri),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
    .bind(body.did, v.handle, zip || null, v.followUri, v.supporterUri).run();
  return json({ ok: true, followed: !!v.followUri, supporter: !!v.supporterUri });
};
