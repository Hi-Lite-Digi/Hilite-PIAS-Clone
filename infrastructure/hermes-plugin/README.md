# HiHunt Hermes inbox plugin

`hihunt-inbox` intercepts every external one-to-one WhatsApp message before
Hermes' AI dispatch. It forwards the message to HiHunt's authenticated inbound
endpoint, then returns a `skip` directive so customer replies never reach the
Hermes agent. This includes messages that start with `/`; allowing slash
commands through would expose Hermes when unknown-number intake is enabled.

Images and stickers are copied immediately from Hermes' short-lived local media
cache into the existing private `campaign-posters` bucket. The plugin first
requests an authenticated, single-object upload ticket and then uploads directly
to Supabase Storage. The application stores only the private object path and
returns a one-hour signed preview URL to the RE-engage inbox. PNG, JPG, WebP, and
GIF files up to 20 MB are accepted; remote URLs and non-image files are rejected.

Required runtime variables:

- `HIHUNT_INBOUND_URL`
- `HIHUNT_INBOUND_SECRET`

The gateway must set `WHATSAPP_ALLOWED_USERS=*`. The Node WhatsApp bridge and
the Python gateway both apply their access policy before plugin hooks; the
wildcard is the explicit open-inbox setting understood by both layers. Without
it, a brand-new number is silently rejected before `hihunt-inbox` can forward
the message. This is safe for this dedicated inbox only while the plugin
remains enabled and fail-closed. Install and verify the plugin before enabling
all-user intake.

Failed forwards are appended to `/opt/data/hihunt-inbox-spool.ndjson` so an
inbound reply is not silently lost during a temporary outage.
