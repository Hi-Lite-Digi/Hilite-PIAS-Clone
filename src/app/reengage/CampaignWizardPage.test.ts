import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.join(process.cwd(), "src/app/reengage/CampaignWizardPage.tsx"), "utf8");

test("wizard uses the data-router blocker and system dialogs for navigation and destructive poster replacement", () => {
  assert.match(source, /useBlocker/);
  assert.match(source, /Discard edits and replace poster\?/);
  assert.match(source, /Leave this campaign\?/);
  assert.match(source, /confirmedNavigation\.current/);
  assert.doesNotMatch(source, /window\.confirm/);
});

test("wizard poster processing supersedes stale asynchronous uploads", () => {
  assert.match(source, /const posterRequest = useRef\(0\)/);
  assert.match(source, /const request = \+\+posterRequest\.current/);
  assert.match(source, /request !== posterRequest\.current/);
  assert.match(source, /if \(analyzing\) return/);
});

test("WhatsApp review previews the reply-to-unsubscribe instruction in muted text", () => {
  assert.match(source, /Reply &apos;Unsubscribe&apos; to stop receiving updates/);
  assert.match(source, /text-ink-3/);
});
