import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, MessageCircle, Plus, SearchX, Upload } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import {
  getCampaigns,
  getLeads,
  getSummary,
  type CampaignRecord,
  type LeadRecord,
  type ReplyConversationRecord,
  type WorkspaceSummary,
} from "../../lib/api";
import { getThreads } from "../../lib/stubs";
import { normaliseWhatsAppPhone } from "../../lib/whatsapp";
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  FilterChips,
  PageHeader,
  PageSizeSelect,
  SearchInput,
  Skeleton,
  StatCard,
  type DataTableColumn,
} from "../components/system";
import { LeadDetailDrawer } from "./LeadDetailDrawer";
import { LeadFormDrawer } from "./LeadFormDrawer";
import { LeadImportDrawer } from "./LeadImportDrawer";
import { leadMatchesCampaignAudience } from "./campaign-view";
import { PrivateTestLeadsPage } from "./PrivateCampaignWorkspace";

const DEFAULT_LEAD_PAGE_SIZE = 10;

function getLeadCampaigns(lead: LeadRecord, campaigns: readonly CampaignRecord[], threads: readonly ReplyConversationRecord[]) {
  const campaignIds = new Set(threads.filter((thread) => thread.leadId === lead.id).map((thread) => thread.campaignId));
  return campaigns.filter((campaign) => campaignIds.has(campaign.id) || leadMatchesCampaignAudience(lead, campaign.audience));
}

function LeadsPage() {
  const [params] = useSearchParams();
  if (import.meta.env.VITE_DEMO_MODE === "true" && params.get("view") !== "demo") return <PrivateTestLeadsPage />;
  return <DemoLeadsPage />;
}

function DemoLeadsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [threads, setThreads] = useState<ReplyConversationRecord[]>([]);
  const [sampleHistory, setSampleHistory] = useState(false);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [error, setError] = useState("");
  const [auxiliaryError, setAuxiliaryError] = useState("");
  const [leadTotal, setLeadTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [ageBand, setAgeBand] = useState("all");
  const [campaignId, setCampaignId] = useState("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_LEAD_PAGE_SIZE);
  const [reloadToken, setReloadToken] = useState(0);
  const [selected, setSelected] = useState<LeadRecord | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const leadLoadRequest = useRef(0);
  const contextLoadRequest = useRef(0);

  const loadContext = useCallback(async () => {
    const request = ++contextLoadRequest.current;
    setLoadingSummary(true);
    setAuxiliaryError("");
    const [summaryResult, campaignResult, threadResult] = await Promise.allSettled([
      getSummary(),
      getCampaigns(),
      getThreads(),
    ]);
    if (request !== contextLoadRequest.current) return;
    const auxiliaryFailures: string[] = [];
    if (summaryResult.status === "fulfilled") setSummary(summaryResult.value);
    else auxiliaryFailures.push(summaryResult.reason instanceof Error ? summaryResult.reason.message : "Lead filter totals could not be loaded.");
    if (campaignResult.status === "fulfilled") setCampaigns(campaignResult.value.data);
    else auxiliaryFailures.push(campaignResult.reason instanceof Error ? campaignResult.reason.message : "Campaign history could not be loaded.");
    if (threadResult.status === "fulfilled") {
      setThreads(threadResult.value.data);
      setSampleHistory(threadResult.value.sample);
    } else auxiliaryFailures.push(threadResult.reason instanceof Error ? threadResult.reason.message : "Conversation history could not be loaded.");
    setAuxiliaryError(auxiliaryFailures.join(" "));
    setLoadingSummary(false);
  }, []);

  useEffect(() => {
    void loadContext();
    return () => { contextLoadRequest.current += 1; };
  }, [loadContext, reloadToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPageIndex(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const request = ++leadLoadRequest.current;
    const loadPage = async () => {
      setLoadingLeads(true);
      setError("");
      try {
        const result = await getLeads({
          limit: pageSize,
          offset: pageIndex * pageSize,
          search: debouncedSearch || undefined,
          status: status === "all" ? undefined : status,
          ageBand: ageBand === "all" ? undefined : ageBand,
          campaignId: campaignId === "all" ? undefined : campaignId,
        });
        if (request !== leadLoadRequest.current) return;
        setLeads(result.data);
        setLeadTotal(result.total);
      } catch (loadError) {
        if (request !== leadLoadRequest.current) return;
        setError(loadError instanceof Error ? loadError.message : "Leads could not be loaded.");
      } finally {
        if (request === leadLoadRequest.current) setLoadingLeads(false);
      }
    };
    void loadPage();
    return () => { leadLoadRequest.current += 1; };
  }, [ageBand, campaignId, debouncedSearch, pageIndex, pageSize, reloadToken, status]);

  const reload = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  useEffect(() => {
    const action = searchParams.get("action");
    if (action === "add") setAddOpen(true);
    if (action === "import") setImportOpen(true);
  }, [searchParams]);

  const closeAction = (open: boolean, action: "add" | "import") => {
    if (action === "add") setAddOpen(open); else setImportOpen(open);
    if (!open && searchParams.get("action") === action) {
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
    }
  };

  const statusOptions = useMemo(() => [
    { value: "all", label: "All statuses" },
    ...Object.entries(summary?.statuses ?? {}).map(([value, count]) => ({ value, label: value, count })),
  ], [summary]);
  const ageOptions = useMemo(() => [
    { value: "all", label: "All ages" },
    ...Object.entries(summary?.ageBands ?? {}).map(([value, count]) => ({ value, label: value, count })),
  ], [summary]);
  const campaignOptions = useMemo(() => [
    { value: "all", label: "All campaigns" },
    ...campaigns.map((campaign) => ({ value: campaign.id, label: campaign.title })),
  ], [campaigns]);

  const columns = useMemo<DataTableColumn<LeadRecord>[]>(() => [
    {
      key: "name",
      header: "Lead",
      cell: (lead) => <div><p className="font-medium text-ink">{lead.name}</p><p className="mt-0.5 text-chip text-ink-2">{lead.email ?? lead.phone ?? "No contact"}</p></div>,
      sortValue: (lead) => lead.name,
      mobileLabel: "Lead",
    },
    {
      key: "age",
      header: "Age",
      cell: (lead) => lead.age != null ? `${lead.age} · ${lead.age_band ?? "Unknown"}` : lead.age_band ?? "Unknown",
      sortValue: (lead) => lead.age,
    },
    {
      key: "status",
      header: "Status",
      cell: (lead) => <span className="inline-flex rounded-full bg-surface-2 px-2.5 py-1 text-chip font-medium text-ink-2">{lead.status ?? "Unknown"}</span>,
      sortValue: (lead) => lead.status,
    },
    {
      key: "subscribed",
      header: "Subscribed",
      cell: (lead) => (
        <span className={lead.subscribed
          ? "inline-flex rounded-full bg-mint px-2.5 py-1 text-chip font-medium text-ink"
          : "inline-flex rounded-full bg-surface-2 px-2.5 py-1 text-chip font-medium text-ink-2"}
        >
          {lead.subscribed ? "Subscribed" : "Unsubscribed"}
        </span>
      ),
      sortValue: (lead) => lead.subscribed ? 1 : 0,
    },
    {
      key: "topics",
      header: "Topics",
      cell: (lead) => lead.topics?.length ? lead.topics.slice(0, 2).join(", ") : "—",
      sortValue: (lead) => lead.topics?.[0],
      hideOnMobile: true,
    },
    {
      key: "campaign",
      header: "Campaign",
      cell: (lead) => getLeadCampaigns(lead, campaigns, threads)[0]?.title ?? "—",
      sortValue: (lead) => getLeadCampaigns(lead, campaigns, threads)[0]?.title,
      hideOnMobile: true,
    },
  ], [campaigns, threads]);

  const thisMonthOnPage = useMemo(() => {
    const now = new Date();
    return leads.filter((lead) => {
      if (!lead.first_captured) return false;
      const captured = new Date(lead.first_captured);
      return captured.getFullYear() === now.getFullYear() && captured.getMonth() === now.getMonth();
    }).length;
  }, [leads]);
  const reachableOnPage = leads.filter((lead) => lead.subscribed && !lead.struck && normaliseWhatsAppPhone(lead.phone) !== null).length;
  const activeFilters = Boolean(search || status !== "all" || ageBand !== "all" || campaignId !== "all");
  const clearFilters = () => { setSearch(""); setStatus("all"); setAgeBand("all"); setCampaignId("all"); setPageIndex(0); };
  const pageCount = Math.max(1, Math.ceil(leadTotal / pageSize));
  const pageStart = leadTotal === 0 ? 0 : pageIndex * pageSize + 1;
  const pageEnd = Math.min(pageIndex * pageSize + leads.length, leadTotal);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7" data-slot="reengage-leads">
      <div className="space-y-6">
        <PageHeader
          actions={<>{import.meta.env.VITE_DEMO_MODE === "true" && <Button asChild variant="secondary"><Link to="/reengage/leads">Test leads</Link></Button>}<Button onClick={() => setImportOpen(true)} variant="secondary"><Upload aria-hidden="true" className="size-4" strokeWidth={1.75} />Upload leads</Button><Button onClick={() => setAddOpen(true)}><Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />Add lead</Button></>}
          subtitle="Search, segment, and maintain the people available for WhatsApp campaigns."
          title="Leads"
        />

        {loadingSummary && !summary ? <Skeleton rows={3} variant="cards" label="Loading lead statistics" /> : (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Total leads" value={summary?.total ?? leadTotal} />
            <StatCard label="Reachable on WhatsApp" trend="Valid WhatsApp phone" value={summary?.whatsappReachable ?? reachableOnPage} />
            <StatCard label="Added this month" value={summary?.addedThisMonth ?? thisMonthOnPage} />
          </div>
        )}

        {auxiliaryError && !error && (
          <div className="flex flex-col gap-3 rounded-control border border-danger/20 bg-danger/10 p-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <div><p className="text-body font-medium text-danger">Some lead context is unavailable</p><p className="mt-1 text-label text-ink-2">Campaign filters and history may be incomplete. {auxiliaryError}</p></div>
            <Button onClick={reload} size="sm" variant="secondary">Try again</Button>
          </div>
        )}

        <Card>
          <div className="space-y-3 border-b border-line pb-5">
            <SearchInput onValueChange={setSearch} placeholder="Search name, phone, or email" value={search} />
            <FilterChips label="Lead status" onValueChange={(value) => { setStatus(String(value)); setPageIndex(0); }} options={statusOptions} value={status} />
            <FilterChips label="Age band" onValueChange={(value) => { setAgeBand(String(value)); setPageIndex(0); }} options={ageOptions} value={ageBand} />
            {campaigns.length > 0 && <FilterChips label="Campaign" onValueChange={(value) => { setCampaignId(String(value)); setPageIndex(0); }} options={campaignOptions} value={campaignId} />}
          </div>

          <div className="pt-2">
            {error && leads.length === 0 ? (
              <EmptyState icon={CircleAlert} message={error} action={<Button onClick={reload} variant="secondary">Try again</Button>} />
            ) : loadingLeads && leads.length === 0 ? <Skeleton rows={6} variant="table" label="Loading leads" /> : (
              <>
                {error && <div className="mb-3 rounded-control border border-danger/20 bg-danger/10 p-3 text-label text-danger" role="alert">{error}</div>}
                <div className={loadingLeads ? "pointer-events-none opacity-55" : undefined} aria-busy={loadingLeads || undefined}>
                  <DataTable
                    columns={columns}
                    emptyState={<EmptyState icon={activeFilters ? SearchX : MessageCircle} message={activeFilters ? "No matches" : "No leads yet"} action={activeFilters ? <Button onClick={clearFilters} variant="secondary">Clear filters</Button> : <Button onClick={() => setAddOpen(true)}>Add lead</Button>} />}
                    initialSort={{ key: "name", direction: "ascending" }}
                    onRowClick={setSelected}
                    rowKey={(lead) => lead.id}
                    rows={leads}
                  />
                </div>
                <nav aria-label="Lead pages" className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-label text-ink-2" aria-live="polite">
                    {loadingLeads ? "Loading page…" : `Showing ${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} of ${leadTotal.toLocaleString()}`}
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <PageSizeSelect value={pageSize} onValueChange={(nextPageSize) => { setPageSize(nextPageSize); setPageIndex(0); }} />
                    <div className="flex items-center gap-2">
                      <Button disabled={pageIndex === 0 || loadingLeads} onClick={() => setPageIndex((current) => Math.max(0, current - 1))} size="sm" variant="secondary">Previous</Button>
                      <span className="min-w-24 text-center text-label text-ink-2">Page {pageIndex + 1} of {pageCount}</span>
                      <Button disabled={pageIndex + 1 >= pageCount || loadingLeads} onClick={() => setPageIndex((current) => current + 1)} size="sm" variant="secondary">Next</Button>
                    </div>
                  </div>
                </nav>
              </>
            )}
          </div>
        </Card>
      </div>

      <LeadDetailDrawer
        campaigns={campaigns}
        lead={selected}
        onDeleted={(id) => {
          setLeads((current) => current.filter((lead) => lead.id !== id));
          setLeadTotal((current) => Math.max(0, current - 1));
          setSelected((current) => current?.id === id ? null : current);
        }}
        onOpenChange={(open) => !open && setSelected(null)}
        onUpdated={(updated) => {
          setLeads((current) => current.map((lead) => lead.id === updated.id ? updated : lead));
          setSelected((current) => current?.id === updated.id ? updated : current);
        }}
        sampleHistory={sampleHistory}
        threads={threads}
      />
      <LeadFormDrawer onCreated={() => { setPageIndex(0); reload(); }} onOpenChange={(open) => closeAction(open, "add")} open={addOpen} />
      <LeadImportDrawer existingLeads={leads} onImported={reload} onOpenChange={(open) => closeAction(open, "import")} open={importOpen} />
    </main>
  );
}

export default LeadsPage;
export { getLeadCampaigns };
