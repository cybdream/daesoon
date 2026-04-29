#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");

const FILES = [
  "index.html",
  "app.js",
  "styles.css",
  "manifest.webmanifest",
  "sw.js"
];

const DIRS = ["data", "icons"];

async function main() {
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  for (const file of FILES) {
    await fs.copyFile(path.join(ROOT, file), path.join(DIST, file));
  }

  for (const dir of DIRS) {
    await fs.cp(path.join(ROOT, dir), path.join(DIST, dir), { recursive: true });
  }

  console.log(`[prepare-web] 완료: ${DIST}`);
}

main().catch((error) => {
  console.error(`[prepare-web] 실패: ${error.message}`);
  process.exit(1);
});
