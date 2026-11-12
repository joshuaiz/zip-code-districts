// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// Static site (every page is prerendered); routes that set `export const prerender = false` (src/pages/api/*)
// run on demand in the Cloudflare Worker. Config for bindings and secrets: wrangler.jsonc.
export default defineConfig({
  site: "https://zipcodedistricts.org",
  adapter: cloudflare(),
  server: { port: 8787, host: true },
  // pages as /map.html etc., so /map is served directly (no redirect to /map/) and matches the OAuth redirect URI
  build: { format: "file" },
  redirects: { "/districts": "/map" },
  vite: {
    plugins: [tailwindcss()],
  },
});
