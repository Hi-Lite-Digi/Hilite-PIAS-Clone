import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, RefreshCw, Save, SendHorizontal, Users } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { createCampaign, getLeads, getTemplateCampaign, sendTemplateCampaignRecipient, startTemplateCampaign, updateCampaign, type CampaignRecord, type LeadRecord, type TemplateDelivery } from "../../lib/api";
import { normaliseWhatsAppPhone } from "../../lib/whatsapp";
import { Button, Card, ConfirmDialog, DataTable, EmptyState, PageHeader, SearchInput, Skeleton, StatCard, toast, type DataTableColumn } from "../components/system";
import { useMetaTest, type TestConnection } from "./MetaTestContext";
import { fetchPagedCollection } from "./lead-paging";
import definition from "../../../config/pias-clone-demo-template.json";
import posterUrl from "../../../assets/demo/cpf-webinar-poster.png";

const body = definition.components.find(item => item.type === "BODY")?.text || "";
const footer = definition.components.find(item => item.type === "FOOTER")?.text || "";
const deliveryLabel: Record<TemplateDelivery["status"], string> = { draft: "Ready", sending: "Delivery unconfirmed", accepted: "Accepted by Meta", sent: "Sent", delivered: "Delivered", read: "Read", failed: "Failed", unknown: "Delivery unconfirmed", suppressed: "Unsubscribed" };

export function leadCampaignEligibility(lead: LeadRecord) {
  const phone = normaliseWhatsAppPhone(lead.phone);
  if (!phone) return "No WhatsApp number";
  if (/^120255501\d{2}$/.test(phone.replace(/\D/g, ""))) return "Sample number";
  if (!lead.subscribed || lead.struck) return "Unsubscribed";
  return "";
}

export default function TemplateCampaignPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { request } = useMetaTest();
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>(() => /^\d+$/.test(params.get("lead") || "") ? [Number(params.get("lead"))] : []);
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [deliveries, setDeliveries] = useState<TemplateDelivery[]>([]);
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<TestConnection | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [consented, setConsented] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState("");
  const [dirty, setDirty] = useState(false);
  const editable = !campaign || campaign.status === "draft";
  const refresh = useCallback(async () => {
    if (!id) return;
    const result = await getTemplateCampaign(id);
    setCampaign(result.data); setDeliveries(result.deliveries);
    setTitle(result.data.title); setSelectedIds(result.data.audience.includedLeadIds || []); setDirty(false);
  }, [id]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    fetchPagedCollection<LeadRecord>(paging => getLeads(paging)).then(async result => {
      if (!active) return;
      setLeads(result.items);
      if (result.capReached) throw new Error("Your lead list is too large to load completely. Narrow it before creating a campaign.");
      await refresh();
    }).catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    request<TestConnection>("status").then(result => { if (active) setConnection(result); }).catch(cause => { if (active) setConnectionError(cause.message); });
    return () => { active = false; };
  }, [refresh, request]);
  const selected = useMemo(() => leads.filter(lead => selectedIds.includes(lead.id)), [leads, selectedIds]);
  const query = search.trim().toLowerCase();
  const matching = leads.filter(lead => `${lead.name} ${lead.phone || ""} ${lead.email || ""}`.toLowerCase().includes(query));
  const visible = matching.slice(page * 10, page * 10 + 10);
  const columns: DataTableColumn<LeadRecord>[] = [
    { key: "selected", header: <span className="sr-only">Selected</span>, cell: lead => <label className="inline-flex min-h-11 min-w-11 items-center justify-center"><span className="sr-only">Select {lead.name}</span><input checked={selectedIds.includes(lead.id)} className="size-5 accent-ink focus-visible:ring-3 focus-visible:ring-ring/50" disabled={!editable || Boolean(leadCampaignEligibility(lead)) || busy} onChange={event => { setSelectedIds(current => event.target.checked ? [...current, lead.id] : current.filter(value => value !== lead.id)); setDirty(true); }} type="checkbox" /></label> },
    { key: "name", header: "Lead", cell: lead => <div><p className="break-words font-medium">{lead.name}</p><p className="text-chip text-ink-2">{lead.email}</p></div>, sortValue: lead => lead.name },
    { key: "phone", header: "WhatsApp", cell: lead => lead.phone || "—" },
    { key: "status", header: "Status", cell: lead => leadCampaignEligibility(lead) || "Available" },
  ];
  async function save() {
    if (busy) return;
    if (!title.trim()) { setError("Enter a campaign name."); return; }
    if (!selectedIds.length) { setError("Select at least one contact."); return; }
    setBusy(true); setError("");
    try {
      const input = { title, subject: "CPF Changes & You", message: body, audience: { ageBands: [], topics: [], statuses: [], includedLeadIds: selectedIds } };
      const result = id ? await updateCampaign(id, input) : await createCampaign(input);
      toast.success("Campaign saved.");
      if (!id) navigate(`/reengage/campaigns/${result.data.id}`);
      else await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The campaign could not be saved. Try again."); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!id || busy) return;
    setConfirmOpen(false); setBusy(true); setError("");
    try {
      const started = await startTemplateCampaign(id);
      const pending = started.deliveries.filter(item => item.status === "draft");
      setDeliveries(started.deliveries);
      for (let index = 0; index < pending.length; index += 1) {
        setProgress(`Sending ${index + 1} of ${pending.length}…`);
        const result = await sendTemplateCampaignRecipient(id, pending[index].id);
        if (!result.accepted) throw new Error("Delivery was not confirmed. Check WhatsApp before continuing.");
        if (!result.trackingSaved) throw new Error("Meta accepted this message, but its saved status is incomplete. Check WhatsApp before continuing.");
      }
      toast.success("Accepted by Meta. Check WhatsApp to confirm delivery.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Delivery was not confirmed. Refresh the results before continuing."); }
    finally { setProgress(""); await refresh().catch(() => undefined); setBusy(false); setConsented(false); }
  }
  const canSend = campaign?.audience.template === definition.name && (campaign.status === "draft" || (campaign.status === "sending" && deliveries.some(item => item.status === "draft")));
  return <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7">
    <div className="space-y-6">
      <Link className="inline-flex min-h-11 items-center gap-2 text-label text-ink-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50" to="/reengage/campaigns"><ArrowLeft aria-hidden="true" className="size-4" />Campaigns</Link>
      <PageHeader title={campaign ? campaign.title : "New campaign"} actions={id && <Button disabled={busy} onClick={() => void refresh().catch(cause => setError(cause.message))} variant="secondary"><RefreshCw aria-hidden="true" className="size-4" />Refresh status</Button>} />
      {loading ? <Skeleton rows={4} label="Loading campaign" /> : <>
        {error && <p className="rounded-control border border-danger/20 bg-danger/10 p-4 text-label text-danger" role="alert">{error}</p>}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-6">
            <Card title="Campaign">
              <label className="text-label font-medium" htmlFor="campaign-name">Campaign name<input className="mt-2 h-11 w-full rounded-control border border-line bg-surface px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50" disabled={!editable || busy} id="campaign-name" maxLength={120} name="campaign-name" onChange={event => { setTitle(event.target.value); setDirty(true); }} placeholder="CPF webinar invitation" required value={title} /></label>
            </Card>
            <Card title={`Audience · ${selectedIds.length} selected`} action={<Button asChild size="sm" variant="secondary"><Link to="/reengage/leads?action=add"><Plus aria-hidden="true" className="size-4" />Add lead</Link></Button>}>
              <SearchInput value={search} onValueChange={value => { setSearch(value); setPage(0); }} placeholder="Search name, phone, or email" />
              <div className="mt-4"><DataTable columns={columns} rows={visible} rowKey={lead => lead.id} emptyState={<EmptyState icon={Users} message="No matching contacts" />} /></div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-chip text-ink-2">{matching.length} contacts</p><div className="flex gap-2"><Button disabled={page === 0} onClick={() => setPage(current => current - 1)} size="sm" variant="secondary">Previous</Button><Button disabled={(page + 1) * 10 >= matching.length} onClick={() => setPage(current => current + 1)} size="sm" variant="secondary">Next</Button></div></div>
              {selected.length > 0 && <div className="mt-4 border-t border-line pt-4"><p className="mb-2 text-label font-medium">Selected recipients</p><ul className="max-h-60 space-y-2 overflow-y-auto text-label">{selected.map(lead => <li className="break-words" key={lead.id}>{lead.name} · {lead.phone}</li>)}</ul></div>}
            </Card>
          </div>
          <Card className="min-w-0 self-start" title="CPF Changes & You">
            <p className="mb-4 text-label text-ink-2">Approved WhatsApp template</p>
            <img alt="CPF Changes 2026 webinar poster, 29 October, 7–9:30 pm" className="mx-auto h-auto w-full max-w-72 rounded-control" height={1600} src={posterUrl} width={1131} />
            <details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 text-label font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">View message</summary><p className="whitespace-pre-line text-label">{body.replace("{{1}}", selected[0]?.name.trim().split(/\s+/)[0] || "{{1}}")}</p><p className="mt-4 text-chip text-ink-2">{footer}</p><p className="mt-3 text-label">Attending · Maybe next time · Unsubscribe</p></details>
          </Card>
        </div>
        {editable && <Button disabled={busy} loading={busy} onClick={() => void save()}><Save aria-hidden="true" className="size-4" />Save campaign</Button>}
        {deliveries.length > 0 && <Card title="Delivery results">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Recipients" value={deliveries.length} />
            <StatCard label="Accepted by Meta" value={deliveries.filter(item => ["accepted", "sent", "delivered", "read"].includes(item.status)).length} />
            <StatCard label="Confirmed delivered" value={deliveries.filter(item => ["delivered", "read"].includes(item.status)).length} />
            <StatCard label="Awaiting send" value={deliveries.filter(item => item.status === "draft").length} />
          </div>
          <DataTable columns={[{ key: "lead", header: "Lead", cell: row => row.lead?.name || `Contact ${row.lead_id}` }, { key: "phone", header: "WhatsApp", cell: row => `+${row.phone}` }, { key: "status", header: "Status", cell: row => <div>{deliveryLabel[row.status]}{row.failure_reason && <p className="mt-1 text-chip text-danger">{row.failure_reason}</p>}</div> }]} rows={deliveries} rowKey={row => row.id} />
        </Card>}
        {canSend && <Card title="Send campaign">
          <p className="mb-4 text-label text-ink-2">{connection?.ready ? "Hi-Hunt connected · Template approved" : connectionError || connection?.requirements.join(" ") || "Checking WhatsApp connection…"}</p>
          <label className="mb-4 flex min-h-11 items-center gap-3 text-label"><input checked={consented} className="size-5 shrink-0 accent-ink focus-visible:ring-3 focus-visible:ring-ring/50" disabled={busy} onChange={event => setConsented(event.target.checked)} type="checkbox" />The selected recipients agreed to receive this message.</label>
          {dirty && <p className="mb-4 text-label text-ink-2">Save your changes before sending.</p>}
          {progress && <p className="mb-4 text-label" role="status">{progress}</p>}
          <Button disabled={!connection?.ready || !consented || dirty || busy} loading={busy} onClick={() => setConfirmOpen(true)}><SendHorizontal aria-hidden="true" className="size-4" />Review & send</Button>
        </Card>}
      </>}
    </div>
    <ConfirmDialog confirmLabel="Send campaign" description={`Send the approved CPF invitation and original poster to ${campaign?.status === "sending" ? deliveries.filter(item => item.status === "draft").length : selectedIds.length} selected recipient(s) from the new number ending 4289? These are real WhatsApp messages. Meta messaging charges may apply.`} onConfirm={() => void send()} onOpenChange={setConfirmOpen} open={confirmOpen} pending={busy} title="Send this campaign?" />
  </main>;
}
