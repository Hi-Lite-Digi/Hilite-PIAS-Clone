import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Mail,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import {
  approveOutreachBatch,
  updateOutreachDraft,
  type OutreachDraft,
} from "../../lib/stubs";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { cn } from "../components/ui/utils";
import {
  BatchActionLabel,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  SampleDataPill,
  Skeleton,
  toast,
} from "../components/system";
import {
  buildPendingEmailQueue,
  getEmailCapDisplay,
  getOutreachApprovalUpdate,
  hasDraftEdits,
  type DraftEdits,
  type EmailCap,
} from "./home-model";

const AVATAR_STYLES = ["bg-cyan", "bg-lavender", "bg-mint"];

type PendingEmailBatchPanelProps = {
  drafts: OutreachDraft[];
  sample: boolean;
  accountSample: boolean;
  accountConnected: boolean;
  accountAddress: string | null;
  cap: EmailCap | null;
  loading: boolean;
  loadError: string | null;
  accountError: string | null;
  onRetry: () => void;
  onDraftUpdated: (draft: OutreachDraft) => void;
  onApproved: (draftIds: string[]) => void;
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";
}

function avatarStyle(name: string) {
  const index = [...name].reduce((value, character) => value + character.charCodeAt(0), 0);
  return AVATAR_STYLES[index % AVATAR_STYLES.length];
}

function PendingEmailBatchPanel({
  accountAddress,
  accountConnected,
  accountError,
  accountSample,
  cap,
  drafts,
  loadError,
  loading,
  onApproved,
  onDraftUpdated,
  onRetry,
  sample,
}: PendingEmailBatchPanelProps) {
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [edits, setEdits] = useState<DraftEdits>({});
  const [removedDraftIds, setRemovedDraftIds] = useState<Set<string>>(() => new Set());
  const [approvedDraftIds, setApprovedDraftIds] = useState<Set<string>>(() => new Set());
  const [approvedCount, setApprovedCount] = useState(0);
  const [lastApprovedCount, setLastApprovedCount] = useState(0);
  const [approving, setApproving] = useState(false);
  const [savingDraftId, setSavingDraftId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    setApprovedDraftIds(new Set<string>());
    setApprovedCount(0);
    setLastApprovedCount(0);
  }, [cap]);

  const hiddenDraftIds = useMemo(
    () => new Set([...removedDraftIds, ...approvedDraftIds]),
    [approvedDraftIds, removedDraftIds],
  );
  const capDisplay = getEmailCapDisplay(cap, approvedCount);
  const hasLiveCap = cap !== null && !accountSample && !accountError;
  const queue = useMemo(
    () => buildPendingEmailQueue(
      drafts,
      hiddenDraftIds,
      hasLiveCap ? capDisplay.remaining : Number.MAX_SAFE_INTEGER,
    ),
    [capDisplay.remaining, drafts, hasLiveCap, hiddenDraftIds],
  );
  const hasBlankCopy = queue.actionableItems.some((draft) => {
    const edit = edits[draft.id];
    return !(edit?.subject ?? draft.subject).trim() || !(edit?.body ?? draft.body).trim();
  });
  const hasEdits = hasDraftEdits(queue.actionableItems, edits);
  const draftReadOnly = sample;

  const editFor = (draft: OutreachDraft) => edits[draft.id] ?? {
    subject: draft.subject,
    body: draft.body,
  };

  const setDraftEdit = (draft: OutreachDraft, field: "subject" | "body", value: string) => {
    if (draftReadOnly || approving || savingDraftId === draft.id) return;
    setEdits((current) => ({
      ...current,
      [draft.id]: { ...editFor(draft), ...current[draft.id], [field]: value },
    }));
  };

  const persistDraft = async (draft: OutreachDraft) => {
    const edit = edits[draft.id];
    if (!edit || (edit.subject === draft.subject && edit.body === draft.body)) return draft;
    if (!edit.subject.trim() || !edit.body.trim()) {
      throw new Error("Add both a subject and email body before saving.");
    }
    const result = await updateOutreachDraft(draft.id, {
      subject: edit.subject.trim(),
      body: edit.body.trim(),
    });
    if (result.sample || !result.data) {
      throw new Error("Sample drafts are read-only. Connect the live outreach service to save changes.");
    }
    onDraftUpdated(result.data);
    setEdits((current) => {
      const currentEdit = current[draft.id];
      if (!currentEdit || currentEdit.subject !== edit.subject || currentEdit.body !== edit.body) return current;
      const next = { ...current };
      delete next[draft.id];
      return next;
    });
    return result.data;
  };

  const saveDraft = async (draft: OutreachDraft) => {
    if (draftReadOnly || approving || savingDraftId) return;
    setSavingDraftId(draft.id);
    setMutationError(null);
    try {
      await persistDraft(draft);
      toast.success("Email draft saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The email draft could not be saved.";
      setMutationError(message);
      toast.error(message);
    } finally {
      setSavingDraftId(null);
    }
  };

  const removeDraft = (draft: OutreachDraft) => {
    if (draftReadOnly || approving || savingDraftId === draft.id) return;
    setRemovedDraftIds((current) => new Set(current).add(draft.id));
    if (expandedDraftId === draft.id) setExpandedDraftId(null);
    toast("Removed from this batch", {
      description: `${draft.prospect.full_name} will remain drafted for a future batch.`,
      duration: 5_000,
      action: {
        label: "Undo",
        onClick: () => {
          setRemovedDraftIds((current) => {
            const next = new Set(current);
            next.delete(draft.id);
            return next;
          });
        },
      },
    });
  };

  const approveBatch = async () => {
    if (draftReadOnly || accountSample || accountError || approving || savingDraftId || !accountConnected || queue.actionableItems.length === 0 || hasBlankCopy) return;
    setApproving(true);
    setMutationError(null);
    try {
      for (const draft of queue.actionableItems) await persistDraft(draft);
      const requestedDraftIds = queue.actionableItems.map((draft) => draft.id);
      const result = await approveOutreachBatch(requestedDraftIds);
      const update = getOutreachApprovalUpdate(queue.actionableItems, result);
      setApprovedDraftIds((current) => new Set([...current, ...update.approvedDraftIds]));
      setApprovedCount((current) => current + update.approvedCount);
      setLastApprovedCount(update.approvedCount);
      setExpandedDraftId(null);
      onApproved(update.approvedDraftIds);
      if (update.retryableMessage) {
        setMutationError(update.retryableMessage);
        toast.error(update.retryableMessage);
      } else {
        toast.success(`${update.approvedCount} ${update.approvedCount === 1 ? "email" : "emails"} approved and sent`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The email batch could not be approved.";
      setMutationError(message);
      toast.error(message);
    } finally {
      setApproving(false);
    }
  };

  const footer = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        {hasLiveCap ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-label text-ink-2">
              <span><strong className="font-medium text-ink">{capDisplay.used}</strong> of {capDisplay.limit} daily sends used</span>
              <span>{capDisplay.remaining} remaining</span>
            </div>
            <p className="mt-1 text-chip text-ink-2">Resets daily at 7:00 AM SGT.</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200"
                style={{ width: `${capDisplay.limit === 0 ? 0 : Math.min(100, (capDisplay.used / capDisplay.limit) * 100)}%` }}
              />
            </div>
            {queue.deferredCount > 0 && (
              <p className="mt-2 text-chip text-ink-2">
                {queue.deferredCount} {queue.deferredCount === 1 ? "email is" : "emails are"} held for the next batch by the daily sending limit.
              </p>
            )}
          </>
        ) : (
          <p className="text-label text-ink-2">
            Sending limit unavailable. All live drafts remain reviewable; approval waits for a live account status.
          </p>
        )}
      </div>
      <ConfirmDialog
        confirmLabel={`Approve ${queue.actionableItems.length}`}
        description={(
          <span className="space-y-2">
            <span className="block">
              {queue.actionableItems.length} {queue.actionableItems.length === 1 ? "email" : "emails"} will send from {accountAddress || "the connected account"}. Any edits will be saved first.
            </span>
            {hasLiveCap && (
              <span className="block text-ink-2">
                Daily limit: {capDisplay.remaining} of {capDisplay.limit} sends remain; this batch uses {queue.actionableItems.length}.
              </span>
            )}
            <span className="block font-medium text-ink">
              I have reviewed the recipients and outreach copy for this batch.
            </span>
          </span>
        )}
        onConfirm={() => void approveBatch()}
        pending={approving}
        title={`Approve batch (${queue.actionableItems.length})?`}
        trigger={(
          <Button
            disabled={sample || accountSample || Boolean(accountError) || Boolean(savingDraftId) || !accountConnected || queue.actionableItems.length === 0 || hasBlankCopy}
            loading={approving}
          >
            <BatchActionLabel
              approveLabel={`Approve batch (${queue.actionableItems.length})`}
              pendingCount={queue.actionableItems.length}
              sentCount={lastApprovedCount}
            />
          </Button>
        )}
      />
    </div>
  );

  return (
    <Card
      action={<SampleDataPill show={sample || accountSample} />}
      description="Review the prepared outreach once, then approve the whole send group."
      footer={footer}
      title="Pending emails"
    >
      {sample && !loading && (
        <div className="mb-4 flex gap-3 rounded-control border border-lavender bg-lavender/30 p-4" role="status">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-ink-2" strokeWidth={1.75} />
          <div>
            <p className="text-body font-medium text-ink">Sample drafts are read-only</p>
            <p className="mt-1 text-label text-ink-2">Connect the live workflow and email-account endpoints before editing or approving outreach.</p>
          </div>
        </div>
      )}

      {(accountSample || accountError) && !loading && (
        <div className="mb-4 flex gap-3 rounded-control border border-warn/30 bg-warn/10 p-4" role="status">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-warn" strokeWidth={1.75} />
          <div>
            <p className="text-body font-medium text-ink">Sending-account status is unavailable</p>
            <p className="mt-1 text-label text-ink-2">You can still review, edit, and remove live drafts. Approval stays disabled until the live account status and sending limit load.{accountError ? ` ${accountError}` : ""}</p>
          </div>
        </div>
      )}

      {!accountConnected && !loading && !accountSample && !accountError && (
        <div className="mb-4 flex gap-3 rounded-control border border-warn/30 bg-warn/10 p-4" role="status">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-warn" strokeWidth={1.75} />
          <div>
            <p className="text-body font-medium text-ink">Email sending is not ready</p>
            <p className="mt-1 text-label text-ink-2">Connect a sending account in Hi-Hunt Settings before approving this batch.</p>
          </div>
        </div>
      )}

      {mutationError && (
        <div className="mb-4 flex items-center gap-2 rounded-control bg-danger/10 px-4 py-3 text-body text-danger" role="alert">
          <CircleAlert aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.75} />
          <span>{mutationError}</span>
        </div>
      )}

      {lastApprovedCount > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-control bg-mint p-4" role="status">
          <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-ink" strokeWidth={1.75} />
          <p className="text-body text-ink">
            <strong className="font-medium tabular-nums">{lastApprovedCount}</strong> {lastApprovedCount === 1 ? "email was" : "emails were"} approved and sent.
          </p>
        </div>
      )}

      {hasEdits && !draftReadOnly && (
        <div className="mb-4 flex items-center gap-2 rounded-control bg-cyan/40 px-4 py-3 text-label text-ink-2" role="status">
          <Save aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
          Edited subject lines and bodies will be saved to the live draft before this batch sends.
        </div>
      )}

      {loading ? (
        <Skeleton label="Loading pending outreach emails" rows={3} />
      ) : loadError ? (
        <div className="rounded-control border border-danger/20 bg-danger/10 p-4">
          <div className="flex items-start gap-3">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-danger" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-danger">Pending emails could not be loaded</p>
              <p className="mt-1 text-label text-ink-2">{loadError}</p>
            </div>
            <Button onClick={onRetry} size="sm" variant="secondary">
              <RotateCcw aria-hidden="true" className="size-4" />
              Retry
            </Button>
          </div>
        </div>
      ) : queue.groups.length === 0 ? (
        <EmptyState
          icon={Mail}
          message={queue.deferredCount > 0
            ? `The daily sending limit is reached. ${queue.deferredCount} ${queue.deferredCount === 1 ? "draft remains" : "drafts remain"} queued for the next batch.`
            : "No outreach emails are waiting for approval."}
        />
      ) : (
        <div className="space-y-4">
          {queue.groups.map((group) => (
            <section className="overflow-hidden rounded-card border border-line" key={group.id}>
              <header className="flex items-center justify-between gap-3 bg-surface-2 px-4 py-3">
                <div className="min-w-0">
                  <h3 className="truncate text-card-title font-medium text-ink">{group.title}</h3>
                  <p className="mt-0.5 text-chip text-ink-2">
                    {group.items.length} {group.items.length === 1 ? "email" : "emails"}
                  </p>
                </div>
                <span className="rounded-full bg-cyan px-2.5 py-1 text-chip font-medium text-ink">Drafted</span>
              </header>

              <div className="divide-y divide-line">
                {group.items.map((draft) => {
                  const expanded = expandedDraftId === draft.id;
                  const edit = editFor(draft);
                  const changed = edit.subject !== draft.subject || edit.body !== draft.body;
                  const invalid = !edit.subject.trim() || !edit.body.trim();
                  return (
                    <article className="p-4" key={draft.id}>
                      <div className="flex items-center gap-3">
                        <Avatar className={cn("size-10 text-ink", avatarStyle(draft.prospect.full_name))}>
                          <AvatarFallback className="bg-transparent text-chip font-semibold text-ink">
                            {initials(draft.prospect.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-body font-medium text-ink">{draft.prospect.full_name}</p>
                            <span className="hidden shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-chip text-ink-2 sm:inline-flex">
                              {group.title}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-label text-ink-2">{edit.subject || "Subject is empty"}</p>
                        </div>
                        <IconButton
                          icon={expanded ? ChevronUp : ChevronDown}
                          label={expanded ? `Collapse email for ${draft.prospect.full_name}` : `Review email for ${draft.prospect.full_name}`}
                          onClick={() => setExpandedDraftId(expanded ? null : draft.id)}
                          variant="ghost"
                        />
                        <IconButton
                          disabled={draftReadOnly || approving || savingDraftId === draft.id}
                          icon={Trash2}
                          label={`Remove ${draft.prospect.full_name} from this batch`}
                          onClick={() => removeDraft(draft)}
                          variant="destructive"
                        />
                      </div>

                      {expanded && (
                        <div className="mt-4 space-y-4 sm:pl-[52px]">
                          <div>
                            <label className="text-label font-medium text-ink" htmlFor={`subject-${draft.id}`}>Subject</label>
                            <Input
                              aria-invalid={!edit.subject.trim() || undefined}
                              className="mt-2 h-11 rounded-control border-line bg-surface-2 text-body text-ink"
                              disabled={draftReadOnly || approving || savingDraftId === draft.id}
                              id={`subject-${draft.id}`}
                              onChange={(event) => setDraftEdit(draft, "subject", event.target.value)}
                              value={edit.subject}
                            />
                          </div>
                          <div>
                            <label className="text-label font-medium text-ink" htmlFor={`body-${draft.id}`}>Email body</label>
                            <Textarea
                              aria-invalid={!edit.body.trim() || undefined}
                              className="mt-2 min-h-44 rounded-control border-line bg-surface-2 text-body leading-6 text-ink"
                              disabled={draftReadOnly || approving || savingDraftId === draft.id}
                              id={`body-${draft.id}`}
                              onChange={(event) => setDraftEdit(draft, "body", event.target.value)}
                              value={edit.body}
                            />
                          </div>
                          {invalid && <p className="text-chip text-danger">Add both a subject and email body before approving.</p>}
                          {changed && !draftReadOnly && (
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                disabled={approving || savingDraftId === draft.id}
                                onClick={() => setEdits((current) => ({ ...current, [draft.id]: { subject: draft.subject, body: draft.body } }))}
                                size="sm"
                                variant="ghost"
                              >
                                <RotateCcw aria-hidden="true" className="size-4" />
                                Reset
                              </Button>
                              <Button
                                disabled={invalid || approving || savingDraftId !== null}
                                loading={savingDraftId === draft.id}
                                onClick={() => void saveDraft(draft)}
                                size="sm"
                                variant="secondary"
                              >
                                <Save aria-hidden="true" className="size-4" />
                                Save edits
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

export default PendingEmailBatchPanel;
export type { PendingEmailBatchPanelProps };
