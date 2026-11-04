import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(process.cwd());

const removedPaths = [
  "src/app/TodayPage.tsx",
  "src/app/LeadsPage.tsx",
  "src/app/CampaignsPage.tsx",
  "src/app/RepliesPage.tsx",
  "src/app/HRDiscoveryPage.tsx",
  "src/app/SettingsPage.tsx",
  "src/app/PlaceholderPage.tsx",
  "src/app/hihunt/OutreachPage.tsx",
  "src/app/hihunt/OutreachDraftEditor.tsx",
  "src/app/components/SendBatch.tsx",
  "src/app/components/ProspectReviewQueue.tsx",
  "src/app/components/AudienceSelectionModal.tsx",
  "src/app/components/SelectedPeopleList.tsx",
  "src/app/reengage/AudienceControls.tsx",
  "src/app/layout/Shell.tsx",
  "src/app/layout/Sidebar.tsx",
  "src/app/layout/Topbar.tsx",
  "src/app/components/figma",
  "src/imports",
  "default_shadcn_theme.css",
  "src/styles/globals.css",
] as const;

async function pathExists(relativePath: string) {
  try {
    await access(path.join(projectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

test("Phase 4 removes only the verified legacy and orphan closure", async () => {
  const results = await Promise.all(removedPaths.map(pathExists));
  assert.deepEqual(
    removedPaths.filter((_, index) => results[index]),
    [],
  );
  assert.equal(await pathExists("src/app/layout/BadgesContext.tsx"), true);
});

test("document metadata uses the Hilite title, background, and raster favicon", async () => {
  const html = await readFile(path.join(projectRoot, "index.html"), "utf8");
  assert.match(html, /<title>Hilite<\/title>/);
  assert.match(html, /<meta\s+name="theme-color"\s+content="#EFEEF3"\s*\/?>/);
  assert.match(html, /<link\s+rel="icon"\s+type="image\/png"\s+href="\/favicon\.png"\s*\/?>/);

  const favicon = await readFile(path.join(projectRoot, "public/favicon.png"));
  assert.deepEqual([...favicon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(favicon.readUInt32BE(16), 128);
  assert.equal(favicon.readUInt32BE(20), 128);
});

test("backend handoff records edited-copy and dependency follow-ups", async () => {
  const todo = await readFile(path.join(projectRoot, "BACKEND_TODO.md"), "utf8");
  assert.match(todo, /edited copy/i);
  assert.match(todo, /message-override contract/i);
  assert.match(todo, /dependency cleanup/i);
  assert.match(todo, /canvas-confetti/);
  assert.match(todo, /@mui\/material/);
});
