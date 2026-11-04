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
- Category: Marketing (CPF webinar invitation)
- Header: CPF Changes & You
- First-name variable: `{{1}}`; sample: Pyie
- Quick replies: Attending, Maybe next time, Unsubscribe
- Footer: Reply UNSUBSCRIBE to stop receiving updates.

The user rejected the initial software-demo invitation and supplied the CPF
webinar invitation wording. The payload now contains that supplied text,
including the **Apex Premier** sign-off and **29 October 2026 (Thursday)** date.
Keep those supplied details unless the user requests a change. The name is the
only body variable; the date and event name are fixed in this version.

**Status: corrected and resubmitted to Meta on 4 November 2026; In review.**
Template ID: `1505051565019452`. The same template was edited only in the new
account `1656774412758599`. The original software-demo link and demo footer were
replaced with the three quick replies and unsubscribe footer.

The saved Meta preview was verified to contain the supplied CPF invitation and
all three buttons. An initial edit with an empty header was rejected because
Meta expected the existing text header's text field. Resubmission with
**CPF Changes & You** as the header succeeded.

No poster image has been added. The user's attachment shows only part of the
poster inside a WhatsApp screenshot; the original poster is still needed for
an image header. Do not upload the entire conversation screenshot as a poster.

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
