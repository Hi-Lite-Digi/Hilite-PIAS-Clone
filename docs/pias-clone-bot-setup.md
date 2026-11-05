# Hi-Hunt WhatsApp demo

Meta app **PIAS_Clone Bot** was created on 4 November 2026 under the verified
**HiLite Digital** business portfolio. App ID: `1629215102235593`.
Business ID: `1564220678374619`.

The user entered and completed verification for a **new** WhatsApp sender number
ending **4289**. Existing business phone numbers must not be edited, disconnected,
re-registered, or used for tests.

Verified in WhatsApp Manager on 5 November 2026:

- New WhatsApp Business account: **HiLite Digital**, `1656774412758599`
- Original phone display name: **PIAS_Demo**, rejected by Meta
- Replacement **HiLite Digital** was approved. The user then requested
  **Hi-Hunt**; that new display-name request is now submitted and **In Review**.
  The approved name remains visible until Meta approves its replacement.
- New phone number ID: `1442204225635652`, status **Connected**

The account's internal name differs from the phone display name. Its phone
inventory confirms this is the new number, rather than any older business account.

## Template submitted

Template definition: `config/pias-clone-demo-template.json`.
Original poster: `assets/demo/cpf-webinar-poster.png`.

- Name: `pias_clone_cpf_webinar_image`
- Language: English (US), `en_US`
- Category: Marketing (CPF webinar invitation)
- Header: Image, using the user's full original poster without changes
- First-name variable: `{{1}}`; sample: Pyie
- Quick replies: Attending, Maybe next time, Unsubscribe
- Footer: Reply UNSUBSCRIBE to stop receiving updates.

The template contains the supplied CPF webinar invitation wording, including
the **Apex Premier** sign-off and **29 October 2026 (Thursday)** date.
Keep those supplied details unless the user requests a change. The name is the
only body variable; the date and event name are fixed in this version.

**Status: WhatsApp Manager shows Active - Quality pending on 4 November 2026.**
Template ID: `1091074947262722`. Created only in the new account
`1656774412758599`. The saved preview was verified to contain the uploaded
poster, supplied invitation, and three quick replies.

The earlier text version (`pias_clone_demo_invite`, `1505051565019452`) was
locked while under review when the poster arrived, so the image version has a
new name. The test helper now targets the image version. The earlier version
was last observed as Active - Quality pending; use the image version above.

Meta received the original 1,457,298-byte PNG as the review sample. The static
definition omits Meta's upload-specific sample handle; recreating it through
the API requires a new media upload for that handle. The original file is kept
in the repository for reuse.

[View the image template](https://business.facebook.com/latest/whatsapp_manager/template_details/?business_id=1564220678374619&tab=template-details&childRoute=CAPI&id=1091074947262722&nav_ref=whatsapp_manager&asset_id=1656774412758599).

[View the new account's templates](https://business.facebook.com/latest/whatsapp_manager/message_templates?business_id=1564220678374619&asset_id=1656774412758599).
The template-manager page initially defaulted to an older account; no template
was created or changed there.

## Manual test in Hilite

### Normal Leads and Campaigns

The demo uses the regular Leads table, Add/Edit drawer, filters and spreadsheet
upload. Contacts and campaign drafts persist in the normal database tables.
The sole outbound message choice is the approved CPF image template above.

Sign in once with the workspace key. A host-only Secure, HttpOnly, SameSite=Strict
cookie keeps this browser signed in for 30 days, including after refresh. Only a
SHA-256 hash of its random session token is stored in `workspace_sessions`.
Sign out revokes that session; rotating the operator key revokes all sessions.
Neither the operator key nor Meta token is saved in browser storage or a URL.
All workspace data APIs now require authorization, including reads and imports.

1. In **Leads**, choose **Add lead** or **Upload leads** and save contacts normally.
2. Choose **Create campaign** for a lead, or **New campaign** from Campaigns.
3. Name the campaign, select one or more contacts, preview the fixed invitation
   and original poster, and save the draft.
4. Confirm consent, choose **Review & send**, and confirm the selected recipients.

Fictional sample phone numbers cannot receive messages. The server pins the
template, poster and new sender ending 4289, regardless of client input. Each
recipient gets an atomic draft-to-sending claim in `meta_campaign_deliveries`.
Concurrent requests cannot send the same recipient twice. Unknown/failed attempts
are never automatically retried; explicitly resumed batches send only recipients
that have not yet been attempted. Accepted outgoing messages appear in the normal
inbox history; acceptance is distinct from confirmed delivery.

All contact/session/delivery tables have RLS and no public client grants. The
old private-test tables are retained for compatibility, but the separate test
workspace is no longer the application's Leads/Campaigns workflow.
Migration: `20261105175731_normal_workspace_sessions_and_template_delivery.sql`.

### Direct individual test

RE-engage Settings contains a **WhatsApp test · Hi-Hunt** panel. It uses the
saved workspace sign-in and provides connection checking and an optional direct
individual test with the same approved template. Its signed-in state includes
**Sign out**; no separate key is needed for each page.

Server setup requires these Vercel settings:

- `META_ACCESS_TOKEN` (Secret): token scoped to the new bot/account only
- `META_TEST_OPERATOR_TOKEN` (Secret): a separate random private key, at least 32 characters
- `META_TEST_SEND_ENABLED=true` (Config): enable only after approving the connection

The new WABA and phone IDs are pinned in the server. Conflicting environment
IDs are rejected. `/api/meta-whatsapp` requires an authorized workspace session
or the private key, rejects foreign origins, and sends at most one message per confirmed
request. Connection checks do not upload media or send messages. A send first
checks the new phone is `CONNECTED` and the exact English image template is
`APPROVED`, then uploads the original poster and sends that media ID.

The isolated Employee system user **PIAS_Clone Bot Demo** has access only to the
new app and new WhatsApp account. Meta's token debugger confirms a valid System
User token for this app with **Expires: Never**, as requested by the user.
The token and a separate operator key are saved as Production Secrets in Vercel.
The deployment's live connection check confirms **Number: CONNECTED · Template:
APPROVED**, and the manual-test panel shows **Ready**. No payment method has been added.

The user completed registration through
[Meta's API Playground](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/phone-number-registration)
for the new phone ID only, entering their own PIN and submitting the request.
Both WhatsApp Manager and Hilite's actual API check confirm the number is
Connected. The PIN was entered only in Meta; it was not read or saved by the
agent. Registration form credentials were cleared after verification. No repeat
registration is needed.

After signing in, click **Check bot**, enter a recipient
and first name, confirm the recipient agreed to receive the test, and send one
message. The confirmation notes that Meta charges may apply. Meta acceptance is
shown separately from delivery confirmation; verify receipt on the recipient's
phone. Requests are never automatically retried.

The legacy Hermes/free-text send paths, automatic reminders, and discovery
remain disabled. Normal confirmed campaigns use Meta's approved template path.
Live inbound replies/webhooks are not yet connected to Hilite's demo inbox.

## Optional command-line test

Keep these values in ignored `.env.local` or another private server environment:

```dotenv
META_GRAPH_API_VERSION=v25.0
META_ACCESS_TOKEN=your-server-only-token-for-the-new-bot
META_WABA_ID=1656774412758599
META_PHONE_NUMBER_ID=1442204225635652
META_NEW_SENDER_NUMBER=the-new-verified-number-with-country-code
META_TEST_RECIPIENT=a-separate-number-you-control
META_TEST_ALLOWED_RECIPIENT=the-same-explicitly-authorized-test-recipient
META_TEST_FIRST_NAME=Demo
META_HEADER_IMAGE_ID=the-meta-media-id-for-the-original-poster
# Alternatively set META_HEADER_IMAGE_URL to a public HTTPS image URL.
# Set exactly one image source, not both.
```

```sh
node scripts/test-meta-template.mjs           # Preview only; no network request
node scripts/test-meta-template.mjs --check   # Verify the new sender and approval
node scripts/test-meta-template.mjs --send    # One explicitly authorized test
```

The helper verifies that the phone-number ID matches the new sender, checks
the exact template's approved status and language, and restricts the recipient
before sending. It also rejects every account or phone ID other than the
confirmed new ones above. It never edits phone numbers and does not retry automatically.
A returned message ID confirms Meta accepted the request; delivery still needs
to be verified on the recipient's device or through a status webhook.

The helper includes an image header parameter and rejects missing or invalid
image configuration before contacting Meta. The review sample does not
automatically attach the poster to a send; each send needs its media ID or URL.
See [Meta's template object example](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/TemplateObject/).

The normal demo workspace is private. Confirmed campaigns and direct tests use
Meta Cloud API with the one fixed template and do not enable Hermes sending.
No real message has been sent as part of this setup.

Remaining: Meta's review of the submitted **Hi-Hunt** display name and a recipient
chosen when the user wants to send a test. No recipient is required to create or approve a
template. An approved template can be reused for different recipients who have
opted in; each actual send still specifies a destination. See
[WhatsApp's Business Messaging Policy](https://business.whatsapp.com/policy).
The developer console reports missing/ineligible payment methods; no payment
method has been added or changed.
