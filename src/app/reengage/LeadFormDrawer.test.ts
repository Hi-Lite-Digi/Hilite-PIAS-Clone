import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { validateLeadForm, type LeadForm } from "./LeadFormDrawer";
import { calculateLeadAge } from "./lead-validation";

const validLead: LeadForm = {
  name: "Jamie Lim",
  phone: "+65 9123 4567",
  email: "",
  dob: "1988-05-12",
  status: "Untouched",
  topics: "Retirement",
  source: "Manual entry",
  remarks: "",
};

test("add-lead validation reports invalid phone and date values inline", () => {
  assert.match(validateLeadForm({ ...validLead, phone: "123" }).phone ?? "", /valid phone/i);
  assert.match(validateLeadForm({ ...validLead, email: "not-an-email" }).email ?? "", /valid email/i);
  assert.match(validateLeadForm({ ...validLead, dob: "2026-02-31" }).dob ?? "", /valid date/i);
  assert.match(validateLeadForm({ ...validLead, dob: "2999-01-01" }).dob ?? "", /between 0 and 120/i);
  assert.deepEqual(validateLeadForm(validLead), {});
});

test("the date-of-birth field renders its validation message", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/reengage/LeadFormDrawer.tsx"), "utf8");
  assert.match(source, /<Field label="Date of birth" error=\{errors\.dob\}>/);
});

test("add and edit lead surfaces use one contact and date validator", () => {
  const addSource = readFileSync(path.join(process.cwd(), "src/app/reengage/LeadFormDrawer.tsx"), "utf8");
  const editSource = readFileSync(path.join(process.cwd(), "src/app/reengage/LeadDetailDrawer.tsx"), "utf8");

  assert.match(addSource, /validateLeadContact/);
  assert.match(editSource, /validateLeadContact/);
  assert.match(editSource, /dob: lead\.dob \?\? ""/);
  assert.match(editSource, /errors\.phone/);
  assert.match(editSource, /errors\.email/);
  assert.match(editSource, /errors\.dob/);
});

test("changing or closing the detail lead invalidates deletion work and clears busy state", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/reengage/LeadDetailDrawer.tsx"), "utf8");
  const resetEffect = source.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[lead\]\);/)?.[1] ?? "";

  assert.match(resetEffect, /deleteRequest\.current \+= 1/);
  assert.match(resetEffect, /setBusy\(false\)/);
  assert.ok(
    resetEffect.indexOf("setBusy(false)") < resetEffect.indexOf("if (!lead) return"),
    "busy must clear before the closed-lead early return",
  );
});

test("lead reloads and drawer mutations ignore stale request completions", () => {
  const leadsSource = readFileSync(path.join(process.cwd(), "src/app/reengage/LeadsPage.tsx"), "utf8");
  const detailSource = readFileSync(path.join(process.cwd(), "src/app/reengage/LeadDetailDrawer.tsx"), "utf8");
  const formSource = readFileSync(path.join(process.cwd(), "src/app/reengage/LeadFormDrawer.tsx"), "utf8");

  assert.match(leadsSource, /const leadLoadRequest = useRef\(0\)/);
  assert.match(leadsSource, /const request = \+\+leadLoadRequest\.current/);
  assert.match(leadsSource, /if \(request !== leadLoadRequest\.current\) return/);
  assert.match(detailSource, /const mutationRequest = useRef\(0\)/);
  assert.match(detailSource, /if \(request !== mutationRequest\.current\) return/);
  assert.match(detailSource, /if \(request !== deleteRequest\.current\) return;\s*toast\.error/);
  assert.match(leadsSource, /setSelected\(\(current\) => current\?\.id === updated\.id \? updated : current\)/);
  assert.ok(
    detailSource.indexOf("onUpdated(result.data)") < detailSource.indexOf("if (request !== mutationRequest.current) return", detailSource.indexOf("const saveEdit")),
    "a completed update should reconcile its table row before stale drawer state is ignored",
  );
  assert.match(formSource, /const submitRequest = useRef\(0\)/);
  assert.match(formSource, /if \(request !== submitRequest\.current\) return/);
  assert.ok(
    formSource.indexOf("onCreated(result.data)") < formSource.indexOf("if (request !== submitRequest.current) return"),
    "a completed create should reconcile its row before stale drawer state is ignored",
  );
});

test("date-of-birth age uses the device-local calendar date", () => {
  const localJustAfterMidnight = new Date(2026, 7, 26, 0, 5);

  assert.equal(calculateLeadAge("2000-08-26", localJustAfterMidnight), 26);
  assert.equal(calculateLeadAge("2000-08-27", localJustAfterMidnight), 25);
  assert.equal(calculateLeadAge("2026-02-31", localJustAfterMidnight), null);
});
