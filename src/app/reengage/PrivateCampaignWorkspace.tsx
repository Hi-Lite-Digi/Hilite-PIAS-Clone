import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Copy, LockKeyhole, Megaphone, Plus, RefreshCw, SendHorizontal, UsersRound } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Button, Card, ConfirmDialog, DataTable, EmptyState, PageHeader, Skeleton, toast, type DataTableColumn } from "../components/system";
import { useMetaTest, type TestCampaign, type TestConnection, type TestLead } from "./MetaTestContext";
import definition from "../../../config/pias-clone-demo-template.json";
import posterUrl from "../../../assets/demo/cpf-webinar-poster.png";

const fieldClass = "mt-2 h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";
const firstName = (lead?: TestLead) => lead?.name.trim().split(/\s+/)[0] || "{{1}}";

function TestAccess() {
  const { operatorKey, setOperatorKey } = useMetaTest();
  const [candidate, setCandidate] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(operatorKey.trim()); setCopied(true); }
    catch { setError("The key could not be copied. Copy it from Settings instead."); }
  };
  return operatorKey ? (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface-2 px-4 py-3">
      <span className="inline-flex items-center gap-2 text-label text-ink-2"><LockKeyhole aria-hidden="true" className="size-4" />Private access for this tab</span>
      <div className="flex flex-wrap gap-2"><Button onClick={() => void copy()} size="sm" variant="ghost"><Copy aria-hidden="true" className="size-4" />{copied ? "Copied" : "Copy key"}</Button><Button onClick={() => setOperatorKey("")} size="sm" variant="secondary">Lock</Button></div>
      {error && <p className="w-full text-label text-danger" role="alert">{error}</p>}
    </div>
  ) : (
    <Card title="Unlock private tests">
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={event => { event.preventDefault(); setOperatorKey(candidate.trim()); setCandidate(""); }}>
        <label className="min-w-0 flex-1 text-label font-medium" htmlFor="private-workspace-key">Private test key<input autoComplete="off" className={fieldClass} id="private-workspace-key" name="private-test-key" onChange={event => setCandidate(event.target.value)} required type="password" value={candidate} /></label>
        <Button size="lg" type="submit">Unlock</Button>
      </form>
      <p className="mt-3 text-label text-ink-2">Real leads and test campaigns are visible only with this key.</p>
    </Card>
  );
}

function TestLayout({ children, section }: { children: ReactNode; section: "leads" | "campaigns" }) {
  return <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7">
    <div className="flex flex-col gap-6">
      <PageHeader title={section === "leads" ? "Leads" : "Campaigns"} actions={<Button asChild variant="secondary"><Link to={`/reengage/${section}?view=demo`}>View demo {section}</Link></Button>} />
      <nav aria-label="Private campaign tests" className="flex flex-wrap gap-2">
        <Link aria-current={section === "leads" ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 text-label font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${section === "leads" ? "bg-ink text-surface" : "bg-surface text-ink"}`} to="/reengage/leads">Test leads</Link>
        <Link aria-current={section === "campaigns" ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 text-label font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${section === "campaigns" ? "bg-ink text-surface" : "bg-surface text-ink"}`} to="/reengage/campaigns">Test campaigns</Link>
      </nav>
      <TestAccess />
      {children}
    </div>
  </main>;
}

function InvitationPreview({ lead }: { lead?: TestLead }) {
  const body = definition.components.find(component => component.type === "BODY")?.text || "";
  return <details className="rounded-control border border-line p-4">
    <summary className="cursor-pointer text-label font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">Preview CPF invitation</summary>
    <div className="mt-4 flex flex-col gap-4">
      <a href={posterUrl} rel="noreferrer" target="_blank"><img alt="CPF Changes 2026 webinar poster, 29 October, 7–9:30 pm" className="h-auto w-auto max-h-80 max-w-full rounded-control object-contain" height={1600} loading="lazy" src={posterUrl} width={1131} /></a>
      <p className="whitespace-pre-line text-label">{body.replace("{{1}}", firstName(lead))}</p>
      <p className="text-chip text-ink-2">{definition.components.find(component => component.type === "FOOTER")?.text}</p>
      <p className="text-label font-medium">Attending · Maybe next time · Unsubscribe</p>
    </div>
  </details>;
}

export function PrivateTestLeadsPage() {
  const { operatorKey, request } = useMetaTest();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<TestLead[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLeads([]); setError("");
    if (!operatorKey) return;
    setLoading(true);
    request<{ data: TestLead[] }>("list_leads").then(result => { if (active) setLeads(result.data); })
      .catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [operatorKey, request]);
  async function add(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await request<{ data: TestLead }>("create_lead", { name, phone, consented });
      setLeads(current => [result.data, ...current]); setName(""); setPhone(""); setConsented(false);
      toast.success("Private lead added.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The lead could not be added. Try again."); }
    finally { setBusy(false); }
  }
  const columns: DataTableColumn<TestLead>[] = [
    { key: "name", header: "Lead", cell: lead => <p className="break-words font-medium">{lead.name}</p> },
    { key: "phone", header: "WhatsApp", cell: lead => `+${lead.phone}` },
    { key: "action", header: "Campaign", cell: lead => <Button onClick={() => navigate(`/reengage/campaigns?lead=${encodeURIComponent(lead.id)}`)} size="sm" variant="secondary">Create campaign</Button> },
  ];
  return <TestLayout section="leads">
    {operatorKey && <>
      <Card title="Add test lead">
        <form className="flex flex-col gap-4" onSubmit={event => void add(event)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-label font-medium" htmlFor="test-lead-name">Name<input autoComplete="name" className={fieldClass} disabled={busy} id="test-lead-name" maxLength={80} name="name" onChange={event => setName(event.target.value)} required value={name} /></label>
            <label className="text-label font-medium" htmlFor="test-lead-phone">WhatsApp number<input autoComplete="tel" className={fieldClass} disabled={busy} id="test-lead-phone" name="phone" onChange={event => setPhone(event.target.value)} placeholder="+65 …" required type="tel" value={phone} /></label>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-label"><input checked={consented} className="size-5 shrink-0 accent-ink focus-visible:ring-3 focus-visible:ring-ring/50" disabled={busy} name="consented" onChange={event => setConsented(event.target.checked)} required type="checkbox" />This person agreed to receive the test message.</label>
          <div><Button loading={busy} type="submit"><Plus aria-hidden="true" className="size-4" />Add lead</Button></div>
        </form>
      </Card>
      {error && <p className="text-label text-danger" role="alert">{error}</p>}
      <Card title="Private leads">{loading ? <Skeleton rows={3} label="Loading private leads" /> : leads.length ? <DataTable columns={columns} rowKey={lead => lead.id} rows={leads} /> : <EmptyState icon={UsersRound} message="Add your test recipient above, then create a campaign for that person." />}</Card>
    </>}
  </TestLayout>;
}

const statusLabel: Record<TestCampaign["status"], string> = { draft: "Draft", sending: "Sending · check WhatsApp", accepted: "Accepted by Meta", failed: "Failed", unknown: "Delivery unconfirmed" };

export function PrivateTestCampaignsPage() {
  const { operatorKey, request } = useMetaTest();
  const [params] = useSearchParams();
  const [leads, setLeads] = useState<TestLead[]>([]);
  const [campaigns, setCampaigns] = useState<TestCampaign[]>([]);
  const [connection, setConnection] = useState<TestConnection | null>(null);
  const [title, setTitle] = useState("CPF webinar test");
  const [leadId, setLeadId] = useState(params.get("lead") || "");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sendTarget, setSendTarget] = useState<TestCampaign | null>(null);
  const selectedLead = leads.find(lead => lead.id === leadId);
  const load = useCallback(async () => {
    const [leadResult, campaignResult, status] = await Promise.all([
      request<{ data: TestLead[] }>("list_leads"), request<{ data: TestCampaign[] }>("list_campaigns"), request<TestConnection>("status"),
    ]);
    return { leads: leadResult.data, campaigns: campaignResult.data, status };
  }, [request]);
  useEffect(() => {
    let active = true;
    setLeads([]); setCampaigns([]); setConnection(null); setError("");
    if (!operatorKey) return;
    setLoading(true);
    load().then(result => { if (active) { setLeads(result.leads); setCampaigns(result.campaigns); setConnection(result.status); } })
      .catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [operatorKey, load]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await request<{ data: TestCampaign }>("create_campaign", { title, leadId });
      setCampaigns(current => [result.data, ...current]); toast.success("Campaign saved for one recipient.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The campaign could not be saved. Try again."); }
    finally { setBusy(false); }
  }
  async function send() {
    const target = sendTarget;
    if (!target || busy) return;
    setBusy(true); setSendTarget(null); setError("");
    try {
      await request("send_campaign", { campaignId: target.id, confirmed: true });
      setCampaigns(current => current.map(campaign => campaign.id === target.id ? { ...campaign, status: "accepted" } : campaign));
      toast.success("Accepted by Meta. Check the recipient's WhatsApp for delivery.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delivery was not confirmed. Check WhatsApp before trying another test.");
      request<{ data: TestCampaign[] }>("list_campaigns").then(result => setCampaigns(result.data)).catch(() => undefined);
    } finally { setBusy(false); }
  }
  const columns: DataTableColumn<TestCampaign>[] = [
    { key: "title", header: "Campaign", cell: campaign => <p className="break-words font-medium">{campaign.title}</p> },
    { key: "recipient", header: "One recipient", cell: campaign => <div><p>{campaign.lead.name}</p><p className="text-chip text-ink-2">+{campaign.lead.phone}</p></div> },
    { key: "status", header: "Status", cell: campaign => statusLabel[campaign.status] },
    { key: "send", header: "Send", cell: campaign => campaign.status === "draft" ? <Button disabled={busy || !connection?.ready} onClick={() => setSendTarget(campaign)} size="sm" variant="secondary"><SendHorizontal aria-hidden="true" className="size-4" />Review &amp; send</Button> : "—" },
  ];
  return <TestLayout section="campaigns">
    {operatorKey && <>
      <div className="flex flex-wrap items-center justify-between gap-3 text-label text-ink-2" role="status"><span>{connection?.ready ? "Hi-Hunt connected · CPF image template approved" : loading ? "Checking bot connection…" : connection?.requirements.join(" ") || "Connection unavailable"}</span><Button disabled={busy || loading} onClick={() => { setLoading(true); setError(""); load().then(result => { setLeads(result.leads); setCampaigns(result.campaigns); setConnection(result.status); }).catch(cause => setError(cause.message)).finally(() => setLoading(false)); }} size="sm" variant="secondary"><RefreshCw aria-hidden="true" className="size-4" />Refresh</Button></div>
      <Card title="Create test campaign">
        <form className="flex flex-col gap-4" onSubmit={event => void save(event)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-label font-medium" htmlFor="test-campaign-title">Campaign name<input autoComplete="off" className={fieldClass} disabled={busy} id="test-campaign-title" maxLength={120} name="campaign-name" onChange={event => setTitle(event.target.value)} required value={title} /></label>
            <label className="text-label font-medium" htmlFor="test-campaign-lead">Recipient<select className={fieldClass} disabled={busy || loading} id="test-campaign-lead" name="recipient" onChange={event => setLeadId(event.target.value)} required value={leadId}><option value="">Choose one private lead</option>{leads.map(lead => <option key={lead.id} value={lead.id}>{lead.name} · +{lead.phone}</option>)}</select></label>
          </div>
          {!loading && !leads.length && <p className="text-label"><Link className="underline underline-offset-4" to="/reengage/leads">Add a test lead</Link> to choose your recipient.</p>}
          <InvitationPreview lead={selectedLead} />
          <div><Button loading={busy} type="submit">Save campaign</Button></div>
        </form>
      </Card>
      {error && <p className="text-label text-danger" role="alert">{error}</p>}
      <Card title="Test campaigns">{loading ? <Skeleton rows={3} label="Loading private campaigns" /> : campaigns.length ? <DataTable columns={columns} rowKey={campaign => campaign.id} rows={campaigns} /> : <EmptyState icon={Megaphone} message="Save a campaign, then review and send it to your one selected recipient." />}</Card>
      <p className="text-chip text-ink-2">Accepted means Meta received the request. Check the recipient's WhatsApp to confirm delivery. Test campaigns never retry automatically.</p>
    </>}
    <ConfirmDialog confirmLabel="Send to this person" description={`Send the CPF invitation and original poster to ${sendTarget?.lead.name || ""} (+${sendTarget?.lead.phone || ""}) from the new number ending 4289? This is one real WhatsApp message. Meta messaging charges may apply.`} onConfirm={() => void send()} onOpenChange={open => { if (!open) setSendTarget(null); }} open={Boolean(sendTarget)} pending={busy} title="Send this one-person campaign?" />
  </TestLayout>;
}
