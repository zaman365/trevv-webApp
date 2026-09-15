import { cloudflare } from "@cloudflare/vite-plugin";
import { sites } from "@openai/sites-vite-plugin";
import tailwindcss from "@tailwindcss/postcss";
import vinext from "vinext";
import { defineConfig } from "vite";
import workerNextConfig from "./worker-next.config";
import { workspaceSourceAliases } from "./workspace-source-aliases";

export default defineConfig({
  resolve: { alias: workspaceSourceAliases },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [
    vinext({ nextConfig: workerNextConfig }),
    sites(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      config: {
        main: "vinext/server/app-router-entry",
        compatibility_flags: ["nodejs_compat"],
      },
    }),
  ],
});
