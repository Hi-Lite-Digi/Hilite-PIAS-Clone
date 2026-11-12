import { Mail, ShieldCheck } from "lucide-react";
import { BrandLogo } from "./components/system/brand-logo";

function PrivacyPage() {
  return (
    <main className="min-h-screen bg-canvas px-5 py-12 text-ink sm:py-16">
      <article className="mx-auto w-full max-w-3xl rounded-[2rem] border border-line bg-surface p-7 shadow-sm sm:p-10">
        <BrandLogo className="h-12 text-[2.5rem]" />
        <div className="mt-10 flex items-center gap-3">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-mint text-ink">
            <ShieldCheck aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-chip uppercase tracking-[0.16em] text-ink-3">Privacy policy</p>
            <h1 className="mt-1 text-page-title font-medium">Hilite Campaign Sender</h1>
          </div>
        </div>

        <div className="mt-8 space-y-7 text-body leading-7 text-ink-2">
          <p>HI-LITE DIGITAL PTE. LTD. operates this Hilite outreach demo. This notice describes the contact and messaging information used by the demo.</p>
          <section>
            <h2 className="text-section-title font-medium text-ink">Information used</h2>
            <p className="mt-2">
              An authorised workspace operator can supply a person's name, phone number, email, consent or subscription status and campaign details. Hilite also processes the selected message template, message identifiers, delivery status and failure information. The workspace includes fictional sample contacts; real contacts added for testing are personal data.
            </p>
          </section>

          <section>
            <h2 className="text-section-title font-medium text-ink">Purpose and service providers</h2>
            <p className="mt-2">
              Hilite uses this information to manage leads and campaigns, send operator-approved WhatsApp messages, honour recorded messaging preferences and investigate delivery problems. Meta/WhatsApp processes messages and delivery events. Vercel hosts the application and diagnostic logs. Supabase stores workspace contacts and campaign records. Private service credentials are kept on the server.
            </p>
            <p className="mt-2">
              The new delivery diagnostic records message identifiers, timestamps, status and error codes. It filters out other WhatsApp accounts and does not log incoming message text or contact profiles. Receiving a delivery event does not trigger an automatic reply or resend.
            </p>
          </section>

          <section>
            <h2 className="text-section-title font-medium text-ink">Retention and choices</h2>
            <p className="mt-2">
              Workspace records are retained for the demo's operational history until removed through the workspace or an authorised deletion request. Hosting diagnostic logs follow the hosting provider's configured retention. Recipients can choose Unsubscribe or reply UNSUBSCRIBE; replies are not yet automatically processed by this demo, so the operator must handle requests manually.
            </p>
          </section>

          <section>
            <h2 className="text-section-title font-medium text-ink">Contact</h2>
            <p className="mt-2">For questions, access or correction requests, withdrawal of consent, or a deletion request, contact business@hilitedigi.ai. The operator should stop further outreach when consent is withdrawn and handle the relevant records before further testing.</p>
            <a className="mt-3 inline-flex items-center gap-2 text-ink underline underline-offset-4" href="mailto:business@hilitedigi.ai">
              <Mail aria-hidden="true" className="size-4" />
              business@hilitedigi.ai
            </a>
          </section>
        </div>

        <p className="mt-10 border-t border-line pt-5 text-chip text-ink-3">Last updated: 12 November 2026</p>
      </article>
    </main>
  );
}

export default PrivacyPage;
