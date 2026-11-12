// Shared AT Protocol settings for the browser OAuth client and the server routes.
export const SUPPORTER_NSID = "org.zipcodedistricts.supporter";
export const FOLLOW_NSID = "app.bsky.graph.follow";
export const PROJECT_HANDLE = "zipcodedistricts.org";
export const SITE_ORIGIN = "https://zipcodedistricts.org";

// Only what the signup needs: create a follow of the project account and (optionally) the supporter record.
// Nothing else in the person's account can be read or changed.
export const OAUTH_SCOPE = `atproto repo:${FOLLOW_NSID}?action=create repo:${SUPPORTER_NSID}?action=create`;

export const REDIRECT_PATH = "/oauth/callback";

// Production: the client metadata document served from the site (public/oauth-client-metadata.json).
// Local development: an AT Protocol "loopback" client, which needs no metadata document but must run on 127.0.0.1.
export function oauthClientId(loc: Location): string {
  const loopback = loc.hostname === "127.0.0.1" || loc.hostname === "localhost" || loc.hostname === "[::1]";
  if (!loopback) return `${SITE_ORIGIN}/oauth-client-metadata.json`;
  const redirect = `http://127.0.0.1:${loc.port}${REDIRECT_PATH}`;
  return `http://localhost?redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(OAUTH_SCOPE)}`;
}
