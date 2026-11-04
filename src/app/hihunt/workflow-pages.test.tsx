import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("workflow list exposes the operational card details and explicit enable control", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/hihunt/WorkflowsPage.tsx"), "utf8");

  assert.match(source, /formatWorkflowSchedule/);
  assert.match(source, /Last run/);
  assert.match(source, /workflow\.lastRun\?\.completedAt \?\? workflow\.lastRun\?\.startedAt/);
  assert.match(source, /Next run/);
  assert.match(source, /Drafted today/);
  assert.match(source, /role="switch"/);
  assert.match(source, /if \(sample \|\| updatingId\)/);
  assert.match(source, /disabled=\{sample \|\| updatingId !== null\}/);
  assert.match(source, /SampleDataPill/);
  assert.match(source, /sample \? \(\s*<Button disabled>/);
  assert.doesNotMatch(source, /<Button asChild disabled=\{sample\}>/);
  assert.doesNotMatch(source, /status="active"/);
});

test("workflow editor includes all four sections, enable validation, and route-wide guards", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/hihunt/WorkflowEditorPage.tsx"), "utf8");

  for (const section of ["Schedule", "Scrape recipe", "Email template", "Sending rules"]) {
    assert.match(source, new RegExp(`title="${section}"`));
  }
  assert.match(source, /useBlocker/);
  assert.match(source, /beforeunload/);
  assert.match(source, /allowSavedNavigation/);
  assert.match(source, /new Set\(\[\.\.\.options, \.\.\.selected\]\)/);
  assert.match(source, /currentValidation\.seniorities/);
  assert.match(source, /min=\{0\}/);
  assert.match(source, /ConfirmDialog/);
  assert.match(source, /validateWorkflow/);
  assert.match(source, /data-slot="workflow-save-bar"/);
  assert.match(source, /\{\(isNew \|\| dirty\) && \(/);
  assert.match(source, /isNew \? "Create workflow" : "Save changes"/);
  for (const error of ["name", "scheduleDays", "scheduleTime", "volumePerRun", "dailyLimit", "spacingMinutes", "sendWindow"]) {
    assert.match(source, new RegExp(`validation\\.${error} \\?\\? currentValidation\\.${error}`));
  }
  assert.match(source, /\{\{first_name\}\}/);
  assert.match(source, /company_name/);
  assert.match(source, /Live preview/);
  assert.match(source, /SGT/);
  assert.match(source, /Multi-provider/);
  assert.match(source, /const readOnly = sample \|\| saving/);
  assert.match(source, /getSettings/);
  assert.match(source, /defaultWorkflow\(result\.data\.outreach\)/);
  assert.match(source, /Default email settings are unavailable/);
  assert.match(source, /disabled=\{readOnly\}/);
  assert.doesNotMatch(source, /status="active"/);
});

test("workflow editor resets reused route state and restores blocking after a saved create navigation", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/hihunt/WorkflowEditorPage.tsx"), "utf8");

  assert.match(source, /if \(isNew\) \{[\s\S]*?defaultWorkflow\([^)]*\)[\s\S]*?setSaved\([\s\S]*?setWorkflow\(/);
  assert.match(source, /allowSavedNavigation\.current = false/);
  assert.match(source, /setValidation\(\{\}\)/);
});
