import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(projectRoot, "dist");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".sh": "text/x-shellscript; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function collectStaticFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "server" || entry.name === ".openai") continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectStaticFiles(path));
    else files.push(path);
  }
  return files;
}

await mkdir(new URL("../dist/server/", import.meta.url), { recursive: true });
await copyFile(
  new URL("../worker/index.js", import.meta.url),
  new URL("../dist/server/index.js", import.meta.url),
);
await copyFile(
  new URL("../worker/supabase-api.js", import.meta.url),
  new URL("../dist/server/supabase-api.js", import.meta.url),
);
await copyFile(
  new URL("../infrastructure/hermes-relay/install-droplet-gateway.sh", import.meta.url),
  new URL("../dist/install-hermes-gateway.sh", import.meta.url),
);

const staticAssets = {};
for (const file of await collectStaticFiles(distRoot)) {
  const route = `/${relative(distRoot, file).split(sep).join("/")}`;
  staticAssets[route] = {
    body: await readFile(file, "utf8"),
    contentType: contentTypes[extname(file).toLowerCase()] || "application/octet-stream",
  };
}

await writeFile(
  resolve(distRoot, "server/static-assets.js"),
  `export const STATIC_ASSETS = ${JSON.stringify(staticAssets)};\n`,
  "utf8",
);
