import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Megaphone, RefreshCw, Upload, UserPlus } from "lucide-react";
import { checkOutreachConnection, getOutreachActivity, getSummary, type OutreachActivity } from "../../lib/api";
import { Button, Card, DataTable, EmptyState, PageHeader, Skeleton, StatCard, StatusPill, buttonVariants } from "../components/system";

export const deliveryLabels = { draft: "Ready to send", sending: "Awaiting confirmation", accepted: "Accepted by Meta", sent: "Sent", delivered: "Delivered", read: "Read", failed: "Failed", unknown: "Delivery unconfirmed", suppressed: "Unsubscribed" };

export default function OutreachWorkspacePage({ view = "home" }: { view?: "home" | "campaigns" }) {
  const [data, setData] = useState<OutreachActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [leads, setLeads] = useState<number | null>(null);
  const [connection, setConnection] = useState<{ ready: boolean; requirements: string[] } | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const requestId = useRef(0);
  const refresh = useCallback(async (checkConnection = false) => {
    const current = ++requestId.current;
    setLoading(true); setError("");
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
  return <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 sm:px-6 md:px-7 md:py-7">
    <div className="mx-auto max-w-[1180px] space-y-6">
      <PageHeader title={view === "home" ? "WhatsApp outreach" : "Campaigns"} actions={<>
        <Link className={buttonVariants({ variant: "primary" })} to="/reengage/campaigns/new"><Megaphone aria-hidden="true" className="size-4" />New campaign</Link>
        <Link className={buttonVariants({ variant: "secondary" })} to="/reengage/leads?action=add"><UserPlus aria-hidden="true" className="size-4" />Add lead</Link>
        <Link className={buttonVariants({ variant: "secondary" })} to="/reengage/leads?action=import"><Upload aria-hidden="true" className="size-4" />Upload leads</Link>
        <Button variant="secondary" disabled={loading} onClick={() => void refresh(true)}><RefreshCw aria-hidden="true" className="size-4" />Refresh status</Button>
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
      <Card title="Your campaigns">
        {loading && !data ? <Skeleton rows={3} variant="table" label="Loading campaigns" /> : data ? <DataTable columns={[
          { key: "title", header: "Campaign", cell: row => <Link className="font-medium underline decoration-ink/20 underline-offset-4" to={`/reengage/campaigns/${row.id}`}>{row.title}</Link> },
          { key: "audience", header: "Recipients", cell: row => row.audience_count },
          { key: "status", header: "Status", cell: row => row.status === "sent" ? "All recipients attempted" : row.status === "sending" ? "In progress" : row.status === "paused" ? "Review results" : "Draft" },
          { key: "open", header: <span className="sr-only">Open campaign</span>, cell: row => <Link className={buttonVariants({ size: "sm", variant: "secondary" })} to={`/reengage/campaigns/${row.id}`}>{row.status === "draft" ? "Review & send" : "View results"}</Link> },
        ]} rows={data.campaigns} rowKey={row => row.id} emptyState={<EmptyState icon={Megaphone} message="No campaigns yet" action={<Link className={buttonVariants({ variant: "primary" })} to="/reengage/campaigns/new">Create campaign</Link>} />} /> : null}
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
