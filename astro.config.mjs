// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: { port: 8787, host: true },
  redirects: { "/districts": "/" },
  vite: {
    plugins: [tailwindcss()],
  },
});
