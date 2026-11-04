import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  MessageCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { getWhatsAppStatus, type WhatsAppGatewayStatus } from "../../lib/api";
import {
  approveSendBatch,
  getSendQueue,
  type SendQueueItem,
  type SendQueueResult,
} from "../../lib/stubs";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Textarea } from "../components/ui/textarea";
import { cn } from "../components/ui/utils";
import {
  BatchActionLabel,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Skeleton,
  toast,
} from "../components/system";
import {
  getBatchApprovalUpdate,
  getQueueCapDisplay,
  getQueueItemKey,
  groupQueueByCampaign,
  hasQueueMessageChanges,
} from "./home-model";

const AVATAR_STYLES = ["bg-cyan", "bg-lavender", "bg-mint"];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";
}

function avatarStyle(item: SendQueueItem) {
  const index = [...item.name].reduce((value, character) => value + character.charCodeAt(0), 0);
  return AVATAR_STYLES[index % AVATAR_STYLES.length];
}

function BatchApprovalPanel() {
  const [queue, setQueue] = useState<SendQueueResult | null>(null);
  const [gateway, setGateway] = useState<WhatsAppGatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [expandedItemKey, setExpandedItemKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [removedItemKeys, setRemovedItemKeys] = useState<Set<string>>(() => new Set());
  const [approvedItemKeys, setApprovedItemKeys] = useState<Set<string>>(() => new Set());
  const [approvedCount, setApprovedCount] = useState(0);
  const [lastApprovedCount, setLastApprovedCount] = useState(0);
  const [approvingTargetId, setApprovingTargetId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setGatewayError(null);
    const [queueResult, gatewayResult] = await Promise.allSettled([getSendQueue(), getWhatsAppStatus()]);
    if (queueResult.status === "fulfilled") {
      setQueue(queueResult.value);
    } else {
      setQueue(null);
      setLoadError(queueResult.reason instanceof Error ? queueResult.reason.message : "Today's queue could not be loaded.");
    }
    if (gatewayResult.status === "fulfilled") {
      setGateway(gatewayResult.value);
    } else {
      setGateway(null);
      setGatewayError(
        gatewayResult.reason instanceof Error
          ? gatewayResult.reason.message
          : "The WhatsApp connection could not be checked.",
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.allSettled([getSendQueue(), getWhatsAppStatus()]).then(([queueResult, gatewayResult]) => {
      if (!active) return;
      if (queueResult.status === "fulfilled") setQueue(queueResult.value);
      else setLoadError(queueResult.reason instanceof Error ? queueResult.reason.message : "Today's queue could not be loaded.");
      if (gatewayResult.status === "fulfilled") setGateway(gatewayResult.value);
      else setGatewayError(
        gatewayResult.reason instanceof Error
          ? gatewayResult.reason.message
          : "The WhatsApp connection could not be checked.",
      );
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setApprovedItemKeys(new Set<string>());
    setApprovedCount(0);
    setLastApprovedCount(0);
  }, [queue?.cap]);

  const hiddenItemKeys = useMemo(
    () => new Set([...removedItemKeys, ...approvedItemKeys]),
    [approvedItemKeys, removedItemKeys],
  );
  const { limit, used, remaining } = getQueueCapDisplay(queue?.cap ?? null, approvedCount);
  const groups = useMemo(
    () => groupQueueByCampaign(queue?.batch ?? [], hiddenItemKeys, remaining),
    [hiddenItemKeys, queue?.batch, remaining],
  );
  const actionableItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const hasBlankMessage = actionableItems.some((item) => !(messages[getQueueItemKey(item)] ?? item.message).trim());
  const hasUnpersistedEdits = hasQueueMessageChanges(actionableItems, messages);
  const deliveryReady = gateway?.deliveryReady === true;
  const approving = approvingTargetId !== null;

  const removeItem = (item: SendQueueItem) => {
    const itemKey = getQueueItemKey(item);
    setRemovedItemKeys((current) => new Set(current).add(itemKey));
    if (expandedItemKey === itemKey) setExpandedItemKey(null);
    toast("Removed from today's batch", {
      description: `${item.name} will remain queued for a future batch.`,
      duration: 5_000,
      action: {
        label: "Undo",
        onClick: () => {
          setRemovedItemKeys((current) => {
            const next = new Set(current);
            next.delete(itemKey);
            return next;
          });
        },
      },
    });
  };

  const approveItems = async (items: SendQueueItem[], targetId: string, campaignTitle?: string) => {
    const itemIds = items.map((item) => item.recipientId);
    const targetHasBlankMessage = items.some((item) => !(messages[getQueueItemKey(item)] ?? item.message).trim());
    const targetHasUnpersistedEdits = hasQueueMessageChanges(items, messages);
    if (approving || itemIds.length === 0 || targetHasBlankMessage || targetHasUnpersistedEdits || !deliveryReady) return;
    setApprovingTargetId(targetId);
    setMutationError(null);
    try {
      const result = await approveSendBatch(itemIds);
      const update = getBatchApprovalUpdate(items, result);
      setApprovedItemKeys((current) => new Set([...current, ...update.approvedItemKeys]));
      setApprovedCount((current) => current + update.approvedCount);
      setLastApprovedCount(update.approvedCount);
      setExpandedItemKey(null);
      if (update.retryableMessage) {
        setMutationError(update.retryableMessage);
        toast.error(update.retryableMessage);
      } else {
        toast.success(
          campaignTitle
            ? `${update.approvedCount} ${update.approvedCount === 1 ? "message" : "messages"} scheduled for ${campaignTitle}`
            : `${update.approvedCount} ${update.approvedCount === 1 ? "message" : "messages"} scheduled one minute apart`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The batch could not be approved.";
      setMutationError(message);
      toast.error(message);
    } finally {
      setApprovingTargetId(null);
    }
  };

  const approveBatch = () => approveItems(actionableItems, "batch");

  const footer = queue ? (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2 text-label text-ink-2">
          <span><strong className="font-medium text-ink">{used}</strong> of {limit} sends sent or scheduled this 12-hour window</span>
          <span>{remaining} remaining</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200"
            style={{ width: `${limit === 0 ? 0 : Math.min(100, (used / limit) * 100)}%` }}
          />
        </div>
      </div>
      <ConfirmDialog
        confirmLabel={`Approve ${actionableItems.length}`}
        description={(
          <span className="space-y-2">
            <span className="block">
              {actionableItems.length === 1
                ? "This message will be scheduled to send shortly."
                : `${actionableItems.length} messages will be scheduled one minute apart. The first sends shortly; the last starts about ${actionableItems.length - 1} minutes later.`} {Math.max(0, remaining - actionableItems.length)} of {limit} sends will remain available in this 12-hour window.
            </span>
            <span className="block font-medium text-ink">
              I confirm these recipients agreed to receive WhatsApp messages from this sender.
            </span>
          </span>
        )}
        onConfirm={() => void approveBatch()}
        pending={approvingTargetId === "batch"}
        title={`Approve batch (${actionableItems.length})?`}
        trigger={(
          <Button
            disabled={approving || !deliveryReady || actionableItems.length === 0 || hasBlankMessage || hasUnpersistedEdits}
            loading={approvingTargetId === "batch"}
          >
            <BatchActionLabel
              approveLabel={`Approve batch (${actionableItems.length})`}
              completeLabel="Scheduled"
              pendingCount={actionableItems.length}
              sentCount={lastApprovedCount}
            />
          </Button>
        )}
      />
    </div>
  ) : undefined;

  return (
    <Card
      description="Review the prepared messages, then schedule the full batch or one campaign at a time. WhatsApp sends are spaced one minute apart."
      footer={footer}
      title="Today's batch"
    >
      {(gatewayError || (gateway && !gateway.deliveryReady)) && (
        <div className="mb-4 flex gap-3 rounded-control border border-warn/30 bg-warn/10 p-4" role="status">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-warn" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="text-body font-medium text-ink">WhatsApp is not ready</p>
            <p className="mt-1 text-label text-ink-2">
              {gatewayError || gateway?.requirements.join(" · ") || "Reconnect Hermes in Settings before approving this batch."}
            </p>
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
            <strong className="font-medium tabular-nums">{lastApprovedCount}</strong> {lastApprovedCount === 1 ? "message was" : "messages were"} approved and scheduled one minute apart.
          </p>
        </div>
      )}

      {hasUnpersistedEdits && (
        <div className="mb-4 flex flex-col gap-3 rounded-control border border-warn/30 bg-warn/10 p-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <div className="flex items-start gap-3">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-warn" strokeWidth={1.75} />
            <div><p className="text-body font-medium text-ink">Edited copy is preview-only</p><p className="mt-1 text-label text-ink-2">The approved API accepts recipient IDs only. Reset local edits before approving so the queued copy cannot differ from what you reviewed.</p></div>
          </div>
          <Button onClick={() => setMessages({})} size="sm" variant="secondary"><RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.75} />Reset edits</Button>
        </div>
      )}

      {loading ? (
        <Skeleton label="Loading today's batch" rows={3} />
      ) : loadError || !queue ? (
        <div className="rounded-control border border-danger/20 bg-danger/10 p-4">
          <div className="flex items-start gap-3">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-danger" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-danger">The live queue could not be loaded</p>
              <p className="mt-1 text-label text-ink-2">{loadError || "Try again in a moment."}</p>
            </div>
            <Button onClick={() => void load()} size="sm" variant="secondary">
              <RotateCcw aria-hidden="true" className="size-4" />
              Retry
            </Button>
          </div>
        </div>
      ) : groups.length === 0 ? (
        <EmptyState icon={MessageCircle} message="Nothing waiting for approval today." />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section className="overflow-hidden rounded-card border border-line" key={group.id}>
              <header className="flex flex-wrap items-center justify-between gap-3 bg-surface-2 px-4 py-3">
                <div className="min-w-0">
                  <h3 className="truncate text-card-title font-medium text-ink">{group.title}</h3>
                  <p className="mt-0.5 text-chip text-ink-2">
                    {group.items.length} {group.items.length === 1 ? "message" : "messages"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-cyan px-2.5 py-1 text-chip font-medium text-ink">
                    Queued
                  </span>
                  <ConfirmDialog
                    confirmLabel={`Schedule ${group.items.length}`}
                    description={(
                      <span className="space-y-2">
                        <span className="block">
                          {group.items.length === 1
                            ? `The message from ${group.title} will be scheduled to send shortly.`
                            : `${group.items.length} messages from ${group.title} will be scheduled one minute apart.`} Other campaigns will stay queued.
                        </span>
                        <span className="block font-medium text-ink">
                          I confirm these recipients agreed to receive WhatsApp messages from this sender.
                        </span>
                      </span>
                    )}
                    onConfirm={() => void approveItems(group.items, group.id, group.title)}
                    pending={approvingTargetId === group.id}
                    title={`Schedule ${group.title} (${group.items.length})?`}
                    trigger={(
                      <Button
                        disabled={
                          approving
                          || !deliveryReady
                          || group.items.some((item) => !(messages[getQueueItemKey(item)] ?? item.message).trim())
                          || hasQueueMessageChanges(group.items, messages)
                        }
                        loading={approvingTargetId === group.id}
                        size="sm"
                      >
                        <MessageCircle aria-hidden="true" className="size-4" strokeWidth={1.75} />
                        Schedule campaign ({group.items.length})
                      </Button>
                    )}
                  />
                </div>
              </header>

              <div className="divide-y divide-line">
                {group.items.map((item) => {
                  const itemKey = getQueueItemKey(item);
                  const expanded = expandedItemKey === itemKey;
                  const message = messages[itemKey] ?? item.message;
                  return (
                    <article className="p-4" key={itemKey}>
                      <div className="flex items-center gap-3">
                        <Avatar className={cn("size-10 text-ink", avatarStyle(item))}>
                          <AvatarFallback className="bg-transparent text-chip font-semibold text-ink">
                            {initials(item.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-body font-medium text-ink">{item.name}</p>
                            <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-chip text-ink-2">
                              {group.title}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-label text-ink-2">{message || "Message is empty"}</p>
                        </div>
                        <IconButton
                          icon={expanded ? ChevronUp : ChevronDown}
                          label={expanded ? `Collapse message for ${item.name}` : `Review message for ${item.name}`}
                          onClick={() => setExpandedItemKey(expanded ? null : itemKey)}
                          variant="ghost"
                        />
                        <IconButton
                          icon={Trash2}
                          label={`Remove ${item.name} from today's batch`}
                          onClick={() => removeItem(item)}
                          variant="destructive"
                        />
                      </div>
                      {expanded && (
                        <div className="mt-4 pl-0 sm:pl-[52px]">
                          <label className="text-label font-medium text-ink" htmlFor={`message-${itemKey}`}>
                            WhatsApp message preview
                          </label>
                          <Textarea
                            aria-invalid={!message.trim() || undefined}
                            className="mt-2 min-h-28 rounded-control border-line bg-surface-2 text-body text-ink"
                            id={`message-${itemKey}`}
                            onChange={(event) => setMessages((current) => ({ ...current, [itemKey]: event.target.value }))}
                            value={message}
                          />
                          {!message.trim() && <p className="mt-1 text-chip text-danger">Add a message before approving.</p>}
                          <p className="mt-2 text-chip text-ink-2">Local edits are not saved by the itemIds-only approval contract. Reset any change before approval.</p>
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

export default BatchApprovalPanel;
