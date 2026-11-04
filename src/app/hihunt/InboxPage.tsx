import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CircleAlert, Inbox as InboxIcon, Mail, RefreshCw, RotateCcw, Send } from "lucide-react";
import { Link, useParams } from "react-router";
import {
  getEmailAccount,
  getEmailThread,
  getEmailThreads,
  replyToEmailThread,
  type EmailAccountRecord,
  type EmailThreadRecord,
  type EmailThreadSummary,
} from "../../lib/stubs";
import { Button, EmptyState, FilterChips, SampleDataPill, SearchInput, Skeleton, StatusPill, toast } from "../components/system";
import { cn } from "../components/ui/utils";
import {
  filterAndSortEmailThreads,
  getEmailThreadHref,
  getEmailThreadRequestDecision,
  getInterestFilterOptions,
  isEmailThreadDetailRequestCurrent,
  reconcileSuccessfulEmailReply,
  removePendingEmail,
  toEmailThreadSummary,
  upsertEmailThreadSummary,
  upsertNewestEmailThreadSummary,
  type PendingEmailMessage,
  type InterestFilterValue,
} from "./inbox-model";

type InboxPageProps = {
  initialThreads?: EmailThreadSummary[];
  initialSelectedThread?: EmailThreadRecord | null;
  initialAccount?: EmailAccountRecord | null;
  initialAccountError?: string | null;
  initialSample?: boolean;
  initialListError?: string | null;
  initialThreadError?: string | null;
  onCountsChange?: (counts: { unread: number; total: number }) => void;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function makeIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `email-reply-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function initials(name: string | null, address: string) {
  const source = name?.trim() || address.split("@")[0] || "?";
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function InboxPage({
  initialAccount,
  initialAccountError = null,
  initialListError = null,
  initialSample = false,
  initialSelectedThread = null,
  initialThreadError = null,
  initialThreads,
  onCountsChange,
}: InboxPageProps) {
  const { threadId } = useParams<{ threadId?: string }>();
  const [threads, setThreads] = useState<EmailThreadSummary[]>(initialThreads ?? []);
  const [selectedThread, setSelectedThread] = useState<EmailThreadRecord | null>(threadId ? initialSelectedThread : null);
  const [account, setAccount] = useState<EmailAccountRecord | null>(initialAccount ?? null);
  const [listSample, setListSample] = useState(initialSample);
  const [threadSample, setThreadSample] = useState(initialSample);
  const [accountSample, setAccountSample] = useState(initialSample);
  const [loadingList, setLoadingList] = useState(initialThreads === undefined && !initialListError);
  const [loadingThread, setLoadingThread] = useState(Boolean(threadId && !initialSelectedThread && !initialThreadError));
  const [loadingAccount, setLoadingAccount] = useState(initialAccount === undefined && !initialAccountError);
  const [listError, setListError] = useState<string | null>(initialListError);
  const [threadError, setThreadError] = useState<string | null>(initialThreadError);
  const [accountError, setAccountError] = useState<string | null>(initialAccountError);
  const [threadRetry, setThreadRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<InterestFilterValue>("all");
  const [draft, setDraft] = useState("");
  const [pendingByThread, setPendingByThread] = useState<Record<string, PendingEmailMessage[]>>({});
  const lastThreadRequest = useRef("");
  const threadRequest = useRef(0);
  const replyGenerationByThread = useRef<Record<string, number>>({});
  const activeThreadIdRef = useRef(threadId);
  const listRequest = useRef(0);
  const listMutationGeneration = useRef(0);
  const accountRequest = useRef(0);
  const onCountsChangeRef = useRef(onCountsChange);

  activeThreadIdRef.current = threadId;

  useEffect(() => { onCountsChangeRef.current = onCountsChange; }, [onCountsChange]);

  const loadThreads = useCallback(async () => {
    const request = ++listRequest.current;
    const mutationGeneration = listMutationGeneration.current;
    setLoadingList(true);
    setListError(null);
    try {
      const result = await getEmailThreads();
      if (request !== listRequest.current || mutationGeneration !== listMutationGeneration.current) return;
      setThreads(result.data);
      setListSample(result.sample);
      if (!result.sample) onCountsChangeRef.current?.({ unread: result.unread, total: result.total });
    } catch (error) {
      if (request !== listRequest.current || mutationGeneration !== listMutationGeneration.current) return;
      const message = getErrorMessage(error);
      setListError(message);
      toast.error("Email inbox could not be loaded", { description: message });
    } finally {
      if (request === listRequest.current) setLoadingList(false);
    }
  }, []);

  const loadAccount = useCallback(async () => {
    const request = ++accountRequest.current;
    setLoadingAccount(true);
    setAccountError(null);
    try {
      const result = await getEmailAccount();
      if (request !== accountRequest.current) return;
      setAccount(result.data);
      setAccountSample(result.sample);
    } catch (error) {
      if (request !== accountRequest.current) return;
      setAccount(null);
      setAccountError(getErrorMessage(error));
    } finally {
      if (request === accountRequest.current) setLoadingAccount(false);
    }
  }, []);

  useEffect(() => {
    if (initialThreads === undefined && !initialListError) void loadThreads();
    if (initialAccount === undefined && !initialAccountError) void loadAccount();
    return () => { listRequest.current += 1; accountRequest.current += 1; threadRequest.current += 1; };
  }, [initialAccount, initialAccountError, initialListError, initialThreads, loadAccount, loadThreads]);

  useEffect(() => {
    if (!listSample && !threadSample) {
      onCountsChangeRef.current?.({ unread: threads.filter((thread) => thread.unread).length, total: threads.length });
    }
  }, [listSample, threadSample, threads]);

  const selectedMatchesRoute = selectedThread?.id === threadId;
  useEffect(() => {
    setDraft("");
  }, [threadId]);

  useEffect(() => {
    if (!threadId) {
      lastThreadRequest.current = "";
      threadRequest.current += 1;
      setSelectedThread(null);
      setThreadSample(false);
      setThreadError(null);
      setLoadingThread(false);
      return;
    }
    if (selectedMatchesRoute) {
      setThreadError(null);
      setLoadingThread(false);
      return;
    }
    const decision = getEmailThreadRequestDecision(lastThreadRequest.current, threadId, threadRetry);
    if (!decision.shouldLoad) return;
    lastThreadRequest.current = decision.nextRequest;
    const request = ++threadRequest.current;
    const replyGeneration = replyGenerationByThread.current[threadId] ?? 0;
    setLoadingThread(true);
    setThreadError(null);
    getEmailThread(threadId)
      .then((result) => {
        if (!isEmailThreadDetailRequestCurrent(request, threadRequest.current, replyGeneration, replyGenerationByThread.current[threadId])) return;
        if (!result.data) {
          setSelectedThread(null);
          setThreadError("This email thread could not be found.");
          return;
        }
        setSelectedThread(result.data);
        setThreadSample(result.sample);
        if (!result.sample) setThreads((current) => upsertEmailThreadSummary(current, toEmailThreadSummary(result.data!)));
      })
      .catch((error) => {
        if (!isEmailThreadDetailRequestCurrent(request, threadRequest.current, replyGeneration, replyGenerationByThread.current[threadId])) return;
        setSelectedThread(null);
        setThreadError(getErrorMessage(error));
      })
      .finally(() => {
        if (request === threadRequest.current) setLoadingThread(false);
      });
  }, [selectedMatchesRoute, threadId, threadRetry]);

  const filteredThreads = useMemo(() => filterAndSortEmailThreads(threads, query, category), [category, query, threads]);
  const interestOptions = useMemo(() => getInterestFilterOptions(threads), [threads]);
  const selectedPending = threadId ? pendingByThread[threadId] ?? [] : [];
  const readOnly = listSample || threadSample || accountSample;
  const canReply = Boolean(!readOnly && account?.status === "connected" && account.address && selectedThread && selectedMatchesRoute);
  const showLoadingThread = loadingThread || Boolean(threadId && !selectedMatchesRoute && !threadError);

  const sendPending = async (target: EmailThreadRecord, pending: PendingEmailMessage) => {
    setPendingByThread((current) => ({ ...current, [target.id]: (current[target.id] ?? []).map((item) => item.id === pending.id ? { ...item, deliveryState: "sending" } : item) }));
    try {
      const result = await replyToEmailThread(target.id, pending.body, pending.idempotencyKey);
      replyGenerationByThread.current[target.id] = (replyGenerationByThread.current[target.id] ?? 0) + 1;
      listMutationGeneration.current += 1;
      const fallbackNext = reconcileSuccessfulEmailReply(target, pending, result.messageId, result.sentAt);
      setThreads((current) => upsertNewestEmailThreadSummary(current, toEmailThreadSummary(fallbackNext)));
      setSelectedThread((current) => {
        if (current?.id === target.id) return reconcileSuccessfulEmailReply(current, pending, result.messageId, result.sentAt);
        return activeThreadIdRef.current === target.id ? fallbackNext : current;
      });
      if (activeThreadIdRef.current === target.id) setLoadingThread(false);
      setPendingByThread((current) => removePendingEmail(current, target.id, pending.id));
      toast.success("Reply sent.");
    } catch (error) {
      setPendingByThread((current) => ({ ...current, [target.id]: (current[target.id] ?? []).map((item) => item.id === pending.id ? { ...item, deliveryState: "failed" } : item) }));
      toast.error("Reply could not be sent", { description: getErrorMessage(error) });
    }
  };

  const submitReply = () => {
    if (!selectedThread || !account?.address || !canReply || !draft.trim()) return;
    const idempotencyKey = makeIdempotencyKey();
    const pending: PendingEmailMessage = {
      id: `pending:${idempotencyKey}`,
      idempotencyKey,
      deliveryState: "sending",
      direction: "outbound",
      from: { name: account.displayName, address: account.address },
      to: [selectedThread.sender],
      occurredAt: new Date().toISOString(),
      body: draft.trim(),
    };
    setPendingByThread((current) => ({ ...current, [selectedThread.id]: [...(current[selectedThread.id] ?? []), pending] }));
    setDraft("");
    void sendPending(selectedThread, pending);
  };

  return (
    <main className="flex min-h-0 flex-1 overflow-hidden bg-bg" data-slot="hihunt-inbox">
      <aside className={cn("min-h-0 w-full flex-col border-r border-line bg-surface md:flex md:w-[23rem] md:shrink-0", threadId ? "hidden md:flex" : "flex")} aria-label="Email threads">
        <div className="border-b border-line p-4 md:p-5">
          <div className="flex items-center justify-between gap-3"><div><h1 className="text-section-title font-medium text-ink">Inbox</h1><p className="mt-1 text-label text-ink-2">Replies to Hi-Hunt outreach</p></div>{listSample && <SampleDataPill />}</div>
          <div className="mt-4 space-y-3"><SearchInput onValueChange={setQuery} placeholder="Search sender, subject, or campaign" value={query} /><FilterChips label="Reply interest" onValueChange={(value) => setCategory(value as InterestFilterValue)} options={interestOptions} value={category} /></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadingList ? <Skeleton className="p-4" rows={6} variant="list" label="Loading email threads" /> : listError ? (
            <EmptyState className="m-4" icon={CircleAlert} message={listError} action={<Button onClick={() => void loadThreads()} variant="secondary">Try again</Button>} />
          ) : filteredThreads.length === 0 ? (
            <EmptyState className="m-4" icon={InboxIcon} message={query ? "No email threads match these filters." : category === "all" ? "No email replies yet." : `No ${category.toLowerCase()} email replies yet.`} action={query || category !== "all" ? <Button onClick={() => { setQuery(""); setCategory("all"); }} variant="secondary">Clear filters</Button> : undefined} />
          ) : filteredThreads.map((thread) => (
            <Link aria-current={thread.id === threadId ? "page" : undefined} className={cn("flex min-h-24 gap-3 border-b border-line px-4 py-4 outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50", thread.id === threadId && "bg-surface-2")} key={thread.id} to={getEmailThreadHref(thread.id)}>
              <span aria-hidden="true" className={cn("mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-chip font-semibold text-ink", thread.unread ? "bg-accent" : "bg-surface-2")}>{initials(thread.sender.name, thread.sender.address)}</span>
              <span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><span className={cn("truncate text-body text-ink", thread.unread && "font-semibold")}>{thread.sender.name || thread.sender.address}</span><span className="shrink-0 text-chip text-ink-3">{formatDateTime(thread.lastMessageAt)}</span></span><span className="mt-1 block truncate text-label font-medium text-ink">{thread.subject}</span><span className="mt-1 block truncate text-chip text-ink-2">{thread.snippet}</span><span className="mt-2 inline-flex rounded-full bg-surface-2 px-2 py-1 text-chip text-ink-2">{thread.workflowName || "Unassigned"}</span></span>
            </Link>
          ))}
        </div>
      </aside>

      <section className={cn("min-h-0 min-w-0 flex-1 flex-col bg-bg", threadId ? "flex" : "hidden md:flex")} aria-label="Selected email thread">
        {!threadId ? <EmptyState className="m-auto" icon={Mail} message="Choose an email thread to read and reply." /> : showLoadingThread ? <Skeleton className="m-5" rows={5} variant="cards" label="Loading email thread" /> : threadError || !selectedThread || !selectedMatchesRoute ? (
          <EmptyState className="m-auto" icon={CircleAlert} message={threadError || "This email thread could not be found."} action={<div className="flex gap-2"><Button asChild variant="secondary"><Link to="/hihunt/inbox"><ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />Back to inbox</Link></Button><Button onClick={() => setThreadRetry((current) => current + 1)}><RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.75} />Try again</Button></div>} />
        ) : (
          <>
            <header className="border-b border-line bg-surface px-4 py-4 md:px-6">
              <div className="flex items-start gap-3"><Button asChild className="md:hidden" size="sm" variant="ghost"><Link aria-label="Back to email threads" to="/hihunt/inbox"><ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />Back</Link></Button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-card-title font-medium text-ink">{selectedThread.subject}</h2><StatusPill label={selectedThread.status === "needs_reply" ? "Needs reply" : "Replied"} status={selectedThread.status === "needs_reply" ? "queued" : "done"} />{threadSample && <SampleDataPill />}</div><p className="mt-1 text-label text-ink-2">{selectedThread.sender.name || selectedThread.sender.address} · {selectedThread.workflowName || "Unassigned"}</p></div></div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
              <div className="mx-auto max-w-3xl space-y-3">
                {[...selectedThread.messages, ...selectedPending].sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)).map((message) => {
                  const pending = "deliveryState" in message ? message as PendingEmailMessage : null;
                  return (
                    <article className={cn("rounded-card border border-line p-4 md:p-5", message.direction === "outbound" ? "ml-auto bg-surface-2" : "mr-auto bg-surface", "max-w-[92%]")} key={message.id}>
                      <dl className="grid gap-x-3 gap-y-1 text-chip text-ink-2 sm:grid-cols-[auto_1fr]"><dt className="font-medium text-ink">From</dt><dd className="break-all">{message.from.name ? `${message.from.name} <${message.from.address}>` : message.from.address}</dd><dt className="font-medium text-ink">To</dt><dd className="break-all">{message.to.map((party) => party.name ? `${party.name} <${party.address}>` : party.address).join(", ")}</dd><dt className="font-medium text-ink">Time</dt><dd>{formatDateTime(message.occurredAt)}</dd></dl>
                      <p className="mt-4 whitespace-pre-wrap text-body leading-6 text-ink">{message.body}</p>
                      {pending && <div className="mt-3 flex items-center gap-2 text-chip text-ink-2">{pending.deliveryState === "sending" ? "Sending…" : <><span className="text-danger">Send failed</span><Button onClick={() => void sendPending(selectedThread, pending)} size="sm" variant="ghost"><RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.75} />Retry</Button></>}</div>}
                    </article>
                  );
                })}
              </div>
            </div>
            <footer className="border-t border-line bg-surface p-4 md:px-6">
              <div className="mx-auto max-w-3xl">
                {loadingAccount ? <Skeleton rows={2} variant="list" label="Checking connected sender" /> : (
                  <>
                    {accountError ? (
                      <div className="flex items-start justify-between gap-3 rounded-control border border-danger/20 bg-danger/10 p-3 text-label" role="alert">
                        <div><p className="font-medium text-danger">Sending account is unavailable</p><p className="mt-1 text-ink-2">{accountError}</p></div>
                        <Button onClick={() => void loadAccount()} size="sm" variant="secondary">Retry account</Button>
                      </div>
                    ) : (
                      <div className="text-chip text-ink-2">{account?.status === "connected" && account.address ? `Sending from ${account.address}` : "Connect an email account in Settings to reply."}</div>
                    )}
                    {readOnly && <p className="mt-2 text-chip text-ink-2">Sample inbox data is read-only. Load the live email service before sending.</p>}
                    <div className="mt-3 flex items-end gap-2"><textarea aria-label="Email reply" className="min-h-24 flex-1 resize-y rounded-control border border-line bg-surface-2 px-3.5 py-3 text-body text-ink outline-none focus:ring-3 focus:ring-ring/40 disabled:opacity-45" disabled={!canReply} onChange={(event) => setDraft(event.target.value)} placeholder="Write a reply" value={draft} /><Button disabled={!canReply || !draft.trim()} onClick={submitReply} size="lg"><Send aria-hidden="true" className="size-4" strokeWidth={1.75} />Send reply</Button></div>
                  </>
                )}
              </div>
            </footer>
          </>
        )}
      </section>
    </main>
  );
}

export default InboxPage;
export type { InboxPageProps };
