// Small helpers for the /api routes (Cloudflare Workers runtime).
export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

export const ZIP_RE = /^\d{5}$/;
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

/** Read a JSON or form body; returns {} on anything unparseable. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const type = request.headers.get("content-type") || "";
    if (type.includes("application/json")) return (await request.json()) as Record<string, unknown>;
    return Object.fromEntries((await request.formData()).entries());
  } catch {
    return {};
  }
}

/** Only accept POSTs from our own pages (simple CSRF guard; browsers always send Origin on POST). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

/** Salted SHA-256 of the client IP, used only to rate-limit signups. The raw IP is never stored. */
export async function ipHash(request: Request, salt = ""): Promise<string | null> {
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ip));
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
