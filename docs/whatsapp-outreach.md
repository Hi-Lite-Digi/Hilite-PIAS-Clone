# WhatsApp outreach

The protected RE-engage workspace uses the approved CPF invitation and its original poster, sent only from the new sender ending 4289. Home and Campaigns show real campaigns and sending activity. The old fictional batch queue is not mounted in this workspace. Seed contacts and seeded conversations are hidden from normal lead lists, totals and inbox results; records are retained rather than deleted.

To send, add or import leads, create a campaign, select recipients, save it, confirm recipient consent and review the final send confirmation. Creating or opening a campaign never sends. Server-side recipient checks, the fixed template, atomic claims and no automatic resend after uncertain delivery remain enforced. Legacy free-text and cron sending remain disabled in demo mode.

Meta API acceptance is labelled **Accepted by Meta**. Signed status callbacks for the new WhatsApp account/phone only are stored in private `meta_delivery_events`. Exact message IDs connect receipts to saved outbound records. Duplicate callbacks are ignored by the compound primary key. Display projection ranks read above delivered, failed, sent and accepted, so delayed notifications cannot downgrade a confirmed receipt. Events can arrive before outbound history is saved; joining them later preserves those receipts. A database failure returns HTTP 503 so Meta can retry the callback; this never resends the message.

New direct Settings tests also save outbound history. A successful send with failed history persistence remains accepted and reports `trackingSaved=false`; it is never automatically retried. Historical sends with no signed receipt remain accepted/unconfirmed, rather than being labelled delivered. No incoming RSVP processing or automatic replies are added by delivery tracking.

`20261113040005_persisted_meta_delivery_events.sql` defines the private service-only receipt table. RLS is enabled and public, anon and authenticated grants are revoked. Only the server can select or insert receipts. No additional Meta permissions or old WhatsApp assets are used.
