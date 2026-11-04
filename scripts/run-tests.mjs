import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourceRoot = path.join(projectRoot, "src");

async function collectTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectTests(entryPath);
      return /\.test\.(?:ts|tsx)$/.test(entry.name) ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

async function resolveRequestedTests(arguments_) {
  const requested = arguments_.filter((argument) => argument !== "--");
  if (requested.length === 0) return collectTests(sourceRoot);

  const files = [];
  for (const requestedPath of requested) {
    const absolutePath = path.resolve(projectRoot, requestedPath);
    const details = await stat(absolutePath);
    if (details.isDirectory()) files.push(...(await collectTests(absolutePath)));
    else files.push(absolutePath);
  }
  return files;
}

const testFiles = (await resolveRequestedTests(process.argv.slice(2))).sort();
if (testFiles.length === 0) {
  console.log("No test files found.");
  process.exit(0);
}

const vite = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "error",
  esbuild: { jsx: "automatic" },
  optimizeDeps: { disabled: true },
  resolve: { alias: { "@": sourceRoot } },
  root: projectRoot,
  server: { hmr: false, middlewareMode: true },
});

try {
  for (const testFile of testFiles) {
    const modulePath = `/${path.relative(projectRoot, testFile).replaceAll(path.sep, "/")}`;
    await vite.ssrLoadModule(modulePath);
  }
} finally {
  await vite.close();
}
