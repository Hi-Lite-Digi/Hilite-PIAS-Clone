import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Clock3,
  Mail,
  MessageCircle,
  RefreshCw,
  Save,
  SendHorizontal,
  ShieldCheck,
  X,
} from "lucide-react";
import { useBlocker, type BlockerFunction } from "react-router";
import { getEmailSenderStatus, getWhatsAppStatus, type EmailSenderStatus, type WhatsAppGatewayStatus } from "../../lib/api";
import { getSendQueue, type SendQueueResult } from "../../lib/stubs";
import {
  Button,
  Card,
  ConfirmDialog,
  PageHeader,
  SampleDataPill,
  Skeleton,
  StatusPill,
  toast,
} from "../components/system";
import {
  getGatewayPresentation,
  isReengageSettingsDirty,
  loadReengageSettings,
  saveReengageSettings,
  validateSendWindow,
  type ReengageSettings,
} from "./settings-model";

type SettingsPageProps = {
  initialGateway?: WhatsAppGatewayStatus | null;
  initialEmailSender?: EmailSenderStatus | null;
  initialCap?: SendQueueResult["cap"];
  initialSettings?: ReengageSettings;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}

const singaporeResetFormatter = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  hour: "numeric",
  minute: "2-digit",
});

function formatSingaporeReset(resetAt: string) {
  return singaporeResetFormatter.format(new Date(resetAt));
}

export default function SettingsPage({ initialCap, initialEmailSender, initialGateway, initialSettings }: SettingsPageProps) {
  const loadedSettings = useMemo(() => initialSettings ?? loadReengageSettings(), [initialSettings]);
  const [savedSettings, setSavedSettings] = useState<ReengageSettings>(loadedSettings);
  const [settings, setSettings] = useState<ReengageSettings>(loadedSettings);
  const [gateway, setGateway] = useState<WhatsAppGatewayStatus | null>(initialGateway ?? null);
  const [emailSender, setEmailSender] = useState<EmailSenderStatus | null>(initialEmailSender ?? null);
  const [cap, setCap] = useState(initialCap ?? null);
  const [checking, setChecking] = useState(initialGateway === undefined);
  const [checkingEmail, setCheckingEmail] = useState(initialEmailSender === undefined);
  const [loadingCap, setLoadingCap] = useState(initialCap === undefined);
  const [saving, setSaving] = useState(false);
  const confirmedNavigation = useRef(false);
  const dirty = isReengageSettingsDirty(savedSettings, settings);
  const validationError = validateSendWindow(settings.sendWindowStart, settings.sendWindowEnd);
  const gatewayPresentation = getGatewayPresentation(gateway, checking);
  const blockNavigation = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => {
    const currentUrl = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`;
    const nextUrl = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;
    return dirty && currentUrl !== nextUrl;
  }, [dirty]);
  const blocker = useBlocker(blockNavigation);

  const refreshGateway = useCallback(async (showFailureToast = true) => {
    setChecking(true);
    try {
      setGateway(await getWhatsAppStatus());
    } catch (error) {
      setGateway(null);
      if (showFailureToast) {
        toast.error("WhatsApp connection check failed", { description: getErrorMessage(error) });
      }
    } finally {
      setChecking(false);
    }
  }, []);

  const refreshCap = useCallback(async (showFailureToast = true) => {
    setLoadingCap(true);
    try {
      const queue = await getSendQueue();
      setCap(queue.cap);
    } catch (error) {
      setCap(null);
      if (showFailureToast) {
        toast.error("Sending limit could not be loaded", { description: getErrorMessage(error) });
      }
    } finally {
      setLoadingCap(false);
    }
  }, []);

  const refreshEmailSender = useCallback(async (showFailureToast = true) => {
    setCheckingEmail(true);
    try {
      setEmailSender(await getEmailSenderStatus());
    } catch (error) {
      setEmailSender(null);
      if (showFailureToast) {
        toast.error("Email sender check failed", { description: getErrorMessage(error) });
      }
    } finally {
      setCheckingEmail(false);
    }
  }, []);

  useEffect(() => {
    if (initialGateway === undefined) void refreshGateway(false);
    if (initialCap === undefined) void refreshCap(false);
    if (initialEmailSender === undefined) void refreshEmailSender(false);
  }, [initialCap, initialEmailSender, initialGateway, refreshCap, refreshEmailSender, refreshGateway]);

  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [dirty]);

  const updateSetting = (key: keyof ReengageSettings, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const save = () => {
    if (validationError) return;
    setSaving(true);
    try {
      const normalized = { ...settings, senderEmail: emailSender?.address ?? settings.senderEmail.trim().toLowerCase() };
      saveReengageSettings(normalized);
      setSettings(normalized);
      setSavedSettings(normalized);
      void refreshEmailSender(false);
      toast.success("RE-engage preferences saved on this device");
    } catch (error) {
      toast.error("Settings could not be saved", { description: getErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const capPercent = cap && cap.limit > 0 ? Math.min(100, Math.round((cap.used / cap.limit) * 100)) : 0;

  return (
    <main className="h-full overflow-y-auto bg-bg px-4 py-6 [scrollbar-width:none] md:px-8 md:py-8" data-slot="reengage-settings-page">
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader
          subtitle="Manage the WhatsApp connection, client-facing email sender, and safeguards applied to approved batches."
          title="RE-engage settings"
        />

        <Card
          description="Choose the connections and sender identity used by approved RE-engage campaigns."
          title="Connections"
        >
          <div className="rounded-card border border-line bg-surface-2 p-4 md:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-mint text-ink">
                <MessageCircle aria-hidden="true" className="size-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-card-title font-medium text-ink">WhatsApp · Hermes</h3>
                  <StatusPill label={gatewayPresentation.label} status={gatewayPresentation.status} />
                </div>
                <p className="mt-2 max-w-2xl text-body text-ink-2">{gatewayPresentation.copy}</p>

                {!checking && gateway?.requirements && gateway.requirements.length > 0 && (
                  <div className="mt-4">
                    <p className="text-label font-medium text-ink">Before sending</p>
                    <ul className="mt-2 space-y-2">
                      {gateway.requirements.map((requirement) => (
                        <li className="flex items-start gap-2 text-label text-ink-2" key={requirement}>
                          <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />
                          <span>{requirement}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!checking && gateway?.deliveryReady && gateway.requirements.length === 0 && (
                  <p className="mt-4 flex items-center gap-2 text-label text-ink-2">
                    <Check aria-hidden="true" className="size-4 text-ink" strokeWidth={1.75} />
                    Ready for approved batches.
                  </p>
                )}
              </div>
              <Button
                loading={checking}
                onClick={() => void refreshGateway()}
                size="sm"
                variant="secondary"
              >
                {!checking && <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.75} />}
                Check connection
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-card border border-line bg-surface-2 p-4 md:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-cyan text-ink">
                <Mail aria-hidden="true" className="size-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-card-title font-medium text-ink">Email · Gmail</h3>
                  <StatusPill
                    label={checkingEmail ? "Checking" : emailSender?.configured ? "Ready" : "Needs setup"}
                    status={checkingEmail ? "queued" : emailSender?.configured ? "done" : "error"}
                  />
                </div>
                <p className="mt-2 max-w-2xl text-body text-ink-2">
                  {checkingEmail
                    ? "Checking the Gmail sender."
                    : emailSender?.configured
                      ? `Campaign emails are ready to send as ${emailSender.address}.`
                      : emailSender?.requirement ?? "The email sender could not be checked."}
                </p>
                <div className="mt-4">
                  <p className="text-label font-medium text-ink-2">Connected Gmail account</p>
                  <p className="mt-2 min-h-11 rounded-control border border-line bg-surface px-3 py-3 text-body text-ink">
                    {emailSender?.address ?? "Not connected"}
                  </p>
                  <p className="mt-2 text-chip text-ink-2">This sender is fixed by the secure Gmail connection and cannot be changed per campaign.</p>
                </div>
              </div>
              <Button loading={checkingEmail} onClick={() => void refreshEmailSender()} size="sm" variant="secondary">
                {!checkingEmail && <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.75} />}
                Check Gmail
              </Button>
            </div>
          </div>
        </Card>

        <Card
          action={<SampleDataPill label="Local preference" />}
          description="The 12-hour WhatsApp cap is live. The send window is saved in this browser as a planning preference and is not yet enforced by the sending service."
          title="Sending rules"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-card bg-surface-2 p-4 md:p-5" aria-labelledby="send-cap-title">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-control bg-accent text-ink">
                  <ShieldCheck aria-hidden="true" className="size-5" strokeWidth={1.75} />
                </span>
                <div>
                  <h3 className="text-card-title font-medium text-ink" id="send-cap-title">12-hour cap</h3>
                  <p className="mt-0.5 text-chip text-ink-2">Resets at midnight and noon Singapore time.</p>
                </div>
              </div>
              {loadingCap ? (
                <Skeleton className="mt-5" label="Loading 12-hour cap" rows={2} variant="list" />
              ) : cap ? (
                <div className="mt-5">
                  <p className="text-display font-normal tabular-nums text-ink">{cap.limit} messages / {cap.windowHours}h</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${capPercent}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between gap-3 text-chip tabular-nums text-ink-2">
                    <span>{cap.used} used this window</span>
                    <span>{cap.remaining} remaining</span>
                  </div>
                  <p className="mt-3 text-chip tabular-nums text-ink-2">Resets at {formatSingaporeReset(cap.resetsAt)} SGT.</p>
                </div>
              ) : (
                <div className="mt-5">
                  <p className="text-body text-ink-2">The 12-hour limit is temporarily unavailable.</p>
                  <Button className="mt-3" onClick={() => void refreshCap()} size="sm" variant="secondary">Try again</Button>
                </div>
              )}
            </section>

            <section className="rounded-card bg-surface-2 p-4 md:p-5" aria-labelledby="send-window-title">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-control bg-cyan text-ink">
                  <Clock3 aria-hidden="true" className="size-5" strokeWidth={1.75} />
                </span>
                <div>
                  <h3 className="text-card-title font-medium text-ink" id="send-window-title">Send window</h3>
                  <p className="mt-0.5 text-chip text-ink-2">Device-local planning preference.</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                <label className="text-label font-medium text-ink-2">
                  Start
                  <input
                    id="send-window-start"
                    aria-describedby={validationError ? "send-window-error" : undefined}
                    aria-invalid={Boolean(validationError)}
                    className="mt-2 h-11 w-full rounded-control border border-line bg-surface px-3 text-body tabular-nums text-ink outline-none focus:ring-3 focus:ring-ring/40"
                    onChange={(event) => updateSetting("sendWindowStart", event.target.value)}
                    type="time"
                    value={settings.sendWindowStart}
                  />
                </label>
                <span aria-hidden="true" className="pb-3 text-label text-ink-3">to</span>
                <label className="text-label font-medium text-ink-2">
                  End
                  <input
                    id="send-window-end"
                    aria-describedby={validationError ? "send-window-error" : undefined}
                    aria-invalid={Boolean(validationError)}
                    className="mt-2 h-11 w-full rounded-control border border-line bg-surface px-3 text-body tabular-nums text-ink outline-none focus:ring-3 focus:ring-ring/40"
                    onChange={(event) => updateSetting("sendWindowEnd", event.target.value)}
                    type="time"
                    value={settings.sendWindowEnd}
                  />
                </label>
              </div>
              {validationError && (
                <p id="send-window-error" className="mt-3 flex items-center gap-2 text-label text-danger" role="alert">
                  <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  {validationError}
                </p>
              )}
              <p className="mt-4 flex items-start gap-2 text-label text-ink-2">
                <SendHorizontal aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                This preference does not delay approved messages yet. Home batch approval sends immediately; the live 12-hour cap still applies.
              </p>
            </section>
          </div>
        </Card>

        {dirty && (
          <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-card border border-line bg-surface p-3 shadow-shell sm:flex-row sm:items-center sm:justify-between md:p-4" data-slot="settings-save-bar">
            <div>
              <p className="text-body font-medium text-ink">Unsaved RE-engage changes</p>
              <p className="mt-0.5 text-chip text-ink-2">Save or discard them before leaving this page.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setSettings(savedSettings)} size="sm" variant="ghost">Discard</Button>
              <Button disabled={Boolean(validationError)} loading={saving} onClick={save} size="sm">
                {!saving && <Save aria-hidden="true" className="size-4" strokeWidth={1.75} />}
                Save changes
              </Button>
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        confirmLabel="Discard and leave"
        description="Your unsaved sending-rule changes will be lost."
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
        title="Discard unsaved changes?"
        variant="destructive"
      />
    </main>
  );
}
