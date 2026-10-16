import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir("public/ai", { recursive: true });
await build({
  entryPoints: ["src/ai/worker.mjs"],
  outfile: "public/ai/worker.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  conditions: ["browser"],
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "linked",
});
console.log("Bundled isolated, same-origin AI worker.");
