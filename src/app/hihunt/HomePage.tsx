import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CircleAlert,
  Clock3,
  MailCheck,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router";
import { Cell, Pie, PieChart } from "recharts";
import { getHRProspects, type HRDiscoveryProvider, type HRDiscoverySummary } from "../../lib/api";
import {
  getEmailAccount,
  getEmailThreads,
  getOutreachDrafts,
  type EmailAccountRecord,
  type EmailThreadSummary,
  type OutreachDraft,
} from "../../lib/stubs";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  SampleDataPill,
  Skeleton,
  StatCard,
  StatusPill,
  buttonVariants,
} from "../components/system";
import { ChartContainer, type ChartConfig } from "../components/ui/chart";
import { useBadges } from "../layout/BadgesContext";
import PendingEmailBatchPanel from "./PendingEmailBatchPanel";
import {
  buildReplyHighlights,
  formatNextRunCountdown,
  summarizeHiHuntHome,
} from "./home-model";

const REPLY_RATE_COLORS = {
  Replies: "var(--mint)",
  "No reply": "var(--surface-2)",
  Unavailable: "var(--surface-2)",
} as const;

const replyRateChartConfig = {
  Replies: { label: "Replies", color: REPLY_RATE_COLORS.Replies },
  "No reply": { label: "No reply", color: REPLY_RATE_COLORS["No reply"] },
  Unavailable: { label: "Reply rate unavailable", color: REPLY_RATE_COLORS.Unavailable },
} satisfies ChartConfig;

function todayLabel(date = new Date()) {
  return date.toLocaleDateString("en-SG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function dateTimeLabel(value: string | null) {
  if (!value) return "No completed run yet";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Run time unavailable";
  return date.toLocaleString("en-SG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Recently";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function nextDailyDiscoveryAt(now: Date) {
  const next = new Date(now);
  next.setHours(7, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

function HomePage() {
  const { refresh: refreshBadges } = useBadges();
  const [discoverySummary, setDiscoverySummary] = useState<HRDiscoverySummary | null>(null);
  const [discoveryProvider, setDiscoveryProvider] = useState<HRDiscoveryProvider | null>(null);
  const [drafts, setDrafts] = useState<OutreachDraft[]>([]);
  const [threads, setThreads] = useState<EmailThreadSummary[]>([]);
  const [account, setAccount] = useState<EmailAccountRecord | null>(null);
  const [draftSample, setDraftSample] = useState(false);
  const [threadSample, setThreadSample] = useState(false);
  const [accountSample, setAccountSample] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setLoading(true);
    setDiscoveryError(null);
    setDraftError(null);
    setThreadError(null);
    setAccountError(null);
    const [discoveryResult, draftResult, threadResult, accountResult] = await Promise.allSettled([
      getHRProspects({ limit: 1 }),
      getOutreachDrafts(),
      getEmailThreads(),
      getEmailAccount(),
    ]);
    if (loadRequestRef.current !== requestId) return;

    if (discoveryResult.status === "fulfilled") {
      setDiscoverySummary(discoveryResult.value.summary);
      setDiscoveryProvider(discoveryResult.value.provider);
    } else {
      setDiscoveryError(discoveryResult.reason instanceof Error ? discoveryResult.reason.message : "Discovery activity is unavailable.");
    }
    if (draftResult.status === "fulfilled") {
      setDrafts(draftResult.value.data);
      setDraftSample(draftResult.value.sample);
    } else {
      setDraftError(draftResult.reason instanceof Error ? draftResult.reason.message : "Pending emails are unavailable.");
    }
    if (threadResult.status === "fulfilled") {
      setThreads(threadResult.value.data);
      setThreadSample(threadResult.value.sample);
    } else {
      setThreadError(threadResult.reason instanceof Error ? threadResult.reason.message : "Email replies are unavailable.");
    }
    if (accountResult.status === "fulfilled") {
      setAccount(accountResult.value.data);
      setAccountSample(accountResult.value.sample);
    } else {
      setAccountError(accountResult.reason instanceof Error ? accountResult.reason.message : "The sending account is unavailable.");
    }
    setNow(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      loadRequestRef.current += 1;
      window.clearInterval(interval);
    };
  }, [load]);

  const latestDiscoveryRun = discoverySummary?.lastRun ?? null;
  const digests = useMemo(() => {
    if (!latestDiscoveryRun) return [];
    const nextRunAt = nextDailyDiscoveryAt(now);
    return [{
      id: latestDiscoveryRun.id,
      name: "Singapore HR lead discovery",
      found: latestDiscoveryRun.saved_count,
      skippedDuplicates: Math.max(0, (latestDiscoveryRun.searched_count ?? latestDiscoveryRun.saved_count) - latestDiscoveryRun.saved_count),
      drafted: 0,
      runStatus: latestDiscoveryRun.status,
      lastRunAt: latestDiscoveryRun.completed_at ?? latestDiscoveryRun.started_at,
      nextRunAt,
      nextRunCountdown: formatNextRunCountdown(nextRunAt, now),
    }];
  }, [latestDiscoveryRun, now]);
  const summary = useMemo(
    () => summarizeHiHuntHome({ digests, drafts, threads, now }),
    [digests, drafts, now, threads],
  );
  const highlights = useMemo(() => buildReplyHighlights(threads), [threads]);
  const replyChartData = summary.replyRate === null
    ? [{ name: "Unavailable", value: 1 }]
    : [
        { name: "Replies", value: summary.repliesReceived },
        { name: "No reply", value: summary.emailsWithoutReply },
      ];
  const errors = [discoveryError, draftError, threadError, accountError].filter(Boolean);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 [scrollbar-width:none] sm:px-6 md:px-7 md:py-7">
      <div className="mx-auto max-w-[1180px] space-y-7">
        <PageHeader
          actions={(
            <>
              <Link className={buttonVariants({ variant: "primary" })} to="/hihunt/workflows">
                <Sparkles aria-hidden="true" className="size-4" />
                Workflows
              </Link>
              <Link className={buttonVariants({ variant: "secondary" })} to="/hihunt/inbox">
                <MailCheck aria-hidden="true" className="size-4" />
                Open inbox
              </Link>
            </>
          )}
          meta={todayLabel()}
          subtitle="See what automation prepared overnight, review it once, and send."
          title="Home"
        />

        {errors.length > 0 && (
          <div className="flex flex-col gap-3 rounded-control border border-danger/20 bg-danger/10 p-4 sm:flex-row sm:items-center" role="alert">
            <CircleAlert aria-hidden="true" className="size-[18px] shrink-0 text-danger" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-danger">Some live Hi-Hunt data could not be loaded</p>
              <p className="mt-1 text-label text-ink-2">{errors.join(" ")}</p>
            </div>
            <Button onClick={() => void load()} size="sm" variant="secondary">
              <RefreshCw aria-hidden="true" className="size-4" />
              Retry
            </Button>
          </div>
        )}

        <Card
          action={discoveryProvider ? (
            <span className="text-chip text-ink-2">
              {discoveryProvider.providers.filter((provider) => provider.configured).length} provider(s) connected
              {discoveryProvider.perProviderLimit ? ` · ${discoveryProvider.perProviderLimit} max each` : ""}
            </span>
          ) : undefined}
          description="The latest daily Singapore HR discovery run, using each connected provider safely."
          title="What happened overnight"
        >
          {loading ? (
            <Skeleton label="Loading overnight workflow activity" rows={2} />
          ) : discoveryError ? (
            <EmptyState
              action={<Button onClick={() => void load()} size="sm" variant="secondary">Retry</Button>}
              icon={CircleAlert}
              message="Discovery activity is unavailable right now."
            />
          ) : digests.length === 0 ? (
            <EmptyState
              action={<Link className={buttonVariants({ size: "sm", variant: "secondary" })} to="/hihunt/leads">Open leads</Link>}
              icon={Sparkles}
              message="No discovery job has run yet."
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {digests.map((digest) => (
                <article className="rounded-card bg-surface-2 p-4" key={digest.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="truncate text-card-title font-medium text-ink">{digest.name}</h3>
                        {digest.runStatus && (
                          <StatusPill
                            label={digest.runStatus === "completed" ? "Completed" : digest.runStatus === "running" ? "Running" : "Failed"}
                            status={digest.runStatus === "completed" ? "done" : digest.runStatus === "running" ? "running" : "error"}
                          />
                        )}
                      </div>
                      <p className="mt-1 text-chip text-ink-2">Last run {dateTimeLabel(digest.lastRunAt)}</p>
                      {latestDiscoveryRun?.error_message && (
                        <p className="mt-2 text-chip text-danger">{latestDiscoveryRun.error_message}</p>
                      )}
                      {latestDiscoveryRun?.filters?.providerErrors?.map((failure) => (
                        <p className="mt-2 text-chip text-danger" key={failure.provider}>
                          {failure.message}
                        </p>
                      ))}
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-chip font-medium text-ink">
                      <Clock3 aria-hidden="true" className="size-4" strokeWidth={1.75} />
                      Next {digest.nextRunCountdown}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-control bg-surface p-3">
                      <Clock3 aria-hidden="true" className="size-4 text-ink-2" strokeWidth={1.75} />
                      <p className="mt-2 text-section-title font-medium tabular-nums text-ink">{latestDiscoveryRun?.requested_count?.toLocaleString() ?? "—"}</p>
                      <p className="mt-0.5 text-chip text-ink-2">Daily target</p>
                    </div>
                    <div className="rounded-control bg-surface p-3">
                      <Search aria-hidden="true" className="size-4 text-ink-2" strokeWidth={1.75} />
                      <p className="mt-2 text-section-title font-medium tabular-nums text-ink">{latestDiscoveryRun?.searched_count?.toLocaleString() ?? "—"}</p>
                      <p className="mt-0.5 text-chip text-ink-2">Searched</p>
                    </div>
                    <div className="rounded-control bg-surface p-3">
                      <MailCheck aria-hidden="true" className="size-4 text-ink-2" strokeWidth={1.75} />
                      <p className="mt-2 text-section-title font-medium tabular-nums text-ink">{latestDiscoveryRun?.saved_count.toLocaleString() ?? "—"}</p>
                      <p className="mt-0.5 text-chip text-ink-2">Verified saved</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>

        <PendingEmailBatchPanel
          accountAddress={account?.address ?? null}
          accountConnected={account?.status === "connected"}
          accountError={accountError}
          accountSample={accountSample}
          cap={account?.cap ?? null}
          drafts={drafts}
          loadError={draftError}
          loading={loading}
          onApproved={(draftIds) => {
            const approvedIds = new Set(draftIds);
            setDrafts((current) => current.map((draft) => (
              approvedIds.has(draft.id) ? { ...draft, status: "approved" } : draft
            )));
            if (draftIds.length > 0) refreshBadges();
          }}
          onDraftUpdated={(updated) => setDrafts((current) => current.map((draft) => draft.id === updated.id ? updated : draft))}
          onRetry={() => void load()}
          sample={draftSample}
        />

        <section aria-labelledby="hihunt-stats-title" className="space-y-4">
          <h2 className="sr-only" id="hihunt-stats-title">Hi-Hunt statistics</h2>
          {loading ? (
            <Skeleton label="Loading Hi-Hunt statistics" rows={3} variant="cards" />
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                label="Found overnight"
                trend={discoveryError ? "Discovery total unavailable" : "Verified leads saved by the latest run"}
                value={discoveryError ? "—" : summary.foundOvernight?.toLocaleString() ?? "—"}
              />
              <StatCard
                label={<span className="inline-flex flex-wrap items-center gap-2">Pending approval <SampleDataPill label="Sample" show={draftSample} /></span>}
                trend={draftSample ? "Sample drafts · review only" : "Ready for the daily send review"}
                value={draftError ? "—" : summary.pendingEmails.toLocaleString()}
              />
              <StatCard
                label={<span className="inline-flex flex-wrap items-center gap-2">Replies this week <SampleDataPill label="Sample" show={threadSample} /></span>}
                trend={threadError ? "Reply totals unavailable" : `${summary.needsReplyThreads} need ${summary.needsReplyThreads === 1 ? "a reply" : "replies"}`}
                value={threadError ? "—" : summary.repliesThisWeek.toLocaleString()}
              />
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
          <Card
            action={<SampleDataPill label="Sample metric" show={draftSample || threadSample} />}
            description="Share of tracked sent emails that received a reply."
            title="Reply rate"
          >
            {loading ? (
              <Skeleton label="Loading reply rate" rows={2} />
            ) : threadError || draftError ? (
              <EmptyState icon={CircleAlert} message="Reply-rate data is unavailable." />
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <div className="relative size-36 shrink-0">
                  <ChartContainer className="size-36 aspect-auto" config={replyRateChartConfig}>
                    <PieChart accessibilityLayer>
                      <Pie
                        data={replyChartData}
                        dataKey="value"
                        innerRadius={43}
                        nameKey="name"
                        outerRadius={62}
                        stroke="var(--surface)"
                        strokeWidth={2}
                      >
                        {replyChartData.map((entry) => (
                          <Cell
                            fill={entry.name in REPLY_RATE_COLORS
                              ? REPLY_RATE_COLORS[entry.name as keyof typeof REPLY_RATE_COLORS]
                              : "var(--surface-2)"}
                            key={entry.name}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-section-title font-medium tabular-nums text-ink">
                    {summary.replyRate === null ? "—" : `${summary.replyRate}%`}
                  </span>
                </div>
                {summary.replyRate === null ? (
                  <div className="space-y-2 text-label text-ink-2">
                    <p className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-surface-2 ring-1 ring-line" />Reply rate unavailable</p>
                    <p>No tracked sent emails; {summary.repliesReceived} {summary.repliesReceived === 1 ? "reply was" : "replies were"} recorded.</p>
                  </div>
                ) : (
                  <div className="space-y-2 text-label text-ink-2">
                    <p className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-mint" />{summary.repliesReceived} replies</p>
                    <p className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-surface-2 ring-1 ring-line" />{summary.emailsWithoutReply} without reply</p>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card
            action={(
              <div className="flex flex-wrap items-center justify-end gap-2">
                <SampleDataPill show={threadSample} />
                <Link className={buttonVariants({ size: "sm", variant: "ghost" })} to="/hihunt/inbox">
                  View inbox <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </div>
            )}
            description="Recent conversations worth picking up next."
            title="Reply highlights"
          >
            {loading ? (
              <Skeleton label="Loading reply highlights" rows={3} />
            ) : threadError ? (
              <EmptyState icon={CircleAlert} message="Reply highlights are unavailable." />
            ) : highlights.length === 0 ? (
              <EmptyState icon={MailCheck} message="No email replies yet." />
            ) : (
              <div className="divide-y divide-line">
                {highlights.map((highlight) => (
                  <Link
                    className="flex min-h-16 items-center gap-3 rounded-control px-2 py-3 outline-none transition-colors hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/50"
                    key={highlight.id}
                    to={highlight.href}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-body font-medium text-ink">{highlight.senderName}</p>
                        <span className="truncate rounded-full bg-surface-2 px-2.5 py-1 text-chip text-ink-2">{highlight.workflowName}</span>
                      </div>
                      <p className="mt-1 truncate text-label font-medium text-ink">{highlight.subject}</p>
                      <p className="mt-0.5 truncate text-chip text-ink-2">{highlight.snippet}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-chip tabular-nums text-ink-3">{relativeTime(highlight.lastMessageAt)}</span>
                      <StatusPill
                        label={highlight.status === "needs_reply" ? "Needs reply" : "Replied"}
                        status={highlight.status === "needs_reply" ? "queued" : "done"}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </section>
      </div>
    </main>
  );
}

export { replyRateChartConfig };
export default HomePage;
