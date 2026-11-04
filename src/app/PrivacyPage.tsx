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
          <section>
            <h2 className="text-section-title font-medium text-ink">How Google account access is used</h2>
            <p className="mt-2">
              Hilite uses the Gmail send permission only to send campaign emails that an authorised Hilite user prepares and approves. The app does not request permission to read, search, modify, or delete email in the connected mailbox.
            </p>
          </section>

          <section>
            <h2 className="text-section-title font-medium text-ink">Information handled by Hilite</h2>
            <p className="mt-2">
              Hilite processes campaign content, recipient contact details, delivery status, and the connected sender address for the purpose of sending and tracking approved outreach. OAuth credentials are stored as protected server-side environment variables and are not exposed in the browser.
            </p>
          </section>

          <section>
            <h2 className="text-section-title font-medium text-ink">Sharing and retention</h2>
            <p className="mt-2">
              Google account data is not sold. It is used only to provide the campaign-sending feature and is shared with service providers only where required to operate Hilite securely. Campaign records are retained for operational history until an authorised Hilite user removes them.
            </p>
          </section>

          <section>
            <h2 className="text-section-title font-medium text-ink">Your choices</h2>
            <p className="mt-2">
              The connected Gmail account can revoke Hilite access at any time from Google Account connections. Campaign recipients can use the unsubscribe link included in campaign messages to stop future outreach.
            </p>
          </section>

          <section>
            <h2 className="text-section-title font-medium text-ink">Contact</h2>
            <a className="mt-3 inline-flex items-center gap-2 text-ink underline underline-offset-4" href="mailto:namiuser89@gmail.com">
              <Mail aria-hidden="true" className="size-4" />
              namiuser89@gmail.com
            </a>
          </section>
        </div>

        <p className="mt-10 border-t border-line pt-5 text-chip text-ink-3">Last updated: 4 November 2026</p>
      </article>
    </main>
  );
}

export default PrivacyPage;
