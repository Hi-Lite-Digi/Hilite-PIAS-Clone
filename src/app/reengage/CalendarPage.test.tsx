import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.join(process.cwd(), "src/app/reengage/CalendarPage.tsx"), "utf8");

test("calendar loads campaign dates automatically and links every block to its campaign", () => {
  assert.match(source, /getCampaigns\(\)/);
  assert.match(source, /campaignCalendarEvents\(campaigns\)/);
  assert.match(source, /to={`\/reengage\/campaigns\/\$\{encodeURIComponent\(event\.campaignId\)\}`}/);
  assert.match(source, /Singapore time/);
  assert.match(source, /No event date · shown when last updated/);
});

test("calendar exposes month navigation, today, and campaign creation controls", () => {
  assert.match(source, /aria-label="Previous month"/);
  assert.match(source, /aria-label="Next month"/);
  assert.match(source, />Today<\/Button>/);
  assert.match(source, /to="\/reengage\/campaigns\/new"/);
});
