import { useEffect, useMemo, useRef, useState } from "react";
import { Mail, MessageCircle, Pencil, Phone, Trash2 } from "lucide-react";
import { Link } from "react-router";
import {
  deleteLead,
  getLeadDeletionImpact,
  updateLead,
  type CampaignRecord,
  type LeadDeletionImpact,
  type LeadRecord,
  type ReplyConversationRecord,
} from "../../lib/api";
import { Button, ConfirmDialog, Drawer, EmptyState, SampleDataPill, StatusPill, toast } from "../components/system";
import { validateLeadContact, type LeadContactErrors, type LeadContactFields } from "./lead-validation";

type LeadDetailDrawerProps = {
  lead: LeadRecord | null;
  campaigns: readonly CampaignRecord[];
  threads: readonly ReplyConversationRecord[];
  sampleHistory?: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (leadId: number) => void;
  onUpdated: (lead: LeadRecord) => void;
};

const FIELD_CLASS = "h-11 w-full rounded-control border border-line bg-surface-2 px-3.5 text-body text-ink outline-none focus:ring-3 focus:ring-ring/40";

type LeadEditDraft = LeadContactFields & { remarks: string };

function LeadDetailDrawer({ campaigns, lead, onDeleted, onOpenChange, onUpdated, sampleHistory, threads }: LeadDetailDrawerProps) {
  const [editing, setEditing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ lead: LeadRecord; impact: LeadDeletionImpact } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<LeadEditDraft>({ name: "", phone: "", email: "", dob: "", remarks: "" });
  const [errors, setErrors] = useState<LeadContactErrors>({});
  const deleteRequest = useRef(0);
  const mutationRequest = useRef(0);

  useEffect(() => {
    deleteRequest.current += 1;
    mutationRequest.current += 1;
    setBusy(false);
    if (!lead) return;
    setEditing(false);
    setDeleteTarget(null);
    setConfirmOpen(false);
    setErrors({});
    setDraft({ name: lead.name, phone: lead.phone ?? "", email: lead.email ?? "", dob: lead.dob ?? "", remarks: lead.remarks ?? "" });
  }, [lead]);
  useEffect(() => () => {
    deleteRequest.current += 1;
    mutationRequest.current += 1;
  }, []);

  const history = useMemo(() => {
    if (!lead) return [];
    const threadCampaignIds = new Set(threads.filter((thread) => thread.leadId === lead.id).map((thread) => thread.campaignId));
    return campaigns.filter((campaign) =>
      threadCampaignIds.has(campaign.id) || campaign.audience.includedLeadIds?.includes(lead.id),
    );
  }, [campaigns, lead, threads]);
  const leadThreads = useMemo(() => threads.filter((thread) => thread.leadId === lead?.id), [lead?.id, threads]);

  const prepareDelete = async () => {
    if (!lead) return;
    const target = lead;
    const request = ++deleteRequest.current;
    setBusy(true);
    try {
      const result = await getLeadDeletionImpact(target.id);
      if (request !== deleteRequest.current) return;
      setDeleteTarget({ lead: target, impact: result.data });
      setConfirmOpen(true);
    } catch (error) {
      if (request !== deleteRequest.current) return;
      toast.error(error instanceof Error ? error.message : "Deletion impact could not be checked.");
    } finally {
      if (request === deleteRequest.current) setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget.lead;
    const request = ++mutationRequest.current;
    setBusy(true);
    try {
      await deleteLead(target.id);
      if (request !== mutationRequest.current) return;
      onDeleted(target.id);
      toast.success(`${target.name} was deleted.`);
      if (lead?.id === target.id) handleOpenChange(false);
    } catch (error) {
      if (request !== mutationRequest.current) return;
      toast.error(error instanceof Error ? error.message : "The lead could not be deleted.");
    } finally {
      if (request === mutationRequest.current) {
        setBusy(false);
        setConfirmOpen(false);
      }
    }
  };

  const saveEdit = async () => {
    if (!lead) return;
    const nextErrors = validateLeadContact(draft);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    const target = lead;
    const request = ++mutationRequest.current;
    setBusy(true);
    try {
      const result = await updateLead(target.id, {
        name: draft.name.trim(),
        phone: draft.phone.trim(),
        email: draft.email.trim(),
        dob: draft.dob.trim(),
        remarks: draft.remarks.trim(),
      });
      onUpdated(result.data);
      if (request !== mutationRequest.current) return;
      setEditing(false);
      toast.success(`${result.data.name} was updated.`);
    } catch (error) {
      if (request !== mutationRequest.current) return;
      toast.error(error instanceof Error ? error.message : "The lead could not be updated.");
    } finally {
      if (request === mutationRequest.current) setBusy(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      deleteRequest.current += 1;
      mutationRequest.current += 1;
      setBusy(false);
    }
    onOpenChange(open);
  };

  const updateContactField = (field: keyof LeadContactFields, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  return (
    <>
      <Drawer
        description={lead ? `${lead.age_band ?? "Age unknown"} · ${lead.status ?? "No status"}` : undefined}
        footer={lead && (
          <div className="flex w-full items-center justify-between gap-2">
            <Button onClick={() => setEditing((current) => !current)} variant="secondary">
              <Pencil aria-hidden="true" className="size-4" strokeWidth={1.75} />{editing ? "Cancel edit" : "Edit"}
            </Button>
            <Button loading={busy} onClick={() => void prepareDelete()} variant="destructive">
              <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.75} />Delete
            </Button>
          </div>
        )}
        onOpenChange={handleOpenChange}
        open={lead !== null}
        title={lead?.name ?? "Lead details"}
      >
        {lead && (
          <div className="space-y-6">
            {editing ? (
              <section className="space-y-3 rounded-card bg-surface-2 p-4" aria-label="Edit lead">
                <label className="block text-label font-medium text-ink">Name
                  <input aria-invalid={Boolean(errors.name)} className={`mt-1.5 ${FIELD_CLASS}`} onChange={(event) => updateContactField("name", event.target.value)} value={draft.name} />
                  {errors.name && <span className="mt-1.5 block text-chip text-danger">{errors.name}</span>}
                </label>
                <label className="block text-label font-medium text-ink">WhatsApp phone
                  <input aria-invalid={Boolean(errors.phone)} className={`mt-1.5 ${FIELD_CLASS}`} inputMode="tel" onChange={(event) => updateContactField("phone", event.target.value)} value={draft.phone} />
                  {errors.phone && <span className="mt-1.5 block text-chip text-danger">{errors.phone}</span>}
                </label>
                <label className="block text-label font-medium text-ink">Email
                  <input aria-invalid={Boolean(errors.email)} className={`mt-1.5 ${FIELD_CLASS}`} onChange={(event) => updateContactField("email", event.target.value)} type="email" value={draft.email} />
                  {errors.email && <span className="mt-1.5 block text-chip text-danger">{errors.email}</span>}
                </label>
                <label className="block text-label font-medium text-ink">Date of birth
                  <input aria-invalid={Boolean(errors.dob)} className={`mt-1.5 ${FIELD_CLASS}`} onChange={(event) => updateContactField("dob", event.target.value)} type="date" value={draft.dob} />
                  {errors.dob && <span className="mt-1.5 block text-chip text-danger">{errors.dob}</span>}
                </label>
                <label className="block text-label font-medium text-ink">Remarks
                  <textarea className={`mt-1.5 min-h-24 py-3 ${FIELD_CLASS}`} onChange={(event) => setDraft((current) => ({ ...current, remarks: event.target.value }))} value={draft.remarks} />
                </label>
                <Button loading={busy} onClick={() => void saveEdit()}>Save changes</Button>
              </section>
            ) : (
              <section aria-labelledby="contact-heading">
                <h3 className="text-card-title font-medium text-ink" id="contact-heading">Contact</h3>
                <div className="mt-3 space-y-2 rounded-card bg-surface-2 p-4 text-body">
                  <p className="flex items-center gap-2 text-ink"><Phone aria-hidden="true" className="size-4 text-ink-3" strokeWidth={1.75} />{lead.phone ?? "No phone"}</p>
                  <p className="flex items-center gap-2 text-ink"><Mail aria-hidden="true" className="size-4 text-ink-3" strokeWidth={1.75} />{lead.email ?? "No email"}</p>
                  <p className="text-ink-2">{lead.age != null ? `${lead.age} years old` : "Age unknown"}{lead.dob ? ` · born ${lead.dob}` : ""}</p>
                  {lead.remarks && <p className="border-t border-line pt-3 text-ink-2">{lead.remarks}</p>}
                </div>
              </section>
            )}

            <section aria-labelledby="history-heading">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-card-title font-medium text-ink" id="history-heading">Campaign history</h3>
                {sampleHistory && <SampleDataPill />}
              </div>
              {history.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {history.map((campaign) => (
                    <Link className="flex items-center justify-between rounded-control border border-line px-3 py-3 outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/50" key={campaign.id} to={`/reengage/campaigns/${encodeURIComponent(campaign.id)}`}>
                      <span className="text-body font-medium text-ink">{campaign.title}</span>
                      <StatusPill status={campaign.status === "sent" ? "done" : campaign.status === "sending" ? "running" : campaign.status} />
                    </Link>
                  ))}
                </div>
              ) : <p className="mt-3 text-body text-ink-2">No campaign activity yet.</p>}
            </section>

            <section aria-labelledby="conversation-heading">
              <h3 className="text-card-title font-medium text-ink" id="conversation-heading">Inbox</h3>
              {leadThreads.length > 0 ? leadThreads.map((thread) => (
                <Button asChild className="mt-3" key={thread.id} variant="secondary">
                  <Link to={`/reengage/inbox/${encodeURIComponent(thread.id)}`}><MessageCircle aria-hidden="true" className="size-4" strokeWidth={1.75} />Open conversation</Link>
                </Button>
              )) : <EmptyState className="mt-3 min-h-32" icon={MessageCircle} message="No conversation with this lead yet." />}
            </section>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        confirmLabel="Delete lead"
        description={deleteTarget
          ? `This permanently deletes ${deleteTarget.impact.lead.name}, ${deleteTarget.impact.campaignRecipients} campaign recipient record${deleteTarget.impact.campaignRecipients === 1 ? "" : "s"}, and ${deleteTarget.impact.whatsappMessages} WhatsApp message${deleteTarget.impact.whatsappMessages === 1 ? "" : "s"}.`
          : "Check the lead's related records before deleting."}
        onConfirm={() => void confirmDelete()}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        pending={busy}
        title="Delete this lead?"
        variant="destructive"
      />
    </>
  );
}

export { LeadDetailDrawer };
