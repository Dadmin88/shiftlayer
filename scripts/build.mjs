import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const out = "dist";
const entries = [
  "manifest.json",
  "shared.js",
  "background.js",
  "content/content.js",
  "content/content.css",
  "popup/popup.html",
  "popup/popup.css",
  "popup/popup.js",
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const entry of entries) {
  if (!existsSync(entry)) throw new Error(`Missing build input: ${entry}`);
  const destination = join(out, entry);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(entry, destination);
}

const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("ShiftLayer must build as Manifest V3.");
console.log(`Built ShiftLayer ${manifest.version} -> ${out}/ (${entries.length} files)`);
