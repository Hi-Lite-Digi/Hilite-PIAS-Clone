# PIAS_Clone Bot

Meta app **PIAS_Clone Bot** was created on 4 November 2026 under the verified
**HiLite Digital** business portfolio. App ID: `1629215102235593`.
Business ID: `1564220678374619`.

The user entered and completed verification for a **new** WhatsApp sender number
ending **4289**. Existing business phone numbers must not be edited, disconnected,
re-registered, or used for tests.

Verified in WhatsApp Manager on 4 November 2026:

- New WhatsApp Business account: **HiLite Digital**, `1656774412758599`
- New phone display name: **PIAS_Demo**, **In Review**
- New phone number ID: `1442204225635652`, status **Pending**

The account's internal name differs from the phone display name. Its phone
inventory confirms this is the new number, rather than any older business account.

## Template submitted

Payload: `config/pias-clone-demo-template.json`.

- Name: `pias_clone_demo_invite`
- Language: English (US), `en_US`
- Category: Marketing (demo invitation)
- Header: Hilite demo
- First-name example: Aisha (fictional)
- Website button: Open demo → `https://hilite-outreach.vercel.app/`

> Hi {{1}}, you're invited to try the Hilite demo with PIAS_Clone Bot.
>
> Explore sample leads, campaigns, and inbox conversations using the button below.
>
> Reply STOP to opt out.

**Status: submitted to Meta on 4 November 2026; In review, not approved.**
Template ID: `1505051565019452`. It was created only in the new account
`1656774412758599`. Website click tracking was disabled.

[View the new account's templates](https://business.facebook.com/latest/whatsapp_manager/message_templates?business_id=1564220678374619&asset_id=1656774412758599).
The template-manager page initially defaulted to an older account; no template
was created or changed there.

## Controlled test after registration and approval

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

The existing public Hilite demo remains in simulated mode with real outreach
disabled. Its Hermes integration is separate from this Meta Cloud API setup;
the new Meta bot is not yet connected to the public demo's campaign send flow.
No real message has been sent as part of this setup.

Remaining: Meta approval/connection of the new number, template approval,
server-only access credentials for the new bot, and a recipient chosen when the
user wants to send a test. No recipient is required to create or approve a
template. An approved template can be reused for different recipients who have
opted in; each actual send still specifies a destination. See
[WhatsApp's Business Messaging Policy](https://business.whatsapp.com/policy).
The developer console reports missing/ineligible payment methods; no payment
method has been added or changed.
