import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("Hi-Hunt Leads uses paged loading and exposes the safety cap", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/hihunt/LeadsPage.tsx"), "utf8");
  assert.match(source, /fetchPagedCollection/);
  assert.match(source, /capReached/);
  assert.match(source, /role="status"/);
});

test("Hi-Hunt Leads displays ten sorted contacts per page with RE-engage-style controls", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/hihunt/LeadsPage.tsx"), "utf8");
  assert.match(source, /const DEFAULT_LEAD_PAGE_SIZE = 10/);
  assert.match(source, /sortRows\(filtered, activeColumn, sort\.direction\)/);
  assert.match(source, /sorted\.slice\(pageIndex \* pageSize/);
  assert.match(source, /<PageSizeSelect value=\{pageSize\}/);
  assert.match(source, /aria-label="Hi-Hunt lead pages"/);
  assert.match(source, />Previous<\/Button>/);
  assert.match(source, />Next<\/Button>/);
  assert.match(source, /Page \{pageIndex \+ 1\} of \{pageCount\}/);
});

test("Hi-Hunt Leads labels blocked email contacts as unsubscribed", () => {
  const page = readFileSync(path.join(process.cwd(), "src/app/hihunt/LeadsPage.tsx"), "utf8");
  const model = readFileSync(path.join(process.cwd(), "src/app/hihunt/leads-model.ts"), "utf8");
  assert.match(page, /label: leadStatusLabel\.suppressed/);
  assert.match(page, /label=\{leadStatusLabel\[row\.status\]\}/);
  assert.match(model, /suppressed: "Unsubscribed"/);
});

test("lead lifecycle totals use authoritative summary and never silently count only a capped page", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/hihunt/LeadsPage.tsx"), "utf8");
  assert.match(source, /summary\.lifecycle/);
  assert.match(source, /getLeadLifecycleStats/);
  assert.match(source, /lifecycleStats\.newCount === null \? "—"/);
  assert.match(source, /lifecycleStats\.repliedCount === null \? "—"/);
});

test("authoritative lead reload clears stale local lifecycle overrides", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/hihunt/LeadsPage.tsx"), "utf8");
  const successStart = source.indexOf("setProspects(leadResult.value.items)");
  const overrideReset = source.indexOf("setStatusOverrides({})");
  assert.ok(successStart >= 0, "the authoritative prospect success branch must exist");
  assert.ok(overrideReset >= 0, "an authoritative reload must clear local overrides");
  assert.ok(overrideReset > successStart, "overrides clear only after the authoritative prospect request succeeds");
});

test("lead history source state is replaced per load rather than accumulated", () => {
  const pageSource = readFileSync(path.join(process.cwd(), "src/app/hihunt/LeadsPage.tsx"), "utf8");
  const drawerSource = readFileSync(path.join(process.cwd(), "src/app/hihunt/LeadDetailDrawer.tsx"), "utf8");
  assert.match(pageSource, /setHistorySources\(nextHistorySources\)/);
  assert.doesNotMatch(pageSource, /setSampleHistory\(\(current\) => current \|\|/);
  assert.match(drawerSource, /getLeadHistoryPresentation/);
  assert.match(drawerSource, /historyPresentation\.showSample/);
  assert.match(drawerSource, /historyPresentation\.state === "error"/);
  assert.match(drawerSource, /historyPresentation\.state === "sample"/);
});

test("lead drawer uses a labelled suppression confirmation and undo", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/hihunt/LeadDetailDrawer.tsx"), "utf8");
  assert.match(source, /ConfirmDialog/);
  assert.match(source, /confirmLabel="Suppress lead"/);
  assert.match(source, /Undo/);
  assert.match(source, /updateHiHuntLeadStatus/);
});

test("eligible unsuppressed leads can start a preselected email campaign", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/hihunt/LeadDetailDrawer.tsx"), "utf8");
  assert.match(source, /lead\.status !== "suppressed"/);
  assert.match(source, /hasSendableHRWorkEmail\(lead\.prospect\)/);
  assert.match(source, /\/hihunt\/campaigns\/new\?prospectId=/);
  assert.match(source, /\/>Email campaign/);
});

test("Hi-Hunt leads explain the daily 7 AM refresh and omit source workflow data", () => {
  const page = readFileSync(path.join(process.cwd(), "src/app/hihunt/LeadsPage.tsx"), "utf8");
  const drawer = readFileSync(path.join(process.cwd(), "src/app/hihunt/LeadDetailDrawer.tsx"), "utf8");
  assert.match(page, /every day at 7:00 AM/);
  assert.doesNotMatch(page, /Source workflow|workflowOptions/);
  assert.doesNotMatch(drawer, /Source workflow|sourceWorkflow/);
});
