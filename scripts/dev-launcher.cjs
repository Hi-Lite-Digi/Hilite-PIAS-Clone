// Dev-server launcher that pins cwd to the app root and spawns vite's JS
// entrypoint directly via node, avoiding npm.cmd path/space resolution issues on Windows.
const path = require("path");
const { spawn } = require("child_process");

const appDir = path.join(__dirname, "..");
const viteBin = path.join(appDir, "node_modules", "vite", "bin", "vite.js");
const port = process.env.PORT || "5173";

const child = spawn(process.execPath, [viteBin, "--port", port, "--strictPort"], {
  cwd: appDir,
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
