import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CircleAlert, FileText, Inbox, Mail, MessageCircle, Pause, Pencil, Play, Upload, Users } from "lucide-react";
import { Link, useParams } from "react-router";
import {
  getAudiencePreview,
  getEmailSenderStatus,
  getPosterUploadTicket,
  getSummary,
  queueCampaign,
  sendCampaignEmail,
  setCampaignStatus,
  uploadPosterFile,
  updateCampaign,
  type AssistantLeadPreview,
  type CampaignRecord,
  type EmailSenderStatus,
  type ReplyConversationRecord,
  type WorkspaceSummary,
} from "../../lib/api";
import { getCampaignDetail, getThreads } from "../../lib/stubs";
import type { CampaignDraft } from "../../lib/campaign";
import { ACCEPTED_POSTER_TYPES, DAILY_SEND_CAP, campaignDelivery, validatePosterFile } from "../../lib/campaign";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  SampleDataPill,
  Skeleton,
  StatusPill,
  toast,
} from "../components/system";
import { AudiencePanel } from "./AudiencePanel";
import CampaignEditorFields from "./CampaignEditorFields";
import CampaignDeliveryFields from "./CampaignDeliveryFields";
import { loadReengageSettings } from "./settings-model";
import {
  audienceSummary,
  buildCampaignSectionUpdate,
  campaignAttendanceCount,
  campaignAttendanceTotal,
  campaignProgress,
  campaignStatus,
  getCampaignStatusAction,
  type CampaignUpdateSection,
} from "./campaign-view";
import TemplateCampaignPage from "./TemplateCampaignPage";

type DetailTab = "message" | "audience" | "delivery" | "recipients" | "replies";

const TABS: { id: DetailTab; label: string }[] = [
  { id: "message", label: "Message" },
  { id: "audience", label: "Audience" },
  { id: "delivery", label: "Delivery" },
  { id: "recipients", label: "Recipients" },
  { id: "replies", label: "Replies" },
];

function recipientStatus(campaign: CampaignRecord, index: number) {
  if (campaign.status === "sent") return { label: "Sent", status: "done" as const };
  if (campaign.status === "draft") return { label: "Draft", status: "draft" as const };
  if (campaign.status === "paused") return { label: "Paused", status: "paused" as const };
  const progress = campaignProgress(campaign);
  return index < progress.sent
    ? { label: "Sent", status: "done" as const }
    : { label: campaign.status === "sending" ? "Queued" : "Queued", status: "queued" as const };
}

function CampaignDetailPage() {
  if (import.meta.env.VITE_DEMO_MODE === "true") return <TemplateCampaignPage />;
  return <FullCampaignDetailPage />;
}

function FullCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [sample, setSample] = useState(false);
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [threads, setThreads] = useState<ReplyConversationRecord[]>([]);
  const [sampleReplies, setSampleReplies] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [replyError, setReplyError] = useState("");
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [recipients, setRecipients] = useState<AssistantLeadPreview[]>([]);
  const [recipientError, setRecipientError] = useState("");
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<DetailTab>("message");
  const [editingMessage, setEditingMessage] = useState(false);
  const [draft, setDraft] = useState<CampaignDraft>({ title: "", subject: "", message: "" });
  const [audience, setAudience] = useState<CampaignRecord["audience"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [audienceConfirmOpen, setAudienceConfirmOpen] = useState(false);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [emailConfirmOpen, setEmailConfirmOpen] = useState(false);
  const [emailSender, setEmailSender] = useState<EmailSenderStatus | null>(null);
  const [loadingSender, setLoadingSender] = useState(true);
  const [posterName, setPosterName] = useState<string | null>(null);
  const [posterPath, setPosterPath] = useState<string | null>(null);
  const [posterProgress, setPosterProgress] = useState(0);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);
  const posterObjectUrl = useRef<string | null>(null);
  const replyRequest = useRef(0);
  const [preferredSenderEmail] = useState(() => loadReengageSettings().senderEmail);
  const selectedSenderEmail = useMemo(
    () => campaignDelivery(audience).senderEmail ?? preferredSenderEmail,
    [audience, preferredSenderEmail],
  );

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setError("");
    setCampaign(null);
    setEditingMessage(false);
    setAudienceConfirmOpen(false);
    setStatusConfirmOpen(false);
    getCampaignDetail(id)
      .then((result) => {
        if (!active || !result.data) return;
        const value = result.data;
        setCampaign(value);
        setSample(result.sample);
        setDraft({ title: value.title, subject: value.subject, message: value.message });
        setAudience(value.audience);
        setPosterName(value.poster_name);
        setPosterPath(value.poster_path);
      })
      .catch((nextError) => {
        if (active) setError(nextError instanceof Error ? nextError.message : "The campaign could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  const loadSummary = useCallback(async () => {
    setSummary(null);
    setSummaryError("");
    try {
      setSummary(await getSummary());
    } catch (nextError) {
      setSummaryError(nextError instanceof Error ? nextError.message : "Audience options could not be loaded.");
    }
  }, []);

  const loadReplies = useCallback(async () => {
    const request = ++replyRequest.current;
    if (!id || !campaign || campaign.id !== id) {
      setThreads([]);
      setSampleReplies(false);
      setReplyError("");
      setLoadingReplies(false);
      return;
    }
    setLoadingReplies(true);
    setReplyError("");
    setThreads([]);
    setSampleReplies(false);
    try {
      const result = await getThreads(id, campaign.title);
      if (request !== replyRequest.current) return;
      setThreads(result.data);
      setSampleReplies(result.sample);
    } catch (nextError) {
      if (request !== replyRequest.current) return;
      setReplyError(nextError instanceof Error ? nextError.message : "Campaign replies could not be loaded.");
    } finally {
      if (request === replyRequest.current) setLoadingReplies(false);
    }
  }, [campaign?.id, campaign?.title, id]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useEffect(() => { void loadReplies(); }, [loadReplies]);
  useEffect(() => {
    let active = true;
    setLoadingSender(true);
    getEmailSenderStatus(selectedSenderEmail).then((status) => { if (active) setEmailSender(status); }).catch(() => { if (active) setEmailSender(null); }).finally(() => { if (active) setLoadingSender(false); });
    return () => { active = false; };
  }, [selectedSenderEmail]);

  const loadRecipients = useCallback(async () => {
    if (!campaign || !audience) return;
    setLoadingRecipients(true);
    setRecipientError("");
    setRecipients([]);
    try {
      const result = await getAudiencePreview(audience, 100, 0, {}, true);
      setRecipients(result.data);
    } catch (nextError) {
      setRecipientError(nextError instanceof Error ? nextError.message : "Recipients could not be loaded.");
    } finally {
      setLoadingRecipients(false);
    }
  }, [audience, campaign]);

  useEffect(() => { void loadRecipients(); }, [loadRecipients]);
  useEffect(() => () => {
    replyRequest.current += 1;
    if (posterObjectUrl.current) URL.revokeObjectURL(posterObjectUrl.current);
  }, []);

  const filteredReplies = useMemo(
    () => threads.filter((thread) => thread.campaignId === campaign?.id || thread.campaign === campaign?.title),
    [campaign, threads],
  );

  const persist = async (section: CampaignUpdateSection) => {
    if (!campaign || !audience) return;
    if (sample) {
      toast.error("Sample campaigns are read-only. No changes were saved.");
      return;
    }
    setSaving(true);
    try {
      const result = await updateCampaign(
        campaign.id,
        buildCampaignSectionUpdate(section, campaign, draft, audience, { posterName, posterPath }),
      );
      setCampaign(result.data);
      if (section === "message") {
        setDraft({ title: result.data.title, subject: result.data.subject, message: result.data.message });
        setPosterName(result.data.poster_name);
        setPosterPath(result.data.poster_path);
        setEditingMessage(false);
        toast.success("Campaign message saved.");
      } else {
        setAudience(result.data.audience);
        toast.success("Campaign audience saved.");
        if (result.audienceReset) toast.warning("The queued recipient list was rebuilt for the changed audience.");
      }
    } catch (nextError) {
      toast.error(section === "message" ? "Campaign message could not be saved" : "Campaign audience could not be saved", {
        description: nextError instanceof Error ? nextError.message : "Please try again.",
      });
    } finally {
      setSaving(false);
      if (section === "audience") setAudienceConfirmOpen(false);
    }
  };

  const toggleStatus = async () => {
    if (!campaign) return;
    if (sample) {
      toast.error("Sample campaigns are read-only. No status was changed.");
      return;
    }
    const action = getCampaignStatusAction(campaign.status);
    setSaving(true);
    try {
      const result = action.operation === "resume"
        ? await setCampaignStatus(campaign.id, "queued")
        : action.operation === "queue"
          ? await queueCampaign(campaign.id)
          : await setCampaignStatus(campaign.id, "paused");
      setCampaign(result.data);
      toast.success(`${campaign.title} ${action.successText}`);
    } catch (nextError) {
      toast.error(action.failureTitle, {
        description: nextError instanceof Error ? nextError.message : "Please try again.",
      });
    } finally {
      setSaving(false);
      setStatusConfirmOpen(false);
    }
  };

  const sendEmail = async () => {
    if (!campaign) return;
    setSaving(true);
    try {
      const result = await sendCampaignEmail(campaign.id, true);
      setCampaign(result.data);
      toast.success(`${result.sent} email${result.sent === 1 ? "" : "s"} sent from ${result.senderEmail}.`);
      if (result.failed > 0) toast.warning(`${result.failed} recipient${result.failed === 1 ? "" : "s"} remained unsent.`);
    } catch (nextError) {
      toast.error("Email campaign could not be sent", { description: nextError instanceof Error ? nextError.message : "Please try again." });
    } finally {
      setSaving(false);
      setEmailConfirmOpen(false);
    }
  };

  const replacePoster = async (file: File) => {
    if (sample) return;
    const problem = validatePosterFile(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    setPosterProgress(0);
    try {
      const ticket = await getPosterUploadTicket(file);
      await uploadPosterFile(file, ticket, setPosterProgress);
      if (posterObjectUrl.current) URL.revokeObjectURL(posterObjectUrl.current);
      posterObjectUrl.current = URL.createObjectURL(file);
      setPosterPreviewUrl(posterObjectUrl.current);
      setPosterName(file.name);
      setPosterPath(ticket.path);
      toast.success("Poster uploaded. Save the message to apply it.");
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : "The poster could not be uploaded.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7"><Skeleton rows={5} variant="cards" label="Loading campaign detail" /></main>;

  if (error || !campaign || !audience) {
    return <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7"><EmptyState icon={CircleAlert} message={error || "This campaign was not found."} action={<Button asChild variant="secondary"><Link to="/reengage/campaigns"><ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />Back to campaigns</Link></Button>} /></main>;
  }

  const statusAction = getCampaignStatusAction(campaign.status);
  const StatusActionIcon = statusAction.operation === "queue" || statusAction.operation === "resume" ? Play : Pause;
  const delivery = campaignDelivery(audience);
  const attendanceCount = campaignAttendanceCount(campaign, threads);
  const attendanceTotal = campaignAttendanceTotal(campaign);
  const attendanceProgress = attendanceTotal === 0 ? 0 : Math.min(100, Math.round((attendanceCount / attendanceTotal) * 100));

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7" data-slot="campaign-detail">
      <div className="space-y-6">
        <Button asChild size="sm" variant="ghost"><Link to="/reengage/campaigns"><ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />Campaigns</Link></Button>
        <PageHeader
          actions={<>{delivery.channel === "email" && campaign.status === "queued" && <Button disabled={sample || saving || !emailSender?.configured} onClick={() => setEmailConfirmOpen(true)}><Mail aria-hidden="true" className="size-4" strokeWidth={1.75} />Send email blast</Button>}<Button disabled={sample || campaign.status === "sent" || saving} onClick={() => { if (statusAction.operation === "queue") setStatusConfirmOpen(true); else void toggleStatus(); }} variant="secondary"><StatusActionIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />{statusAction.label}</Button><Button disabled={sample} onClick={() => { setTab("message"); setEditingMessage(true); }}><Pencil aria-hidden="true" className="size-4" strokeWidth={1.75} />Edit</Button></>}
          meta={<span className="inline-flex items-center gap-2"><StatusPill status={campaignStatus(campaign.status)} />{sample && <SampleDataPill />}</span>}
          subtitle={audienceSummary(campaign.audience)}
          title={campaign.title}
        />

        {sample && (
          <div className="flex items-start gap-3 rounded-control border border-line bg-surface-2 p-4 text-body text-ink-2" role="status">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            This labelled sample is read-only. Connect the campaign service to edit, pause, resume, or queue it.
          </div>
        )}

        {summaryError && (
          <div className="flex flex-col gap-3 rounded-control border border-danger/20 bg-danger/10 p-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <div><p className="text-body font-medium text-danger">Audience options are unavailable</p><p className="mt-1 text-label text-ink-2">{summaryError}</p></div>
            <Button onClick={() => void loadSummary()} size="sm" variant="secondary">Try again</Button>
          </div>
        )}

        <nav aria-label="Campaign detail" className="flex gap-1 overflow-x-auto rounded-full bg-surface-2 p-1 [scrollbar-width:none]">
          {TABS.map((item) => <button aria-current={tab === item.id ? "page" : undefined} className={`min-h-11 shrink-0 rounded-full px-4 text-body font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9 ${tab === item.id ? "bg-ink text-surface" : "text-ink-2 hover:text-ink"}`} key={item.id} onClick={() => setTab(item.id)} type="button">{item.label}</button>)}
        </nav>

        {tab === "message" && (
          <Card title="Campaign message" description={delivery.channel === "email" ? "The email copy and PDF attachment recipients receive." : "The WhatsApp copy and attached poster recipients receive."} action={!editingMessage ? <Button disabled={sample} onClick={() => setEditingMessage(true)} size="sm" variant="secondary">Edit copy</Button> : undefined}>
            {editingMessage ? (
              <>
                <CampaignEditorFields channel={delivery.channel} draft={draft} onChange={(partial) => setDraft((current) => ({ ...current, ...partial }))} posterMimeType={posterName?.toLowerCase().endsWith(".pdf") ? "application/pdf" : null} posterName={posterName} posterPreviewUrl={posterPreviewUrl} readOnly={sample} />
                <div className="mt-4 rounded-control border border-line bg-surface-2 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="text-label font-medium text-ink">Campaign poster</p><p className="mt-1 text-chip text-ink-2">Replace the stored poster with a PNG, JPEG, WebP, GIF, or PDF.</p></div>
                    <Button disabled={sample || saving} onClick={() => posterInputRef.current?.click()} size="sm" variant="secondary"><Upload aria-hidden="true" className="size-4" strokeWidth={1.75} />Replace poster</Button>
                    <input ref={posterInputRef} accept={ACCEPTED_POSTER_TYPES.join(",")} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void replacePoster(file); }} type="file" />
                  </div>
                  {posterProgress > 0 && posterProgress < 100 && <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface"><span className="block h-full rounded-full bg-accent" style={{ width: `${posterProgress}%` }} /></div>}
                </div>
                <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4"><Button onClick={() => { setEditingMessage(false); setDraft({ title: campaign.title, subject: campaign.subject, message: campaign.message }); setPosterName(campaign.poster_name); setPosterPath(campaign.poster_path); setPosterPreviewUrl(null); }} variant="secondary">Cancel</Button><Button disabled={sample} loading={saving} onClick={() => void persist("message")}>Save message</Button></div>
              </>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div><p className="text-label font-medium text-ink-2">Internal label</p><p className="mt-2 text-body text-ink">{campaign.subject}</p><p className="mt-5 text-label font-medium text-ink-2">WhatsApp copy</p><p className="mt-2 whitespace-pre-wrap text-body leading-6 text-ink">{campaign.message}</p></div>
                <div className="rounded-card bg-surface-2 p-4"><div className="ml-auto rounded-control bg-mint p-3 text-body leading-6 text-ink"><p className="whitespace-pre-wrap">{campaign.message.replace(/\{\{\s*first_name\s*\}\}/gi, "Sarah")}</p>{delivery.channel === "whatsapp" && <p className="mt-3 text-chip italic text-ink-3">Reply &apos;Unsubscribe&apos; to stop receiving updates</p>}</div>{campaign.poster_name && <div className="mt-3 flex items-center gap-2 rounded-control bg-surface px-3 py-2 text-label text-ink-2"><FileText aria-hidden="true" className="size-4" strokeWidth={1.75} />{campaign.poster_name}</div>}</div>
              </div>
            )}
          </Card>
        )}

        {tab === "audience" && (
          <Card title="Audience" description="Rules and individual lead overrides live together on this surface.">
            <AudiencePanel audience={audience} onChange={setAudience} readOnly={sample} summary={summary} />
            <div className="mt-5 flex justify-end border-t border-line pt-4"><Button disabled={sample} loading={saving} onClick={() => campaign.status === "draft" ? void persist("audience") : setAudienceConfirmOpen(true)}>Save audience</Button></div>
          </Card>
        )}

        {delivery.channel === "whatsapp" && <Card action={<StatusPill label={`${attendanceCount.toLocaleString()} / ${attendanceTotal.toLocaleString()} attending`} status={attendanceCount > 0 ? "done" : "queued"} />} description="Every YES reply is counted against the actual campaign recipient total. MAYBE NEXT TIME and unsubscribe replies are excluded." title="Attendance tracker"><div aria-label={`${attendanceProgress}% of campaign recipients attending`} className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemax={100} aria-valuemin={0} aria-valuenow={attendanceProgress}><span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${attendanceProgress}%` }} /></div></Card>}

        {tab === "delivery" && (
          <Card title="Delivery plan" description="Choose the channel, client-facing sender, campaign date, Zoom link, and follow-up reminders.">
            <CampaignDeliveryFields delivery={delivery} emailSender={emailSender} loadingSender={loadingSender} onChange={(value) => setAudience({ ...audience, delivery: value })} posterName={campaign.poster_name} />
            <div className="mt-5 flex justify-end border-t border-line pt-4"><Button disabled={sample} loading={saving} onClick={() => campaign.status === "draft" ? void persist("audience") : setAudienceConfirmOpen(true)}>Save delivery plan</Button></div>
          </Card>
        )}

        {tab === "recipients" && (
          <Card action={<SampleDataPill label="Sample statuses" />} description={recipients.length < campaign.audience_count ? `Showing ${recipients.length} of ${campaign.audience_count} recipients. Delivery status is modelled until recipient events are exposed.` : "Delivery status is modelled until recipient events are exposed."} title={`Recipients (${campaign.audience_count})`}>
            {loadingRecipients ? <Skeleton label="Loading recipients" rows={5} variant="list" /> : recipientError ? <EmptyState icon={CircleAlert} message={recipientError} action={<Button onClick={() => void loadRecipients()} variant="secondary">Try again</Button>} /> : recipients.length > 0 ? <div className="divide-y divide-line overflow-hidden rounded-card border border-line">{recipients.map((recipient, index) => { const delivery = recipientStatus(campaign, index); return <div className="flex items-center gap-3 px-4 py-3" key={recipient.id}><span className="inline-flex size-9 items-center justify-center rounded-full bg-cyan text-chip font-semibold text-ink">{recipient.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span><div className="min-w-0 flex-1"><p className="truncate text-body font-medium text-ink">{recipient.name}</p><p className="truncate text-chip text-ink-2">{recipient.phone ?? recipient.email}</p></div><StatusPill label={delivery.label} status={delivery.status} /></div>; })}</div> : <EmptyState icon={Users} message="No recipients match this audience yet." />}
          </Card>
        )}

        {tab === "replies" && (
          <Card action={sampleReplies ? <SampleDataPill /> : undefined} description={`Replies attributed to this campaign · ${attendanceCount.toLocaleString()} / ${attendanceTotal.toLocaleString()} attending.`} title={replyError ? "Replies" : `Replies (${filteredReplies.length})`}>
            {loadingReplies ? <Skeleton label="Loading campaign replies" rows={4} variant="list" /> : replyError ? <EmptyState icon={CircleAlert} message={replyError} action={<Button onClick={() => void loadReplies()} variant="secondary">Try again</Button>} /> : filteredReplies.length > 0 ? <div className="space-y-2">{filteredReplies.map((thread) => <Link className="flex items-center gap-3 rounded-control border border-line p-3 outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/50" key={thread.id} to={`/reengage/inbox/${encodeURIComponent(thread.id)}`}><span className="inline-flex size-9 items-center justify-center rounded-full bg-mint text-chip font-semibold text-ink">{thread.initials}</span><div className="min-w-0 flex-1"><p className="text-body font-medium text-ink">{thread.leadName}</p><p className="truncate text-label text-ink-2">{thread.preview}</p></div><StatusPill label={thread.category === "Not Interested" ? "Maybe next time" : thread.category} status={thread.category === "Interested" ? "done" : thread.category === "Unsubscribe" ? "error" : thread.category === "Not Interested" ? "paused" : "queued"} /></Link>)}</div> : <EmptyState icon={Inbox} message="No replies for this campaign yet." action={<Button asChild variant="secondary"><Link to="/reengage/inbox"><MessageCircle aria-hidden="true" className="size-4" strokeWidth={1.75} />Open inbox</Link></Button>} />}
          </Card>
        )}
      </div>

      <ConfirmDialog
        confirmLabel="Save and rebuild"
        description="Changing a queued or active campaign audience may rebuild its unsent recipient list. Sent messages are not changed."
        onConfirm={() => void persist("audience")}
        onOpenChange={setAudienceConfirmOpen}
        open={audienceConfirmOpen}
        pending={saving}
        title="Update this audience?"
      />
      <ConfirmDialog
        confirmLabel={`Send ${campaign.audience_count} emails`}
        description={`Send this campaign now from ${emailSender?.address ?? "the configured client-facing sender"}${campaign.poster_name?.toLowerCase().endsWith(".pdf") ? ` with ${campaign.poster_name} attached` : ""}. This action delivers the full queued email audience.`}
        onConfirm={() => void sendEmail()}
        onOpenChange={setEmailConfirmOpen}
        open={emailConfirmOpen}
        pending={saving}
        title="Send this email blast?"
      />
      <ConfirmDialog
        confirmLabel={`Queue ${campaign.audience_count}`}
        description={`${campaign.audience_count} recipients will enter the preparation queue in daily groups of up to ${DAILY_SEND_CAP}. Review the actual messages and confirm consent once from Home before anything sends.`}
        onConfirm={() => void toggleStatus()}
        onOpenChange={setStatusConfirmOpen}
        open={statusConfirmOpen}
        pending={saving}
        title="Approve and queue this campaign?"
      />
    </main>
  );
}

export default CampaignDetailPage;
