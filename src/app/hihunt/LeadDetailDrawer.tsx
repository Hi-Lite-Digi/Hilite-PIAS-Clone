import { useEffect, useRef, useState } from "react";
import { Building2, ExternalLink, Linkedin, Mail, MapPin, ShieldOff, UserRound } from "lucide-react";
import { Link } from "react-router";
import { updateHiHuntLeadStatus } from "../../lib/stubs";
import { Button, ConfirmDialog, Drawer, EmptyState, SampleDataPill, StatusPill, toast } from "../components/system";
import {
  getLeadHistoryPresentation,
  leadStatusTone,
  type HiHuntLeadRow,
  type HiHuntLeadStatus,
  type LeadHistorySources,
} from "./leads-model";
import { hasSendableHRWorkEmail } from "./prospect-eligibility";

type LeadDetailDrawerProps = {
  lead: HiHuntLeadRow | null;
  historyError: string | null;
  historySources: LeadHistorySources;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (id: string, status: HiHuntLeadStatus) => void;
};

function LeadDetailDrawer({ historyError, historySources, lead, onOpenChange, onStatusChange }: LeadDetailDrawerProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const mutationRequest = useRef(0);
  const statusMutationVersion = useRef<Record<string, number>>({});
  const historyPresentation = getLeadHistoryPresentation(historySources);

  useEffect(() => {
    mutationRequest.current += 1;
    setBusy(false);
    setConfirmOpen(false);
  }, [lead?.prospect.id]);
  useEffect(() => () => { mutationRequest.current += 1; }, []);

  const changeStatus = async (target: HiHuntLeadRow, nextStatus: HiHuntLeadStatus, successMessage: string) => {
    const request = ++mutationRequest.current;
    const statusVersion = (statusMutationVersion.current[target.prospect.id] ?? 0) + 1;
    statusMutationVersion.current[target.prospect.id] = statusVersion;
    setBusy(true);
    try {
      await updateHiHuntLeadStatus(target.prospect.id, nextStatus);
      const isLatestStatusMutation = statusMutationVersion.current[target.prospect.id] === statusVersion;
      if (isLatestStatusMutation) onStatusChange(target.prospect.id, nextStatus);
      if (request !== mutationRequest.current || !isLatestStatusMutation) return false;
      toast.success(successMessage);
      return true;
    } catch (error) {
      if (request !== mutationRequest.current) return false;
      toast.error(error instanceof Error ? error.message : "The contact status could not be changed.");
      return false;
    } finally {
      if (request === mutationRequest.current) setBusy(false);
    }
  };

  const suppress = async () => {
    if (!lead?.status || lead.status === "suppressed") return;
    const previousStatus: HiHuntLeadStatus = lead.status;
    const target = lead;
    const updated = await changeStatus(target, "suppressed", `${target.prospect.full_name} was suppressed.`);
    if (!updated) return;
    setConfirmOpen(false);
    toast.success("Future outreach is blocked for this contact.", {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => { void changeStatus(target, previousStatus, `${target.prospect.full_name} was restored.`); },
      },
    });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      mutationRequest.current += 1;
      setBusy(false);
      setConfirmOpen(false);
    }
    onOpenChange(open);
  };

  return (
    <>
      <Drawer
        description={lead ? `${lead.prospect.job_title}${lead.prospect.company_name ? ` at ${lead.prospect.company_name}` : ""}` : undefined}
        footer={lead?.status && lead.status !== "suppressed" ? (
          <Button loading={busy} onClick={() => setConfirmOpen(true)} variant="destructive">
            <ShieldOff aria-hidden="true" className="size-4" strokeWidth={1.75} />Suppress
          </Button>
        ) : undefined}
        onOpenChange={handleOpenChange}
        open={lead !== null}
        title={lead?.prospect.full_name ?? "Contact details"}
      >
        {lead && (
          <div className="space-y-6">
            <section aria-labelledby="profile-heading">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-card-title font-medium text-ink" id="profile-heading">Profile</h3>
                {lead.status
                  ? <StatusPill label={lead.status} status={leadStatusTone[lead.status]} />
                  : <StatusPill label="Status unavailable" status="error" />}
              </div>
              <div className="mt-3 space-y-3 rounded-card bg-surface-2 p-4 text-body">
                <p className="flex items-start gap-2 text-ink"><UserRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.75} /><span>{lead.prospect.job_title}{lead.prospect.seniority ? ` · ${lead.prospect.seniority}` : ""}</span></p>
                <p className="flex items-start gap-2 text-ink"><Building2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.75} /><span>{lead.prospect.company_name || "Company unavailable"}{lead.prospect.company_domain ? ` · ${lead.prospect.company_domain}` : ""}</span></p>
                <p className="flex items-start gap-2 text-ink"><Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.75} /><span className="break-all">{lead.prospect.work_email || "No work email"}</span></p>
                <p className="flex items-start gap-2 text-ink"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.75} /><span>{lead.prospect.location || "Location unavailable"}</span></p>
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <StatusPill label={lead.verification.label} status={lead.verification.tone} />
                  {lead.status !== "suppressed" && hasSendableHRWorkEmail(lead.prospect) && (
                    <Button asChild size="sm">
                      <Link to={`/hihunt/campaigns/new?prospectId=${encodeURIComponent(lead.prospect.id)}`}>
                        <Mail aria-hidden="true" className="size-4" strokeWidth={1.75} />Email campaign
                      </Link>
                    </Button>
                  )}
                  {lead.prospect.linkedin_url && (
                    <Button asChild size="sm" variant="secondary"><a href={lead.prospect.linkedin_url} rel="noreferrer" target="_blank"><Linkedin aria-hidden="true" className="size-4" strokeWidth={1.75} />LinkedIn</a></Button>
                  )}
                </div>
              </div>
              <div className="mt-3 rounded-control border border-line p-4">
                <p className="text-label font-medium text-ink">Why this contact matched</p>
                <p className="mt-1 text-body text-ink-2">{lead.prospect.hr_match_reason || "No match explanation was provided."}</p>
                {lead.prospect.provider === "public_web" && <p className="mt-2 text-label text-ink-2">Public listing · not verified for delivery or consent.{lead.prospect.name_source === "email-local-part" ? " Name inferred from the email address." : ""}</p>}
                {lead.prospect.provider === "public_web" && lead.prospect.source_url && /^https:\/\//i.test(lead.prospect.source_url) && <a className="mt-2 inline-block text-label underline" href={lead.prospect.source_url} target="_blank" rel="noreferrer">View public source</a>}
                {!lead.status && <p className="mt-3 text-label text-danger">Suppression is unavailable until live outreach status has loaded.</p>}
              </div>
            </section>

            <section aria-labelledby="email-history-heading">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-card-title font-medium text-ink" id="email-history-heading">Email history</h3>
                {historyPresentation.showSample && <SampleDataPill />}
              </div>
              {historyPresentation.state === "error" && (
                <div className="mt-3 rounded-control border border-danger/20 bg-danger/10 p-3 text-label text-ink-2" role="alert">
                  <p className="font-medium text-danger">Email history is incomplete</p>
                  <p className="mt-1">{historyError || "One or more live email-history sources could not be loaded."}</p>
                </div>
              )}
              {historyPresentation.state === "sample" && (
                <div className="mt-3 rounded-control border border-lavender bg-lavender/30 p-3 text-label text-ink-2" role="status">
                  Live email history is unavailable for one or more sources. Sample records were not mixed into this contact.
                </div>
              )}
              {historyPresentation.loading && (
                <div className="mt-3 rounded-control border border-line bg-surface-2 p-3 text-label text-ink-2" role="status">
                  Refreshing email history…
                </div>
              )}
              {lead.history.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {lead.history.map((item) => {
                    const content = (
                      <>
                        <span className="min-w-0"><span className="block truncate text-body font-medium text-ink">{item.subject}</span><span className="mt-0.5 block text-chip text-ink-2">{item.workflowName} · {new Date(item.occurredAt).toLocaleString("en-SG")}</span></span>
                        {item.threadId && <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />}
                      </>
                    );
                    return item.threadId ? (
                      <Link className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-line px-3 py-3 outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/50" key={item.id} to={`/hihunt/inbox/${encodeURIComponent(item.threadId)}`}>{content}</Link>
                    ) : <div className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-line px-3 py-3" key={item.id}>{content}</div>;
                  })}
                </div>
              ) : historyPresentation.complete ? (
                <EmptyState className="mt-3 min-h-32" icon={Mail} message="No outreach email history yet." />
              ) : null}
            </section>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        confirmLabel="Suppress lead"
        description={lead ? `This blocks future Hi-Hunt outreach to ${lead.prospect.full_name}. You can undo immediately after suppressing.` : "This blocks future outreach to the selected contact."}
        onConfirm={() => void suppress()}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        pending={busy}
        title="Suppress this contact?"
        variant="destructive"
      />
    </>
  );
}

export { LeadDetailDrawer };
export type { LeadDetailDrawerProps };
