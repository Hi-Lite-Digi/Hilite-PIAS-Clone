import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.join(process.cwd(), "src/app/reengage/CampaignsPage.tsx"), "utf8");

test("campaign rows expose an accessible destructive action with confirmation", () => {
  assert.match(source, /deleteCampaign\(target\.id\)/);
  assert.match(source, /label={`Delete \$\{campaign\.title\}`}/);
  assert.match(source, /title="Delete this campaign\?"/);
  assert.match(source, /variant="destructive"/);
  assert.match(source, /WhatsApp conversations are kept/);
});

test("campaign deletion removes only the confirmed campaign from local state", () => {
  assert.match(source, /campaign\.id !== target\.id/);
  assert.match(source, /event\.stopPropagation\(\)/);
});

test("all campaigns defaults to latest updates and refreshes while visible", () => {
  assert.match(source, /const recentCampaigns = useMemo/);
  assert.match(source, /Date\.parse\(right\.updated_at\)/);
  assert.match(source, /rows=\{recentCampaigns\}/);
  assert.doesNotMatch(source, /initialSort=\{\{ key: "name"/);
  assert.match(source, /window\.setInterval\(refreshVisibleCampaigns, 30_000\)/);
  assert.match(source, /window\.addEventListener\("focus", refreshVisibleCampaigns\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", refreshVisibleCampaigns\)/);
  assert.match(source, /load\(false\)/);
});

test("campaign rows expose YES-based attendance against the actual recipient total", () => {
  assert.match(source, /header: "Attending"/);
  assert.match(source, /campaignAttendanceCount\(campaign, threads\)/);
  assert.match(source, /campaignAttendanceTotal\(campaign\)/);
});
