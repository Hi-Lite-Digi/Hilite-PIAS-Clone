import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CircleAlert, Mail, Megaphone, MessageCircle, Plus, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { deleteCampaign, getCampaigns, type CampaignRecord, type ReplyConversationRecord } from "../../lib/api";
import { getThreads } from "../../lib/stubs";
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  IconButton,
  PageHeader,
  SampleDataPill,
  Skeleton,
  StatusPill,
  toast,
  type DataTableColumn,
} from "../components/system";
import { audienceSummary, campaignAttendanceCount, campaignAttendanceTotal, campaignProgress, campaignReplyCount, campaignStatus } from "./campaign-view";
import { campaignDelivery, PARTICIPANT_REMINDER_PRESETS } from "../../lib/campaign";

import OutreachWorkspacePage from "./OutreachWorkspacePage";

function CampaignsPage() {
  return import.meta.env.VITE_DEMO_MODE === "true" ? <OutreachWorkspacePage view="campaigns" /> : <LegacyCampaignsPage />;
}

function LegacyCampaignsPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [threads, setThreads] = useState<ReplyConversationRecord[]>([]);
  const [sampleReplies, setSampleReplies] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyError, setReplyError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CampaignRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const campaignLoadRequest = useRef(0);

  const load = useCallback(async (showLoading = true) => {
    const request = ++campaignLoadRequest.current;
    if (showLoading) setLoading(true);
    setError("");
    setReplyError("");
    const [campaignResult, threadResult] = await Promise.allSettled([getCampaigns(), getThreads()]);
    if (request !== campaignLoadRequest.current) return;
    if (campaignResult.status === "fulfilled") setCampaigns(campaignResult.value.data);
    else setError(campaignResult.reason instanceof Error ? campaignResult.reason.message : "Campaigns could not be loaded.");
    if (threadResult.status === "fulfilled") {
      setThreads(threadResult.value.data);
      setSampleReplies(threadResult.value.sample);
    } else {
      setThreads([]);
      setSampleReplies(false);
      setReplyError(threadResult.reason instanceof Error ? threadResult.reason.message : "Reply totals could not be loaded.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    return () => { campaignLoadRequest.current += 1; };
  }, [load]);
  useEffect(() => {
    const refreshVisibleCampaigns = () => { if (!document.hidden) void load(false); };
    const intervalId = window.setInterval(refreshVisibleCampaigns, 30_000);
    window.addEventListener("focus", refreshVisibleCampaigns);
    document.addEventListener("visibilitychange", refreshVisibleCampaigns);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisibleCampaigns);
      document.removeEventListener("visibilitychange", refreshVisibleCampaigns);
    };
  }, [load]);

  const replyCount = (campaign: CampaignRecord) => campaignReplyCount(campaign, threads);
  const recentCampaigns = useMemo(() => [...campaigns].sort((left, right) => {
    const leftTime = Date.parse(left.updated_at);
    const rightTime = Date.parse(right.updated_at);
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  }), [campaigns]);
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      await deleteCampaign(target.id);
      setCampaigns((current) => current.filter((campaign) => campaign.id !== target.id));
      setDeleteTarget(null);
      toast.success(`${target.title} was deleted.`);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The campaign could not be deleted.");
    } finally {
      setDeleting(false);
    }
  };
  const calendarEvents = useMemo(() => campaigns.flatMap((campaign) => {
    const delivery = campaignDelivery(campaign.audience);
    const events = delivery.scheduledAt ? [{ at: delivery.scheduledAt, label: "Campaign", campaign, channel: delivery.channel }] : [];
    delivery.reminderDates.forEach((at, index) => events.push({
      at,
      label: delivery.channel === "whatsapp"
        ? `WhatsApp · ${PARTICIPANT_REMINDER_PRESETS[index]?.label ?? `Reminder ${index + 1}`}`
        : `Reminder ${index + 1}`,
      campaign,
      channel: delivery.channel,
    }));
    return events;
  }).filter((event) => Number.isFinite(Date.parse(event.at))).sort((left, right) => Date.parse(left.at) - Date.parse(right.at)), [campaigns]);
  const columns = useMemo<DataTableColumn<CampaignRecord>[]>(() => [
    {
      key: "name",
      header: "Campaign",
      cell: (campaign) => <div><p className="font-medium text-ink">{campaign.title}</p><p className="mt-0.5 text-chip text-ink-2">Updated {new Date(campaign.updated_at).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p></div>,
      sortValue: (campaign) => campaign.title,
    },
    {
      key: "status",
      header: "Status",
      cell: (campaign) => <StatusPill status={campaignStatus(campaign.status)} />,
      sortValue: (campaign) => campaign.status,
    },
    {
      key: "audience",
      header: "Audience",
      cell: (campaign) => <span className="line-clamp-2 max-w-xs">{audienceSummary(campaign.audience)}</span>,
      sortValue: (campaign) => campaign.audience_count,
      hideOnMobile: true,
    },
    {
      key: "progress",
      header: "Sent / total",
      cell: (campaign) => {
        const progress = campaignProgress(campaign);
        return <div className="min-w-32"><div className="flex items-center gap-2"><p className="text-body tabular-nums text-ink">{progress.sent} / {progress.total}</p>{!progress.exact && <SampleDataPill label="Sample" />}</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent" style={{ width: progress.total === 0 ? "0%" : `${Math.round((progress.sent / progress.total) * 100)}%` }} /></div></div>;
      },
      sortValue: (campaign) => campaign.audience_count,
    },
    {
      key: "replies",
      header: "Replies",
      cell: (campaign) => <span className="tabular-nums">{replyError ? "—" : replyCount(campaign)}</span>,
      sortValue: (campaign) => replyError ? null : replyCount(campaign),
    },
    {
      key: "attending",
      header: "Attending",
      cell: (campaign) => <span className="whitespace-nowrap tabular-nums">{replyError ? "—" : `${campaignAttendanceCount(campaign, threads)} / ${campaignAttendanceTotal(campaign)}`}</span>,
      sortValue: (campaign) => replyError ? null : campaignAttendanceCount(campaign, threads),
      hideOnMobile: true,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      mobileLabel: "Actions",
      className: "w-16 text-right",
      cell: (campaign) => (
        <IconButton
          icon={Trash2}
          label={`Delete ${campaign.title}`}
          onClick={(event) => {
            event.stopPropagation();
            setDeleteTarget(campaign);
          }}
          variant="destructive"
        />
      ),
    },
  ], [replyError, threads]);

  return (
    <>
      <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7" data-slot="reengage-campaigns">
      <div className="space-y-6">
        <PageHeader
          actions={<Button asChild><Link to="/reengage/campaigns/new"><Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />New campaign</Link></Button>}
          subtitle="Prepare audiences and messages, then approve one sending batch at a time."
          title="Campaigns"
        />
        <Card description="Campaign dates, email blasts, and automatic participant WhatsApp reminders in Singapore time." title="Campaign calendar">
          {loading ? <Skeleton rows={2} variant="cards" label="Loading campaign calendar" /> : calendarEvents.length === 0 ? <EmptyState icon={CalendarDays} message="No campaign dates or reminders have been planned yet." action={<Button asChild variant="secondary"><Link to="/reengage/campaigns/new">Plan a campaign</Link></Button>} /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{calendarEvents.map((event, index) => { const ChannelIcon = event.channel === "email" ? Mail : MessageCircle; return <button className="flex min-h-24 items-start gap-3 rounded-card border border-line bg-surface-2 p-4 text-left outline-none hover:border-ink/30 focus-visible:ring-3 focus-visible:ring-ring/50" key={`${event.campaign.id}-${event.at}-${index}`} onClick={() => navigate(`/reengage/campaigns/${encodeURIComponent(event.campaign.id)}`)} type="button"><span className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-surface"><ChannelIcon aria-hidden="true" className="size-4" /></span><span className="min-w-0"><span className="block text-chip font-medium uppercase tracking-wide text-ink-2">{event.label}</span><span className="mt-1 block truncate text-body font-medium text-ink">{event.campaign.title}</span><span className="mt-1 block text-label tabular-nums text-ink-2">{new Date(event.at).toLocaleString("en-SG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</span></span></button>; })}</div>}
        </Card>
        <Card action={sampleReplies ? <SampleDataPill /> : undefined} description={`${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`} title="All campaigns">
          {loading ? <Skeleton rows={6} variant="table" label="Loading campaigns" /> : error ? (
            <EmptyState icon={CircleAlert} message={error} action={<Button onClick={() => void load()} variant="secondary">Try again</Button>} />
          ) : (
            <div className="space-y-4">
              {replyError && (
                <div className="flex flex-col gap-3 rounded-control border border-danger/20 bg-danger/10 p-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
                  <div><p className="text-body font-medium text-danger">Reply counts are unavailable</p><p className="mt-1 text-label text-ink-2">{replyError}</p></div>
                  <Button onClick={() => void load()} size="sm" variant="secondary">Try again</Button>
                </div>
              )}
              <DataTable
                columns={columns}
                emptyState={<EmptyState icon={Megaphone} message="No campaigns yet" action={<Button asChild><Link to="/reengage/campaigns/new">Create campaign</Link></Button>} />}
                onRowClick={(campaign) => navigate(`/reengage/campaigns/${encodeURIComponent(campaign.id)}`)}
                rowKey={(campaign) => campaign.id}
                rows={recentCampaigns}
              />
            </div>
          )}
        </Card>
      </div>
      </main>
      <ConfirmDialog
        confirmLabel="Delete campaign"
        description={deleteTarget
          ? `This permanently deletes “${deleteTarget.title}” and its recipient and reminder records. WhatsApp conversations are kept.`
          : "Choose a campaign to delete."}
        onConfirm={() => void confirmDelete()}
        onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}
        open={deleteTarget !== null}
        pending={deleting}
        title="Delete this campaign?"
        variant="destructive"
      />
    </>
  );
}

export default CampaignsPage;
