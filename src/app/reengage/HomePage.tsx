import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CircleAlert, Megaphone, Upload, UserPlus } from "lucide-react";
import { Link } from "react-router";
import { Cell, Pie, PieChart } from "recharts";
import {
  getCampaigns,
  getReplies,
  getSummary,
  type CampaignRecord,
  type ReplyCategory,
  type ReplyConversationRecord,
  type WorkspaceSummary,
} from "../../lib/api";
import {
  Card,
  PageHeader,
  SampleDataPill,
  Skeleton,
  StatCard,
  StatusPill,
  buttonVariants,
  type Status,
} from "../components/system";
import { ChartContainer, type ChartConfig } from "../components/ui/chart";
import BatchApprovalPanel from "./BatchApprovalPanel";
import CampaignBentoGrid from "./CampaignBentoGrid";
import { summarizeHome } from "./home-model";

const REPLY_COLORS = {
  Interested: "var(--mint)",
  Question: "var(--cyan)",
  "Follow-up": "var(--lavender)",
  "Not Interested": "var(--warn)",
  "Out of Office": "var(--accent)",
  Unsubscribe: "var(--danger)",
} satisfies Record<ReplyCategory, string>;

export const replyChartConfig = {
  Interested: { label: "Interested", color: REPLY_COLORS.Interested },
  Question: { label: "Question", color: REPLY_COLORS.Question },
  "Follow-up": { label: "Follow-up", color: REPLY_COLORS["Follow-up"] },
  "Not Interested": { label: "Not Interested", color: REPLY_COLORS["Not Interested"] },
  "Out of Office": { label: "Out of Office", color: REPLY_COLORS["Out of Office"] },
  Unsubscribe: { label: "Unsubscribe", color: REPLY_COLORS.Unsubscribe },
} satisfies ChartConfig;

function replyColor(name: string) {
  return name in REPLY_COLORS
    ? REPLY_COLORS[name as ReplyCategory]
    : "var(--surface-2)";
}

function draftStatus(status: CampaignRecord["status"]): Status {
  if (status === "sending") return "running";
  if (status === "sent") return "done";
  return status;
}

function todayLabel(date = new Date()) {
  return date.toLocaleDateString("en-SG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function HomePage() {
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [replies, setReplies] = useState<ReplyConversationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([getSummary(), getCampaigns(), getReplies()]).then(
      ([summaryResult, campaignResult, replyResult]) => {
        if (!active) return;
        if (summaryResult.status === "fulfilled") setSummary(summaryResult.value);
        else setSummaryError(summaryResult.reason instanceof Error ? summaryResult.reason.message : "Lead totals are unavailable.");

        if (campaignResult.status === "fulfilled") setCampaigns(campaignResult.value.data);
        else setCampaignError(campaignResult.reason instanceof Error ? campaignResult.reason.message : "Campaigns are unavailable.");

        if (replyResult.status === "fulfilled") setReplies(replyResult.value.data);
        else setReplyError(replyResult.reason instanceof Error ? replyResult.reason.message : "Reply totals are unavailable.");

        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const homeSummary = useMemo(
    () => summarizeHome({ summary, campaigns, replies }),
    [campaigns, replies, summary],
  );
  const replyChartData = homeSummary.replyCategories.length
    ? homeSummary.replyCategories
    : [{ name: "No replies", value: 1 }];

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 [scrollbar-width:none] sm:px-6 md:px-7 md:py-7">
      <div className="mx-auto max-w-[1180px] space-y-7">
        <PageHeader
          actions={(
            <>
              <Link className={buttonVariants({ variant: "primary" })} to="/reengage/campaigns/new">
                <Megaphone aria-hidden="true" className="size-4" />
                New campaign
              </Link>
              <Link className={buttonVariants({ variant: "secondary" })} to="/reengage/leads?action=import">
                <Upload aria-hidden="true" className="size-4" />
                Upload leads
              </Link>
              <Link className={buttonVariants({ variant: "secondary" })} to="/reengage/leads?action=add">
                <UserPlus aria-hidden="true" className="size-4" />
                Add lead
              </Link>
            </>
          )}
          meta={todayLabel()}
          subtitle="Prepare, approve, and send today's follow-ups."
          title="Home"
        />

        <BatchApprovalPanel />

        <section aria-labelledby="active-campaigns-title" className="space-y-4">
          <div>
            <h2 className="text-section-title font-medium text-ink" id="active-campaigns-title">Active campaigns</h2>
            <p className="mt-1 text-label text-ink-2">A quick view of every campaign currently moving.</p>
          </div>
          <CampaignBentoGrid
            campaigns={campaigns}
            error={campaignError}
            loading={loading}
            replies={replies}
          />
        </section>

        {(summaryError || replyError) && (
          <div className="flex gap-3 rounded-control border border-danger/20 bg-danger/10 p-4" role="alert">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-danger" strokeWidth={1.75} />
            <div>
              <p className="text-body font-medium text-danger">Some live totals could not be loaded</p>
              <p className="mt-1 text-label text-ink-2">{[summaryError, replyError].filter(Boolean).join(" ")}</p>
            </div>
          </div>
        )}

        <section aria-labelledby="workspace-stats-title" className="space-y-4">
          <h2 className="sr-only" id="workspace-stats-title">Workspace statistics</h2>
          {loading ? (
            <Skeleton label="Loading workspace statistics" rows={3} variant="cards" />
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                label="Total leads"
                trend={summary ? `${summary.sendable.toLocaleString()} reachable on WhatsApp` : "Live total unavailable"}
                value={homeSummary.totalLeads?.toLocaleString() ?? "—"}
              />
              <StatCard
                chart={(
                  <div className="relative size-24">
                    <ChartContainer className="size-24 aspect-auto" config={replyChartConfig}>
                      <PieChart accessibilityLayer>
                        <Pie
                          data={replyChartData}
                          dataKey="value"
                          innerRadius={27}
                          nameKey="name"
                          outerRadius={42}
                          stroke="var(--surface)"
                          strokeWidth={2}
                        >
                          {replyChartData.map((entry) => (
                            <Cell fill={replyColor(entry.name)} key={entry.name} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-body font-medium tabular-nums text-ink">
                      {homeSummary.repliesThisWeek}
                    </span>
                  </div>
                )}
                label="Replies this week"
                trend={replyError
                  ? "Live total unavailable"
                  : homeSummary.replyCategories[0]
                    ? `${homeSummary.replyCategories[0].name}: ${homeSummary.replyCategories[0].value}`
                    : "No replies yet"}
                value={replyError ? "—" : homeSummary.repliesThisWeek.toLocaleString()}
              />
              <StatCard
                label={<span className="inline-flex flex-wrap items-center gap-2">Messages sent this week <SampleDataPill label="Sample" /></span>}
                trend={campaignError ? "Campaign totals unavailable" : "Modelled from labelled campaign performance"}
                value={campaignError ? "—" : homeSummary.messagesSentThisWeek.toLocaleString()}
              />
            </div>
          )}
        </section>

        {homeSummary && homeSummary.drafts.length > 0 && (
          <section aria-labelledby="draft-campaigns-title" className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-section-title font-medium text-ink" id="draft-campaigns-title">Draft campaigns</h2>
                <p className="mt-1 text-label text-ink-2">Finish the message and audience before queueing.</p>
              </div>
              <Link className={buttonVariants({ size: "sm", variant: "ghost" })} to="/reengage/campaigns">
                View all <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {homeSummary.drafts.slice(0, 3).map((campaign) => (
                <Link
                  className="rounded-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  key={campaign.id}
                  to={`/reengage/campaigns/${encodeURIComponent(campaign.id)}`}
                >
                  <Card className="h-full p-4 transition-colors hover:bg-surface-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-card-title font-medium text-ink">{campaign.title}</h3>
                        <p className="mt-1 text-label text-ink-2">
                          {campaign.audience_count.toLocaleString()} people selected
                        </p>
                      </div>
                      <StatusPill status={draftStatus(campaign.status)} />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default HomePage;
