import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const pwa = VitePWA({
  registerType: "prompt",
  injectRegister: false,
  includeAssets: ["favicon.ico"],
  outDir: "build/client",
  manifest: {
    name: "Sakustudi",
    short_name: "Sakustudi",
    description: "Study assistant for academic terms, calendars, and notes.",
    start_url: "/",
    display: "standalone",
    theme_color: "#ffce54",
    background_color: "#fafafa",
    icons: [
      { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,woff}"],
    cleanupOutdatedCaches: true,
  },
});

export default defineConfig({
  environments: {
    ssr: {
      build: {
        rollupOptions: {
          input: "./server/app.ts",
        },
      },
    },
  },
  plugins: [tailwindcss(), reactRouter(), pwa],
  resolve: {
    tsconfigPaths: true,
  },
});
