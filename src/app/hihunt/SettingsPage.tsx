import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mail, RefreshCw, Save } from "lucide-react";
import { useBlocker, type BlockerFunction } from "react-router";
import { getEmailSenderStatus, type EmailSenderStatus } from "../../lib/api";
import { GmailSetupControls } from "./GmailSetupControls";
import { PublicHRSetup } from "./PublicHRSetup";
import {
  getSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  type HiHuntSettings,
} from "../../lib/stubs";
import { Button, Card, ConfirmDialog, PageHeader, SampleDataPill, Skeleton, StatusPill, toast } from "../components/system";
import {
  isHiHuntDefaultsDirty,
  isHiHuntSenderPreferenceDirty,
  loadHiHuntSenderPreference,
  normalizeDefaults,
  normalizeHiHuntSenderPreference,
  saveHiHuntSenderPreference,
  validateHiHuntDefaults,
  validateHiHuntSenderEmail,
  type HiHuntDefaults,
  type HiHuntSenderPreference,
} from "./settings-model";

type SettingsPageProps = {
  initialEmailSender?: EmailSenderStatus | null;
  initialSenderPreference?: HiHuntSenderPreference;
  initialSettings?: HiHuntSettings;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}

function SettingsPage({ initialEmailSender, initialSenderPreference, initialSettings }: SettingsPageProps) {
  const loadedSettings = useMemo(() => initialSettings ?? DEFAULT_SETTINGS, [initialSettings]);
  const loadedDefaults = useMemo<HiHuntDefaults>(() => ({
    senderName: loadedSettings.outreach.senderName,
    signoff: loadedSettings.outreach.signoff,
  }), [loadedSettings]);
  const loadedSenderPreference = useMemo(
    () => initialSenderPreference ?? loadHiHuntSenderPreference(),
    [initialSenderPreference],
  );
  const [emailSender, setEmailSender] = useState<EmailSenderStatus | null>(initialEmailSender ?? null);
  const [checkingEmail, setCheckingEmail] = useState(initialEmailSender === undefined);
  const [savedSenderPreference, setSavedSenderPreference] = useState(loadedSenderPreference);
  const [senderPreference, setSenderPreference] = useState(loadedSenderPreference);
  const [savedDefaults, setSavedDefaults] = useState(loadedDefaults);
  const [defaults, setDefaults] = useState(loadedDefaults);
  const [settingsRecord, setSettingsRecord] = useState(loadedSettings);
  const [settingsSample, setSettingsSample] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(initialSettings === undefined);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const confirmedNavigation = useRef(false);
  const senderDirty = isHiHuntSenderPreferenceDirty(savedSenderPreference, senderPreference);
  const defaultsDirty = isHiHuntDefaultsDirty(savedDefaults, defaults);
  const dirty = senderDirty || defaultsDirty;
  const senderValidationError = validateHiHuntSenderEmail(senderPreference.senderEmail);
  const defaultErrors = validateHiHuntDefaults(defaults);

  const blockNavigation = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => {
    const currentUrl = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`;
    const nextUrl = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;
    return dirty && currentUrl !== nextUrl;
  }, [dirty]);
  const blocker = useBlocker(blockNavigation);

  const refreshEmailSender = useCallback(async (address: string, showFailureToast = true) => {
    setCheckingEmail(true);
    try {
      setEmailSender(await getEmailSenderStatus(address));
    } catch (error) {
      setEmailSender(null);
      if (showFailureToast) toast.error("Email sender check failed", { description: getErrorMessage(error) });
    } finally {
      setCheckingEmail(false);
    }
  }, []);

  const refreshDefaults = useCallback(async (showToast = true) => {
    setLoadingDefaults(true);
    setDefaultsError(null);
    try {
      const result = await getSettings();
      const nextDefaults = {
        senderName: result.data.outreach.senderName,
        signoff: result.data.outreach.signoff,
      };
      setSettingsRecord(result.data);
      setSavedDefaults(nextDefaults);
      setDefaults(nextDefaults);
      setSettingsSample(result.sample);
    } catch (error) {
      const message = getErrorMessage(error);
      setDefaultsError(message);
      setSettingsSample(false);
      if (showToast) toast.error("Email defaults could not be loaded", { description: message });
    } finally {
      setLoadingDefaults(false);
    }
  }, []);

  useEffect(() => {
    if (initialEmailSender === undefined) void refreshEmailSender(loadedSenderPreference.senderEmail, false);
    if (initialSettings === undefined) void refreshDefaults(false);
  }, [initialEmailSender, initialSettings, loadedSenderPreference.senderEmail, refreshDefaults, refreshEmailSender]);

  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const save = async () => {
    if (saving || senderValidationError || Object.keys(defaultErrors).length > 0) return;
    if (defaultsDirty && (settingsSample || loadingDefaults || defaultsError)) return;
    const nextSenderPreference = normalizeHiHuntSenderPreference(senderPreference);
    const nextDefaults = normalizeDefaults(defaults);
    setSaving(true);
    try {
      if (defaultsDirty) {
        await saveSettings({
          ...settingsRecord,
          outreach: { ...settingsRecord.outreach, senderName: nextDefaults.senderName, signoff: nextDefaults.signoff },
        });
        setSettingsRecord((current) => ({
          ...current,
          outreach: { ...current.outreach, senderName: nextDefaults.senderName, signoff: nextDefaults.signoff },
        }));
        setDefaults(nextDefaults);
        setSavedDefaults(nextDefaults);
      }
      saveHiHuntSenderPreference(nextSenderPreference);
      setSenderPreference(nextSenderPreference);
      setSavedSenderPreference(nextSenderPreference);
      void refreshEmailSender(nextSenderPreference.senderEmail, false);
      toast.success("Hi-Hunt email settings saved on this device.");
    } catch (error) {
      toast.error("Email settings could not be saved", { description: getErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setSenderPreference(savedSenderPreference);
    setDefaults(savedDefaults);
  };

  const saveDisabled = Boolean(
    senderValidationError
    || Object.keys(defaultErrors).length > 0
    || (defaultsDirty && (settingsSample || loadingDefaults || defaultsError)),
  );

  return (
    <main className="h-full overflow-y-auto bg-bg px-4 py-6 [scrollbar-width:none] md:px-8 md:py-8" data-slot="hihunt-settings-page">
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader subtitle="Manage the client-facing email sender and the defaults used by new outreach workflows." title="Hi-Hunt settings" />

        <Card description="Choose the verified sender address used by approved Hi-Hunt outreach emails." title="Email sender">
          <div className="rounded-card border border-line bg-surface-2 p-4 md:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-cyan text-ink"><Mail aria-hidden="true" className="size-5" strokeWidth={1.75} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-card-title font-medium text-ink">Email · Gmail</h3>
                  <StatusPill
                    label={checkingEmail ? "Checking" : emailSender?.configured ? emailSender.sendingEnabled === false ? "Connected" : "Ready" : "Needs setup"}
                    status={checkingEmail ? "queued" : emailSender?.configured ? "done" : "error"}
                  />
                </div>
                <p className="mt-2 max-w-2xl text-body text-ink-2">
                  {checkingEmail
                    ? "Checking the Gmail sender."
                    : emailSender?.configured
                      ? emailSender.sendingEnabled === false ? `${emailSender.address} is connected. Email sending is paused.` : `Hi-Hunt emails are ready to send as ${emailSender.address}.`
                      : emailSender?.requirement ?? "The email sender could not be checked."}
                </p>
                <label className="mt-4 block text-label font-medium text-ink-2">
                  Connected Gmail account
                  <input
                    aria-describedby="hihunt-sender-email-help"
                    className="mt-2 h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink disabled:cursor-not-allowed disabled:opacity-80"
                    disabled
                    placeholder="Not connected"
                    type="email"
                    value={emailSender?.address ?? ""}
                  />
                </label>
                <p className="mt-2 text-chip text-ink-2" id="hihunt-sender-email-help">This sender is fixed by the secure Gmail connection and cannot be changed here.</p>
              </div>
              <Button loading={checkingEmail} onClick={() => void refreshEmailSender(senderPreference.senderEmail)} size="sm" variant="secondary">
                {!checkingEmail && <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.75} />}
                Check Gmail
              </Button>
            </div>
          </div>
          <GmailSetupControls clientConfigured={Boolean(emailSender?.clientConfigured)} connected={Boolean(emailSender?.configured)} onSaved={() => void refreshEmailSender(senderPreference.senderEmail)} />
        </Card>

        <PublicHRSetup />

        <Card action={settingsSample ? <SampleDataPill /> : undefined} description="These values are inserted into new workflow templates and their live preview." title="Email defaults">
          {loadingDefaults ? <Skeleton rows={2} variant="list" label="Loading email defaults" /> : defaultsError ? (
            <div className="rounded-control border border-danger/20 bg-danger/10 p-4" role="alert">
              <p className="text-body font-medium text-danger">Email defaults are unavailable</p>
              <p className="mt-1 text-label text-ink-2">{defaultsError}</p>
              <Button className="mt-3" onClick={() => void refreshDefaults()} size="sm" variant="secondary">Try again</Button>
            </div>
          ) : (
            <>
              {settingsSample && <p className="mb-4 text-label text-ink-2">Fallback defaults are read-only. Connect the live settings service before saving changes.</p>}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-label font-medium text-ink">Default sender name
                  <input aria-invalid={Boolean(defaultErrors.senderName)} className="mt-2 h-11 w-full rounded-control border border-line bg-surface-2 px-3.5 text-body text-ink outline-none focus:ring-3 focus:ring-ring/40" disabled={settingsSample || saving} onChange={(event) => setDefaults((current) => ({ ...current, senderName: event.target.value }))} value={defaults.senderName} />
                  {defaultErrors.senderName && <span className="mt-1.5 block text-chip text-danger">{defaultErrors.senderName}</span>}
                </label>
                <label className="text-label font-medium text-ink">Sign-off
                  <textarea aria-invalid={Boolean(defaultErrors.signoff)} className="mt-2 min-h-24 w-full rounded-control border border-line bg-surface-2 px-3.5 py-3 text-body text-ink outline-none focus:ring-3 focus:ring-ring/40" disabled={settingsSample || saving} onChange={(event) => setDefaults((current) => ({ ...current, signoff: event.target.value }))} value={defaults.signoff} />
                  {defaultErrors.signoff && <span className="mt-1.5 block text-chip text-danger">{defaultErrors.signoff}</span>}
                </label>
              </div>
            </>
          )}
        </Card>

        {dirty && (
          <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-card border border-line bg-surface p-3 shadow-shell sm:flex-row sm:items-center sm:justify-between md:p-4" data-slot="hihunt-settings-save-bar">
            <div><p className="text-body font-medium text-ink">Unsaved Hi-Hunt email changes</p><p className="mt-0.5 text-chip text-ink-2">Save or discard them before leaving this page.</p></div>
            <div className="flex items-center gap-2"><Button disabled={saving} onClick={discard} size="sm" variant="ghost">Discard</Button><Button disabled={saveDisabled} loading={saving} onClick={() => void save()} size="sm">{!saving && <Save aria-hidden="true" className="size-4" strokeWidth={1.75} />}Save changes</Button></div>
          </div>
        )}
      </div>

      <ConfirmDialog
        confirmLabel="Discard and leave"
        description="Your unsaved sender address or email defaults will be lost."
        onConfirm={() => { if (blocker.state !== "blocked") return; confirmedNavigation.current = true; blocker.proceed(); }}
        onOpenChange={(open) => { if (open) return; if (confirmedNavigation.current) { confirmedNavigation.current = false; return; } if (blocker.state === "blocked") blocker.reset(); }}
        open={blocker.state === "blocked"}
        pending={saving}
        title="Discard unsaved changes?"
        variant="destructive"
      />
    </main>
  );
}

export default SettingsPage;
export type { SettingsPageProps };
