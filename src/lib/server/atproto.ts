// Server-side AT Protocol helpers: resolve identities and check that a record really exists in someone's repo.
// Used to verify a signup (the browser says "I am did:…, here is my follow / supporter record") without the server
// ever holding the person's OAuth tokens: the record can only exist if they created it from their own account.
import { FOLLOW_NSID, SUPPORTER_NSID } from "../atproto/config";

const DID_RE = /^did:(plc:[a-z2-7]{24}|web:[a-zA-Z0-9.-]+)$/;
export const isDid = (s: unknown): s is string => typeof s === "string" && DID_RE.test(s);

/** DID document → { pds, handle }. did:plc via plc.directory, did:web via /.well-known/did.json. */
export async function resolveDid(did: string): Promise<{ pds: string; handle: string | null }> {
  const url = did.startsWith("did:plc:") ? `https://plc.directory/${did}` : `https://${did.slice(8)}/.well-known/did.json`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`could not resolve ${did} (${res.status})`);
  const doc = (await res.json()) as { service?: { id: string; type: string; serviceEndpoint: string }[]; alsoKnownAs?: string[] };
  const svc = doc.service?.find((s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer");
  if (!svc) throw new Error(`${did} has no PDS`);
  const aka = doc.alsoKnownAs?.find((a) => a.startsWith("at://"));
  return { pds: svc.serviceEndpoint.replace(/\/$/, ""), handle: aka ? aka.slice(5) : null };
}

/** Handle → DID through the public Bluesky AppView (works for any handle on the network). */
export async function resolveHandle(handle: string): Promise<string | null> {
  const res = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
  if (!res.ok) return null;
  const { did } = (await res.json()) as { did?: string };
  return isDid(did) ? did : null;
}

/** Parse at://did/collection/rkey. */
export function parseAtUri(uri: unknown): { did: string; collection: string; rkey: string } | null {
  if (typeof uri !== "string") return null;
  const m = /^at:\/\/(did:[^/]+)\/([a-zA-Z0-9.-]+)\/([A-Za-z0-9._:~-]{1,512})$/.exec(uri);
  return m ? { did: m[1], collection: m[2], rkey: m[3] } : null;
}

/** Fetch a record from the owner's PDS; null if it doesn't exist. */
export async function getRecord(pds: string, did: string, collection: string, rkey: string): Promise<Record<string, unknown> | null> {
  const q = new URLSearchParams({ repo: did, collection, rkey });
  const res = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?${q}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { value?: Record<string, unknown> };
  return body.value ?? null;
}

/**
 * Verify a signup: at least one of the two URIs must point to a real record in `did`'s repo —
 * a follow whose subject is the project account, or an org.zipcodedistricts.supporter record.
 */
export async function verifySignup(did: string, projectDid: string | null, followUri: unknown, supporterUri: unknown) {
  const { pds, handle } = await resolveDid(did);
  const out = { handle, followUri: null as string | null, supporterUri: null as string | null };
  const f = parseAtUri(followUri);
  if (f && f.did === did && f.collection === FOLLOW_NSID && projectDid) {
    const rec = await getRecord(pds, did, f.collection, f.rkey);
    if (rec && rec.subject === projectDid) out.followUri = followUri as string;
  }
  const s = parseAtUri(supporterUri);
  if (s && s.did === did && s.collection === SUPPORTER_NSID) {
    const rec = await getRecord(pds, did, s.collection, s.rkey);
    if (rec) out.supporterUri = supporterUri as string;
  }
  return out;
}
