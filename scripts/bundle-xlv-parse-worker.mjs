import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const entry = path.join(root, "src/services/import/xlv-excel-parse-worker.ts");
const outDir = path.join(root, "scripts");
const outfile = path.join(outDir, "xlv-parse-worker.mjs");

if (!fs.existsSync(entry)) {
  console.error("Missing worker entry:", entry);
  process.exit(1);
}

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile,
  // Bundle npm deps (notably xlsx) so the standalone runner image needs no node_modules/xlsx.
  packages: "bundle",
  alias: {
    "@": path.join(root, "src"),
    // Prefer SheetJS ESM entry so esbuild does not wrap CJS dynamic require().
    xlsx: path.join(root, "node_modules/xlsx/xlsx.mjs"),
  },
  mainFields: ["module", "main"],
  conditions: ["node", "import", "default"],
  logLevel: "info",
});

console.info("Wrote", outfile);