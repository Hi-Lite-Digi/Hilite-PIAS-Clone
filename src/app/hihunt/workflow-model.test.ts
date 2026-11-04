import assert from "node:assert/strict";
import test from "node:test";
import {
  cloneWorkflowEditorValue,
  formatWorkflowSchedule,
  isWorkflowDirty,
  renderWorkflowTemplate,
  validateWorkflow,
  type WorkflowEditorValue,
} from "./workflow-model";

function workflow(overrides: Partial<WorkflowEditorValue> = {}): WorkflowEditorValue {
  return {
    name: "Singapore advisers",
    enabled: true,
    schedule: {
      days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      time: "08:00",
      timezone: "Asia/Singapore",
    },
    scrapeRecipe: {
      roles: ["Financial adviser"],
      seniorities: ["Director"],
      location: "Singapore",
      companyDomain: null,
      volumePerRun: 300,
      source: "multi_provider",
    },
    emailTemplate: {
      subject: "A quick idea for {{company}}",
      body: "Hi {{first_name}},\n\nWould this help at {{company}}?",
    },
    sendingRules: {
      dailyLimit: 80,
      spacingMinutes: 5,
      window: { start: "09:00", end: "18:00", timezone: "Asia/Singapore" },
    },
    ...overrides,
  };
}

test("formats the all-week schedule in the compact card summary", () => {
  assert.equal(formatWorkflowSchedule(workflow()), "Mon–Sun · 8:00 SGT · 300 contacts");
  assert.equal(
    formatWorkflowSchedule(workflow({ schedule: { days: ["mon", "wed", "fri"], time: "14:30", timezone: "Asia/Singapore" } })),
    "Mon, Wed, Fri · 14:30 SGT · 300 contacts",
  );
});

test("only blocks enablement when seniorities or template content are empty", () => {
  const empty = workflow({
    enabled: true,
    scrapeRecipe: { ...workflow().scrapeRecipe, seniorities: [] },
    emailTemplate: { subject: "", body: "  " },
  });

  assert.deepEqual(validateWorkflow(empty), {
    seniorities: "Choose at least one seniority before enabling this workflow.",
    subject: "Add a subject before enabling this workflow.",
    body: "Add an email body before enabling this workflow.",
  });
  assert.deepEqual(validateWorkflow({ ...empty, enabled: false }), {});
});

test("validates every workflow state required by the documented mutation contract", () => {
  const invalid = workflow({
    name: "   ",
    enabled: false,
    schedule: { days: [], time: "8am", timezone: "Asia/Singapore" },
    scrapeRecipe: { ...workflow().scrapeRecipe, volumePerRun: 0.5 },
    sendingRules: {
      dailyLimit: 0,
      spacingMinutes: 1.5,
      window: { start: "09:00", end: "09:00", timezone: "Asia/Singapore" },
    },
  });

  assert.deepEqual(validateWorkflow(invalid), {
    name: "Enter a workflow name.",
    scheduleDays: "Choose at least one run day.",
    scheduleTime: "Choose a valid run time.",
    volumePerRun: "Volume per run must be a positive whole number.",
    dailyLimit: "Daily send limit must be a positive whole number.",
    spacingMinutes: "Spacing must be a whole number of zero or more minutes.",
    sendWindow: "Sending window start and end must be different.",
  });
});

test("renders known template variables and leaves unknown variables visible", () => {
  assert.equal(
    renderWorkflowTemplate("Hi {{first_name}} from {{company}} — {{unknown}}", {
      first_name: "Avery",
      company: "Northstar",
      role: "Director",
    }),
    "Hi Avery from Northstar — {{unknown}}",
  );
});

test("dirty comparison is value based and cloning isolates nested edits", () => {
  const saved = workflow();
  const current = cloneWorkflowEditorValue(saved);
  assert.equal(isWorkflowDirty(saved, current), false);

  current.schedule.days.pop();
  assert.equal(isWorkflowDirty(saved, current), true);
  assert.equal(saved.schedule.days.length, 7);
});

test("dirty comparison treats chip and day selections as order-independent sets", () => {
  const saved = workflow({
    scrapeRecipe: {
      ...workflow().scrapeRecipe,
      roles: ["Financial adviser", "Wealth manager"],
      seniorities: ["Director", "Partner"],
    },
  });
  const reordered = cloneWorkflowEditorValue(saved);
  reordered.schedule.days.reverse();
  reordered.scrapeRecipe.roles.reverse();
  reordered.scrapeRecipe.seniorities.reverse();

  assert.equal(isWorkflowDirty(saved, reordered), false);
});
