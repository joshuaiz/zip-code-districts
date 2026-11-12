// GET /api/project.json → the project account's handle and DID (the subject of supporters' follows).
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { resolveHandle } from "../../lib/server/atproto";
import { json } from "../../lib/server/http";

export const prerender = false;

export const GET: APIRoute = async () => {
  const did = env.PROJECT_DID || (await resolveHandle(env.PROJECT_HANDLE));
  return json({ handle: env.PROJECT_HANDLE, did }, did ? 200 : 503, { "cache-control": "public, max-age=3600" });
};
