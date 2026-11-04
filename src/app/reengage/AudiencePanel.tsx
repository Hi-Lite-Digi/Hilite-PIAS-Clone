import { useEffect, useMemo, useState } from "react";
import { CircleAlert, Search, UserMinus, UserPlus, Users } from "lucide-react";
import {
  getAudiencePreview,
  type AssistantLeadPreview,
  type CampaignAudience,
  type WorkspaceSummary,
} from "../../lib/api";
import { AGE_ORDER, hasAudienceRules } from "../../lib/campaign";
import { Button, ConfirmDialog, Drawer, EmptyState, FilterChips, IconButton, SearchInput, Skeleton } from "../components/system";
import {
  audienceRuleKey,
  failAudienceLoad,
  finishAudienceLoad,
  idleAudienceLoad,
  setAudienceLeadMode,
  startAudienceLoad,
} from "./audience-panel-model";
import { audienceHasManualPicks, clearManualPicks } from "./campaign-view";
import { LEAD_FETCH_CAP, fetchPagedCollection } from "./lead-paging";

type AudiencePanelProps = {
  audience: CampaignAudience;
  summary: WorkspaceSummary | null;
  onChange: (audience: CampaignAudience) => void;
  readOnly?: boolean;
};

const DEFAULT_TOPICS = ["Investment", "CPF", "Retirement Planning", "Legacy Planning"];
const STATUS_OPTIONS = ["Untouched", "Unreachable", "Contacted", "Replied"];

function AudiencePanel({ audience, onChange, readOnly = false, summary }: AudiencePanelProps) {
  const [preview, setPreview] = useState(idleAudienceLoad);
  const [previewRetry, setPreviewRetry] = useState(0);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browse, setBrowse] = useState(idleAudienceLoad);
  const [browsePageResult, setBrowsePageResult] = useState<{ capReached: boolean; total: number } | null>(null);
  const [browseAudience, setBrowseAudience] = useState(audience);
  const [browseRetry, setBrowseRetry] = useState(0);
  const [browseSearch, setBrowseSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingRules, setPendingRules] = useState<CampaignAudience | null>(null);
  const browseRuleKey = audienceRuleKey(audience);
  const browseRules = useMemo(() => clearManualPicks(audience), [browseRuleKey]);

  const topicOptions = summary?.topics.map((topic) => topic.name).filter(Boolean) ?? DEFAULT_TOPICS;
  const ageOptions = AGE_ORDER.filter((band) => !summary || Boolean(summary.ageBands[band]));
  const statusOptions = [...new Set([
    ...STATUS_OPTIONS,
    ...Object.keys(summary?.statuses ?? {}),
    ...audience.statuses,
  ].filter(Boolean))];

  useEffect(() => {
    if (!hasAudienceRules(audience) && !audienceHasManualPicks(audience)) {
      setPreview(idleAudienceLoad());
      return;
    }
    let active = true;
    setPreview(startAudienceLoad());
    const timer = window.setTimeout(() => {
      getAudiencePreview(audience, 50, 0, {}, true)
        .then((result) => {
          if (!active) return;
          setPreview(finishAudienceLoad(result.data, result.total));
        })
        .catch((error) => active && setPreview(failAudienceLoad(error, "The audience could not be loaded.")));
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [audience, previewRetry]);

  useEffect(() => {
    if (!browseOpen) return;
    let active = true;
    setBrowse(startAudienceLoad());
    setBrowsePageResult(null);
    const timer = window.setTimeout(() => {
      fetchPagedCollection<AssistantLeadPreview>(async ({ limit, offset }) => {
        const result = await getAudiencePreview(browseRules, limit, offset, { browseAll: true, search: browseSearch }, true);
        return { data: result.data, total: result.matchingTotal };
      })
        .then((result) => {
          if (!active) return;
          setBrowse(finishAudienceLoad(result.items, result.total));
          setBrowsePageResult({ capReached: result.capReached, total: result.total });
        })
        .catch((error) => active && setBrowse(failAudienceLoad(error, "The lead library could not be loaded.")));
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [browseOpen, browseRetry, browseRuleKey, browseSearch]);

  const applyRuleChange = (partial: Partial<CampaignAudience>) => {
    if (readOnly) return;
    const next: CampaignAudience = { ...audience, ...partial };
    if (audienceHasManualPicks(audience)) {
      setPendingRules(clearManualPicks(next));
      setConfirmOpen(true);
      return;
    }
    onChange(next);
  };

  const setLeadMode = (leadId: number, mode: "include" | "exclude" | "auto") => {
    if (readOnly) return;
    onChange(setAudienceLeadMode(audience, leadId, mode));
  };

  const setBrowseLeadMode = (leadId: number, mode: "include" | "exclude" | "auto") => {
    if (readOnly) return;
    const next = setAudienceLeadMode(browseAudience, leadId, mode);
    setBrowseAudience(next);
    onChange(next);
  };

  const handleBrowseOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setBrowseAudience(audience);
    setBrowseOpen(nextOpen);
  };

  const previewPeople = useMemo(() => preview.people.slice(0, 8), [preview.people]);

  return (
    <div className="space-y-6" data-slot="audience-panel">
      <section aria-labelledby="audience-topics">
        <h3 className="text-card-title font-medium text-ink" id="audience-topics">Interests</h3>
        <p className="mt-1 text-label text-ink-2">A lead matches when any selected topic is present.</p>
        <FilterChips
          className="mt-3"
          label="Audience topics"
          multiple
          onValueChange={(value) => applyRuleChange({ topics: Array.isArray(value) ? value : [value] })}
          options={topicOptions.map((topic) => ({ label: topic, value: topic, disabled: readOnly }))}
          value={audience.topics}
        />
      </section>

      <section aria-labelledby="audience-age">
        <h3 className="text-card-title font-medium text-ink" id="audience-age">Age</h3>
        <FilterChips
          className="mt-3"
          label="Audience age bands"
          multiple
          onValueChange={(value) => applyRuleChange({ ageBands: Array.isArray(value) ? value : [value], minAge: null, maxAge: null })}
          options={ageOptions.map((band) => ({ label: band, value: band, disabled: readOnly }))}
          value={audience.ageBands}
        />
        <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
          <NumberField disabled={readOnly} label="Minimum age" value={audience.minAge} onChange={(value) => applyRuleChange({ minAge: value, ageBands: [] })} />
          <NumberField disabled={readOnly} label="Maximum age" value={audience.maxAge} onChange={(value) => applyRuleChange({ maxAge: value, ageBands: [] })} />
        </div>
      </section>

      <section aria-labelledby="audience-status">
        <h3 className="text-card-title font-medium text-ink" id="audience-status">Lead status</h3>
        <FilterChips
          className="mt-3"
          label="Audience lead statuses"
          multiple
          onValueChange={(value) => applyRuleChange({ statuses: Array.isArray(value) ? value : [value] })}
          options={statusOptions.map((status) => ({ label: status, value: status, disabled: readOnly }))}
          value={audience.statuses}
        />
      </section>

      <section aria-labelledby="audience-people">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-card-title font-medium text-ink" id="audience-people">People</h3><p className="mt-1 text-label text-ink-2">{preview.loading ? "Checking matches" : preview.error ? "Matches unavailable" : `${preview.total} matched`} · {(audience.includedLeadIds ?? []).length} included · {(audience.excludedLeadIds ?? []).length} excluded</p></div>
          {!readOnly && <Button onClick={() => handleBrowseOpenChange(true)} variant="secondary"><Search aria-hidden="true" className="size-4" strokeWidth={1.75} />Browse all leads</Button>}
        </div>
        {preview.loading ? <Skeleton className="mt-3" rows={3} variant="table" label="Loading audience preview" /> : preview.error ? (
          <EmptyState className="mt-3 min-h-36" icon={CircleAlert} message={preview.error} action={<Button onClick={() => setPreviewRetry((current) => current + 1)} variant="secondary">Retry</Button>} />
        ) : previewPeople.length > 0 ? (
          <div className="mt-3 divide-y divide-line overflow-hidden rounded-card border border-line">
            {previewPeople.map((person) => <LeadChoice audience={audience} key={person.id} onModeChange={setLeadMode} person={person} readOnly={readOnly} />)}
          </div>
        ) : <EmptyState className="mt-3 min-h-36" icon={Users} message="Choose a rule or include leads manually to build the audience." />}
      </section>

      <Drawer className="md:max-w-[42rem]" description="Include or exclude individual people without leaving this audience surface." onOpenChange={handleBrowseOpenChange} open={browseOpen} title="Browse all leads">
        <SearchInput onValueChange={setBrowseSearch} placeholder="Search the lead library" value={browseSearch} />
        {browsePageResult?.capReached && (
          <div className="mt-4 rounded-control border border-line bg-surface-2 p-3 text-label text-ink-2" role="status">
            Showing the first {browse.people.length.toLocaleString()} of {browsePageResult.total.toLocaleString()} leads. Refine the search to see leads beyond the {LEAD_FETCH_CAP.toLocaleString()}-lead safety limit.
          </div>
        )}
        {browse.loading ? <Skeleton className="mt-4" rows={6} variant="table" label="Loading lead library" /> : browse.error ? (
          <EmptyState className="mt-4" icon={CircleAlert} message={browse.error} action={<Button onClick={() => setBrowseRetry((current) => current + 1)} variant="secondary">Retry</Button>} />
        ) : browse.people.length > 0 ? (
          <div className="mt-4 divide-y divide-line overflow-hidden rounded-card border border-line">
            {browse.people.map((person) => <LeadChoice audience={browseAudience} key={person.id} onModeChange={setBrowseLeadMode} person={person} readOnly={readOnly} />)}
          </div>
        ) : <EmptyState className="mt-4" icon={Search} message="No leads match this search." />}
      </Drawer>

      <ConfirmDialog
        confirmLabel="Change rules"
        description="Changing audience rules will clear the manually included and excluded people. This keeps the audience result predictable."
        onConfirm={() => { if (pendingRules) onChange(pendingRules); setPendingRules(null); setConfirmOpen(false); }}
        onOpenChange={(nextOpen) => { setConfirmOpen(nextOpen); if (!nextOpen) setPendingRules(null); }}
        open={confirmOpen}
        title="Clear manual picks?"
      />
    </div>
  );
}

function LeadChoice({ audience, onModeChange, person, readOnly = false }: {
  audience: CampaignAudience;
  onModeChange: (leadId: number, mode: "include" | "exclude" | "auto") => void;
  person: AssistantLeadPreview;
  readOnly?: boolean;
}) {
  const included = audience.includedLeadIds?.includes(person.id);
  const excluded = audience.excludedLeadIds?.includes(person.id);
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-lavender text-chip font-semibold text-ink">{person.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span>
      <div className="min-w-0 flex-1"><p className="truncate text-body font-medium text-ink">{person.name}</p><p className="truncate text-chip text-ink-2">{person.age_band ?? "Age unknown"} · {person.phone ?? person.email ?? "No contact"}</p></div>
      {readOnly ? <span className="text-chip font-medium text-ink-2">{included ? "Included" : excluded ? "Excluded" : "Matched"}</span> : (
        <div className="flex items-center gap-1">
          <IconButton aria-pressed={Boolean(included)} icon={UserPlus} label={`Include ${person.name}`} onClick={() => onModeChange(person.id, included ? "auto" : "include")} variant={included ? "primary" : "default"} />
          <IconButton aria-pressed={Boolean(excluded)} icon={UserMinus} label={`Exclude ${person.name}`} onClick={() => onModeChange(person.id, excluded ? "auto" : "exclude")} variant={excluded ? "destructive" : "default"} />
        </div>
      )}
    </div>
  );
}

function NumberField({ disabled = false, label, onChange, value }: { disabled?: boolean; label: string; onChange: (value: number | null) => void; value?: number | null }) {
  return <label className="text-label font-medium text-ink">{label}<input className="mt-1.5 h-11 w-full rounded-control border border-line bg-surface-2 px-3 text-body text-ink outline-none focus:ring-3 focus:ring-ring/40 disabled:opacity-45" disabled={disabled} max={120} min={18} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} type="number" value={value ?? ""} /></label>;
}

export { AudiencePanel, LeadChoice };
