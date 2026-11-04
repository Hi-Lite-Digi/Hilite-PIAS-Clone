import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, Linkedin, SearchX, UserRoundSearch } from "lucide-react";
import { getHRProspects, type HRProspectRecord } from "../../lib/api";
import { getEmailThreads, getOutreachDrafts } from "../../lib/stubs";
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
  StatusPill,
  sortRows,
  type DataTableColumn,
  type SortState,
} from "../components/system";
import { fetchPagedCollection, LEAD_FETCH_CAP } from "../reengage/lead-paging";
import { LeadDetailDrawer } from "./LeadDetailDrawer";
import { useBadges } from "../layout/BadgesContext";
import {
  buildHiHuntLeadRows,
  filterHiHuntLeadRows,
  getLeadLifecycleStats,
  leadStatusLabel,
  leadStatusTone,
  type HiHuntLeadRow,
  type LeadHistorySources,
  type LeadLifecycleSummary,
  type HiHuntLeadStatus,
} from "./leads-model";

const STATUS_OPTIONS: { value: HiHuntLeadStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "queued", label: "Queued" },
  { value: "contacted", label: "Contacted" },
  { value: "replied", label: "Replied" },
  { value: "suppressed", label: leadStatusLabel.suppressed },
];

const DEFAULT_LEAD_PAGE_SIZE = 10;

function LeadsPage() {
  const { refresh: refreshBadges } = useBadges();
  const [prospects, setProspects] = useState<HRProspectRecord[]>([]);
  const [drafts, setDrafts] = useState<Awaited<ReturnType<typeof getOutreachDrafts>>["data"]>([]);
  const [threads, setThreads] = useState<Awaited<ReturnType<typeof getEmailThreads>>["data"]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historySources, setHistorySources] = useState<LeadHistorySources>({ drafts: "loading", threads: "loading" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [auxiliaryError, setAuxiliaryError] = useState("");
  const [pageResult, setPageResult] = useState<{
    capReached: boolean;
    lifecycle: LeadLifecycleSummary | null;
    total: number;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<HiHuntLeadStatus | "all">("all");
  const [verification, setVerification] = useState<"all" | "verified" | "unverified">("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_LEAD_PAGE_SIZE);
  const [sort, setSort] = useState<SortState>({ key: "name", direction: "ascending" });
  const [statusOverrides, setStatusOverrides] = useState<Record<string, HiHuntLeadStatus>>({});
  const loadRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    setError("");
    setAuxiliaryError("");
    setPageResult(null);
    setHistorySources({ drafts: "loading", threads: "loading" });
    const [leadResult, draftResult, threadResult] = await Promise.allSettled([
      (async () => {
        let lifecycle: LeadLifecycleSummary | null = null;
        const collection = await fetchPagedCollection<HRProspectRecord>(async ({ limit, offset }) => {
          const page = await getHRProspects({ includeSuppressed: true, limit, offset });
          if (!lifecycle && page.summary.lifecycle) lifecycle = page.summary.lifecycle;
          return page;
        });
        return { ...collection, lifecycle };
      })(),
      getOutreachDrafts(),
      getEmailThreads(),
    ]);
    if (request !== loadRequest.current) return;
    if (leadResult.status === "rejected") {
      setProspects([]);
      setError(leadResult.reason instanceof Error ? leadResult.reason.message : "Scraped contacts could not be loaded.");
      setLoading(false);
      return;
    }
    setProspects(leadResult.value.items);
    setStatusOverrides({});
    setPageResult({
      capReached: leadResult.value.capReached,
      lifecycle: leadResult.value.lifecycle,
      total: leadResult.value.total,
    });
    const nextHistorySources: LeadHistorySources = {
      drafts: draftResult.status === "rejected" ? "error" : draftResult.value.sample ? "sample" : "live",
      threads: threadResult.status === "rejected" ? "error" : threadResult.value.sample ? "sample" : "live",
    };
    setHistorySources(nextHistorySources);
    const failures: string[] = [];
    if (draftResult.status === "fulfilled") {
      setDrafts(draftResult.value.sample ? [] : draftResult.value.data);
      if (draftResult.value.sample) failures.push("Live outreach-draft history is unavailable; sample records were not used to infer contact status.");
    } else {
      setDrafts([]);
      failures.push(draftResult.reason instanceof Error ? draftResult.reason.message : "Outreach history is unavailable.");
    }
    if (threadResult.status === "fulfilled") {
      setThreads(threadResult.value.sample ? [] : threadResult.value.data);
      if (threadResult.value.sample) failures.push("Live email-thread history is unavailable; sample records were not used to infer contact status.");
    } else {
      setThreads([]);
      failures.push(threadResult.reason instanceof Error ? threadResult.reason.message : "Email history is unavailable.");
    }
    setAuxiliaryError(failures.join(" "));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    return () => { loadRequest.current += 1; };
  }, [load]);

  const draftsAvailable = historySources.drafts === "live";
  const threadsAvailable = historySources.threads === "live";
  const rows = useMemo(() => buildHiHuntLeadRows(prospects, drafts, threads, { draftsAvailable, threadsAvailable }).map((row) => ({
    ...row,
    status: statusOverrides[row.prospect.id] ?? row.status,
  })), [drafts, draftsAvailable, prospects, statusOverrides, threads, threadsAvailable]);
  const filtered = useMemo(() => filterHiHuntLeadRows(rows, { search, status, verification }), [rows, search, status, verification]);
  const selected = rows.find((row) => row.prospect.id === selectedId) ?? null;

  const columns = useMemo<DataTableColumn<HiHuntLeadRow>[]>(() => [
    {
      key: "name",
      header: "Contact",
      cell: (row) => <div><p className="font-medium text-ink">{row.prospect.full_name}</p><p className="mt-0.5 text-chip text-ink-2">{row.prospect.location || "Location unavailable"}</p></div>,
      sortValue: (row) => row.prospect.full_name,
      mobileLabel: "Contact",
    },
    {
      key: "role",
      header: "Role & company",
      cell: (row) => <div><p>{row.prospect.job_title}</p><p className="mt-0.5 text-chip text-ink-2">{row.prospect.company_name || "Company unavailable"}</p></div>,
      sortValue: (row) => `${row.prospect.company_name ?? ""} ${row.prospect.job_title}`,
      mobileLabel: "Role",
    },
    {
      key: "email",
      header: "Work email",
      cell: (row) => <div className="space-y-1.5"><p className="break-all">{row.prospect.work_email || "No work email"}</p><StatusPill label={row.verification.label} status={row.verification.tone} /></div>,
      sortValue: (row) => row.prospect.work_email,
      mobileLabel: "Email",
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => row.status
        ? <StatusPill label={leadStatusLabel[row.status]} status={leadStatusTone[row.status]} />
        : <StatusPill label="Unavailable" status="error" />,
      sortValue: (row) => row.status ?? "",
    },
    {
      key: "linkedin",
      header: "LinkedIn",
      cell: (row) => row.prospect.linkedin_url ? (
        <a className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-label font-medium text-ink outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9" href={row.prospect.linkedin_url} rel="noreferrer" target="_blank">
          <Linkedin aria-hidden="true" className="size-4" strokeWidth={1.75} />View
        </a>
      ) : <span className="text-ink-3">—</span>,
      hideOnMobile: true,
    },
  ], []);

  const sorted = useMemo(() => {
    const activeColumn = columns.find((column) => column.key === sort.key);
    return sortRows(filtered, activeColumn, sort.direction);
  }, [columns, filtered, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pagedRows = useMemo(
    () => sorted.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    [pageIndex, pageSize, sorted],
  );
  const pageStart = sorted.length === 0 ? 0 : pageIndex * pageSize + 1;
  const pageEnd = Math.min((pageIndex + 1) * pageSize, sorted.length);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const activeFilters = Boolean(search || status !== "all" || verification !== "all");
  const clearFilters = () => { setSearch(""); setStatus("all"); setVerification("all"); setPageIndex(0); };
  const lifecycleStats = getLeadLifecycleStats(rows, pageResult?.lifecycle ?? null, !pageResult || pageResult.capReached);
  const lifecycleTrend = lifecycleStats.source === "authoritative"
    ? "Authoritative lifecycle total"
    : lifecycleStats.source === "incomplete"
      ? pageResult?.capReached
        ? "Unavailable beyond the loaded safety limit"
        : "Lifecycle totals are incomplete"
      : null;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7" data-slot="hihunt-leads">
      <div className="space-y-6">
        <PageHeader subtitle="Connected prospecting providers target up to 300 new verified Singapore HR work emails every day at 7:00 AM." title="Leads" />

        {loading ? <Skeleton rows={3} variant="cards" label="Loading scraped-contact statistics" /> : (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Scraped contacts" value={pageResult?.total ?? rows.length} />
            <StatCard label="New" trend={lifecycleTrend ?? "Ready for workflow drafting"} value={lifecycleStats.newCount === null ? "—" : lifecycleStats.newCount} />
            <StatCard label="Replied" trend={lifecycleTrend ?? undefined} value={lifecycleStats.repliedCount === null ? "—" : lifecycleStats.repliedCount} />
          </div>
        )}

        {auxiliaryError && !error && (
          <div className="flex flex-col gap-3 rounded-control border border-danger/20 bg-danger/10 p-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <div><p className="text-body font-medium text-danger">Some outreach context is unavailable</p><p className="mt-1 text-label text-ink-2">Statuses or history may be incomplete. {auxiliaryError}</p></div>
            <Button onClick={() => void load()} size="sm" variant="secondary">Try again</Button>
          </div>
        )}

        {pageResult?.capReached && !error && (
          <div className="rounded-control border border-line bg-surface-2 p-4" role="status">
            <p className="text-body font-medium text-ink">Contact display safety limit reached</p>
            <p className="mt-1 text-label text-ink-2">Showing the first {prospects.length.toLocaleString()} of {pageResult.total.toLocaleString()} contacts. The remaining contacts are not shown because the {LEAD_FETCH_CAP.toLocaleString()}-contact safety limit was reached.</p>
          </div>
        )}

        <Card>
          <div className="space-y-3 border-b border-line pb-5">
            <SearchInput onValueChange={(value) => { setSearch(value); setPageIndex(0); }} placeholder="Search name, role, company, or email" value={search} />
            <FilterChips label="Outreach status" onValueChange={(value) => { setStatus(value as HiHuntLeadStatus | "all"); setPageIndex(0); }} options={STATUS_OPTIONS} value={status} />
            <FilterChips label="Email verification" onValueChange={(value) => { setVerification(value as typeof verification); setPageIndex(0); }} options={[{ value: "all", label: "All verification" }, { value: "verified", label: "Verified" }, { value: "unverified", label: "Not verified" }]} value={verification} />
          </div>
          <div className="pt-2">
            {error ? <EmptyState icon={CircleAlert} message={error} action={<Button onClick={() => void load()} variant="secondary">Try again</Button>} />
              : loading ? <Skeleton rows={6} variant="table" label="Loading scraped contacts" />
                : (
                  <>
                    <DataTable
                      columns={columns}
                      emptyState={<EmptyState icon={activeFilters ? SearchX : UserRoundSearch} message={activeFilters ? "No contacts match these filters." : "No scraped contacts yet."} action={activeFilters ? <Button onClick={clearFilters} variant="secondary">Clear filters</Button> : undefined} />}
                      onRowClick={(row) => setSelectedId(row.prospect.id)}
                      onSortChange={(nextSort) => { setSort(nextSort); setPageIndex(0); }}
                      rowKey={(row) => row.prospect.id}
                      rows={pagedRows}
                      sort={sort}
                    />
                    <nav aria-label="Hi-Hunt lead pages" className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-label text-ink-2" aria-live="polite">
                        Showing {pageStart.toLocaleString()}–{pageEnd.toLocaleString()} of {sorted.length.toLocaleString()}
                      </p>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <PageSizeSelect value={pageSize} onValueChange={(nextPageSize) => { setPageSize(nextPageSize); setPageIndex(0); }} />
                        <div className="flex items-center gap-2">
                          <Button disabled={pageIndex === 0} onClick={() => setPageIndex((current) => Math.max(0, current - 1))} size="sm" variant="secondary">Previous</Button>
                          <span className="min-w-24 text-center text-label text-ink-2">Page {pageIndex + 1} of {pageCount}</span>
                          <Button disabled={pageIndex + 1 >= pageCount} onClick={() => setPageIndex((current) => current + 1)} size="sm" variant="secondary">Next</Button>
                        </div>
                      </div>
                    </nav>
                  </>
                )}
          </div>
        </Card>
      </div>

      <LeadDetailDrawer
        lead={selected}
        historyError={auxiliaryError || null}
        historySources={historySources}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onStatusChange={(id, nextStatus) => {
          setStatusOverrides((current) => ({ ...current, [id]: nextStatus }));
          refreshBadges();
        }}
      />
    </main>
  );
}

export default LeadsPage;
