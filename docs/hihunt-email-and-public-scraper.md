# Gmail and public HR discovery

The demo workspace is configured for `business@hilitedigi.ai`. Email sending remains paused by the existing server demo guard. No send, inbox sync, scheduled scrape or automatic reply is performed by connection setup or public discovery.

## Connect Google

In Google Cloud, enable Gmail API and create a **Web application** OAuth client with this exact redirect URI:

`https://hilite-outreach.vercel.app/api/gmail/callback`

For an internal Google Workspace application, restrict the OAuth audience to the organization's users. The owner must complete Google's required two-step verification to use Cloud console. Do not weaken Google security requirements. Add the client ID and secret in **Hi-Hunt → Settings → Google connection setup**, then connect the business mailbox. The Google consent requests `openid`, `email`, and `gmail.send`; no inbox scope. Only the verified `business@hilitedigi.ai` identity is accepted.

The backend uses Google's official OAuth library, offline access, PKCE S256, a random state, and an authenticated, encrypted ten-minute HttpOnly Secure SameSite=Lax callback cookie. The existing workspace cookie remains SameSite=Strict. Credentials are encrypted with AES-256-GCM and separate purpose-bound authentication data in the private `gmail_connection` table. The encryption key is derived by HKDF from the existing operator secret using a Gmail-specific context. Rotating the operator secret requires reconnecting Gmail; preserve or deliberately migrate the credentials before rotation. Neither secret nor refresh token is returned to the client. No plaintext credential files are needed.

Connection status confirms a completed OAuth grant, not mailbox synchronization or delivery. Google can revoke access; actual delivery remains untested while sending is paused. Enabling real email sending is a separate change and requires reviewing recipient selection, opt-outs and the existing demo guard. The WhatsApp integration is independent.

## Public HR scraper

In **Hi-Hunt → Settings → Singapore HR scraper**, enter up to three company websites. The crawler searches up to three public HTML pages per company within forty seconds. It checks robots.txt, stays on the same company hostname (including www), follows bounded redirects, pins checked public IPv4 DNS answers to HTTPS connections, and rejects private/reserved addresses, credentials, custom ports and non-HTTPS URLs. Each page is limited to 750 KB. Hosts requesting crawl delays above one second are skipped. No login, CAPTCHA or blocked-site bypass is attempted.

Only company-domain emails with nearby HR/recruitment evidence or explicit HR role mailbox names are collected. Generic sales/support and personal email providers are excluded. A `.sg` domain or Singapore page evidence is required. Public listing does not prove deliverability, employment identity, Singapore-only operations or outreach consent. Inferred names are marked in metadata and shown as inferred in the lead drawer.

Discoveries use the real `public_web` provider, source URL/evidence, `email_status=public`, `review_status=new`, and `reviewed_for_outreach=false`. Existing ingestion deduplicates email addresses. Results appear in Hi-Hunt Leads for review. Search never creates a campaign, queues a send or contacts a prospect. No daily volume guarantee is made. Existing demo cron routes remain skipped.

## Validation

`node --test scripts/gmail-connection.test.mjs scripts/public-hr-discovery.test.mjs` exercises encryption, authorization, OAuth state/PKCE/account pinning, no-send behavior, SSRF boundaries, robots rules, filtering, source retention and ingestion using local fixtures. No real email is sent by these tests.
