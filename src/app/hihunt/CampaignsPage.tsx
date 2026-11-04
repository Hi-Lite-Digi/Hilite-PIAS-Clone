import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CircleAlert,
  Copy,
  Eye,
  FileImage,
  FileText,
  Link2,
  Mail,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Upload,
  UsersRound,
} from "lucide-react";
import { Link, useBlocker, useLocation, useNavigate, useParams, type BlockerFunction } from "react-router";
import {
  createHRCampaign,
  analyzeHRPoster,
  deleteHRCampaign,
  getEmailSenderStatus,
  getHRCampaign,
  getHRCampaigns,
  getHRProspects,
  getPosterUploadTicket,
  sendHRCampaign,
  updateHRCampaign,
  uploadPosterFile,
  type HRCampaignRecord,
  type HRProspectRecord,
} from "../../lib/api";
import { ACCEPTED_POSTER_TYPES, validatePosterFile } from "../../lib/campaign";
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  IconButton,
  PageHeader,
  SearchInput,
  Skeleton,
  StatusPill,
  toast,
  type DataTableColumn,
} from "../components/system";
import { fetchPagedCollection } from "../reengage/lead-paging";
import { hasSendableHRWorkEmail } from "./prospect-eligibility";

const DEFAULT_SUBJECT = "A quick introduction from Hilite";
const DEFAULT_BODY = `Hi {{first_name}},

I’m reaching out from Hilite. We run practical financial-wellness seminars for employees in Singapore, covering topics such as CPF, retirement planning, and financial confidence.

Would you be open to a short conversation about offering a session to your team?

Warm regards,
Hilite`;

type WizardStep = "poster" | "delivery" | "message" | "audience" | "review";
const STEPS: Array<{ key: WizardStep; label: string }> = [
  { key: "poster", label: "Poster" },
  { key: "delivery", label: "Delivery" },
  { key: "message", label: "Message" },
  { key: "audience", label: "Audience" },
  { key: "review", label: "Review" },
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}

function defaultCampaignName() {
  return `HR outreach – ${new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  }).format(new Date())}`;
}

function singaporeDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function campaignTone(status: HRCampaignRecord["status"]) {
  if (status === "sent") return "done" as const;
  if (status === "sending") return "running" as const;
  if (status === "failed") return "error" as const;
  if (status === "partial") return "queued" as const;
  return "draft" as const;
}

function campaignEditorHref(id: string) {
  return `/hihunt/campaigns/${encodeURIComponent(id)}/edit`;
}

function duplicateCampaignName(name: string) {
  const suffix = " (Copy)";
  const base = name.trim() || "Hi-Hunt campaign";
  return `${base.slice(0, 180 - suffix.length).trimEnd()}${suffix}`;
}

function eligibleProspect(prospect: HRProspectRecord) {
  return prospect.status !== "suppressed"
    && hasSendableHRWorkEmail(prospect);
}

function getPosterFromClipboard(clipboardData: DataTransfer | null) {
  if (!clipboardData) return null;
  const file = Array.from(clipboardData.files).find((item) => ACCEPTED_POSTER_TYPES.includes(item.type));
  if (file) return file;
  return Array.from(clipboardData.items)
    .find((item) => item.kind === "file" && ACCEPTED_POSTER_TYPES.includes(item.type))
    ?.getAsFile() ?? null;
}

function renderEmailLinks(value: string) {
  const parts = value.split(/(\[[^\]\n]{1,160}\]\(https:\/\/[^\s)]+\))/gi);
  return parts.map((part, index) => {
    const match = /^\[([^\]\n]{1,160})\]\((https:\/\/[^\s)]+)\)$/i.exec(part);
    return match
      ? <a className="font-medium text-ink underline underline-offset-2" href={match[2]} key={index} rel="noreferrer" target="_blank">{match[1]}</a>
      : <span key={index}>{part}</span>;
  });
}

function CampaignWizard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id: campaignId } = useParams<{ id: string }>();
  const preselectedId = new URLSearchParams(location.search).get("prospectId");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);
  const previewObjectUrl = useRef<string | null>(null);
  const allowNavigation = useRef(false);
  const confirmedNavigation = useRef(false);
  const [step, setStep] = useState<WizardStep>("poster");
  const [prospects, setProspects] = useState<HRProspectRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(preselectedId ? [preselectedId] : []));
  const [search, setSearch] = useState("");
  const [name, setName] = useState(defaultCampaignName);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [showLinkEditor, setShowLinkEditor] = useState(false);
  const [linkLabel, setLinkLabel] = useState("YES");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkRange, setLinkRange] = useState({ start: 0, end: 0 });
  const [linkError, setLinkError] = useState("");
  const [senderAddress, setSenderAddress] = useState<string | null>(null);
  const [senderRequirement, setSenderRequirement] = useState("");
  const [posterName, setPosterName] = useState<string | null>(null);
  const [posterPath, setPosterPath] = useState<string | null>(null);
  const [posterMimeType, setPosterMimeType] = useState<string | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<{ tone: "ai" | "warning"; text: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [stepErrors, setStepErrors] = useState<Partial<Record<WizardStep, string>>>({});
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savedCampaign, setSavedCampaign] = useState<HRCampaignRecord | null>(null);
  const [touched, setTouched] = useState(false);

  const stepIndex = STEPS.findIndex((item) => item.key === step);
  const readOnly = Boolean(savedCampaign && savedCampaign.status !== "draft");
  const locked = readOnly;
  const dirty = touched && !readOnly;
  const shouldBlockNavigation = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => {
    const currentUrl = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`;
    const nextUrl = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;
    return !allowNavigation.current && dirty && currentUrl !== nextUrl;
  }, [dirty]);
  const blocker = useBlocker(shouldBlockNavigation);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    const campaignRequest = campaignId ? getHRCampaign(campaignId) : Promise.resolve(null);
    Promise.all([
      fetchPagedCollection<HRProspectRecord>(async ({ limit, offset }) => (
        getHRProspects({ includeSuppressed: true, limit, offset })
      )),
      getEmailSenderStatus(),
      campaignRequest,
    ]).then(([prospectResult, sender, campaignResult]) => {
      if (!active) return;
      setProspects(prospectResult.items);
      setSenderAddress(sender.configured ? sender.address : null);
      setSenderRequirement(sender.configured ? "" : sender.requirement || "Connect Gmail before sending a campaign.");
      if (campaignResult) {
        const campaign = campaignResult.data;
        setSavedCampaign(campaign);
        setName(campaign.name);
        setSubject(campaign.subject);
        setBody(campaign.body);
        setPosterName(campaign.poster_name);
        setPosterPath(campaign.poster_path);
        setPosterMimeType(campaign.poster_mime_type);
        setSelectedIds(new Set(campaign.recipient_ids));
        setStep("message");
        setTouched(false);
      } else if (preselectedId) {
        const selected = prospectResult.items.find((prospect) => prospect.id === preselectedId);
        if (selected && eligibleProspect(selected)) setName(`Outreach to ${selected.full_name}`);
        else setSelectedIds(new Set());
      }
    }).catch((error) => {
      if (active) setLoadError(errorMessage(error));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [campaignId, preselectedId]);

  useEffect(() => () => {
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const clearStepError = (target: WizardStep) => {
    setStepErrors((current) => ({ ...current, [target]: undefined }));
  };

  const openLinkEditor = () => {
    const field = bodyInputRef.current;
    const start = field?.selectionStart ?? body.length;
    const end = field?.selectionEnd ?? start;
    setLinkRange({ start, end });
    setLinkLabel(body.slice(start, end).trim() || "YES");
    setLinkUrl("");
    setLinkError("");
    setShowLinkEditor(true);
  };

  const insertEmailLink = () => {
    const label = linkLabel.trim();
    let url: URL;
    try {
      url = new URL(linkUrl.trim());
      if (url.protocol !== "https:") throw new Error();
    } catch {
      setLinkError("Enter a complete HTTPS link.");
      return;
    }
    if (!label) {
      setLinkError("Enter the linked words.");
      return;
    }
    const start = Math.min(linkRange.start, body.length);
    const end = Math.min(Math.max(start, linkRange.end), body.length);
    const inserted = `[${label}](${url.toString()})`;
    setBody(`${body.slice(0, start)}${inserted}${body.slice(end)}`);
    setTouched(true);
    clearStepError("message");
    setShowLinkEditor(false);
    setLinkError("");
    requestAnimationFrame(() => {
      const field = bodyInputRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(start + inserted.length, start + inserted.length);
    });
  };

  const setLocalPreview = useCallback((file: File | null) => {
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
    previewObjectUrl.current = file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    setPosterPreviewUrl(previewObjectUrl.current);
  }, []);

  const fillEmailFromPoster = useCallback(async (input: { posterName: string; posterPath: string; posterMimeType: string }) => {
    setGenerating(true);
    try {
      const result = await analyzeHRPoster(input);
      setName(result.draft.title);
      setSubject(result.draft.subject);
      setBody(result.draft.body);
      setAiNote({
        tone: result.warning ? "warning" : "ai",
        text: result.warning || result.rationale || "The poster was read and an editable HR email was prepared.",
      });
      setTouched(true);
    } finally {
      setGenerating(false);
    }
  }, []);

  const processPoster = useCallback(async (file: File) => {
    const problem = validatePosterFile(file);
    if (problem) {
      setStepErrors((current) => ({ ...current, poster: problem }));
      return;
    }
    if (file.size > 18 * 1024 * 1024) {
      setStepErrors((current) => ({ ...current, poster: "Email attachments must be 18 MB or smaller." }));
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    clearStepError("poster");
    try {
      const ticket = await getPosterUploadTicket(file);
      await uploadPosterFile(file, ticket, setUploadProgress);
      await fillEmailFromPoster({
        posterName: file.name,
        posterPath: ticket.path,
        posterMimeType: file.type,
      });
      setPosterName(file.name);
      setPosterPath(ticket.path);
      setPosterMimeType(file.type);
      setLocalPreview(file);
      setStep("delivery");
    } catch (error) {
      setStepErrors((current) => ({ ...current, poster: errorMessage(error) }));
    } finally {
      setUploading(false);
    }
  }, [fillEmailFromPoster, setLocalPreview]);

  useEffect(() => {
    if (step !== "poster" || uploading || locked) return;
    const handlePaste = (event: ClipboardEvent) => {
      const file = getPosterFromClipboard(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void processPoster(file);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [locked, processPoster, step, uploading]);

  const eligible = useMemo(() => prospects.filter(eligibleProspect), [prospects]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return eligible;
    return eligible.filter((prospect) => [prospect.full_name, prospect.job_title, prospect.company_name, prospect.work_email]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  }, [eligible, search]);
  const selected = useMemo(() => eligible.filter((prospect) => selectedIds.has(prospect.id)), [eligible, selectedIds]);
  const valid = Boolean(name.trim() && subject.trim() && body.trim() && selected.length && senderAddress);

  const toggleRecipient = (id: string) => {
    if (locked) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 200) next.add(id);
      else toast.error("A Hi-Hunt campaign can include up to 200 HR contacts.");
      return next;
    });
    setTouched(true);
    clearStepError("audience");
  };

  const selectVisible = () => {
    if (locked || visible.length === 0) return;
    setSelectedIds((current) => {
      const allVisibleSelected = visible.every((prospect) => current.has(prospect.id));
      const next = new Set(current);
      if (allVisibleSelected) visible.forEach((prospect) => next.delete(prospect.id));
      else visible.filter((prospect) => !next.has(prospect.id)).slice(0, Math.max(0, 200 - next.size)).forEach((prospect) => next.add(prospect.id));
      return next;
    });
    setTouched(true);
    clearStepError("audience");
  };

  const next = () => {
    if (readOnly) {
      setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].key);
      return;
    }
    if (step === "delivery" && !senderAddress) {
      setStepErrors((current) => ({ ...current, delivery: senderRequirement || "Connect Gmail before continuing." }));
      return;
    }
    if (step === "message" && (!name.trim() || !subject.trim() || !body.trim())) {
      setStepErrors((current) => ({ ...current, message: "Add a campaign name, email subject, and email body before continuing." }));
      return;
    }
    if (step === "audience" && selected.length === 0) {
      setStepErrors((current) => ({ ...current, audience: "Choose at least one verified HR contact." }));
      return;
    }
    clearStepError(step);
    setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].key);
  };

  const persistDraft = async () => {
    if (!valid) return null;
    const input = {
      name: name.trim(),
      subject: subject.trim(),
      body: body.trim(),
      recipientIds: selected.map((prospect) => prospect.id),
      posterName,
      posterPath,
      posterMimeType,
    };
    if (savedCampaign) {
      if (savedCampaign.status !== "draft" || !touched) return savedCampaign;
      const result = await updateHRCampaign(savedCampaign.id, input);
      setSavedCampaign(result.data);
      setTouched(false);
      return result.data;
    }
    const result = await createHRCampaign(input);
    setSavedCampaign(result.data);
    setTouched(false);
    return result.data;
  };

  const saveDraft = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const campaign = await persistDraft();
      if (!campaign) return;
      toast.success("Hi-Hunt email campaign saved as a draft.");
      allowNavigation.current = true;
      navigate("/hihunt/campaigns");
    } catch (error) {
      toast.error("Campaign could not be saved", { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const sendNow = async () => {
    if (!valid || saving) return;
    setSaving(true);
    let draftExists = Boolean(savedCampaign);
    try {
      const campaign = await persistDraft();
      if (!campaign) return;
      draftExists = true;
      const result = await sendHRCampaign(campaign.id);
      toast.success(`${result.sent} ${result.sent === 1 ? "email" : "emails"} sent from ${result.data.sender_email}.`);
      allowNavigation.current = true;
      navigate("/hihunt/campaigns");
    } catch (error) {
      toast.error("Campaign could not be sent", { description: `${errorMessage(error)}${draftExists ? " The saved draft is ready to retry." : ""}` });
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7" data-slot="hihunt-campaign-wizard">
      <div className="space-y-6">
        <PageHeader actions={<Button onClick={() => navigate("/hihunt/campaigns")} variant="secondary"><ArrowLeft aria-hidden="true" className="size-4" />Back to campaigns</Button>} subtitle={readOnly ? "Review the saved Gmail message, attachment, audience, and delivery result." : "Prepare the attachment, Gmail message, and verified HR audience before approval."} title={readOnly ? "Campaign details" : campaignId ? "Edit campaign" : "New campaign"} />
        <ol aria-label="Campaign steps" className="grid grid-cols-5 gap-2">
          {STEPS.map((item, index) => <li className="min-w-0" key={item.key}><button aria-current={step === item.key ? "step" : undefined} className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-2 text-chip font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${step === item.key ? "bg-ink text-surface" : index < stepIndex ? "bg-mint text-ink" : "bg-surface-2 text-ink-2"}`} disabled={index > stepIndex} onClick={() => index <= stepIndex && setStep(item.key)} type="button"><span className="tabular-nums">{index + 1}</span><span className="hidden sm:inline">{item.label}</span></button></li>)}
        </ol>

        <Card>
          {(loadError || stepErrors[step]) && <div className="mb-5 flex items-start gap-3 rounded-control border border-danger/20 bg-danger/10 p-4 text-body text-danger" role="alert"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{loadError || stepErrors[step]}</span></div>}
          {readOnly && <div className="mb-5 flex items-start gap-3 rounded-control border border-line bg-surface-2 p-4 text-body text-ink-2"><Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>This campaign has already started sending, so its approved email and recipients are read-only.</span></div>}

          {step === "poster" && <div className="space-y-4">
            <div className="flex min-h-72 flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface-2 p-6 text-center" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (locked) return; const file = event.dataTransfer.files[0]; if (file) void processPoster(file); }}>
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-surface text-ink-2"><FileImage aria-hidden="true" className="size-5" /></span>
              <h2 className="mt-4 text-section-title font-medium text-ink">Drop or paste the campaign attachment</h2>
              <p className="mt-2 max-w-md text-body text-ink-2">PNG, JPEG, WebP, GIF, or PDF up to 18 MB. The saved file is attached to every email.</p>
              <Button className="mt-5" disabled={locked} loading={uploading} onClick={() => fileInputRef.current?.click()}><Upload aria-hidden="true" className="size-4" />Browse attachment</Button>
              <input ref={fileInputRef} accept={ACCEPTED_POSTER_TYPES.join(",")} className="sr-only" disabled={locked} onChange={(event) => { const file = event.target.files?.[0]; if (file) void processPoster(file); event.currentTarget.value = ""; }} type="file" />
              {uploading && <div className="mt-5 w-full max-w-md"><div className="h-2 overflow-hidden rounded-full bg-surface"><span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${uploadProgress}%` }} /></div><p className="mt-2 text-label text-ink-2">{uploadProgress < 100 ? `Uploading ${uploadProgress}%` : "Reading poster and preparing the email…"}</p></div>}
            </div>
            <div className="flex items-center gap-3"><span className="h-px flex-1 bg-line" /><span className="text-chip text-ink-2">or</span><span className="h-px flex-1 bg-line" /></div>
            <Button className="w-full" disabled={locked} onClick={() => { setTouched(true); setStep("delivery"); }} variant="secondary">Start without an attachment</Button>
          </div>}

          {step === "delivery" && <div className="space-y-5">
            <div className="rounded-card border border-ink/60 bg-mint p-5"><div className="flex items-start gap-4"><span className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-surface"><Mail aria-hidden="true" className="size-5" /></span><div className="min-w-0 flex-1"><h2 className="text-section-title font-medium text-ink">Email blast</h2><p className="mt-1 text-body text-ink-2">Hi-Hunt campaigns are sent only through the connected Gmail account.</p><p className="mt-3 break-all text-label font-medium text-ink">{loading ? "Checking Gmail sender…" : senderAddress ? `Connected · ${senderAddress}` : senderRequirement || "Gmail is not connected"}</p></div></div></div>
            {posterName && <div className="flex items-center gap-3 rounded-control bg-surface-2 p-4 text-body text-ink-2"><FileText aria-hidden="true" className="size-4 shrink-0" /><span className="min-w-0 break-all"><strong className="font-medium text-ink">Email attachment:</strong> {posterName}</span></div>}
            <div className="rounded-control border border-line p-4 text-label text-ink-2">Emails do not send automatically. The final Review step requires your approval, and Gmail shows its native unsubscribe control beside the sender.</div>
          </div>}

          {step === "message" && <div className="space-y-4">
            {posterName && !readOnly && <div className={`flex flex-col gap-3 rounded-control border p-4 text-body sm:flex-row sm:items-start ${aiNote?.tone === "warning" ? "border-danger/20 bg-danger/10 text-danger" : "border-accent/30 bg-accent/10 text-ink"}`}><Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><div className="min-w-0 flex-1"><p className="font-medium">{aiNote ? "AI-filled poster template" : "Fill template from poster"}</p><p className="mt-1 text-label opacity-80">{aiNote?.text || "Generate a new campaign name, subject, and personalized email from the attached poster."}</p></div>{posterPath && posterMimeType && <Button disabled={generating} loading={generating} onClick={() => { clearStepError("message"); void fillEmailFromPoster({ posterName, posterPath, posterMimeType }).catch((error) => setStepErrors((current) => ({ ...current, message: errorMessage(error) }))); }} size="sm" variant="secondary"><RefreshCw aria-hidden="true" className="size-4" />{aiNote ? "Regenerate from poster" : "Generate from poster"}</Button>}</div>}
            <label className="block text-label font-medium text-ink">Campaign name<input className="mt-2 min-h-11 w-full rounded-control border border-line bg-surface-2 px-3.5 text-body text-ink outline-none focus:ring-3 focus:ring-ring/40 disabled:opacity-60" disabled={locked} maxLength={180} onChange={(event) => { setName(event.target.value); setTouched(true); clearStepError("message"); }} value={name} /></label>
            <label className="block text-label font-medium text-ink">Email subject<input className="mt-2 min-h-11 w-full rounded-control border border-line bg-surface-2 px-3.5 text-body text-ink outline-none focus:ring-3 focus:ring-ring/40 disabled:opacity-60" disabled={locked} maxLength={220} onChange={(event) => { setSubject(event.target.value); setTouched(true); clearStepError("message"); }} value={subject} /></label>
            <label className="block text-label font-medium text-ink">Email body<textarea ref={bodyInputRef} className="mt-2 min-h-72 w-full resize-y rounded-control border border-line bg-surface-2 px-3.5 py-3 text-body text-ink outline-none focus:ring-3 focus:ring-ring/40 disabled:opacity-60" disabled={locked} maxLength={12000} onChange={(event) => { setBody(event.target.value); setTouched(true); clearStepError("message"); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openLinkEditor(); } }} value={body} /></label>
            <div className="flex flex-wrap items-center gap-3"><Button disabled={locked} onClick={openLinkEditor} size="sm" variant="secondary"><Link2 aria-hidden="true" className="size-4" />Add linked words <kbd className="rounded bg-surface px-1.5 py-0.5 text-chip font-normal">Ctrl K</kbd></Button><span className="text-chip text-ink-2">Select words such as YES, press Ctrl+K, then paste the HTTPS link.</span></div>
            {showLinkEditor && <div className="rounded-card border border-line bg-surface p-4" onKeyDown={(event) => { if (event.key === "Escape") { setShowLinkEditor(false); setLinkError(""); } }}><div className="grid gap-3 sm:grid-cols-[minmax(8rem,0.55fr)_minmax(12rem,1fr)_auto] sm:items-end"><label className="text-label font-medium text-ink-2">Linked words<input autoFocus className="mt-1.5 h-11 w-full rounded-control border border-line bg-surface-2 px-3.5 text-body text-ink outline-none focus:ring-3 focus:ring-ring/40" onChange={(event) => { setLinkLabel(event.target.value); setLinkError(""); }} value={linkLabel} /></label><label className="text-label font-medium text-ink-2">HTTPS link<input className="mt-1.5 h-11 w-full rounded-control border border-line bg-surface-2 px-3.5 text-body text-ink outline-none focus:ring-3 focus:ring-ring/40" onChange={(event) => { setLinkUrl(event.target.value); setLinkError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); insertEmailLink(); } }} placeholder="https://example.com" type="url" value={linkUrl} /></label><Button onClick={insertEmailLink}>Insert link</Button></div>{linkError && <p className="mt-2 text-label text-danger" role="alert">{linkError}</p>}</div>}
            <p className="rounded-control bg-surface-2 p-3 text-label text-ink-2"><code>{"{{first_name}}"}</code> is personalised for each HR contact. Gmail adds its native unsubscribe control automatically.</p>
          </div>}

          {step === "audience" && (loading ? <Skeleton label="Loading Hi-Hunt recipients" rows={6} variant="table" /> : <div className="space-y-4">
            <div><h2 className="text-section-title font-medium text-ink">Choose HR recipients</h2><p className="mt-1 text-body text-ink-2">Only verified, subscribed work emails are available. {selected.length} selected.</p></div>
            <SearchInput onValueChange={setSearch} placeholder="Search name, role, company, or email" value={search} />
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-label text-ink-2">{visible.length} eligible contacts</p><Button disabled={locked || visible.length === 0} onClick={selectVisible} size="sm" variant="ghost">{visible.length > 0 && visible.every((prospect) => selectedIds.has(prospect.id)) ? "Clear visible" : "Select visible"}</Button></div>
            <div className="max-h-[470px] space-y-2 overflow-y-auto pr-1">{visible.length === 0 ? <EmptyState icon={UsersRound} message="No verified contacts match this search." /> : visible.map((prospect) => <label className="flex min-h-16 cursor-pointer items-start gap-3 rounded-control border border-line p-3 transition-colors hover:bg-surface-2" key={prospect.id}><input checked={selectedIds.has(prospect.id)} className="mt-1 size-4 accent-ink" disabled={locked} onChange={() => toggleRecipient(prospect.id)} type="checkbox" /><span className="min-w-0 flex-1"><span className="block text-body font-medium text-ink">{prospect.full_name}</span><span className="mt-0.5 block text-chip text-ink-2">{prospect.job_title}{prospect.company_name ? ` · ${prospect.company_name}` : ""}</span><span className="mt-1 block break-all text-chip text-ink-2">{prospect.work_email}</span></span></label>)}</div>
          </div>)}

          {step === "review" && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-5"><div><p className="text-label text-ink-2">Campaign</p><h2 className="mt-1 text-section-title font-medium text-ink">{name}</h2><p className="mt-1 text-body text-ink-2">{subject}</p></div><div><p className="text-label text-ink-2">Delivery</p><p className="mt-1 break-all text-body text-ink">Email from {senderAddress || "unconfigured Gmail sender"}</p></div><div><p className="text-label text-ink-2">Audience</p><p className="mt-1 text-body text-ink">{selected.length} verified HR {selected.length === 1 ? "contact" : "contacts"}</p></div>{posterName && <div className="flex items-center gap-2 rounded-control bg-surface-2 px-3 py-3 text-body text-ink-2"><FileText aria-hidden="true" className="size-4" />{posterName} · attached to every email</div>}<p className="rounded-control border border-line p-3 text-label text-ink-2">Every email includes Gmail’s native unsubscribe control. Unsubscribed contacts are checked again immediately before sending.</p></div>
            <div className="rounded-card bg-surface-2 p-4">{posterPreviewUrl && <img alt="Campaign attachment preview" className="mb-4 max-h-52 w-full rounded-control object-contain" src={posterPreviewUrl} />}<p className="text-chip font-medium uppercase tracking-wide text-ink-2">Email preview</p><p className="mt-3 text-body font-medium text-ink">{subject.replace(/\{\{\s*first_name\s*\}\}/gi, "Sarah")}</p><p className="mt-3 whitespace-pre-wrap text-label leading-6 text-ink">{renderEmailLinks(body.replace(/\{\{\s*first_name\s*\}\}/gi, "Sarah"))}</p></div>
          </div>}

          {step !== "poster" && <div className="mt-6 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between"><Button disabled={saving || generating} onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)].key)} variant="secondary">Back</Button>{step === "review" ? readOnly ? <Button onClick={() => navigate("/hihunt/campaigns")} variant="secondary">Back to campaigns</Button> : <div className="flex flex-col-reverse gap-2 sm:flex-row"><Button disabled={!valid || saving} loading={saving && !confirmOpen} onClick={() => void saveDraft()} variant="secondary">Save draft</Button><Button disabled={!valid || saving} onClick={() => setConfirmOpen(true)}><Send aria-hidden="true" className="size-4" />{savedCampaign ? "Send campaign" : "Review and send"}</Button></div> : <Button disabled={loading || uploading || generating} onClick={next}>Continue<ArrowRight aria-hidden="true" className="size-4" /></Button>}</div>}
        </Card>
      </div>

      <ConfirmDialog confirmLabel={`Send ${selected.length} ${selected.length === 1 ? "email" : "emails"}`} description={`This sends the approved campaign from ${senderAddress || "the connected Gmail account"} to ${selected.length} selected ${selected.length === 1 ? "contact" : "contacts"}${posterName ? ` with ${posterName} attached` : ""}. Each recipient receives Gmail’s native unsubscribe control.`} onConfirm={() => void sendNow()} onOpenChange={setConfirmOpen} open={confirmOpen} pending={saving} title="Send this Hi-Hunt campaign now?" />
      <ConfirmDialog confirmLabel="Leave campaign" description="Your unsaved attachment, message, and audience changes will be lost." onConfirm={() => { if (blocker.state !== "blocked") return; confirmedNavigation.current = true; blocker.proceed(); }} onOpenChange={(open) => { if (open) return; if (confirmedNavigation.current) { confirmedNavigation.current = false; return; } if (blocker.state === "blocked") blocker.reset(); }} open={blocker.state === "blocked"} title="Leave this campaign?" variant="destructive" />
    </main>
  );
}

function CampaignList() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<HRCampaignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sendTarget, setSendTarget] = useState<HRCampaignRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HRCampaignRecord | null>(null);
  const [pending, setPending] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getHRCampaigns().then((result) => setCampaigns(result.data)).catch((nextError) => setError(errorMessage(nextError))).finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  const activity = useMemo(() => campaigns.map((campaign) => ({ at: campaign.sent_at || campaign.created_at, label: campaign.sent_at ? "Email sent" : "Draft created", campaign })).filter((event) => Number.isFinite(Date.parse(event.at))).sort((left, right) => Date.parse(right.at) - Date.parse(left.at)).slice(0, 6), [campaigns]);

  const sendSavedCampaign = async () => {
    if (!sendTarget || pending) return;
    setPending(true);
    try {
      const result = await sendHRCampaign(sendTarget.id);
      setCampaigns((current) => current.map((campaign) => campaign.id === result.data.id ? result.data : campaign));
      toast.success(`${result.sent} ${result.sent === 1 ? "email" : "emails"} sent.`);
      setSendTarget(null);
    } catch (nextError) {
      toast.error("Campaign could not be sent", { description: errorMessage(nextError) });
    } finally {
      setPending(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || pending) return;
    const target = deleteTarget;
    setPending(true);
    try {
      await deleteHRCampaign(target.id);
      setCampaigns((current) => current.filter((campaign) => campaign.id !== target.id));
      setDeleteTarget(null);
      toast.success(`${target.name} was deleted.`);
    } catch (nextError) {
      toast.error("Campaign could not be deleted", { description: errorMessage(nextError) });
    } finally {
      setPending(false);
    }
  };

  const duplicateCampaign = useCallback(async (campaign: HRCampaignRecord) => {
    if (duplicatingId) return;
    setDuplicatingId(campaign.id);
    try {
      const source = (await getHRCampaign(campaign.id)).data;
      const result = await createHRCampaign({
        name: duplicateCampaignName(source.name),
        subject: source.subject,
        body: source.body,
        recipientIds: source.recipient_ids,
        posterName: source.poster_name,
        posterPath: source.poster_path,
        posterMimeType: source.poster_mime_type,
      });
      setCampaigns((current) => [result.data, ...current]);
      toast.success("Campaign duplicated as an editable draft.");
      navigate(campaignEditorHref(result.data.id));
    } catch (nextError) {
      toast.error("Campaign could not be duplicated", { description: errorMessage(nextError) });
    } finally {
      setDuplicatingId(null);
    }
  }, [duplicatingId, navigate]);

  const columns = useMemo<DataTableColumn<HRCampaignRecord>[]>(() => [
    { key: "name", header: "Campaign", cell: (campaign) => <Link className="group block rounded-control outline-none focus-visible:ring-3 focus-visible:ring-ring/50" to={campaignEditorHref(campaign.id)}><p className="font-medium text-ink underline-offset-4 group-hover:underline">{campaign.name}</p><p className="mt-0.5 text-chip text-ink-2">Updated {singaporeDate(campaign.updated_at)}</p></Link>, sortValue: (campaign) => campaign.name },
    { key: "status", header: "Status", cell: (campaign) => <StatusPill label={campaign.status} status={campaignTone(campaign.status)} />, sortValue: (campaign) => campaign.status },
    { key: "audience", header: "Audience", cell: (campaign) => <span>{campaign.audience_count} verified HR {campaign.audience_count === 1 ? "contact" : "contacts"}</span>, sortValue: (campaign) => campaign.audience_count, hideOnMobile: true },
    { key: "progress", header: "Sent / total", cell: (campaign) => <div className="min-w-32"><p className="text-body tabular-nums text-ink">{campaign.sent_count} / {campaign.audience_count}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent" style={{ width: campaign.audience_count === 0 ? "0%" : `${Math.round((campaign.sent_count / campaign.audience_count) * 100)}%` }} /></div></div>, sortValue: (campaign) => campaign.sent_count },
    { key: "sender", header: "Sender", cell: (campaign) => <span className="break-all text-label text-ink-2">{campaign.sender_email}</span>, sortValue: (campaign) => campaign.sender_email, hideOnMobile: true },
    { key: "actions", header: <span className="sr-only">Actions</span>, mobileLabel: "Actions", className: "w-48 text-right", cell: (campaign) => <div className="flex justify-end gap-2">{campaign.status === "draft" ? <Button asChild size="sm" variant="ghost"><Link aria-label={`Edit ${campaign.name}`} to={campaignEditorHref(campaign.id)}><Pencil aria-hidden="true" className="size-4" />Edit</Link></Button> : <Button aria-label={`Duplicate ${campaign.name}`} disabled={duplicatingId !== null} onClick={() => void duplicateCampaign(campaign)} size="sm" variant="ghost"><Copy aria-hidden="true" className="size-4" />{duplicatingId === campaign.id ? "Duplicating…" : "Duplicate"}</Button>}{campaign.status !== "sent" && campaign.status !== "sending" && <Button onClick={() => setSendTarget(campaign)} size="sm" variant="secondary"><Send aria-hidden="true" className="size-4" />{campaign.status === "draft" ? "Send" : "Retry"}</Button>}<IconButton icon={Trash2} label={`Delete ${campaign.name}`} onClick={() => setDeleteTarget(campaign)} variant="destructive" /></div> },
  ], [duplicateCampaign, duplicatingId]);

  return <>
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7" data-slot="hihunt-campaigns"><div className="space-y-6">
      <PageHeader actions={<Button asChild><Link to="/hihunt/campaigns/new"><Plus aria-hidden="true" className="size-4" />New campaign</Link></Button>} subtitle="Prepare Gmail messages and verified HR audiences, then approve each email campaign." title="Campaigns" />
      <Card description="Hi-Hunt email campaign drafts and completed Gmail sends in Singapore time." title="Campaign activity">{loading ? <Skeleton label="Loading campaign activity" rows={2} variant="cards" /> : activity.length === 0 ? <EmptyState action={<Button asChild variant="secondary"><Link to="/hihunt/campaigns/new">Plan a campaign</Link></Button>} icon={CalendarDays} message="No Hi-Hunt email campaign activity yet." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{activity.map((event) => <Link className="flex min-h-24 items-start gap-3 rounded-card border border-line bg-surface-2 p-4 outline-none transition-colors hover:bg-surface focus-visible:ring-3 focus-visible:ring-ring/50" key={event.campaign.id} to={campaignEditorHref(event.campaign.id)}><span className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-surface"><Mail aria-hidden="true" className="size-4" /></span><span className="min-w-0"><span className="block text-chip font-medium uppercase tracking-wide text-ink-2">{event.label}</span><span className="mt-1 block truncate text-body font-medium text-ink">{event.campaign.name}</span><span className="mt-1 block text-label tabular-nums text-ink-2">{singaporeDate(event.at, true)}</span></span></Link>)}</div>}</Card>
      <Card description={`${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`} title="All campaigns">{error ? <EmptyState action={<Button onClick={load} variant="secondary"><RefreshCw aria-hidden="true" className="size-4" />Try again</Button>} icon={CircleAlert} message={error} /> : loading ? <Skeleton label="Loading Hi-Hunt campaigns" rows={6} variant="table" /> : <DataTable columns={columns} emptyState={<EmptyState action={<Button asChild><Link to="/hihunt/campaigns/new"><Plus aria-hidden="true" className="size-4" />Create campaign</Link></Button>} icon={Megaphone} message="No Hi-Hunt email campaigns yet." />} initialSort={{ key: "name", direction: "ascending" }} onRowClick={(campaign) => navigate(campaignEditorHref(campaign.id))} rowKey={(campaign) => campaign.id} rows={campaigns} />}</Card>
    </div></main>
    <ConfirmDialog confirmLabel={sendTarget?.status === "draft" ? "Send campaign" : "Retry unsent emails"} description={sendTarget ? `Send ${sendTarget.name} from ${sendTarget.sender_email} to its ${sendTarget.audience_count - sendTarget.sent_count} remaining recipients${sendTarget.poster_name ? ` with ${sendTarget.poster_name} attached` : ""}?` : undefined} onConfirm={() => void sendSavedCampaign()} onOpenChange={(open) => { if (!open && !pending) setSendTarget(null); }} open={sendTarget !== null} pending={pending} title="Send this Hi-Hunt campaign?" />
    <ConfirmDialog confirmLabel="Delete campaign" description={deleteTarget ? `This permanently deletes “${deleteTarget.name}” and its saved HR recipient records. It does not affect WhatsApp campaigns or conversations.` : undefined} onConfirm={() => void confirmDelete()} onOpenChange={(open) => { if (!open && !pending) setDeleteTarget(null); }} open={deleteTarget !== null} pending={pending} title="Delete this campaign?" variant="destructive" />
  </>;
}

export default function CampaignsPage() {
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  return location.pathname.endsWith("/new") || id ? <CampaignWizard /> : <CampaignList />;
}

export { getPosterFromClipboard };
