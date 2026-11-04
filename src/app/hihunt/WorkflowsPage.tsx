import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CircleAlert, Clock3, Plus, Workflow } from "lucide-react";
import { Link } from "react-router";
import {
  getWorkflows,
  updateWorkflow,
  type WorkflowRecord,
} from "../../lib/stubs";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  SampleDataPill,
  Skeleton,
  StatusPill,
  toast,
} from "../components/system";
import {
  formatWorkflowSchedule,
  validateWorkflow,
  type WorkflowEditorValue,
} from "./workflow-model";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Please try again.";
}

function editorValue(workflow: WorkflowRecord): WorkflowEditorValue {
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

function formatRunTime(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Singapore",
  }).format(date);
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [sample, setSample] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError("");
    getWorkflows()
      .then((result) => {
        if (!active) return;
        setWorkflows(result.data);
        setSample(result.sample);
      })
      .catch((nextError) => {
        if (active) setError(errorMessage(nextError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => load(), [load]);

  const toggleWorkflow = async (workflow: WorkflowRecord) => {
    if (sample || updatingId) {
      if (updatingId) return;
      toast.error("Sample workflows are read-only. No status was changed.");
      return;
    }
    const enabled = !workflow.enabled;
    if (enabled) {
      const validation = validateWorkflow({ ...editorValue(workflow), enabled: true });
      if (Object.keys(validation).length > 0) {
        toast.error("This workflow is not ready to enable", {
          description: "Open it and add at least one seniority, a subject, and an email body.",
        });
        return;
      }
    }

    setUpdatingId(workflow.id);
    try {
      const result = await updateWorkflow(workflow.id, { enabled });
      setWorkflows((current) => current.map((item) => item.id === workflow.id ? result.data : item));
      toast.success(`${workflow.name} turned ${enabled ? "on" : "off"}.`);
    } catch (nextError) {
      toast.error(`Workflow could not be turned ${enabled ? "on" : "off"}`, {
        description: errorMessage(nextError),
      });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7" data-slot="hihunt-workflows-page">
      <div className="space-y-6">
        <PageHeader
          actions={sample ? (
            <Button disabled>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
              New workflow
            </Button>
          ) : (
            <Button asChild>
              <Link to="/hihunt/workflows/new">
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                New workflow
              </Link>
            </Button>
          )}
          subtitle="Set the scrape recipe and email sequence once; review every drafted batch from Home before it sends."
          title="Workflows"
        />

        {sample && (
          <div className="flex items-start gap-3 rounded-control border border-line bg-surface-2 p-4 text-body text-ink-2" role="status">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            <span>This labelled sample is read-only. Connect the workflow service to create, edit, enable, or disable workflows.</span>
          </div>
        )}

        {loading ? (
          <Skeleton label="Loading workflows" rows={4} variant="cards" />
        ) : error ? (
          <EmptyState
            action={<Button onClick={load} variant="secondary">Try again</Button>}
            icon={CircleAlert}
            message={error}
          />
        ) : workflows.length === 0 ? (
          <Card>
            <EmptyState
              action={sample
                ? <Button disabled>Create workflow</Button>
                : <Button asChild><Link to="/hihunt/workflows/new">Create workflow</Link></Button>}
              icon={Workflow}
              message="No workflows yet"
            />
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {workflows.map((workflow) => (
              <Card
                action={sample ? <SampleDataPill label="Read-only sample" /> : undefined}
                className="flex min-h-64 flex-col"
                key={workflow.id}
              >
                <div className="flex items-start gap-4">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-lavender text-ink">
                    <Workflow aria-hidden="true" className="size-5" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-section-title font-medium text-ink">{workflow.name}</h2>
                      <StatusPill label={workflow.enabled ? "Active" : "Paused"} status={workflow.enabled ? "running" : "paused"} />
                    </div>
                    <p className="mt-2 text-label text-ink-2">{formatWorkflowSchedule(editorValue(workflow))}</p>
                  </div>
                  <button
                    aria-checked={workflow.enabled}
                    aria-label={`${workflow.enabled ? "Disable" : "Enable"} ${workflow.name}`}
                    className={`relative inline-flex h-11 w-16 shrink-0 items-center rounded-full border border-line p-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-45 ${workflow.enabled ? "bg-ink" : "bg-surface-2"}`}
                    disabled={sample || updatingId !== null}
                    onClick={() => void toggleWorkflow(workflow)}
                    role="switch"
                    type="button"
                  >
                    <span className={`size-8 rounded-full transition-transform ${workflow.enabled ? "translate-x-6 bg-accent" : "translate-x-0 bg-ink-3"}`} />
                  </button>
                </div>

                <div className="mt-5 grid gap-3 rounded-card bg-surface-2 p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-chip text-ink-2">Last run</p>
                    <p className="mt-1 text-label font-medium tabular-nums text-ink">{formatRunTime(workflow.lastRun?.completedAt ?? workflow.lastRun?.startedAt)}</p>
                  </div>
                  <div>
                    <p className="text-chip text-ink-2">Next run</p>
                    <p className="mt-1 text-label font-medium tabular-nums text-ink">{formatRunTime(workflow.nextRunAt)}</p>
                  </div>
                  <div>
                    <p className="text-chip text-ink-2">Drafted today</p>
                    <p className="mt-1 text-label font-medium tabular-nums text-ink">{workflow.draftedToday}</p>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                  <p className="flex items-center gap-2 text-chip text-ink-2">
                    <Clock3 aria-hidden="true" className="size-4" strokeWidth={1.75} />
                    {workflow.scrapeRecipe.source === "multi_provider" ? "Multi-provider source" : "Apollo source (legacy)"}
                  </p>
                  <Button asChild size="sm" variant="secondary">
                    <Link to={`/hihunt/workflows/${encodeURIComponent(workflow.id)}`}>
                      Edit workflow
                      <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
