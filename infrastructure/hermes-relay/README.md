# HiHunt Hermes relay

This private relay is the only public entry point to the Hermes WhatsApp bridge. It accepts one recipient per request, requires a server-only bearer token and explicit consent, applies idempotency and low daily rate limits, and keeps Hermes bound to the Droplet's loopback interface.

Campaign sends may include a private Supabase Storage poster. The relay downloads the short-lived signed URL to a permission-restricted temporary directory, sends it through Hermes's native `/send-media` endpoint with the campaign message as its caption, and immediately removes the temporary file. Only signed `campaign-posters` URLs on `*.supabase.co` and PNG, JPEG, WebP, GIF, or PDF files are accepted. The relay and Hermes bridge must run on the same host so the bridge can read the temporary file path.

The Vercel frontend must never call this relay directly. HiHunt's server-side API uses `HERMES_RELAY_URL` and `HERMES_RELAY_TOKEN` to perform health checks and approved sends.

Hermes uses WhatsApp Web emulation, not Meta's official Business API. Use a dedicated number, only message opted-in recipients, and keep human approval enabled. This integration deliberately does not expose bulk sending.

## Persistent Droplet gateway

Pair the dedicated account once with `hermes whatsapp`, then install the gateway watchdog:

```sh
sudo bash infrastructure/hermes-relay/install-droplet-gateway.sh
```

On the production Droplet, the same versioned installer is available without a repository checkout:

```sh
curl -fsSL https://hi-lite-pias-snowy.vercel.app/install-hermes-gateway.sh | sudo bash
```

The installer detects how the existing `hihunt-hermes-gateway` container is managed. Current Hermes images already use s6, so the installer removes any obsolete duplicate host service and uses that single supervised gateway. Older images fall back to a host-level systemd service. In both modes it validates the newly paired credentials, stops the gateway, replaces each Hermes compatibility session directory exactly while retaining timestamped backups, preserves `WHATSAPP_ALLOWED_USERS=*` for the fail-closed HiHunt inbox plugin, and checks the internal bridge every minute. Exact replacement matters because merging a fresh Baileys session into a revoked one leaves stale authentication keys that WhatsApp can immediately log out. A stopped port `3000` restarts only the correct gateway supervisor; the relay container and paired session are not deleted.

Useful host checks:

```sh
systemctl status hihunt-hermes-whatsapp-check.timer --no-pager
docker exec --user 10000:10000 hihunt-hermes-gateway hermes gateway status
docker exec hihunt-hermes-gateway node -e "fetch('http://127.0.0.1:3000/health').then(r=>r.text()).then(console.log)"
```
