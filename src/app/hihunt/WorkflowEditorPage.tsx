import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CircleAlert, Clock3, Save, Sparkles, X } from "lucide-react";
import {
  Link,
  useBlocker,
  useNavigate,
  useParams,
  type BlockerFunction,
} from "react-router";
import {
  createWorkflow,
  getSettings,
  getWorkflow,
  updateWorkflow,
  type HiHuntSettings,
  type WorkflowRecord,
} from "../../lib/stubs";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  SampleDataPill,
  Skeleton,
  StatusPill,
  toast,
} from "../components/system";
import {
  WORKFLOW_DAYS,
  cloneWorkflowEditorValue,
  isWorkflowDirty,
  renderWorkflowTemplate,
  validateWorkflow,
  type WorkflowDay,
  type WorkflowEditorValue,
  type WorkflowValidationErrors,
} from "./workflow-model";

const DAY_LABELS: Record<WorkflowDay, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

const ROLE_OPTIONS = ["Financial adviser", "Wealth manager", "Insurance adviser", "Relationship manager"];
const SENIORITY_OPTIONS = ["Owner", "Partner", "Director", "Manager", "Senior"];
const TEMPLATE_VARIABLES = ["first_name", "company_name", "role"] as const;
const SAMPLE_CONTACT = {
  first_name: "Avery",
  company: "Northstar Advisory",
  company_name: "Northstar Advisory",
  role: "Partnerships Director",
};

function defaultWorkflow(defaults: HiHuntSettings["outreach"] = {
  senderName: "Hilite",
  signoff: "Warm regards",
  valueProp: "",
}): WorkflowEditorValue {
  return {
    name: "Untitled workflow",
    enabled: false,
    schedule: {
      days: ["mon", "tue", "wed", "thu", "fri"],
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
      subject: "A quick idea for {{company_name}}",
      body: `Hi {{first_name}},\n\nI came across your work at {{company_name}} and thought this could be relevant to your role as {{role}}.\n\nWould you be open to a quick conversation?\n\n${defaults.signoff.trim()},\n${defaults.senderName.trim()}`,
    },
    sendingRules: {
      dailyLimit: 50,
      spacingMinutes: 5,
      window: { start: "09:00", end: "18:00", timezone: "Asia/Singapore" },
    },
  };
}

function fromRecord(workflow: WorkflowRecord): WorkflowEditorValue {
  return {
    name: workflow.name,
    enabled: workflow.enabled,
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Please try again.";
}

type ChipFieldProps = {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (value: string[]) => void;
  readOnly: boolean;
  error?: string;
};

function ChipField({ error, label, onChange, options, readOnly, selected }: ChipFieldProps) {
  const visibleOptions = [...new Set([...options, ...selected])];
  return (
    <fieldset>
      <legend className="text-label font-medium text-ink-2">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {visibleOptions.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              aria-pressed={active}
              className={`min-h-11 rounded-full border px-4 text-chip font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${active ? "border-ink bg-ink text-surface" : "border-line bg-surface-2 text-ink-2 hover:text-ink"}`}
              disabled={readOnly}
              key={option}
              onClick={() => onChange(active ? selected.filter((item) => item !== option) : [...selected, option])}
              type="button"
            >
              {option}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 flex items-center gap-2 text-label text-danger" role="alert"><X aria-hidden="true" className="size-4" />{error}</p>}
    </fieldset>
  );
}

export default function WorkflowEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new";
  const initial = useMemo(() => defaultWorkflow(), []);
  const [saved, setSaved] = useState<WorkflowEditorValue>(initial);
  const [workflow, setWorkflow] = useState<WorkflowEditorValue>(cloneWorkflowEditorValue(initial));
  const [sample, setSample] = useState(false);
  const [defaultSettingsSample, setDefaultSettingsSample] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<WorkflowValidationErrors>({});
  const [templateTarget, setTemplateTarget] = useState<"subject" | "body">("body");
  const confirmedNavigation = useRef(false);
  const allowSavedNavigation = useRef(false);
  const dirty = isWorkflowDirty(saved, workflow);
  const blockNavigation = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => {
    const currentUrl = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`;
    const nextUrl = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;
    return !allowSavedNavigation.current && dirty && currentUrl !== nextUrl;
  }, [dirty]);
  const blocker = useBlocker(blockNavigation);

  const load = useCallback(() => {
    allowSavedNavigation.current = false;
    confirmedNavigation.current = false;
    setValidation({});
    setTemplateTarget("body");
    setDefaultSettingsSample(false);
    if (!id) {
      setError("This workflow could not be opened.");
      setLoading(false);
      return () => undefined;
    }
    if (isNew) {
      let active = true;
      setSample(false);
      setError("");
      setLoading(true);
      getSettings()
        .then((result) => {
          if (!active) return;
          const value = defaultWorkflow(result.data.outreach);
          setSaved(value);
          setWorkflow(cloneWorkflowEditorValue(value));
          setDefaultSettingsSample(result.sample);
        })
        .catch((nextError) => {
          if (active) setError(`Default email settings are unavailable. ${errorMessage(nextError)}`);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => { active = false; };
    }
    let active = true;
    setLoading(true);
    setError("");
    getWorkflow(id)
      .then((result) => {
        if (!active) return;
        if (!result.data) {
          setError("This workflow was not found.");
          return;
        }
        const value = fromRecord(result.data);
        setSaved(value);
        setWorkflow(cloneWorkflowEditorValue(value));
        setSample(result.sample);
      })
      .catch((nextError) => {
        if (active) setError(errorMessage(nextError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [id, isNew]);

  useEffect(() => load(), [load]);
  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const update = (apply: (current: WorkflowEditorValue) => WorkflowEditorValue) => {
    setWorkflow((current) => apply(current));
  };

  const toggleEnabled = () => {
    const candidate = { ...workflow, enabled: !workflow.enabled };
    if (candidate.enabled) {
      const errors = validateWorkflow(candidate);
      if (Object.keys(errors).length > 0) {
        setValidation(errors);
        toast.error("Complete the workflow before enabling it", {
          description: "Resolve the highlighted workflow fields first.",
        });
        return;
      }
    }
    setValidation({});
    setWorkflow(candidate);
  };

  const insertVariable = (variable: typeof TEMPLATE_VARIABLES[number]) => {
    const token = `{{${variable}}}`;
    update((current) => ({
      ...current,
      emailTemplate: {
        ...current.emailTemplate,
        [templateTarget]: `${current.emailTemplate[templateTarget]}${current.emailTemplate[templateTarget] ? " " : ""}${token}`,
      },
    }));
  };

  const save = async () => {
    const errors = validateWorkflow(workflow);
    setValidation(errors);
    if (Object.keys(errors).length > 0) {
      toast.error("Workflow is not ready to save", { description: "Resolve the highlighted workflow fields." });
      return;
    }
    if (sample) {
      toast.error("Sample workflows are read-only. No changes were saved.");
      return;
    }
    setSaving(true);
    try {
      const result = isNew
        ? await createWorkflow(workflow)
        : await updateWorkflow(id ?? "", workflow);
      const value = fromRecord(result.data);
      setSaved(value);
      setWorkflow(cloneWorkflowEditorValue(value));
      toast.success(isNew ? "Workflow created." : "Workflow saved.");
      if (isNew) {
        allowSavedNavigation.current = true;
        navigate(`/hihunt/workflows/${encodeURIComponent(result.data.id)}`, { replace: true });
      }
    } catch (nextError) {
      toast.error(isNew ? "Workflow could not be created" : "Workflow could not be saved", {
        description: errorMessage(nextError),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7"><Skeleton label="Loading workflow" rows={5} variant="cards" /></main>;
  }

  if (error) {
    return (
      <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7">
        <EmptyState
          action={<><Button onClick={load} variant="secondary">Try again</Button><Button asChild variant="ghost"><Link to="/hihunt/workflows">Back to workflows</Link></Button></>}
          icon={CircleAlert}
          message={error}
        />
      </main>
    );
  }

  const currentValidation = validateWorkflow(workflow);
  const readOnly = sample || saving;
  const saveDisabled = readOnly || Object.keys(currentValidation).length > 0;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7" data-slot="workflow-editor-page">
      <div className="mx-auto max-w-6xl space-y-6">
        <Button asChild size="sm" variant="ghost">
          <Link to="/hihunt/workflows"><ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />Workflows</Link>
        </Button>
        <PageHeader
          actions={(
            <button
              aria-checked={workflow.enabled}
              aria-label={`${workflow.enabled ? "Disable" : "Enable"} workflow`}
              className={`inline-flex min-h-11 items-center gap-3 rounded-full border border-line px-3 pr-4 text-body font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-45 ${workflow.enabled ? "bg-ink text-surface" : "bg-surface text-ink-2"}`}
              disabled={readOnly}
              onClick={toggleEnabled}
              role="switch"
              type="button"
            >
              <span className={`size-7 rounded-full ${workflow.enabled ? "bg-accent" : "bg-ink-3"}`} />
              {workflow.enabled ? "On" : "Off"}
            </button>
          )}
          meta={<span className="inline-flex items-center gap-2"><StatusPill label={workflow.enabled ? "Active" : "Paused"} status={workflow.enabled ? "running" : "paused"} />{sample && <SampleDataPill label="Read-only sample" />}</span>}
          subtitle="Configure discovery and drafting here. Review and approve every prepared email from Home."
          title={isNew ? "New workflow" : workflow.name}
        />

        {sample && (
          <div className="flex items-start gap-3 rounded-control border border-line bg-surface-2 p-4 text-body text-ink-2" role="status">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            This labelled sample is read-only. Connect the workflow service to save or change its status.
          </div>
        )}

        {defaultSettingsSample && (
          <div className="flex items-start gap-3 rounded-control border border-line bg-surface-2 p-4 text-body text-ink-2" role="status">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            The settings endpoint is not connected, so this new workflow started with labelled fallback email defaults. Review the editable template before saving.
          </div>
        )}

        <label className="block rounded-card border border-line bg-surface p-4 text-label font-medium text-ink-2 md:p-6">
          Workflow name
          <input
            aria-invalid={Boolean(validation.name ?? currentValidation.name)}
            className="mt-2 h-11 w-full rounded-control border border-line bg-surface-2 px-3 text-body font-medium text-ink outline-none focus:ring-3 focus:ring-ring/40"
            disabled={readOnly}
            onChange={(event) => { setValidation((current) => ({ ...current, name: undefined })); update((current) => ({ ...current, name: event.target.value })); }}
            value={workflow.name}
          />
          {(validation.name ?? currentValidation.name) && <span className="mt-2 flex items-center gap-2 text-label text-danger" role="alert"><X aria-hidden="true" className="size-4" />{validation.name ?? currentValidation.name}</span>}
        </label>

        <Card description="Choose when the connected providers prepare the next contact set." title="Schedule">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Run days">
            {WORKFLOW_DAYS.map((day) => {
              const active = workflow.schedule.days.includes(day);
              return (
                <button
                  aria-pressed={active}
                  className={`min-h-11 min-w-14 rounded-full border px-3 text-chip font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${active ? "border-ink bg-ink text-surface" : "border-line bg-surface-2 text-ink-2"}`}
                    disabled={readOnly}
                  key={day}
                  onClick={() => { setValidation((current) => ({ ...current, scheduleDays: undefined })); update((current) => ({
                      ...current,
                      schedule: {
                        ...current.schedule,
                        days: active ? current.schedule.days.filter((item) => item !== day) : [...current.schedule.days, day],
                      },
                    })); }}
                  type="button"
                >
                  {DAY_LABELS[day]}
                </button>
              );
            })}
          </div>
          {(validation.scheduleDays ?? currentValidation.scheduleDays) && <p className="mt-2 flex items-center gap-2 text-label text-danger" role="alert"><X aria-hidden="true" className="size-4" />{validation.scheduleDays ?? currentValidation.scheduleDays}</p>}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-label font-medium text-ink-2">Run time
                <input aria-invalid={Boolean(validation.scheduleTime ?? currentValidation.scheduleTime)} className="mt-2 h-11 w-full rounded-control border border-line bg-surface-2 px-3 text-body tabular-nums text-ink outline-none focus:ring-3 focus:ring-ring/40" disabled={readOnly} onChange={(event) => { setValidation((current) => ({ ...current, scheduleTime: undefined })); update((current) => ({ ...current, schedule: { ...current.schedule, time: event.target.value } })); }} type="time" value={workflow.schedule.time} />
                {(validation.scheduleTime ?? currentValidation.scheduleTime) && <span className="mt-2 flex items-center gap-2 text-label text-danger" role="alert"><X aria-hidden="true" className="size-4" />{validation.scheduleTime ?? currentValidation.scheduleTime}</span>}
            </label>
            <div className="rounded-control bg-surface-2 p-3">
              <p className="text-label font-medium text-ink-2">Timezone</p>
              <p className="mt-1 flex items-center gap-2 text-body text-ink"><Clock3 aria-hidden="true" className="size-4" strokeWidth={1.75} />Singapore time (SGT)</p>
            </div>
          </div>
        </Card>

        <Card description="Define who the connected providers should look for and how many contacts to prepare." title="Scrape recipe">
          <div className="space-y-5">
            <ChipField label="Roles" onChange={(roles) => update((current) => ({ ...current, scrapeRecipe: { ...current.scrapeRecipe, roles } }))} options={ROLE_OPTIONS} readOnly={readOnly} selected={workflow.scrapeRecipe.roles} />
            <ChipField error={validation.seniorities ?? currentValidation.seniorities} label="Seniorities" onChange={(seniorities) => { setValidation((current) => ({ ...current, seniorities: undefined })); update((current) => ({ ...current, scrapeRecipe: { ...current.scrapeRecipe, seniorities } })); }} options={SENIORITY_OPTIONS} readOnly={readOnly} selected={workflow.scrapeRecipe.seniorities} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-label font-medium text-ink-2">Location
                <input className="mt-2 h-11 w-full rounded-control border border-line bg-surface-2 px-3 text-body text-ink outline-none focus:ring-3 focus:ring-ring/40" disabled={readOnly} onChange={(event) => update((current) => ({ ...current, scrapeRecipe: { ...current.scrapeRecipe, location: event.target.value } }))} value={workflow.scrapeRecipe.location} />
              </label>
              <label className="text-label font-medium text-ink-2">Volume per run
                <input aria-invalid={Boolean(validation.volumePerRun ?? currentValidation.volumePerRun)} className="mt-2 h-11 w-full rounded-control border border-line bg-surface-2 px-3 text-body tabular-nums text-ink outline-none focus:ring-3 focus:ring-ring/40" disabled={readOnly} min={1} onChange={(event) => { setValidation((current) => ({ ...current, volumePerRun: undefined })); update((current) => ({ ...current, scrapeRecipe: { ...current.scrapeRecipe, volumePerRun: Number(event.target.value) } })); }} step={1} type="number" value={workflow.scrapeRecipe.volumePerRun} />
                {(validation.volumePerRun ?? currentValidation.volumePerRun) && <span className="mt-2 flex items-center gap-2 text-label text-danger" role="alert"><X aria-hidden="true" className="size-4" />{validation.volumePerRun ?? currentValidation.volumePerRun}</span>}
              </label>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-control bg-surface-2 p-4">
              <div><p className="text-label font-medium text-ink">Source</p><p className="mt-1 text-chip text-ink-2">Contact discovery provider</p></div>
              <StatusPill label="Multi-provider" status="running" />
            </div>
          </div>
        </Card>

        <Card description="Use variables to personalise the draft, then check it against the sample contact." title="Email template">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
            <div className="space-y-4">
              <label className="block text-label font-medium text-ink-2">Subject
                <input aria-invalid={Boolean(validation.subject ?? currentValidation.subject)} className="mt-2 h-11 w-full rounded-control border border-line bg-surface-2 px-3 text-body text-ink outline-none focus:ring-3 focus:ring-ring/40" disabled={readOnly} onChange={(event) => { setValidation((current) => ({ ...current, subject: undefined })); update((current) => ({ ...current, emailTemplate: { ...current.emailTemplate, subject: event.target.value } })); }} onFocus={() => setTemplateTarget("subject")} value={workflow.emailTemplate.subject} />
              </label>
              {(validation.subject ?? currentValidation.subject) && <p className="flex items-center gap-2 text-label text-danger" role="alert"><X aria-hidden="true" className="size-4" />{validation.subject ?? currentValidation.subject}</p>}
              <label className="block text-label font-medium text-ink-2">Body
                <textarea aria-invalid={Boolean(validation.body ?? currentValidation.body)} className="mt-2 min-h-48 w-full resize-y rounded-control border border-line bg-surface-2 p-3 text-body leading-6 text-ink outline-none focus:ring-3 focus:ring-ring/40" disabled={readOnly} onChange={(event) => { setValidation((current) => ({ ...current, body: undefined })); update((current) => ({ ...current, emailTemplate: { ...current.emailTemplate, body: event.target.value } })); }} onFocus={() => setTemplateTarget("body")} value={workflow.emailTemplate.body} />
              </label>
              {(validation.body ?? currentValidation.body) && <p className="flex items-center gap-2 text-label text-danger" role="alert"><X aria-hidden="true" className="size-4" />{validation.body ?? currentValidation.body}</p>}
              <div>
                <p className="text-label font-medium text-ink-2">Insert variable</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TEMPLATE_VARIABLES.map((variable) => <Button disabled={readOnly} key={variable} onClick={() => insertVariable(variable)} size="sm" variant="secondary">{`{{${variable}}}`}</Button>)}
                </div>
              </div>
            </div>
            <section aria-labelledby="workflow-preview-title" className="rounded-card bg-surface-2 p-4 md:p-5">
              <div className="flex items-center gap-2"><Sparkles aria-hidden="true" className="size-4" strokeWidth={1.75} /><h3 className="text-card-title font-medium text-ink" id="workflow-preview-title">Live preview</h3></div>
              <p className="mt-1 text-chip text-ink-2">Avery Tan · Partnerships Director · Northstar Advisory</p>
              <div className="mt-4 rounded-control bg-surface p-4">
                <p className="text-chip font-medium uppercase tracking-wide text-ink-3">Subject</p>
                <p className="mt-2 text-body font-medium text-ink">{renderWorkflowTemplate(workflow.emailTemplate.subject, SAMPLE_CONTACT) || "No subject yet"}</p>
                <div className="my-4 border-t border-line" />
                <p className="whitespace-pre-wrap text-body leading-6 text-ink">{renderWorkflowTemplate(workflow.emailTemplate.body, SAMPLE_CONTACT) || "No email body yet"}</p>
              </div>
            </section>
          </div>
        </Card>

        <Card description="Control the pace and window used once a batch is approved." title="Sending rules">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-label font-medium text-ink-2">Daily send limit
              <input aria-invalid={Boolean(validation.dailyLimit ?? currentValidation.dailyLimit)} className="mt-2 h-11 w-full rounded-control border border-line bg-surface-2 px-3 text-body tabular-nums text-ink outline-none focus:ring-3 focus:ring-ring/40" disabled={readOnly} min={1} onChange={(event) => { setValidation((current) => ({ ...current, dailyLimit: undefined })); update((current) => ({ ...current, sendingRules: { ...current.sendingRules, dailyLimit: Number(event.target.value) } })); }} step={1} type="number" value={workflow.sendingRules.dailyLimit} />
              {(validation.dailyLimit ?? currentValidation.dailyLimit) && <span className="mt-2 flex items-center gap-2 text-label text-danger" role="alert"><X aria-hidden="true" className="size-4" />{validation.dailyLimit ?? currentValidation.dailyLimit}</span>}
            </label>
            <label className="text-label font-medium text-ink-2">Spacing (minutes)
              <input aria-invalid={Boolean(validation.spacingMinutes ?? currentValidation.spacingMinutes)} className="mt-2 h-11 w-full rounded-control border border-line bg-surface-2 px-3 text-body tabular-nums text-ink outline-none focus:ring-3 focus:ring-ring/40" disabled={readOnly} min={0} onChange={(event) => { setValidation((current) => ({ ...current, spacingMinutes: undefined })); update((current) => ({ ...current, sendingRules: { ...current.sendingRules, spacingMinutes: Number(event.target.value) } })); }} step={1} type="number" value={workflow.sendingRules.spacingMinutes} />
              {(validation.spacingMinutes ?? currentValidation.spacingMinutes) && <span className="mt-2 flex items-center gap-2 text-label text-danger" role="alert"><X aria-hidden="true" className="size-4" />{validation.spacingMinutes ?? currentValidation.spacingMinutes}</span>}
            </label>
            <label className="text-label font-medium text-ink-2">Window start
              <input aria-invalid={Boolean(validation.sendWindow ?? currentValidation.sendWindow)} className="mt-2 h-11 w-full rounded-control border border-line bg-surface-2 px-3 text-body tabular-nums text-ink outline-none focus:ring-3 focus:ring-ring/40" disabled={readOnly} onChange={(event) => { setValidation((current) => ({ ...current, sendWindow: undefined })); update((current) => ({ ...current, sendingRules: { ...current.sendingRules, window: { ...current.sendingRules.window, start: event.target.value } } })); }} type="time" value={workflow.sendingRules.window.start} />
            </label>
            <label className="text-label font-medium text-ink-2">Window end · SGT
              <input aria-invalid={Boolean(validation.sendWindow ?? currentValidation.sendWindow)} className="mt-2 h-11 w-full rounded-control border border-line bg-surface-2 px-3 text-body tabular-nums text-ink outline-none focus:ring-3 focus:ring-ring/40" disabled={readOnly} onChange={(event) => { setValidation((current) => ({ ...current, sendWindow: undefined })); update((current) => ({ ...current, sendingRules: { ...current.sendingRules, window: { ...current.sendingRules.window, end: event.target.value } } })); }} type="time" value={workflow.sendingRules.window.end} />
            </label>
          </div>
          {(validation.sendWindow ?? currentValidation.sendWindow) && <p className="mt-2 flex items-center gap-2 text-label text-danger" role="alert"><X aria-hidden="true" className="size-4" />{validation.sendWindow ?? currentValidation.sendWindow}</p>}
        </Card>

        {(isNew || dirty) && (
          <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-card border border-line bg-surface p-3 shadow-shell sm:flex-row sm:items-center sm:justify-between md:p-4" data-slot="workflow-save-bar">
            <div><p className="text-body font-medium text-ink">Unsaved workflow changes</p><p className="mt-0.5 text-chip text-ink-2">Save or discard them before leaving this page.</p></div>
            <div className="flex items-center gap-2">
              <Button disabled={saving} onClick={() => { setWorkflow(cloneWorkflowEditorValue(saved)); setValidation({}); }} size="sm" variant="ghost">Discard</Button>
              <Button disabled={saveDisabled} loading={saving} onClick={() => void save()} size="sm">{!saving && <Save aria-hidden="true" className="size-4" strokeWidth={1.75} />}{isNew ? "Create workflow" : "Save changes"}</Button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        confirmLabel="Discard and leave"
        description="Your unsaved workflow changes will be lost."
        onConfirm={() => {
          if (blocker.state !== "blocked") return;
          confirmedNavigation.current = true;
          blocker.proceed();
        }}
        onOpenChange={(open) => {
          if (open) return;
          if (confirmedNavigation.current) {
            confirmedNavigation.current = false;
            return;
          }
          if (blocker.state === "blocked") blocker.reset();
        }}
        open={blocker.state === "blocked"}
        pending={saving}
        title="Discard unsaved changes?"
        variant="destructive"
      />
    </main>
  );
}
