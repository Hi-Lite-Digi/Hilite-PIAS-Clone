import { Activity } from "lucide-react";
import { Link } from "react-router";
import { Bar, BarChart, Cell, XAxis } from "recharts";
import type { CampaignRecord, ReplyConversationRecord } from "../../lib/api";
import { Card, EmptyState, SampleDataPill, SettledItem, Skeleton, StatusPill, type Status } from "../components/system";
import { ChartContainer, type ChartConfig } from "../components/ui/chart";
import { cn } from "../components/ui/utils";
import { buildCampaignSnapshot } from "./home-model";

const chartConfig = {
  sent: { label: "Sent", color: "var(--ink-3)" },
} satisfies ChartConfig;

function campaignStatus(status: CampaignRecord["status"]): Status {
  if (status === "sending") return "running";
  if (status === "sent") return "done";
  return status;
}

function CampaignBentoGrid({
  campaigns,
  error,
  loading = false,
  replies,
}: {
  campaigns: CampaignRecord[];
  error?: string | null;
  loading?: boolean;
  replies: ReplyConversationRecord[];
}) {
  if (loading) return <Skeleton label="Loading active campaigns" rows={3} variant="cards" />;
  if (error) {
    return (
      <Card className="border-danger/20 bg-danger/10">
        <p className="text-body text-danger">{error}</p>
      </Card>
    );
  }

  const snapshots = campaigns
    .filter((campaign) => campaign.status !== "draft" && campaign.status !== "sent")
    .map((campaign) => buildCampaignSnapshot(campaign, replies));

  if (snapshots.length === 0) {
    return <EmptyState icon={Activity} message="No active campaigns yet." />;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {snapshots.map((snapshot, index) => {
        const progress = snapshot.total === 0 ? 0 : Math.round((snapshot.sent / snapshot.total) * 100);
        return (
          <SettledItem
            className={cn(index === 0 && "md:col-span-2 xl:col-span-1")}
            index={index}
            key={snapshot.campaign.id}
          >
          <Link
            aria-label={`Open ${snapshot.campaign.title}`}
            className="group block h-full rounded-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            to={`/reengage/campaigns/${encodeURIComponent(snapshot.campaign.id)}`}
          >
            <Card className="h-full transition-colors group-hover:bg-surface-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-card-title font-medium text-ink">{snapshot.campaign.title}</h3>
                  <p className="mt-1 text-label text-ink-2">
                    {snapshot.sent.toLocaleString()} of {snapshot.total.toLocaleString()} sent
                  </p>
                </div>
                <StatusPill status={campaignStatus(snapshot.campaign.status)} />
              </div>

              <div
                aria-label={`${progress}% sent`}
                className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2"
                role="progressbar"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={progress}
              >
                <div className="h-full rounded-full bg-ink transition-[width] duration-200" style={{ width: `${progress}%` }} />
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-2 rounded-control bg-surface-2 p-3">
                <div>
                  <dt className="text-chip text-ink-2">Sent</dt>
                  <dd className="mt-1 text-body font-medium tabular-nums text-ink">{snapshot.sent.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-chip text-ink-2">Replies</dt>
                  <dd className="mt-1 text-body font-medium tabular-nums text-ink">{snapshot.replies.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-chip text-ink-2">Interested</dt>
                  <dd className="mt-1 text-body font-medium tabular-nums text-ink">{snapshot.interested.toLocaleString()}</dd>
                </div>
              </dl>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-label text-ink-2">Last 7 days</p>
                <SampleDataPill label="Sample performance" show={snapshot.performanceIsSample} />
              </div>
              <ChartContainer className="mt-2 h-28 w-full aspect-auto" config={chartConfig}>
                <BarChart accessibilityLayer data={snapshot.week} margin={{ bottom: 0, left: 0, right: 0, top: 8 }}>
                  <XAxis
                    axisLine={false}
                    dataKey="day"
                    fontSize={12}
                    tickLine={false}
                    tickMargin={8}
                  />
                  <Bar dataKey="sent" maxBarSize={22}>
                    {snapshot.week.map((point) => (
                      <Cell
                        fill={point.today ? "var(--accent)" : "var(--surface-2)"}
                        key={point.day}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </Card>
          </Link>
          </SettledItem>
        );
      })}
    </div>
  );
}

export default CampaignBentoGrid;
