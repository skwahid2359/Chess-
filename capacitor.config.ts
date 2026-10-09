import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.chessgame.analyzer",
  appName: "Chess Game Analyzer",
  // The mobile-only TanStack Start build emits index.html and static assets here.
  webDir: ".output/public",
};

export default config;
