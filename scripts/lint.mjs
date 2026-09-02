import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = [
  "shared.js",
  "background.js",
  "content/content.js",
  "popup/popup.js",
  "scripts/build.mjs",
  "scripts/lint.mjs",
  "tests/shared.test.mjs",
];

for (const file of files) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
JSON.parse(readFileSync("manifest.json", "utf8"));
JSON.parse(readFileSync("package.json", "utf8"));
console.log(`Syntax/JSON checks passed for ${files.length} JavaScript files.`);
