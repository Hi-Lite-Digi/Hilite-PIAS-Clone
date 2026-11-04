# Gmail campaign sender setup

The campaign email channel and Hi-Hunt inbox use the Gmail API with these OAuth
scopes:

- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.readonly`

WhatsApp continues to use Hermes and does not share any Gmail configuration.

## Google setup

1. Sign in to Google Cloud with the account that will own the Hilite OAuth app.
2. Enable two-step verification for that Google account if Google Cloud requires it.
3. Create or select a Google Cloud project and enable the Gmail API.
4. Configure the OAuth consent screen and add both `gmail.send` and
   `gmail.readonly`.
5. Add the Gmail sender as a test user while setting up. For a durable connection,
   publish the consent screen to production after testing; refresh tokens for a
   testing app using sensitive scopes can expire after seven days.
6. Create an OAuth client and authorize the Gmail sender with offline access so
   Google issues a refresh token.

## Vercel production variables

Set these only in Vercel's encrypted server-side environment:

```text
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
GMAIL_SENDER_EMAIL
GMAIL_SENDER_NAME
GMAIL_CONNECTED_AT
```

`GMAIL_SENDER_EMAIL` must be the same Gmail account that granted the OAuth
authorization. Never commit the client secret or refresh token. Redeploy after
changing the variables, then use **RE-engage → Settings → Check Gmail** to verify
the connection. `GMAIL_CONNECTED_AT` is an optional ISO timestamp used by the
inbox status response. Hi-Hunt enforces a fixed limit of 200 emails per day,
resetting at 7:00 AM Singapore time. This limit does not apply to RE-engage or
WhatsApp delivery.

If the existing refresh token was created with only `gmail.send`, authorize the
account again with both scopes and replace `GMAIL_REFRESH_TOKEN`. Google does not
add new scopes to an old refresh token automatically.

## Runtime behavior

- Each eligible subscribed recipient receives an individual MIME email.
- The campaign CTA and private unsubscribe link are appended to every message.
- A campaign PDF poster is attached when present and no larger than 18 MB.
- Only recipients accepted by Gmail are marked as sent; failures stay queued.
- Hi-Hunt reserves daily send slots atomically before delivery so concurrent
  approvals cannot exceed 200 emails in the same 7:00 AM-to-7:00 AM SGT window.
- Hi-Hunt Inbox lists the latest 50 Gmail inbox threads and loads full message
  bodies only when a thread is opened.
