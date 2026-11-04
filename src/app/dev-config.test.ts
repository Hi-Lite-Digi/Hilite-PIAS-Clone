import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";

const projectRoot = path.resolve(process.cwd());

test("the development server is pinned to the Phase 1 acceptance port", async () => {
  const viteConfig = await readFile(path.join(projectRoot, "vite.config.ts"), "utf8");
  const packageJson = await readFile(path.join(projectRoot, "package.json"), "utf8");
  assert.match(viteConfig, /port:\s*5199/);
  assert.match(viteConfig, /strictPort:\s*true/);
  assert.match(packageJson, /vite --configLoader runner/);
});
