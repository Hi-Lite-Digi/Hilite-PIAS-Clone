#!/usr/bin/env bash
set -Eeuo pipefail

# Keeps the Hermes WhatsApp gateway healthy inside the existing HiHunt Docker
# container. Hermes images that already use s6 keep that single supervisor;
# older images fall back to a host-level systemd service. The relay remains the
# only public service and the bridge stays on 127.0.0.1:3000 in the container.

CONTAINER="${HERMES_CONTAINER:-hihunt-hermes-gateway}"
SERVICE_NAME="hihunt-hermes-whatsapp"
RUNNER_PATH="/usr/local/sbin/hihunt-hermes-gateway-run"
CHECK_PATH="/usr/local/sbin/hihunt-hermes-gateway-check"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
CHECK_SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}-check.service"
TIMER_PATH="/etc/systemd/system/${SERVICE_NAME}-check.timer"
GATEWAY_UID="${HERMES_GATEWAY_UID:-10000}"
GATEWAY_GID="${HERMES_GATEWAY_GID:-10000}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

if [[ "${EUID}" -ne 0 ]]; then
  fail "Run this installer as root on the DigitalOcean Droplet."
fi

DOCKER_BIN="$(command -v docker || true)"
SYSTEMCTL_BIN="$(command -v systemctl || true)"
[[ -n "${DOCKER_BIN}" ]] || fail "Docker is not installed."
[[ -n "${SYSTEMCTL_BIN}" ]] || fail "systemd is not available."
[[ "$(${DOCKER_BIN} inspect -f '{{.State.Running}}' "${CONTAINER}" 2>/dev/null || true)" == "true" ]] \
  || fail "Container ${CONTAINER} is not running."

# Recent Hermes Docker images supervise the gateway with s6. Starting another
# dispatcher from host systemd would leave two processes writing to the same
# profile database. Detect the container supervisor before installing anything.
SUPERVISOR_MODE="host-systemd"
gateway_status="$(${DOCKER_BIN} exec --user "${GATEWAY_UID}:${GATEWAY_GID}" \
  "${CONTAINER}" hermes gateway status 2>&1 || true)"
if [[ "${gateway_status}" == *"container supervisor"* || "${gateway_status}" == *"s6"* ]] \
  || ${DOCKER_BIN} exec "${CONTAINER}" sh -lc '
    test -d /run/service ||
    test -d /etc/s6-overlay/s6-rc.d ||
    command -v s6-svstat >/dev/null 2>&1
  ' >/dev/null 2>&1; then
  SUPERVISOR_MODE="s6"
fi

# Validate the pairing output before stopping a currently healthy gateway. The
# affected Hermes versions only check that creds.json exists, so a zero-byte or
# incomplete file can otherwise be mistaken for a successful pairing.
if ! ${DOCKER_BIN} exec --user 0:0 "${CONTAINER}" sh -lc '
  set -eu
  creds="${HERMES_HOME:-/opt/data}/whatsapp/session/creds.json"
  test -s "${creds}"
  python3 -c "import json,sys; data=json.load(open(sys.argv[1])); assert data.get(\"noiseKey\") and data.get(\"signedIdentityKey\")" \
    "${creds}"
' >/dev/null 2>&1; then
  fail "The canonical WhatsApp credentials are missing or invalid. Re-pair with hermes whatsapp and let it finish normally."
fi

# Clean up the previous installer version, which tried to launch a second
# gateway even when s6 was already supervising the container.
${SYSTEMCTL_BIN} disable --now "${SERVICE_NAME}.service" >/dev/null 2>&1 || true
rm -f "${SERVICE_PATH}"
${SYSTEMCTL_BIN} daemon-reload
${SYSTEMCTL_BIN} reset-failed "${SERVICE_NAME}.service" >/dev/null 2>&1 || true

# Stop the one legitimate gateway before replacing authentication state. This
# prevents its bridge from writing old keys back while the newly paired session
# is being synchronized. `gateway stop` is routed to s6 in current containers.
if [[ "${SUPERVISOR_MODE}" == "s6" ]]; then
  ${DOCKER_BIN} exec --user "${GATEWAY_UID}:${GATEWAY_GID}" \
    "${CONTAINER}" hermes gateway stop >/dev/null 2>&1 || true
fi

# The pairing wizard writes the canonical session here. Mirror it to the
# profile-aware location used by newer Hermes gateway releases so upgrades do
# not silently fall back to an old account. Replace each compatibility folder
# rather than merging it: stale Baileys keys from a revoked account can
# immediately invalidate an otherwise successful new QR pairing.
${DOCKER_BIN} exec --user 0:0 "${CONTAINER}" sh -lc '
  set -eu
  hermes_home="${HERMES_HOME:-/opt/data}"
  source_dir="${hermes_home}/whatsapp/session"
  test -s "${source_dir}/creds.json" || {
    echo "Missing or empty ${source_dir}/creds.json; run hermes whatsapp first." >&2
    exit 1
  }
  stamp="$(date +%Y%m%d-%H%M%S)-$$"
  for destination in \
    "${hermes_home}/platforms/whatsapp/session" \
    "${hermes_home}/.hermes/whatsapp/session" \
    "${hermes_home}/.hermes/platforms/whatsapp/session"
  do
    parent="$(dirname "${destination}")"
    staging="${destination}.new-${stamp}"
    backup="${destination}.backup-${stamp}"
    mkdir -p "${parent}" "${staging}"
    cp -a "${source_dir}/." "${staging}/"
    if [ -e "${destination}" ] || [ -L "${destination}" ]; then
      mv "${destination}" "${backup}"
      chmod -R go-rwx "${backup}"
    else
      backup="none"
    fi
    mv "${staging}" "${destination}"
    printf "Replaced %s (previous session: %s)\n" "${destination}" "${backup}"
  done
  env_file="${hermes_home}/.env"
  touch "${env_file}"
  set_value() {
    key="$1"
    value="$2"
    temporary="${env_file}.tmp"
    grep -v "^${key}=" "${env_file}" > "${temporary}" || true
    printf "%s=%s\n" "${key}" "${value}" >> "${temporary}"
    mv "${temporary}" "${env_file}"
  }
  set_value WHATSAPP_ENABLED true
  set_value WHATSAPP_MODE bot
  set_value WHATSAPP_ALLOWED_USERS "*"
  chown -R 10000:10000 \
    "${hermes_home}/whatsapp" \
    "${hermes_home}/platforms/whatsapp" \
    "${hermes_home}/.hermes/whatsapp" \
    "${hermes_home}/.hermes/platforms/whatsapp" \
    "${env_file}"
  chmod 700 \
    "${source_dir}" \
    "${hermes_home}/platforms/whatsapp/session" \
    "${hermes_home}/.hermes/whatsapp/session" \
    "${hermes_home}/.hermes/platforms/whatsapp/session"
  chmod 600 \
    "${env_file}" \
    "${source_dir}/creds.json" \
    "${hermes_home}/platforms/whatsapp/session/creds.json" \
    "${hermes_home}/.hermes/whatsapp/session/creds.json" \
    "${hermes_home}/.hermes/platforms/whatsapp/session/creds.json"
'

cat > "${RUNNER_PATH}" <<'RUNNER'
#!/usr/bin/env bash
set -Eeuo pipefail
container="${HERMES_CONTAINER:-hihunt-hermes-gateway}"
docker_bin="$(command -v docker)"
gateway_user="${HERMES_GATEWAY_UID:-10000}:${HERMES_GATEWAY_GID:-10000}"

[[ "$(${docker_bin} inspect -f '{{.State.Running}}' "${container}" 2>/dev/null || true)" == "true" ]]

arguments=(gateway run --replace)
if ${docker_bin} exec --user "${gateway_user}" "${container}" \
  hermes gateway run --help 2>&1 | grep -q -- '--no-supervise'; then
  arguments+=(--no-supervise)
fi

exec ${docker_bin} exec --user "${gateway_user}" "${container}" hermes "${arguments[@]}"
RUNNER

cat > "${CHECK_PATH}" <<'CHECKER'
#!/usr/bin/env bash
set -Eeuo pipefail
container="${HERMES_CONTAINER:-hihunt-hermes-gateway}"
docker_bin="$(command -v docker)"
service_name="${HERMES_SERVICE_NAME:-hihunt-hermes-whatsapp.service}"
supervisor_mode="${HERMES_SUPERVISOR_MODE:-host-systemd}"
gateway_user="${HERMES_GATEWAY_UID:-10000}:${HERMES_GATEWAY_GID:-10000}"

if ! ${docker_bin} exec "${container}" node -e '
  fetch("http://127.0.0.1:3000/health", { signal: AbortSignal.timeout(5000) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`health returned ${response.status}`);
      const payload = await response.json();
      console.log(JSON.stringify({ status: payload.status || "unknown" }));
    })
    .catch((error) => { console.error(error.message); process.exit(1); });
'; then
  if [[ "${supervisor_mode}" == "s6" ]]; then
    logger -t hihunt-hermes "WhatsApp bridge health check failed; restarting the s6-supervised gateway"
    ${docker_bin} exec --user "${gateway_user}" "${container}" hermes gateway restart
  else
    logger -t hihunt-hermes "WhatsApp bridge health check failed; restarting ${service_name}"
    systemctl restart "${service_name}"
  fi
fi
CHECKER

chmod 0755 "${RUNNER_PATH}" "${CHECK_PATH}"

if [[ "${SUPERVISOR_MODE}" == "host-systemd" ]]; then
  cat > "${SERVICE_PATH}" <<SERVICE
[Unit]
Description=HiHunt Hermes WhatsApp gateway
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=HERMES_CONTAINER=${CONTAINER}
Environment=HERMES_GATEWAY_UID=${GATEWAY_UID}
Environment=HERMES_GATEWAY_GID=${GATEWAY_GID}
ExecStart=${RUNNER_PATH}
Restart=always
RestartSec=5
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
SERVICE

  CHECK_AFTER="${SERVICE_NAME}.service"
else
  rm -f "${RUNNER_PATH}"
  CHECK_AFTER="docker.service"
fi

cat > "${CHECK_SERVICE_PATH}" <<SERVICE
[Unit]
Description=Check the HiHunt Hermes WhatsApp bridge
After=${CHECK_AFTER}

[Service]
Type=oneshot
Environment=HERMES_CONTAINER=${CONTAINER}
Environment=HERMES_SERVICE_NAME=${SERVICE_NAME}.service
Environment=HERMES_SUPERVISOR_MODE=${SUPERVISOR_MODE}
Environment=HERMES_GATEWAY_UID=${GATEWAY_UID}
Environment=HERMES_GATEWAY_GID=${GATEWAY_GID}
ExecStart=${CHECK_PATH}
SERVICE

cat > "${TIMER_PATH}" <<TIMER
[Unit]
Description=Monitor the HiHunt Hermes WhatsApp bridge

[Timer]
OnBootSec=45s
OnUnitActiveSec=60s
AccuracySec=5s
Unit=${SERVICE_NAME}-check.service

[Install]
WantedBy=timers.target
TIMER

${SYSTEMCTL_BIN} daemon-reload
if [[ "${SUPERVISOR_MODE}" == "s6" ]]; then
  ${DOCKER_BIN} exec --user "${GATEWAY_UID}:${GATEWAY_GID}" \
    "${CONTAINER}" hermes gateway start
  ${SYSTEMCTL_BIN} enable --now "${SERVICE_NAME}-check.timer"
else
  ${SYSTEMCTL_BIN} enable --now "${SERVICE_NAME}.service" "${SERVICE_NAME}-check.timer"
fi

health=""
for _ in $(seq 1 15); do
  if health="$(${DOCKER_BIN} exec "${CONTAINER}" node -e '
    fetch("http://127.0.0.1:3000/health", { signal: AbortSignal.timeout(3000) })
      .then(async (response) => {
        if (!response.ok) throw new Error(`health returned ${response.status}`);
        console.log(JSON.stringify(await response.json()));
      })
      .catch(() => process.exit(1));
  ' 2>/dev/null)"; then
    break
  fi
  sleep 2
done

if [[ -z "${health}" ]]; then
  if [[ "${SUPERVISOR_MODE}" == "s6" ]]; then
    ${DOCKER_BIN} exec --user "${GATEWAY_UID}:${GATEWAY_GID}" \
      "${CONTAINER}" hermes gateway status || true
  else
    ${SYSTEMCTL_BIN} status "${SERVICE_NAME}.service" --no-pager || true
    journalctl -u "${SERVICE_NAME}.service" -n 80 --no-pager || true
  fi
  fail "The ${SUPERVISOR_MODE} gateway was restarted, but the WhatsApp bridge did not open port 3000."
fi

printf 'Hermes WhatsApp supervision ready (%s). Bridge health: %s\n' \
  "${SUPERVISOR_MODE}" "${health}"
if [[ "${health}" != *'"status":"connected"'* ]]; then
  printf 'The bridge is running but WhatsApp is disconnected. Re-pair once with: docker exec -it --user %s:%s %s hermes whatsapp\n' \
    "${GATEWAY_UID}" "${GATEWAY_GID}" "${CONTAINER}"
fi
