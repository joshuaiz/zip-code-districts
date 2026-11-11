// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: { port: 8787, host: true },
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
  },
});