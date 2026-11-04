import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleAlert, FileImage, FileText, Sparkles, Upload } from "lucide-react";
import { Link, useBlocker, useNavigate, type BlockerFunction } from "react-router";
import {
  analyzePoster,
  createCampaign,
  getEmailSenderStatus,
  getAudienceCount,
  getPosterUploadTicket,
  getSummary,
  queueCampaign,
  updateCampaign,
  uploadPosterFile,
  type CampaignAudience,
  type CampaignDelivery,
  type CampaignRecord,
  type EmailSenderStatus,
  type WorkspaceSummary,
} from "../../lib/api";
import {
  ACCEPTED_POSTER_TYPES,
  DAILY_SEND_CAP,
  campaignDeliveryForPosterEvent,
  cloneAudience,
  defaultCampaignDelivery,
  dripDays,
  emptyAudience,
  formatCampaignMessage,
  generateDraft,
  hasAudienceRules,
  inferTopic,
  titleFromFile,
  validatePosterFile,
  type CampaignDraft,
} from "../../lib/campaign";
import { Button, Card, ConfirmDialog, PageHeader, toast } from "../components/system";
import { AudiencePanel } from "./AudiencePanel";
import CampaignEditorFields from "./CampaignEditorFields";
import {
  createWizardSnapshot,
  isWizardDirty,
  shouldConfirmPosterReplacement,
} from "./campaign-wizard-model";

import CampaignDeliveryFields from "./CampaignDeliveryFields";
import { loadReengageSettings } from "./settings-model";

type Step = "upload" | "message" | "audience" | "delivery" | "review";
const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Poster" },
  { key: "delivery", label: "Delivery" },
  { key: "message", label: "Message" },
  { key: "audience", label: "Audience" },
  { key: "review", label: "Review" },
];
const INITIAL_DRAFT: CampaignDraft = { title: "", subject: "", message: "" };

function getPosterFromClipboard(clipboardData: DataTransfer | null) {
  if (!clipboardData) return null;
  const pastedFile = Array.from(clipboardData.files).find((file) => ACCEPTED_POSTER_TYPES.includes(file.type));
  if (pastedFile) return pastedFile;
  const pastedItem = Array.from(clipboardData.items).find((item) => item.kind === "file" && ACCEPTED_POSTER_TYPES.includes(item.type));
  return pastedItem?.getAsFile() ?? null;
}

function CampaignWizardPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewObjectUrl = useRef<string | null>(null);
  const posterRequest = useRef(0);
  const allowNavigation = useRef(false);
  const confirmedNavigation = useRef(false);
  const [preferredSenderEmail] = useState(() => loadReengageSettings().senderEmail);
  const initialDelivery = useRef<CampaignDelivery>({ ...defaultCampaignDelivery(), senderEmail: preferredSenderEmail || null }).current;
  const initializedBaseline = useRef(createWizardSnapshot(null, INITIAL_DRAFT, { ...emptyAudience(), delivery: initialDelivery }));
  const posterContentBaseline = useRef(initializedBaseline.current);
  const [step, setStep] = useState<Step>("upload");
  const [draft, setDraft] = useState<CampaignDraft>({ ...INITIAL_DRAFT });
  const [audience, setAudience] = useState<CampaignAudience>(emptyAudience());
  const [delivery, setDelivery] = useState<CampaignDelivery>({ ...initialDelivery, reminderDates: [...initialDelivery.reminderDates] });
  const [emailSender, setEmailSender] = useState<EmailSenderStatus | null>(null);
  const [loadingSender, setLoadingSender] = useState(true);
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [posterName, setPosterName] = useState<string | null>(null);
  const [posterPath, setPosterPath] = useState<string | null>(null);
  const [posterMimeType, setPosterMimeType] = useState<string | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [aiNote, setAiNote] = useState<{ tone: "ai" | "warning"; text: string } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Step, string>>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceCountError, setAudienceCountError] = useState("");
  const [countingAudience, setCountingAudience] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPoster, setPendingPoster] = useState<File | null>(null);
  const [createdCampaign, setCreatedCampaign] = useState<CampaignRecord | null>(null);
  const [done, setDone] = useState<{ campaign: CampaignRecord; queued: number } | null>(null);

  const stepIndex = STEPS.findIndex((item) => item.key === step);
  const currentSnapshot = createWizardSnapshot(posterName, draft, { ...audience, delivery });
  const dirty = isWizardDirty(initializedBaseline.current, currentSnapshot);
  const shouldBlockNavigation = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => {
    const currentUrl = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`;
    const nextUrl = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;
    return !allowNavigation.current && dirty && !done && currentUrl !== nextUrl;
  }, [dirty, done]);
  const blocker = useBlocker(shouldBlockNavigation);

  useEffect(() => { getSummary().then(setSummary).catch(() => undefined); }, []);
  useEffect(() => {
    let active = true;
    getEmailSenderStatus(preferredSenderEmail).then((status) => { if (active) setEmailSender(status); }).catch(() => { if (active) setEmailSender(null); }).finally(() => { if (active) setLoadingSender(false); });
    return () => { active = false; };
  }, [preferredSenderEmail]);
  useEffect(() => () => {
    posterRequest.current += 1;
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
  }, []);
  useEffect(() => {
    if (!dirty || done) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, done]);
  useEffect(() => {
    if (!hasAudienceRules(audience)) {
      setAudienceCount(audience.includedLeadIds?.length ?? 0);
      setAudienceCountError("");
      setCountingAudience(false);
      return;
    }
    let active = true;
    setAudienceCount(null);
    setAudienceCountError("");
    setCountingAudience(true);
    const timer = window.setTimeout(() => {
      getAudienceCount(audience)
        .then((result) => {
          if (!active) return;
          if (!Number.isInteger(result.count) || result.count < 0) throw new Error("The audience service returned an invalid count.");
          setAudienceCount(result.count);
        })
        .catch((error) => {
          if (!active) return;
          setAudienceCount(null);
          setAudienceCountError(error instanceof Error ? error.message : "The audience count could not be checked.");
        })
        .finally(() => { if (active) setCountingAudience(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [audience]);

  const setStepError = (target: Step, message: string) => setErrors((current) => ({ ...current, [target]: message }));
  const clearStepError = (target: Step) => setErrors((current) => ({ ...current, [target]: undefined }));

  const setLocalPreview = useCallback((file: File) => {
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
    previewObjectUrl.current = URL.createObjectURL(file);
    setPosterPreviewUrl(previewObjectUrl.current);
  }, []);

  const processFile = useCallback(async (file: File) => {
    const problem = validatePosterFile(file);
    if (problem) { setStepError("upload", problem); return; }
    const request = ++posterRequest.current;
    clearStepError("upload");
    setAnalyzing(true);
    setUploadProgress(0);
    try {
      const ticket = await getPosterUploadTicket(file);
      if (request !== posterRequest.current) return;
      await uploadPosterFile(file, ticket, (progress) => {
        if (request === posterRequest.current) setUploadProgress(progress);
      });
      if (request !== posterRequest.current) return;
      let nextDraft: CampaignDraft;
      let nextAudience: CampaignAudience;
      let nextDelivery = delivery;
      let nextAiNote: { tone: "ai" | "warning"; text: string };
      try {
        const result = await analyzePoster({ posterName: file.name, posterPath: ticket.path, posterMimeType: file.type });
        if (request !== posterRequest.current) return;
        nextDraft = { title: result.draft.title, subject: result.draft.subject, message: formatCampaignMessage(result.draft.message) };
        nextAudience = cloneAudience(result.audience);
        nextDelivery = campaignDeliveryForPosterEvent(delivery, result.eventStartsAt);
        nextAiNote = result.warning
          ? { tone: "warning", text: result.warning }
          : result.eventStartsAt && Date.parse(result.eventStartsAt) <= Date.now()
            ? { tone: "warning", text: `The poster event was read as ${new Date(result.eventStartsAt).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}, which has already passed. Update it before scheduling this campaign.` }
            : { tone: "ai", text: result.rationale || "The poster was read and a message, event time, and audience were prepared." };
      } catch {
        if (request !== posterRequest.current) return;
        const title = titleFromFile(file.name);
        const topic = inferTopic(title, summary?.topics ?? []);
        nextDraft = generateDraft(title, topic);
        nextAudience = { ...emptyAudience(), topics: summary?.topics.some((item) => item.name === topic) ? [topic] : [] };
        nextAiNote = { tone: "warning", text: "The AI reader was unavailable, so a starter message was prepared from the file name. Review every field before continuing." };
      }
      if (request !== posterRequest.current) return;
      setPosterName(file.name);
      setPosterMimeType(file.type);
      setPosterPath(ticket.path);
      setLocalPreview(file);
      setDraft(nextDraft);
      setAudience(nextAudience);
      setDelivery(nextDelivery);
      setAiNote(nextAiNote);
      posterContentBaseline.current = createWizardSnapshot(file.name, nextDraft, { ...nextAudience, delivery: nextDelivery });
      setStep("delivery");
    } catch (error) {
      if (request !== posterRequest.current) return;
      setStepError("upload", error instanceof Error ? error.message : "The poster could not be uploaded.");
    } finally {
      if (request === posterRequest.current) setAnalyzing(false);
    }
  }, [delivery, setLocalPreview, summary]);

  const requestFileProcessing = useCallback((file: File) => {
    if (analyzing) return;
    const problem = validatePosterFile(file);
    if (problem) {
      setStepError("upload", problem);
      return;
    }
    if (shouldConfirmPosterReplacement(
      posterContentBaseline.current,
      createWizardSnapshot(posterName, draft, { ...audience, delivery }),
    )) {
      setPendingPoster(file);
      return;
    }
    void processFile(file);
  }, [analyzing, audience, delivery, draft, posterName, processFile]);

  useEffect(() => {
    if (step !== "upload" || analyzing) return;
    const handlePaste = (event: ClipboardEvent) => {
      const file = getPosterFromClipboard(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      requestFileProcessing(file);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [analyzing, requestFileProcessing, step]);

  const startBlank = () => {
    posterRequest.current += 1;
    setAnalyzing(false);
    setUploadProgress(0);
    const title = "New campaign";
    const topic = inferTopic(title, summary?.topics ?? []);
    const nextDraft = generateDraft(title, topic);
    const nextAudience = emptyAudience();
    setDraft(nextDraft);
    setAudience(nextAudience);
    posterContentBaseline.current = createWizardSnapshot(null, nextDraft, { ...nextAudience, delivery });
    setAiNote(null);
    clearStepError("upload");
    setStep("delivery");
  };

  const next = () => {
    if (step === "message" && (!draft.title.trim() || !draft.message.trim())) {
      setStepError("message", "Add a campaign name and WhatsApp message before continuing.");
      return;
    }
    if (step === "audience") {
      if (countingAudience || audienceCount === null) {
        setStepError("audience", audienceCountError || "Wait for the live audience count before continuing.");
        return;
      }
      if (audienceCount === 0) {
        setStepError("audience", "Choose rules or include at least one lead before continuing.");
        return;
      }
    }
    if (step === "delivery") {
      const scheduledTime = Date.parse(delivery.scheduledAt ?? "");
      if (!Number.isFinite(scheduledTime) || scheduledTime <= Date.now()) {
        setStepError("delivery", "Choose a campaign date and time in the future.");
        return;
      }
      if (delivery.channel === "whatsapp") {
        const reminderTimes = delivery.reminderDates.map((value) => Date.parse(value));
        if (reminderTimes.some((value) => !Number.isFinite(value))) {
          setStepError("delivery", "Choose valid reminder dates and times.");
          return;
        }
        if (new Set(delivery.reminderDates.map((value) => new Date(value).toISOString())).size !== delivery.reminderDates.length) {
          setStepError("delivery", "Choose a different time for each reminder.");
          return;
        }
        if (reminderTimes.some((value) => value <= Date.now() || value >= scheduledTime)) {
          setStepError("delivery", "Every reminder must be in the future and before the campaign starts.");
          return;
        }
      }
      if (delivery.ctaUrl) {
        try {
          const url = new URL(delivery.ctaUrl);
          if (url.protocol !== "https:") throw new Error();
        } catch {
          setStepError("delivery", "Enter a valid HTTPS Zoom or CTA link.");
          return;
        }
      }
    }
    clearStepError(step);
    setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].key);
  };

  const leaveWizard = () => {
    navigate("/reengage/campaigns");
  };

  const save = async (queue: boolean) => {
    if (queue && (audienceCount === null || audienceCount <= 0 || countingAudience)) {
      setStepError("review", audienceCountError || "The live audience count must be available before queueing.");
      return;
    }
    if (queue && delivery.channel === "email" && (!emailSender?.configured || !emailSender.address)) {
      setStepError("review", emailSender?.requirement || "Configure a verified client-facing email sender before queueing.");
      return;
    }
    let campaignSaved = createdCampaign !== null;
    setSaving(true);
    clearStepError("review");
    try {
      const campaignInput = { ...draft, audience: { ...audience, delivery: { ...delivery, senderEmail: delivery.channel === "email" ? emailSender?.address ?? delivery.senderEmail ?? null : null } }, ...(posterName && posterPath ? { posterName, posterPath } : {}) };
      const saved = createdCampaign
        ? await updateCampaign(createdCampaign.id, campaignInput)
        : await createCampaign(campaignInput);
      const campaign = saved.data;
      setCreatedCampaign(campaign);
      campaignSaved = true;
      if (!queue) {
        toast.success("Campaign saved as a draft.");
        allowNavigation.current = true;
        navigate(`/reengage/campaigns/${encodeURIComponent(campaign.id)}`);
        return;
      }
      const queued = await queueCampaign(campaign.id);
      setDone({ campaign: queued.data, queued: queued.queued });
      toast.success(`${queued.queued} recipient${queued.queued === 1 ? "" : "s"} queued for approval.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The campaign could not be saved.";
      setStepError("review", campaignSaved
        ? `The campaign draft is saved, but queueing did not finish: ${message}`
        : message);
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  const headerActions = <Button onClick={leaveWizard} variant="secondary"><ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />Back to campaigns</Button>;

  if (done) {
    return (
      <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7">
        <div className="mx-auto max-w-2xl"><Card className="text-center"><span className="mx-auto inline-flex size-12 items-center justify-center rounded-full bg-accent text-ink"><Check aria-hidden="true" className="size-5" strokeWidth={1.75} /></span><h1 className="mt-4 text-page-title font-medium text-ink">Campaign ready for approval</h1><p className="mt-2 text-body text-ink-2">{done.queued} recipient{done.queued === 1 ? "" : "s"} are queued. {delivery.channel === "email" ? "Open the campaign for the final sender check and email blast approval." : "Approve the next daily batch from Home."}</p><div className="mt-6 flex flex-wrap justify-center gap-2">{delivery.channel === "whatsapp" && <Button asChild><Link to="/reengage">Open today's batch</Link></Button>}<Button asChild variant="secondary"><Link to={`/reengage/campaigns/${encodeURIComponent(done.campaign.id)}`}>View campaign</Link></Button></div></Card></div>
      </main>
    );
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7" data-slot="campaign-wizard">
      <div className="space-y-6">
        <PageHeader actions={headerActions} subtitle="Prepare the poster, message, and audience before approval." title="New campaign" />
        <ol aria-label="Campaign steps" className="grid grid-cols-5 gap-2">
          {STEPS.map((item, index) => <li className="min-w-0" key={item.key}><button aria-current={step === item.key ? "step" : undefined} className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-2 text-chip font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${step === item.key ? "bg-ink text-surface" : index < stepIndex ? "bg-mint text-ink" : "bg-surface-2 text-ink-2"}`} disabled={index > stepIndex} onClick={() => index <= stepIndex && setStep(item.key)} type="button"><span className="tabular-nums">{index + 1}</span><span className="hidden sm:inline">{item.label}</span></button></li>)}
        </ol>

        <Card>
          {errors[step] && <div className="mb-5 flex items-start gap-2 rounded-control bg-danger/10 px-4 py-3 text-body text-danger" role="alert"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{errors[step]}</div>}

          {step === "upload" && (
            <div className="space-y-4">
              <div className="flex min-h-72 flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface-2 p-6 text-center" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) requestFileProcessing(file); }}>
                <span className="inline-flex size-12 items-center justify-center rounded-full bg-surface text-ink-2"><FileImage aria-hidden="true" className="size-5" strokeWidth={1.75} /></span>
                <h2 className="mt-4 text-section-title font-medium text-ink">Drop or paste the campaign poster</h2>
                <p className="mt-2 max-w-md text-body text-ink-2">PNG, JPEG, WebP, GIF, or PDF up to 50 MB. Paste directly from your clipboard, or browse for a file.</p>
                <Button className="mt-5" loading={analyzing} onClick={() => fileInputRef.current?.click()}><Upload aria-hidden="true" className="size-4" strokeWidth={1.75} />Browse poster</Button>
                <input ref={fileInputRef} accept={ACCEPTED_POSTER_TYPES.join(",")} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) requestFileProcessing(file); event.currentTarget.value = ""; }} type="file" />
                {analyzing && <div className="mt-5 w-full max-w-md"><div className="h-2 overflow-hidden rounded-full bg-surface"><span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${uploadProgress}%` }} /></div><p className="mt-2 text-label text-ink-2">{uploadProgress < 100 ? `Uploading ${uploadProgress}%` : "Reading poster and preparing a draft…"}</p></div>}
              </div>
              <div className="flex items-center gap-3"><span className="h-px flex-1 bg-line" /><span className="text-chip text-ink-2">or</span><span className="h-px flex-1 bg-line" /></div>
              <Button className="w-full" onClick={startBlank} variant="secondary">Start without a poster</Button>
            </div>
          )}

          {step === "message" && (
            <div>
              {aiNote && <div className={`mb-5 flex items-start gap-3 rounded-control p-4 ${aiNote.tone === "ai" ? "bg-accent/30 text-ink" : "bg-warn/10 text-ink"}`}><Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} /><div><p className="text-body font-medium">{aiNote.tone === "ai" ? "AI draft prepared" : "Starter draft prepared"}</p><p className="mt-1 text-label text-ink-2">{aiNote.text}</p></div></div>}
              <CampaignEditorFields channel={delivery.channel} draft={draft} onChange={(partial) => { clearStepError("message"); setDraft((current) => ({ ...current, ...partial })); }} posterMimeType={posterMimeType} posterName={posterName} posterPreviewUrl={posterPreviewUrl} />
            </div>
          )}

          {step === "audience" && <><AudiencePanel audience={audience} onChange={(value) => { clearStepError("audience"); setAudience(value); }} summary={summary} /><p className={`mt-4 text-label ${audienceCountError ? "text-danger" : "text-ink-2"}`} role={audienceCountError ? "alert" : "status"}>{countingAudience ? "Checking the live audience count…" : audienceCountError || `${audienceCount ?? 0} recipients match this audience.`}</p></>}

          {step === "delivery" && <CampaignDeliveryFields delivery={delivery} emailSender={emailSender} loadingSender={loadingSender} onChange={(value) => { clearStepError("delivery"); setDelivery(value); }} posterName={posterName} />}

          {step === "review" && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="space-y-5"><div><p className="text-label text-ink-2">Campaign</p><h2 className="mt-1 text-section-title font-medium text-ink">{draft.title}</h2><p className="mt-1 text-body text-ink-2">{draft.subject}</p></div><div><p className="text-label text-ink-2">Audience</p><p className="mt-1 text-body text-ink">{audienceCount ?? "—"} recipients{delivery.channel === "whatsapp" && audienceCount !== null ? ` · about ${dripDays(audienceCount)} sending day${dripDays(audienceCount) === 1 ? "" : "s"} at ${DAILY_SEND_CAP}/day` : ""}</p></div><div><p className="text-label text-ink-2">Delivery</p><p className="mt-1 text-body text-ink">{delivery.channel === "email" ? `Email from ${emailSender?.address ?? "unconfigured sender"}` : "WhatsApp through Hermes"}</p>{delivery.scheduledAt && <p className="mt-1 text-label text-ink-2">Planned {new Date(delivery.scheduledAt).toLocaleString("en-SG")}</p>}{delivery.ctaUrl && <p className="mt-1 break-all text-label text-ink-2">CTA: {delivery.ctaUrl}</p>}{delivery.channel === "whatsapp" && delivery.reminderDates.length > 0 && <p className="mt-1 text-label text-ink-2">{delivery.reminderDates.length} automatic participant WhatsApp reminders</p>}</div>{posterName && <div className="flex items-center gap-2 rounded-control bg-surface-2 px-3 py-3 text-body text-ink-2"><FileText aria-hidden="true" className="size-4" strokeWidth={1.75} />{posterName}{delivery.channel === "email" && posterName.toLowerCase().endsWith(".pdf") ? " · attached to email" : delivery.channel === "whatsapp" ? " · attached to campaign and reminders" : ""}</div>}</div>
              <div className="rounded-card bg-surface-2 p-4"><div className="ml-auto rounded-control bg-mint p-3 text-body leading-6 text-ink"><p className="whitespace-pre-wrap">{draft.message.replace(/\{\{\s*first_name\s*\}\}/gi, "Sarah")}</p>{delivery.channel === "whatsapp" && <p className="mt-3 text-chip italic text-ink-3">Reply &apos;Unsubscribe&apos; to stop receiving updates</p>}</div></div>
            </div>
          )}

          {step !== "upload" && <div className="mt-6 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between"><Button onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)].key)} variant="secondary">Back</Button>{step === "review" ? <div className="flex flex-col-reverse gap-2 sm:flex-row"><Button loading={saving} onClick={() => void save(false)} variant="secondary">Save draft</Button><Button disabled={countingAudience || audienceCount === null || audienceCount <= 0 || (delivery.channel === "email" && !emailSender?.configured)} onClick={() => setConfirmOpen(true)}>Create & queue</Button></div> : <Button onClick={next}>Continue<ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.75} /></Button>}</div>}
        </Card>
      </div>

      <ConfirmDialog
        confirmLabel={`Queue ${audienceCount ?? 0}`}
        description={delivery.channel === "email" ? `${audienceCount ?? 0} recipients will enter this email campaign queue. Open the campaign to review the sender and give final consent before the blast sends.` : `${audienceCount ?? 0} recipients will enter the preparation queue in daily groups of up to ${DAILY_SEND_CAP}. Review the actual messages and confirm consent once from Home before anything sends.`}
        onConfirm={() => void save(true)}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        pending={saving}
        title="Create and queue this campaign?"
      />
      <ConfirmDialog
        confirmLabel="Replace poster"
        description="The new poster will replace the message and audience prepared from the current poster, including manual lead picks."
        onConfirm={() => {
          const file = pendingPoster;
          setPendingPoster(null);
          if (file) void processFile(file);
        }}
        onOpenChange={(open) => { if (!open) setPendingPoster(null); }}
        open={pendingPoster !== null}
        pending={analyzing}
        title="Discard edits and replace poster?"
        variant="destructive"
      />
      <ConfirmDialog
        confirmLabel="Leave campaign"
        description="Your unsaved poster, message, and audience changes will be lost."
        onConfirm={() => {
          if (blocker.state !== "blocked") return;
          confirmedNavigation.current = true;
          blocker.proceed();
        }}
        onOpenChange={(open) => {
          if (open) return;
          if (confirmedNavigation.current) {
            confirmedNavigation.current = false;
            return;
          }
          if (blocker.state === "blocked") blocker.reset();
        }}
        open={blocker.state === "blocked"}
        title="Leave this campaign?"
        variant="destructive"
      />
    </main>
  );
}

export default CampaignWizardPage;
export { getPosterFromClipboard };
