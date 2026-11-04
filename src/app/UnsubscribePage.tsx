import { useState } from "react";
import { BellOff, CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { useParams } from "react-router";
import { BrandLogo } from "./components/system/brand-logo";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function UnsubscribePage() {
  const { token = "" } = useParams();
  const valid = UUID_PATTERN.test(token);
  const [state, setState] = useState<"ready" | "saving" | "done" | "error">(valid ? "ready" : "error");
  const [error, setError] = useState(valid ? "" : "This unsubscribe link is invalid or incomplete.");

  const unsubscribe = async () => {
    if (!valid || state === "saving") return;
    setState("saving");
    setError("");
    try {
      const response = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "We could not update your preference.");
      setState("done");
    } catch (nextError) {
      setState("error");
      setError(nextError instanceof Error ? nextError.message : "We could not update your preference.");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12 text-ink">
      <section className="w-full max-w-lg rounded-[2rem] border border-line bg-surface p-7 shadow-sm sm:p-10" aria-labelledby="unsubscribe-title">
        <BrandLogo className="h-12 text-[2.5rem]" />
        {state === "done" ? (
          <div className="mt-10">
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-mint text-ink">
              <CheckCircle2 aria-hidden="true" className="size-6" strokeWidth={1.75} />
            </span>
            <h1 className="mt-5 text-page-title font-medium" id="unsubscribe-title">You’re unsubscribed</h1>
            <p className="mt-3 text-body leading-7 text-ink-2">
              You will no longer receive Hilite campaign emails, WhatsApp messages, or event reminders.
            </p>
          </div>
        ) : (
          <div className="mt-10">
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent text-ink">
              <BellOff aria-hidden="true" className="size-6" strokeWidth={1.75} />
            </span>
            <h1 className="mt-5 text-page-title font-medium" id="unsubscribe-title">Stop campaign messages?</h1>
            <p className="mt-3 text-body leading-7 text-ink-2">
              Confirm below and Hilite will stop sending you campaign emails, WhatsApp messages, and event reminders.
            </p>
            {error && <p className="mt-5 rounded-control border border-danger/20 bg-danger/10 p-3 text-label text-danger" role="alert">{error}</p>}
            <button
              className="mt-7 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-ink px-5 py-3 text-body font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!valid || state === "saving"}
              onClick={() => void unsubscribe()}
              type="button"
            >
              {state === "saving" ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <BellOff aria-hidden="true" className="size-4" />}
              {state === "saving" ? "Updating preference…" : "Unsubscribe me"}
            </button>
            <p className="mt-5 flex items-start gap-2 text-chip leading-5 text-ink-3">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
              This private link only changes your Hilite campaign subscription preference.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

export default UnsubscribePage;
