import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Megaphone, RefreshCw, Upload, UserPlus } from "lucide-react";
import { checkOutreachConnection, getOutreachActivity, getSummary, type OutreachActivity } from "../../lib/api";
import { Button, Card, DataTable, EmptyState, PageHeader, PageSizeSelect, Skeleton, StatCard, StatusPill, buttonVariants } from "../components/system";
import { deliveryLabels } from "../../lib/delivery-status";
import { clearApiCache, peekApiJson } from "../../lib/request-cache";

export { deliveryLabels } from "../../lib/delivery-status";

const CAMPAIGN_PAGE_SIZES = [5, 10, 20, 50] as const;

export default function OutreachWorkspacePage({ view = "home" }: { view?: "home" | "campaigns" }) {
  const [data, setData] = useState<OutreachActivity | null>(() => peekApiJson<OutreachActivity>("/api/outreach-activity") ?? null);
  const [loading, setLoading] = useState(() => !peekApiJson("/api/outreach-activity"));
  const [error, setError] = useState("");
  const [leads, setLeads] = useState<number | null>(() => peekApiJson<{ total: number }>("/api/summary")?.total ?? null);
  const [connection, setConnection] = useState<{ ready: boolean; requirements: string[] } | null>(() => peekApiJson<{ ready: boolean; requirements: string[] }>("/api/meta-whatsapp", { method: "POST", body: JSON.stringify({ action: "status" }) }) ?? null);
  const [connectionError, setConnectionError] = useState("");
  const [campaignPage, setCampaignPage] = useState(0);
  const [campaignPageSize, setCampaignPageSize] = useState<number>(CAMPAIGN_PAGE_SIZES[0]);
  const requestId = useRef(0);
  const refresh = useCallback(async (checkConnection = false, force = false) => {
    if (force) clearApiCache();
    const current = ++requestId.current;
    setLoading(!peekApiJson("/api/outreach-activity")); setError("");
    const results = await Promise.allSettled([getOutreachActivity(), getSummary(), ...(checkConnection ? [checkOutreachConnection()] : [])]);
    if (current !== requestId.current) return;
    const [activity, summary, status] = results;
    if (activity.status === "fulfilled") setData(activity.value as OutreachActivity);
    else { setData(null); setError(activity.reason instanceof Error ? activity.reason.message : "Sending activity could not be loaded."); }
    if (summary.status === "fulfilled") setLeads((summary.value as Awaited<ReturnType<typeof getSummary>>).total);
    else setLeads(null);
    if (status?.status === "fulfilled") { setConnection(status.value as Awaited<ReturnType<typeof checkOutreachConnection>>); setConnectionError(""); }
    else if (status?.status === "rejected") { setConnection(null); setConnectionError(status.reason instanceof Error ? status.reason.message : "Check the WhatsApp connection in Settings."); }
    setLoading(false);
  }, []);
  useEffect(() => {
    void refresh(true);
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30_000);
    return () => { requestId.current++; window.clearInterval(timer); };
  }, [refresh]);
  const activity = data?.activity || [];
  const campaigns = data?.campaigns ?? [];
  const campaignPageCount = Math.max(1, Math.ceil(campaigns.length / campaignPageSize));
  const visibleCampaignPage = Math.min(campaignPage, campaignPageCount - 1);
  const campaignStart = visibleCampaignPage * campaignPageSize;
  const visibleCampaigns = campaigns.slice(campaignStart, campaignStart + campaignPageSize);
  return <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 sm:px-6 md:px-7 md:py-7">
    <div className="mx-auto max-w-[1180px] space-y-6">
      <PageHeader title={view === "home" ? "WhatsApp outreach" : "Campaigns"} actions={<>
        <Link className={buttonVariants({ variant: "primary" })} to="/reengage/campaigns/new"><Megaphone aria-hidden="true" className="size-4" />New campaign</Link>
        <Link className={buttonVariants({ variant: "secondary" })} to="/reengage/leads?action=add"><UserPlus aria-hidden="true" className="size-4" />Add lead</Link>
        <Link className={buttonVariants({ variant: "secondary" })} to="/reengage/leads?action=import"><Upload aria-hidden="true" className="size-4" />Upload leads</Link>
        <Button variant="secondary" disabled={loading} onClick={() => void refresh(true, true)}><RefreshCw aria-hidden="true" className="size-4" />Refresh status</Button>
      </>} />
      <Card title="CPF Changes & You" action={<StatusPill label={connection?.ready ? "Ready to send" : connectionError ? "Check connection" : connection ? "Needs attention" : "Checking connection"} status={connection?.ready ? "done" : connection || connectionError ? "error" : "queued"} />}>
        <p className="text-label text-ink-2">Approved invitation and poster · Sender ending 4289</p>
        <p className="mt-2 text-label text-ink-2">Choose your leads in a campaign, then review and send.</p>
        {(connectionError || (connection && !connection.ready)) && <p role="alert" className="mt-3 text-label text-danger">{connectionError || connection?.requirements.join(" ")}</p>}
      </Card>
      {error && <p role="alert" className="rounded-control border border-danger/20 bg-danger/10 p-4 text-label text-danger">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Your leads" value={leads ?? "—"} />
        <StatCard label="Campaigns" value={data ? data.campaigns.length : "—"} />
        <StatCard label="Confirmed deliveries in recent activity" value={data ? activity.filter(row => ["delivered", "read"].includes(row.status)).length : "—"} />
      </div>
      <Card
        title="Your campaigns"
        action={campaigns.length > 0 && (
          <PageSizeSelect
            options={CAMPAIGN_PAGE_SIZES}
            value={campaignPageSize}
            onValueChange={(size) => {
              setCampaignPageSize(size);
              setCampaignPage(0);
            }}
          />
        )}
      >
        {loading && !data ? <Skeleton rows={3} variant="table" label="Loading campaigns" /> : data ? <DataTable columns={[
          { key: "title", header: "Campaign", cell: row => <div><Link className="font-medium underline decoration-ink/20 underline-offset-4" to={`/reengage/campaigns/${row.id}`}>{row.title}</Link><p className="mt-1 text-chip text-ink-2">Updated {new Date(row.updated_at).toLocaleDateString("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short" })}</p></div> },
          { key: "status", header: "Status", cell: row => row.status === "sent" ? "Completed" : row.status === "sending" ? "In progress" : row.status === "paused" ? "Review results" : "Draft" },
          { key: "sent", header: "Sent / total", cell: row => <div className="min-w-24"><Link aria-label={`View sending results for ${row.title}`} className="underline decoration-ink/20 underline-offset-4" to={`/reengage/campaigns/${row.id}#delivery-results`}>{row.metrics?.accepted ?? 0} / {row.metrics?.total ?? row.audience_count}</Link><progress aria-label={`Sending progress for ${row.title}`} className="mt-2 block h-1.5 w-full accent-accent" max={Math.max(1, row.metrics?.total ?? row.audience_count)} value={row.metrics?.accepted ?? 0} /></div> },
          { key: "notSent", header: "Not sent", cell: row => <Link aria-label={`View unsent recipients for ${row.title}`} className="underline decoration-ink/20 underline-offset-4" to={`/reengage/campaigns/${row.id}?results=notSent#delivery-results`}>{row.metrics?.notSent ?? row.audience_count}</Link> },
          { key: "delivered", header: "Delivered", cell: row => row.metrics?.delivered ?? 0 },
          { key: "read", header: "Read", cell: row => row.metrics?.read ?? 0 },
          { key: "replies", header: "Replies", cell: row => <Link aria-label={`View replies to ${row.title}`} className="underline decoration-ink/20 underline-offset-4" to={`/reengage/inbox?campaign=${row.id}&response=replies`}>{row.metrics?.replies ?? 0}</Link> },
          { key: "attending", header: "Attending", cell: row => <Link aria-label={`View attending contacts for ${row.title}`} className="underline decoration-ink/20 underline-offset-4" to={`/reengage/inbox?campaign=${row.id}&response=attending`}>{row.metrics?.attending ?? 0}</Link> },
          { key: "notAttending", header: "Not attending", cell: row => <Link aria-label={`View contacts not attending ${row.title}`} className="underline decoration-ink/20 underline-offset-4" to={`/reengage/inbox?campaign=${row.id}&response=not_attending`}>{row.metrics?.notAttending ?? 0}</Link> },
          { key: "unsubscribed", header: "Unsubscribed", cell: row => <Link aria-label={`View unsubscribed contacts for ${row.title}`} className="underline decoration-ink/20 underline-offset-4" to={`/reengage/inbox?campaign=${row.id}&response=unsubscribed`}>{row.metrics?.unsubscribed ?? 0}</Link> },
          { key: "open", header: <span className="sr-only">Open campaign</span>, cell: row => <Link className={buttonVariants({ size: "sm", variant: "secondary" })} to={`/reengage/campaigns/${row.id}`}>{row.status === "draft" ? "Review & send" : "View results"}</Link> },
        ]} rows={visibleCampaigns} rowKey={row => row.id} emptyState={<EmptyState icon={Megaphone} message="No campaigns yet" action={<Link className={buttonVariants({ variant: "primary" })} to="/reengage/campaigns/new">Create campaign</Link>} />} /> : null}
        {campaigns.length > 0 && (
          <nav aria-label="Campaign pages" className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="text-label text-ink-2 tabular-nums">
              Showing {campaignStart + 1}–{campaignStart + visibleCampaigns.length} of {campaigns.length}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" disabled={visibleCampaignPage === 0} onClick={() => setCampaignPage(visibleCampaignPage - 1)} size="sm" variant="secondary">Previous</Button>
              <span className="px-1 text-label text-ink-2 tabular-nums">Page {visibleCampaignPage + 1} of {campaignPageCount}</span>
              <Button type="button" disabled={visibleCampaignPage + 1 >= campaignPageCount} onClick={() => setCampaignPage(visibleCampaignPage + 1)} size="sm" variant="secondary">Next</Button>
            </div>
          </nav>
        )}
        <p className="mt-4 text-chip text-ink-2">Sent means accepted by Meta. Delivery and read receipts update separately. Earlier replies may not be available.</p>
      </Card>
      <Card title="Recent sending activity">
        {loading && !data ? <Skeleton rows={3} variant="table" label="Loading sending activity" /> : data ? <DataTable columns={[
          { key: "name", header: "Recipient", cell: row => <div><p className="font-medium">{row.name}</p><p className="text-chip text-ink-2">+{row.phone.replace(/\D/g, "")}</p></div> },
          { key: "campaign", header: "Campaign", cell: row => row.campaignTitle },
          { key: "status", header: "Delivery status", cell: row => <div>{deliveryLabels[row.status]}{row.failure_reason && <p className="mt-1 text-chip text-danger">{row.failure_reason}</p>}</div> },
          { key: "time", header: "Last update", cell: row => new Date(row.status_at || row.occurred_at).toLocaleString("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) },
        ]} rows={activity} rowKey={row => row.id} emptyState={<EmptyState icon={Megaphone} message="No messages sent yet" />} /> : null}
        {data?.truncated && <p className="mt-3 text-chip text-ink-2">Showing the latest 500 recipients. Open a campaign for its full results.</p>}
      </Card>
    </div>
  </main>;
}
