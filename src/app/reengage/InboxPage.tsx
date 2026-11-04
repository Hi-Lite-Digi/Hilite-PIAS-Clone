import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  Image as ImageIcon,
  ImagePlus,
  Inbox as InboxIcon,
  MailOpen,
  MessageCircle,
  RotateCcw,
  Send,
  Star,
  X,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import {
  getPosterUploadTicket,
  sendReply,
  updateReply,
  uploadPosterFile,
  type ReplyCategory,
  type ReplyConversationRecord,
} from "../../lib/api";
import { getThread, getThreads } from "../../lib/stubs";
import {
  Button,
  EmptyState,
  FilterChips,
  IconButton,
  SampleDataPill,
  SearchInput,
  SettledItem,
  Skeleton,
  StatusPill,
  toast,
} from "../components/system";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../components/ui/select";
import { cn } from "../components/ui/utils";
import {
  filterAndSortThreads,
  findMatchingThread,
  getCampaignFilterOptions,
  getCategoryPresentation,
  getThreadHref,
  getThreadRequestDecision,
  groupMessagesByDay,
  isAwayFromLatestMessage,
  reconcileSuccessfulReply,
  removePendingReply,
  upsertThread,
  type PendingReplyMessage,
} from "./inbox-model";

type InboxPageProps = {
  initialThreads?: ReplyConversationRecord[];
  initialSelectedThread?: ReplyConversationRecord | null;
  initialSample?: boolean;
  initialListError?: string | null;
  initialThreadError?: string | null;
  onCountsChange?: (counts: { unread: number; total: number }) => void;
};

const CATEGORY_OPTIONS: ReplyCategory[] = ["Interested", "Not Interested", "Question", "Unsubscribe"];
const INBOX_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_INBOX_IMAGE_BYTES = 10 * 1024 * 1024;
const MEDIA_ONLY_BODIES = new Set(["[Image sent]", "[Image received]", "[Sticker received]"]);

type InboxImageAttachment = {
  path: string;
  name: string;
  mimeType: string;
  previewUrl: string;
};

const avatarClasses: Record<string, string> = {
  accent: "bg-accent",
  cyan: "bg-cyan",
  lavender: "bg-lavender",
  mint: "bg-mint",
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}

function formatThreadTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-SG", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function makeIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `reply-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function InboxAvatar({ thread, size = "default" }: { thread: ReplyConversationRecord; size?: "default" | "large" }) {
  return (
    <Avatar className={cn(size === "large" ? "size-11" : "size-10", avatarClasses[thread.color] ?? "bg-surface-2")}>
      <AvatarFallback className={cn("text-chip font-semibold text-ink", avatarClasses[thread.color] ?? "bg-surface-2")}>
        {thread.initials}
      </AvatarFallback>
    </Avatar>
  );
}

function CategoryControl({
  category,
  disabled,
  onChange,
}: {
  category: ReplyCategory;
  disabled: boolean;
  onChange: (category: ReplyCategory) => void;
}) {
  const presentation = getCategoryPresentation(category);
  return (
    <Select disabled={disabled} onValueChange={(value) => onChange(value as ReplyCategory)} value={category}>
      <SelectTrigger
        aria-label="Conversation category"
        className="h-11 w-auto min-w-32 rounded-full border-line bg-surface px-2.5 text-chip shadow-none md:h-9"
      >
        <StatusPill label={presentation.label} status={presentation.status} />
      </SelectTrigger>
      <SelectContent className="rounded-control border-line bg-surface">
        {CATEGORY_OPTIONS.map((option) => (
          <SelectItem className="rounded-control text-body" key={option} value={option}>
            {getCategoryPresentation(option).label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function InboxPage({
  initialListError = null,
  initialSample = false,
  initialSelectedThread = null,
  initialThreadError = null,
  initialThreads,
  onCountsChange,
}: InboxPageProps) {
  const { threadId } = useParams<{ threadId?: string }>();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ReplyConversationRecord[]>(initialThreads ?? []);
  const [selectedThread, setSelectedThread] = useState<ReplyConversationRecord | null>(
    threadId ? initialSelectedThread : null,
  );
  const [sample, setSample] = useState(initialSample);
  const [loadingList, setLoadingList] = useState(initialThreads === undefined && !initialListError);
  const [loadingThread, setLoadingThread] = useState(Boolean(threadId && !initialSelectedThread && !initialThreadError));
  const [listError, setListError] = useState<string | null>(initialListError);
  const [threadError, setThreadError] = useState<string | null>(initialThreadError);
  const [threadRetry, setThreadRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [campaignId, setCampaignId] = useState("all");
  const [draft, setDraft] = useState("");
  const [imageAttachment, setImageAttachment] = useState<InboxImageAttachment | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pendingByThread, setPendingByThread] = useState<Record<string, PendingReplyMessage[]>>({});
  const [mutatingThread, setMutatingThread] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageObjectUrl = useRef<string | null>(null);
  const imageUploadRequest = useRef(0);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const attemptedReadReceipts = useRef(new Set<string>());
  const lastThreadRequest = useRef("");
  const onCountsChangeRef = useRef(onCountsChange);
  const pendingByThreadRef = useRef(pendingByThread);
  const selectedThreadRef = useRef(selectedThread);
  const threadIdRef = useRef(threadId);

  const clearImageAttachment = useCallback(() => {
    if (imageObjectUrl.current) URL.revokeObjectURL(imageObjectUrl.current);
    imageObjectUrl.current = null;
    setImageAttachment(null);
  }, []);

  const updateJumpToLatest = useCallback((container: HTMLDivElement) => {
    setShowJumpToLatest(isAwayFromLatestMessage(container));
  }, []);

  const jumpToLatest = useCallback(() => {
    const container = messageScrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    onCountsChangeRef.current = onCountsChange;
  }, [onCountsChange]);

  useEffect(() => {
    pendingByThreadRef.current = pendingByThread;
  }, [pendingByThread]);

  useEffect(() => {
    selectedThreadRef.current = selectedThread;
  }, [selectedThread]);

  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);

  const loadThreads = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const result = await getThreads();
      setThreads(result.data);
      setSample(result.sample);
      onCountsChangeRef.current?.({ unread: result.unread, total: result.total });
    } catch (error) {
      const message = getErrorMessage(error);
      setListError(message);
      toast.error("Inbox could not be loaded", { description: message });
    } finally {
      setLoadingList(false);
    }
  }, []);

  const refreshThreads = useCallback(async () => {
    try {
      const result = await getThreads();
      setThreads(result.data);
      setSample(result.sample);
      setListError(null);
      onCountsChangeRef.current?.({ unread: result.unread, total: result.total });

      const current = selectedThreadRef.current;
      const hasPending = current
        ? (pendingByThreadRef.current[String(current.id)]?.length ?? 0) > 0
        : false;
      const refreshed = current && !hasPending ? findMatchingThread(result.data, current) : null;
      if (refreshed) {
        selectedThreadRef.current = refreshed;
        setSelectedThread(refreshed);
        if (threadIdRef.current && String(refreshed.id) !== threadIdRef.current) {
          threadIdRef.current = String(refreshed.id);
          void navigate(getThreadHref(refreshed.id), { replace: true });
        }
      }
    } catch {
      // Background sync is intentionally quiet; the current inbox remains usable.
    }
  }, [navigate]);

  useEffect(() => {
    if (initialThreads === undefined && !initialListError) void loadThreads();
  }, [initialListError, initialThreads, loadThreads]);

  useEffect(() => {
    const refreshVisibleInbox = () => {
      if (!document.hidden) void refreshThreads();
    };
    const intervalId = window.setInterval(refreshVisibleInbox, 4_000);
    window.addEventListener("focus", refreshVisibleInbox);
    document.addEventListener("visibilitychange", refreshVisibleInbox);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisibleInbox);
      document.removeEventListener("visibilitychange", refreshVisibleInbox);
    };
  }, [refreshThreads]);

  useEffect(() => {
    onCountsChangeRef.current?.({
      unread: threads.filter((thread) => !thread.read).length,
      total: threads.length,
    });
  }, [threads]);

  const existingThread = useMemo(
    () => threads.find((thread) => String(thread.id) === threadId),
    [threadId, threads],
  );

  useEffect(() => {
    setDraft("");
    imageUploadRequest.current += 1;
    setUploadingImage(false);
    clearImageAttachment();
  }, [clearImageAttachment, threadId]);

  useEffect(() => () => {
    imageUploadRequest.current += 1;
    if (imageObjectUrl.current) URL.revokeObjectURL(imageObjectUrl.current);
  }, []);

  useEffect(() => {
    if (!threadId) {
      lastThreadRequest.current = getThreadRequestDecision(
        lastThreadRequest.current,
        undefined,
        threadRetry,
      ).nextRequest;
      setSelectedThread(null);
      setThreadError(null);
      setLoadingThread(false);
      return;
    }

    if (existingThread) {
      lastThreadRequest.current = getThreadRequestDecision(
        lastThreadRequest.current,
        undefined,
        threadRetry,
      ).nextRequest;
      setSelectedThread(existingThread);
      setThreadError(null);
      setLoadingThread(false);
      return;
    }

    const requestDecision = getThreadRequestDecision(
      lastThreadRequest.current,
      threadId,
      threadRetry,
    );
    if (!requestDecision.shouldLoad) return;
    lastThreadRequest.current = requestDecision.nextRequest;

    let active = true;
    setLoadingThread(true);
    setThreadError(null);
    getThread(threadId)
      .then((result) => {
        if (!active) return;
        setSelectedThread(result.data);
        if (result.data) {
          const loadedThread = result.data;
          setThreads((current) => upsertThread(current, loadedThread));
        }
        setSample((current) => current || result.sample);
      })
      .catch((error) => {
        if (!active) return;
        setSelectedThread(null);
        setThreadError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoadingThread(false);
      });
    return () => {
      active = false;
    };
  }, [existingThread, threadId, threadRetry]);

  const replaceThread = useCallback((next: ReplyConversationRecord) => {
    setSelectedThread(next);
    setThreads((current) => upsertThread(current, next));
  }, []);

  const mutateConversation = useCallback(async (
    patch: { read?: boolean; starred?: boolean; category?: ReplyCategory },
  ) => {
    if (!selectedThread || mutatingThread || sample) return;
    const previous = selectedThread;
    const optimistic = { ...previous, ...patch };
    replaceThread(optimistic);
    setMutatingThread(true);
    try {
      await updateReply(previous.id, patch);
    } catch (error) {
      replaceThread(previous);
      toast.error("Conversation update failed", {
        description: getErrorMessage(error),
        action: { label: "Retry", onClick: () => void mutateConversation(patch) },
      });
    } finally {
      setMutatingThread(false);
    }
  }, [mutatingThread, replaceThread, sample, selectedThread]);

  useEffect(() => {
    if (!threadId || !selectedThread || selectedThread.read || mutatingThread || sample) return;
    if (attemptedReadReceipts.current.has(threadId)) return;
    attemptedReadReceipts.current.add(threadId);
    void mutateConversation({ read: true });
  }, [mutateConversation, mutatingThread, sample, selectedThread, threadId]);

  const deliverPending = async (conversationId: number, pending: PendingReplyMessage) => {
    if (sample) return;
    const key = String(conversationId);
    setPendingByThread((current) => ({
      ...current,
      [key]: (current[key] ?? []).map((message) => (
        message.id === pending.id ? { ...message, deliveryState: "sending" } : message
      )),
    }));
    try {
      const result = await sendReply(
        conversationId,
        pending.caption ?? pending.body,
        pending.idempotencyKey,
        pending.attachmentPath && pending.attachmentMimeType && pending.attachment
          ? { path: pending.attachmentPath, name: pending.attachment.name, mimeType: pending.attachmentMimeType }
          : undefined,
      );
      setSelectedThread((current) => (
        current?.id === conversationId
          ? reconcileSuccessfulReply(current, pending, result.messageId)
          : current
      ));
      setThreads((current) => current.map((thread) => (
        thread.id === conversationId
          ? reconcileSuccessfulReply(thread, pending, result.messageId)
          : thread
      )));
      setPendingByThread((current) => removePendingReply(current, conversationId, pending.id));
    } catch (error) {
      setPendingByThread((current) => ({
        ...current,
        [key]: (current[key] ?? []).map((message) => (
          message.id === pending.id ? { ...message, deliveryState: "failed" } : message
        )),
      }));
      toast.error("Message wasn’t sent", {
        description: getErrorMessage(error),
        action: { label: "Retry", onClick: () => void deliverPending(conversationId, pending) },
      });
    }
  };

  const retryMessage = (conversationId: number, messageId: string) => {
    if (sample) return;
    const pending = pendingByThread[String(conversationId)]?.find((message) => message.id === messageId);
    if (pending) void deliverPending(conversationId, pending);
  };

  const selectImage = async (file: File) => {
    if (sample) return;
    if (!INBOX_IMAGE_TYPES.includes(file.type)) {
      toast.error("Attach a PNG, JPG, WebP, or GIF image.");
      return;
    }
    if (file.size > MAX_INBOX_IMAGE_BYTES) {
      toast.error("The inbox image must be 10 MB or smaller.");
      return;
    }
    const request = ++imageUploadRequest.current;
    setUploadingImage(true);
    try {
      const ticket = await getPosterUploadTicket(file);
      await uploadPosterFile(file, ticket);
      if (request !== imageUploadRequest.current) return;
      clearImageAttachment();
      const previewUrl = URL.createObjectURL(file);
      imageObjectUrl.current = previewUrl;
      setImageAttachment({ path: ticket.path, name: file.name, mimeType: file.type, previewUrl });
    } catch (error) {
      if (request !== imageUploadRequest.current) return;
      toast.error("Image could not be attached", { description: getErrorMessage(error) });
    } finally {
      if (request === imageUploadRequest.current) setUploadingImage(false);
    }
  };

  const sendMessage = async () => {
    const caption = draft.trim();
    if (!selectedThread || (!caption && !imageAttachment) || sample || uploadingImage) return;
    const conversationId = selectedThread.id;
    const idempotencyKey = makeIdempotencyKey();
    const messageId = `pending-${idempotencyKey}`;
    const pending: PendingReplyMessage = {
      id: messageId,
      idempotencyKey,
      from: "us",
      senderName: "Hilite",
      senderContact: "WhatsApp",
      occurredAt: new Date().toISOString(),
      body: caption || "[Image sent]",
      caption,
      ...(imageAttachment ? {
        attachment: { kind: "image", name: imageAttachment.name },
        attachmentPath: imageAttachment.path,
        attachmentMimeType: imageAttachment.mimeType,
      } : {}),
      deliveryState: "sending",
    };
    const key = String(conversationId);
    setPendingByThread((current) => ({ ...current, [key]: [...(current[key] ?? []), pending] }));
    setDraft("");
    clearImageAttachment();
    if (composerRef.current) composerRef.current.style.height = "auto";
    window.setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 0);
    await deliverPending(conversationId, pending);
  };

  const markUnread = () => {
    if (!selectedThread || sample) return;
    attemptedReadReceipts.current.add(String(selectedThread.id));
    void mutateConversation({ read: false });
  };

  const campaignOptions = useMemo(() => getCampaignFilterOptions(threads), [threads]);
  useEffect(() => {
    if (campaignId !== "all" && !campaignOptions.some((option) => option.value === campaignId)) {
      setCampaignId("all");
    }
  }, [campaignId, campaignOptions]);
  const visibleThreads = useMemo(
    () => filterAndSortThreads(threads, query, campaignId),
    [campaignId, query, threads],
  );
  const selectedMessages = selectedThread
    ? [...selectedThread.thread, ...(pendingByThread[String(selectedThread.id)] ?? [])]
    : [];
  const messageGroups = groupMessagesByDay(selectedMessages);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const container = messageScrollRef.current;
      if (container) updateJumpToLatest(container);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedMessages.length, selectedThread?.id, updateJumpToLatest]);

  return (
    <main className="flex h-full min-h-0 overflow-hidden bg-surface" data-slot="inbox-page">
      <aside
        className={cn(
          "min-h-0 w-full flex-col border-line bg-surface md:flex md:w-[360px] md:shrink-0 md:border-r",
          threadId ? "hidden" : "flex",
        )}
        data-slot="inbox-list"
      >
        <div className="shrink-0 border-b border-line px-4 py-4 md:px-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-section-title font-medium text-ink">Inbox</h1>
              <p className="mt-1 text-label text-ink-2">Unread conversations appear first.</p>
            </div>
            <SampleDataPill show={sample} />
          </div>
          <SearchInput
            aria-label="Search conversations"
            className="mt-4"
            onValueChange={setQuery}
            placeholder="Search name or message"
            value={query}
          />
          <FilterChips
            className="mt-3"
            label="Filter conversations by campaign"
            onValueChange={(value) => setCampaignId(String(value))}
            options={campaignOptions}
            value={campaignId}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]">
          {loadingList ? (
            <Skeleton className="p-4" label="Loading conversations" rows={5} variant="list" />
          ) : listError ? (
            <EmptyState
              action={<Button onClick={() => void loadThreads()} variant="secondary">Try again</Button>}
              className="m-4"
              icon={RotateCcw}
              message={listError}
            />
          ) : visibleThreads.length === 0 ? (
            <EmptyState
              action={query || campaignId !== "all" ? (
                <Button onClick={() => { setQuery(""); setCampaignId("all"); }} variant="secondary">Clear filters</Button>
              ) : undefined}
              className="m-4"
              icon={InboxIcon}
              message={query || campaignId !== "all" ? "No conversations match these filters." : "No replies yet."}
            />
          ) : (
            <nav aria-label="Conversations">
              {visibleThreads.map((thread) => {
                const active = String(thread.id) === threadId;
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "grid min-h-24 grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 border-b border-line px-4 py-4 outline-none transition-colors hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50",
                      active && "bg-surface-2",
                    )}
                    key={thread.id}
                    onClick={(event) => {
                      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                      setSelectedThread(thread);
                      setThreadError(null);
                      setLoadingThread(false);
                    }}
                    to={getThreadHref(thread.id)}
                  >
                    <InboxAvatar thread={thread} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className={cn("truncate text-body text-ink", !thread.read && "font-semibold")}>{thread.leadName}</span>
                        {!thread.read && <span aria-label="Unread" className="size-2 shrink-0 rounded-full bg-accent" />}
                      </span>
                      <span className="mt-1 block truncate text-label text-ink-2">{thread.preview}</span>
                      <span className="mt-2 block truncate text-chip text-ink-3">{thread.campaign}</span>
                    </span>
                    <time className="text-chip tabular-nums text-ink-3" dateTime={thread.occurredAt}>
                      {formatThreadTime(thread.occurredAt)}
                    </time>
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </aside>

      <section
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col bg-surface-2 md:flex",
          threadId ? "flex" : "hidden",
        )}
        data-slot="inbox-thread"
      >
        {loadingThread ? (
          <Skeleton className="p-5 md:p-8" label="Loading conversation" rows={5} variant="list" />
        ) : selectedThread ? (
          <>
            <header className="flex min-h-[76px] shrink-0 flex-wrap items-center gap-3 border-b border-line bg-surface px-3 py-3 md:flex-nowrap md:px-6">
              <Link
                aria-label="Back to conversations"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
                to="/reengage/inbox"
              >
                <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.75} />
              </Link>
              <InboxAvatar size="large" thread={selectedThread} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-card-title font-medium text-ink">{selectedThread.leadName}</h2>
                <p className="mt-0.5 truncate text-chip text-ink-2">
                  Replied to: <span className="font-medium text-ink">{selectedThread.campaign}</span>
                </p>
              </div>
              <div className="flex w-full shrink-0 items-center justify-end gap-1.5 md:w-auto">
                <CategoryControl
                  category={selectedThread.category}
                  disabled={mutatingThread || sample}
                  onChange={(category) => void mutateConversation({ category })}
                />
                <IconButton
                  aria-pressed={selectedThread.starred}
                  disabled={mutatingThread || sample}
                  icon={Star}
                  label={selectedThread.starred ? "Remove star" : "Star conversation"}
                  onClick={() => void mutateConversation({ starred: !selectedThread.starred })}
                  variant={selectedThread.starred ? "primary" : "default"}
                />
                <IconButton
                  className="lg:hidden"
                  disabled={mutatingThread || sample}
                  icon={MailOpen}
                  label="Mark unread"
                  onClick={markUnread}
                />
                <Button
                  className="hidden lg:inline-flex"
                  disabled={mutatingThread || sample}
                  onClick={markUnread}
                  size="sm"
                  variant="ghost"
                >
                  <MailOpen aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Mark unread
                </Button>
              </div>
            </header>

            <div className="relative min-h-0 flex-1">
              <div
                className="h-full overflow-y-auto px-4 py-6 [scrollbar-width:none] md:px-8"
                onScroll={(event) => updateJumpToLatest(event.currentTarget)}
                ref={messageScrollRef}
              >
                <div className="mx-auto max-w-3xl space-y-6">
                {messageGroups.map((group) => (
                  <section aria-label={group.label} key={group.key}>
                    <div className="mb-5 flex items-center gap-3" role="separator">
                      <span className="h-px flex-1 bg-line" />
                      <time className="text-chip font-medium text-ink-3">{group.label}</time>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                    <div className="space-y-3">
                      {group.messages.map((message, messageIndex) => {
                        const pending = message as PendingReplyMessage;
                        const outgoing = message.from === "us";
                        const mediaOnlyMessage = Boolean(message.attachment && MEDIA_ONLY_BODIES.has(message.body));
                        return (
                          <SettledItem className={cn("flex", outgoing ? "justify-end" : "justify-start")} index={messageIndex} key={message.id}>
                            <div
                              className={cn(
                                "max-w-[85%] rounded-card px-4 py-3 text-body leading-relaxed md:max-w-[70%]",
                                outgoing ? "bg-mint text-ink" : "border border-line bg-surface text-ink",
                                pending.deliveryState === "failed" && "border-danger/30",
                              )}
                            >
                              {message.attachment && (message.attachment.url
                                ? (
                                    <a
                                      aria-label={`Open ${message.attachment.kind}`}
                                      className={cn(
                                        "mb-2 block overflow-hidden rounded-control border border-ink/10 bg-surface/70 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                                        message.attachment.kind === "sticker" && "w-fit border-0 bg-transparent",
                                      )}
                                      href={message.attachment.url}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      <img
                                        alt={message.attachment.kind === "sticker" ? "WhatsApp sticker" : message.attachment.name}
                                        className={cn(
                                          "object-contain",
                                          message.attachment.kind === "sticker" ? "max-h-40 max-w-40" : "max-h-80 w-full",
                                        )}
                                        loading="lazy"
                                        src={message.attachment.url}
                                      />
                                      {message.attachment.kind === "image" && (
                                        <span className="flex items-center gap-2 border-t border-ink/10 px-3 py-2">
                                          <ImageIcon aria-hidden="true" className="size-4 shrink-0" />
                                          <span className="min-w-0 truncate text-label font-medium">{message.attachment.name}</span>
                                        </span>
                                      )}
                                    </a>
                                  )
                                : (
                                    <div className="mb-2 flex items-center gap-2 rounded-control border border-ink/10 bg-surface/70 px-3 py-2">
                                      <ImageIcon aria-hidden="true" className="size-4 shrink-0" />
                                      <span className="min-w-0 truncate text-label font-medium">
                                        {message.attachment.kind === "sticker" ? "Sticker preview unavailable" : message.attachment.name}
                                      </span>
                                    </div>
                                  ))}
                              {!mediaOnlyMessage && <p className="whitespace-pre-wrap">{message.body}</p>}
                              <div className="mt-2 flex items-center justify-end gap-2 text-chip text-ink-2">
                                <time dateTime={message.occurredAt}>{formatThreadTime(message.occurredAt)}</time>
                                {pending.deliveryState === "sending" && <span>Sending…</span>}
                                {pending.deliveryState === "failed" && (
                                  <button
                                    className="font-medium text-danger underline decoration-danger/40 underline-offset-2"
                                    onClick={() => void retryMessage(selectedThread.id, String(message.id))}
                                    type="button"
                                  >
                                    Retry
                                  </button>
                                )}
                              </div>
                            </div>
                          </SettledItem>
                        );
                      })}
                    </div>
                  </section>
                ))}
                  <div ref={threadEndRef} />
                </div>
              </div>
              {showJumpToLatest && (
                <Button
                  aria-label="Jump to latest message"
                  className="absolute bottom-4 right-4 z-10 shadow-lg"
                  onClick={jumpToLatest}
                  size="sm"
                  variant="secondary"
                >
                  <ArrowDown aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Latest
                </Button>
              )}
            </div>

            <div className="shrink-0 border-t border-line bg-surface px-3 py-3 md:px-6 md:py-4">
              {sample && <p className="mx-auto mb-2 max-w-3xl rounded-control bg-surface-2 px-3 py-2 text-label text-ink-2">Sample conversations are read-only. Connect the live thread service to categorize, star, mark, or send replies.</p>}
              {imageAttachment && <div className="mx-auto mb-2 flex max-w-3xl items-center gap-3 rounded-control border border-line bg-surface-2 p-2"><img alt="Image ready to send" className="size-14 rounded-control object-cover" src={imageAttachment.previewUrl} /><div className="min-w-0 flex-1"><p className="truncate text-label font-medium text-ink">{imageAttachment.name}</p><p className="mt-0.5 text-chip text-ink-2">Ready to send through WhatsApp</p></div><button aria-label="Remove attached image" className="inline-flex size-9 items-center justify-center rounded-full text-ink-2 outline-none hover:bg-surface focus-visible:ring-3 focus-visible:ring-ring/50" onClick={clearImageAttachment} type="button"><X aria-hidden="true" className="size-4" /></button></div>}
              <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-card border border-line bg-surface-2 p-2 focus-within:ring-3 focus-within:ring-ring/40">
                <button aria-label="Attach image" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 outline-none hover:bg-surface focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40" disabled={sample || uploadingImage} onClick={() => imageInputRef.current?.click()} type="button"><ImagePlus aria-hidden="true" className="size-5" /></button>
                <input ref={imageInputRef} accept={INBOX_IMAGE_TYPES.join(",")} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void selectImage(file); event.currentTarget.value = ""; }} type="file" />
                <textarea
                  aria-label={`Reply to ${selectedThread.leadName}`}
                  className="max-h-36 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-body leading-relaxed text-ink outline-none placeholder:text-ink-3"
                  disabled={sample}
                  onChange={(event) => setDraft(event.target.value)}
                  onInput={(event) => {
                    event.currentTarget.style.height = "auto";
                    event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 144)}px`;
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    void sendMessage();
                  }}
                  placeholder={`Reply to ${selectedThread.leadName.split(/\s+/)[0]}…`}
                  ref={composerRef}
                  rows={1}
                  value={draft}
                />
                <Button disabled={sample || uploadingImage || (!draft.trim() && !imageAttachment)} loading={uploadingImage} onClick={() => void sendMessage()} size="sm">
                  <Send aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Send
                </Button>
              </div>
              <p className="mx-auto mt-2 max-w-3xl px-2 text-chip text-ink-3">Attach an image or write a reply. Enter to send · Shift+Enter for a new line. Sends immediately via the paired Hermes WhatsApp connection.</p>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-5">
            <EmptyState
              action={threadId ? <div className="flex flex-wrap justify-center gap-2">{threadError && <Button onClick={() => setThreadRetry((current) => current + 1)}>Try again</Button>}<Button asChild variant="secondary"><Link to="/reengage/inbox">Back to inbox</Link></Button></div> : undefined}
              className="w-full max-w-md"
              icon={MessageCircle}
              message={threadId ? threadError || "This conversation could not be found." : (
                <>
                  <span className="block">Select a conversation</span>
                  <span className="mt-1 block text-chip text-ink-3">Choose a thread from the list to read and reply.</span>
                </>
              )}
            />
          </div>
        )}
      </section>
    </main>
  );
}
