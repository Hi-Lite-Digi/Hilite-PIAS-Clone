import type { WorkflowDay, WorkflowDefinition } from "../../lib/stubs";

export const WORKFLOW_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const satisfies readonly WorkflowDay[];
export type { WorkflowDay };

export type WorkflowEditorValue = WorkflowDefinition & { enabled: boolean };

export type WorkflowValidationErrors = Partial<Record<
  | "name"
  | "scheduleDays"
  | "scheduleTime"
  | "seniorities"
  | "subject"
  | "body"
  | "volumePerRun"
  | "dailyLimit"
  | "spacingMinutes"
  | "sendWindow",
  string
>>;

const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const DAY_LABELS: Record<WorkflowDay, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

function displayTime(time: string): string {
  return time.replace(/^0(?=\d:)/, "");
}

export function formatWorkflowSchedule(workflow: WorkflowEditorValue): string {
  const uniqueDays = WORKFLOW_DAYS.filter((day) => workflow.schedule.days.includes(day));
  const days = uniqueDays.length === WORKFLOW_DAYS.length
    ? "Mon–Sun"
    : uniqueDays.map((day) => DAY_LABELS[day]).join(", ") || "No days";
  const contactLabel = workflow.scrapeRecipe.volumePerRun === 1 ? "contact" : "contacts";
  return `${days} · ${displayTime(workflow.schedule.time)} SGT · ${workflow.scrapeRecipe.volumePerRun} ${contactLabel}`;
}

export function validateWorkflow(workflow: WorkflowEditorValue): WorkflowValidationErrors {
  const errors: WorkflowValidationErrors = {};
  if (!workflow.name.trim()) {
    errors.name = "Enter a workflow name.";
  }
  if (workflow.schedule.days.length === 0) {
    errors.scheduleDays = "Choose at least one run day.";
  } else if (new Set(workflow.schedule.days).size !== workflow.schedule.days.length) {
    errors.scheduleDays = "Choose each run day only once.";
  }
  if (!CLOCK_TIME.test(workflow.schedule.time)) {
    errors.scheduleTime = "Choose a valid run time.";
  }
  if (!Number.isInteger(workflow.scrapeRecipe.volumePerRun) || workflow.scrapeRecipe.volumePerRun <= 0) {
    errors.volumePerRun = "Volume per run must be a positive whole number.";
  }
  if (!Number.isInteger(workflow.sendingRules.dailyLimit) || workflow.sendingRules.dailyLimit <= 0) {
    errors.dailyLimit = "Daily send limit must be a positive whole number.";
  }
  if (!Number.isInteger(workflow.sendingRules.spacingMinutes) || workflow.sendingRules.spacingMinutes < 0) {
    errors.spacingMinutes = "Spacing must be a whole number of zero or more minutes.";
  }
  const { start, end } = workflow.sendingRules.window;
  if (!CLOCK_TIME.test(start) || !CLOCK_TIME.test(end)) {
    errors.sendWindow = "Choose valid sending window times.";
  } else if (start === end) {
    errors.sendWindow = "Sending window start and end must be different.";
  }
  if (workflow.enabled && !workflow.scrapeRecipe.seniorities.some((seniority) => seniority.trim())) {
    errors.seniorities = "Choose at least one seniority before enabling this workflow.";
  }
  if (workflow.enabled && !workflow.emailTemplate.subject.trim()) {
    errors.subject = "Add a subject before enabling this workflow.";
  }
  if (workflow.enabled && !workflow.emailTemplate.body.trim()) {
    errors.body = "Add an email body before enabling this workflow.";
  }
  return errors;
}

export function renderWorkflowTemplate(
  template: string,
  sample: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => sample[key] ?? match);
}

export function cloneWorkflowEditorValue(workflow: WorkflowEditorValue): WorkflowEditorValue {
  return {
    ...workflow,
    schedule: { ...workflow.schedule, days: [...workflow.schedule.days] },
    scrapeRecipe: {
      ...workflow.scrapeRecipe,
      roles: [...workflow.scrapeRecipe.roles],
      seniorities: [...workflow.scrapeRecipe.seniorities],
    },
    emailTemplate: { ...workflow.emailTemplate },
    sendingRules: { ...workflow.sendingRules, window: { ...workflow.sendingRules.window } },
  };
}

export function isWorkflowDirty(saved: WorkflowEditorValue, current: WorkflowEditorValue): boolean {
  const canonical = (workflow: WorkflowEditorValue) => {
    const value = cloneWorkflowEditorValue(workflow);
    value.schedule.days.sort((left, right) => WORKFLOW_DAYS.indexOf(left) - WORKFLOW_DAYS.indexOf(right));
    value.scrapeRecipe.roles.sort((left, right) => left.localeCompare(right));
    value.scrapeRecipe.seniorities.sort((left, right) => left.localeCompare(right));
    return value;
  };
  return JSON.stringify(canonical(saved)) !== JSON.stringify(canonical(current));
}
