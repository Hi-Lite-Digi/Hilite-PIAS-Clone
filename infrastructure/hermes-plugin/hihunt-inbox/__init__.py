"""Route customer WhatsApp replies into HiHunt before Hermes dispatches them."""

from __future__ import annotations

import json
import mimetypes
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen


_SPOOL_PATH = Path("/opt/data/hihunt-inbox-spool.ndjson")
_WHATSAPP_SESSION_PATH = Path(
    os.environ.get("WHATSAPP_SESSION_DIR", "/opt/data/whatsapp/session")
)
_MAX_INBOUND_IMAGE_BYTES = 20 * 1024 * 1024
_INBOUND_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


def _value(obj, name, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _normalized_name(value, default=""):
    """Normalize strings and Enum-like Hermes values to a lowercase name."""
    raw_value = _value(value, "value", value)
    if raw_value is None:
        raw_value = default
    return str(raw_value).strip().lower()


def _phone_from_whatsapp_id(value):
    """Return a phone number from a PN JID, but never mistake a LID for one."""
    candidate = str(value or "").strip().lower()
    if not candidate or candidate.endswith("@lid") or candidate.endswith("@g.us"):
        return ""
    local_part = candidate.split("@", 1)[0].split(":", 1)[0]
    digits = "".join(character for character in local_part if character.isdigit())
    return digits if 8 <= len(digits) <= 15 else ""


def _phone_from_lid(value):
    """Resolve the private WhatsApp LID using Baileys' persisted reverse map."""
    candidate = str(value or "").strip().lower()
    if not candidate.endswith("@lid"):
        return ""
    lid = candidate.split("@", 1)[0].split(":", 1)[0]
    if not lid.isdigit():
        return ""

    # Older Baileys sessions may include a direct reverse lookup file.
    mapping_path = _WHATSAPP_SESSION_PATH / f"lid-mapping-{lid}_reverse.json"
    try:
        mapped = json.loads(mapping_path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        mapped = ""
    digits = "".join(character for character in str(mapped) if character.isdigit())
    if 8 <= len(digits) <= 15:
        return digits

    # Current Baileys sessions persist one forward map per phone number, for
    # example lid-mapping-6589994751.json whose value is the private LID.
    try:
        mapping_paths = _WHATSAPP_SESSION_PATH.glob("lid-mapping-*.json")
        for candidate_path in mapping_paths:
            if candidate_path.name.endswith("_reverse.json"):
                continue
            try:
                mapped_lid = json.loads(candidate_path.read_text(encoding="utf-8"))
            except (OSError, ValueError, TypeError):
                continue
            mapped_lid_digits = "".join(
                character for character in str(mapped_lid) if character.isdigit()
            )
            if mapped_lid_digits != lid:
                continue
            phone = candidate_path.stem.removeprefix("lid-mapping-")
            phone_digits = "".join(character for character in phone if character.isdigit())
            if 8 <= len(phone_digits) <= 15:
                return phone_digits
    except OSError:
        pass
    return ""


def _resolve_sender_phone(source, raw):
    candidates = (
        _value(raw, "senderPn"),
        _value(raw, "participantPn"),
        _value(raw, "remoteJidAlt"),
        _value(raw, "senderAlt"),
        _value(source, "user_id"),
        _value(source, "chat_id"),
        _value(raw, "senderId"),
        _value(raw, "chatId"),
    )
    for candidate in candidates:
        phone = _phone_from_whatsapp_id(candidate)
        if phone:
            return phone
    for candidate in candidates:
        phone = _phone_from_lid(candidate)
        if phone:
            return phone
    return ""


def _write_spool(payload, error):
    """Keep a recoverable record if HiHunt is temporarily unavailable."""
    record = {
        "payload": payload,
        "error": str(error),
        "spooledAt": datetime.now(timezone.utc).isoformat(),
    }
    try:
        _SPOOL_PATH.parent.mkdir(parents=True, exist_ok=True)
        with _SPOOL_PATH.open("a", encoding="utf-8") as spool:
            spool.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError as spool_error:
        print(f"[hihunt-inbox] Could not write spool: {spool_error}", flush=True)


def _post_to_hihunt(payload):
    endpoint = os.environ.get("HIHUNT_INBOUND_URL", "").strip()
    secret = os.environ.get("HIHUNT_INBOUND_SECRET", "").strip()
    if not endpoint or not secret:
        raise RuntimeError("HIHUNT_INBOUND_URL or HIHUNT_INBOUND_SECRET is missing")

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    last_error = None
    for attempt in range(3):
        request = Request(
            endpoint,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {secret}",
                "Content-Type": "application/json",
                "User-Agent": "hihunt-hermes-inbox/1.0",
            },
        )
        try:
            with urlopen(request, timeout=12) as response:
                if 200 <= response.status < 300:
                    response_body = response.read().decode("utf-8", errors="replace").strip()
                    return json.loads(response_body) if response_body else {}
                last_error = RuntimeError(f"HiHunt returned HTTP {response.status}")
        except (HTTPError, URLError, TimeoutError, OSError) as error:
            last_error = error
        if attempt < 2:
            time.sleep(0.4 * (attempt + 1))

    raise RuntimeError(f"HiHunt delivery failed: {last_error}")


def _local_media_path(value):
    """Resolve the local cache path supplied by Hermes without fetching URLs."""
    raw_value = str(value or "").strip()
    if not raw_value:
        return None
    parsed = urlparse(raw_value)
    if parsed.scheme == "file":
        if parsed.netloc not in {"", "localhost"}:
            return None
        raw_value = unquote(parsed.path)
    elif len(parsed.scheme) == 1 and len(raw_value) >= 3 and raw_value[1] == ":" and raw_value[2] in {"/", "\\"}:
        pass
    elif parsed.scheme:
        return None
    try:
        media_path = Path(raw_value).expanduser().resolve(strict=True)
    except (OSError, RuntimeError, ValueError):
        return None
    return media_path if media_path.is_file() else None


def _looks_like_image(data):
    return (
        data.startswith(b"\x89PNG\r\n\x1a\n")
        or data.startswith(b"\xff\xd8\xff")
        or data.startswith((b"GIF87a", b"GIF89a"))
        or (data.startswith(b"RIFF") and len(data) >= 12 and data[8:12] == b"WEBP")
    )


def _multipart_image_body(data, filename, mime_type):
    boundary = f"hihunt-{uuid.uuid4().hex}"
    safe_name = str(filename or "whatsapp-image").replace('"', "").replace("\r", "").replace("\n", "")
    prefix = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="cacheControl"\r\n\r\n'
        f"3600\r\n--{boundary}\r\n"
        f'Content-Disposition: form-data; name=""; filename="{safe_name}"\r\n'
        f"Content-Type: {mime_type}\r\n\r\n"
    ).encode("utf-8")
    suffix = f"\r\n--{boundary}--\r\n".encode("ascii")
    return boundary, prefix + data + suffix


def _upload_media(upload_url, data, filename, mime_type):
    boundary, body = _multipart_image_body(data, filename, mime_type)
    request = Request(
        upload_url,
        data=body,
        method="PUT",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "User-Agent": "hihunt-hermes-inbox/1.0",
            "x-upsert": "false",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            if 200 <= response.status < 300:
                return
            raise RuntimeError(f"Media storage returned HTTP {response.status}")
    except (HTTPError, URLError, TimeoutError, OSError) as error:
        raise RuntimeError(f"Media upload failed: {error}") from error


def _stage_inbound_media(event, raw, message_id):
    media_urls = _value(event, "media_urls", []) or []
    media_types = _value(event, "media_types", []) or []
    if isinstance(media_urls, str):
        media_urls = [media_urls]
    if isinstance(media_types, str):
        media_types = [media_types]
    if not media_urls:
        return None

    media_path = _local_media_path(media_urls[0])
    if not media_path:
        raise RuntimeError("Hermes did not provide a readable local media file")
    bytes_count = media_path.stat().st_size
    if bytes_count <= 0 or bytes_count > _MAX_INBOUND_IMAGE_BYTES:
        raise RuntimeError("The WhatsApp image must be between 1 byte and 20 MB")

    supplied_type = str(media_types[0] if media_types else "").split(";", 1)[0].strip().lower()
    guessed_type = str(mimetypes.guess_type(media_path.name)[0] or "").lower()
    mime_type = supplied_type if supplied_type in _INBOUND_IMAGE_TYPES else guessed_type
    if mime_type not in _INBOUND_IMAGE_TYPES:
        raise RuntimeError("Only WhatsApp PNG, JPG, WebP, and GIF media can be previewed")
    data = media_path.read_bytes()
    if not _looks_like_image(data):
        raise RuntimeError("Hermes media did not contain a valid supported image")

    raw_type = _normalized_name(
        _value(raw, "mediaType", "") or _value(raw, "type", "") or _value(event, "message_type", "")
    )
    media_kind = "sticker" if "sticker" in raw_type else "image"
    filename = media_path.name or ("whatsapp-sticker.webp" if media_kind == "sticker" else "whatsapp-image")
    ticket = _post_to_hihunt({
        "action": "media-upload-ticket",
        "platform": "whatsapp",
        "messageId": message_id,
        "media": {
            "kind": media_kind,
            "name": filename,
            "mimeType": mime_type,
            "bytes": bytes_count,
        },
    })
    upload_url = str(_value(ticket, "uploadUrl", "") or "").strip()
    storage_path = str(_value(ticket, "path", "") or "").strip()
    if not upload_url or not storage_path:
        raise RuntimeError("HiHunt did not return a media upload ticket")
    _upload_media(upload_url, data, filename, mime_type)
    return {
        "kind": media_kind,
        "name": filename,
        "mimeType": mime_type,
        "path": storage_path,
        "bytes": bytes_count,
    }


def _forward_whatsapp(event, **kwargs):
    del kwargs
    source = _value(event, "source")
    if _normalized_name(_value(source, "platform", "")) != "whatsapp":
        return None

    metadata = _value(event, "metadata", {}) or {}
    raw = _value(event, "raw_message", {}) or {}

    # Messages typed by the linked WhatsApp owner are outbound activity, not replies.
    if bool(_value(metadata, "whatsapp_from_owner", False)) or bool(_value(raw, "fromOwner", False)):
        return {"action": "skip", "reason": "hihunt-owner-message"}

    text = str(_value(event, "text", "") or "").strip()

    # The HiHunt inbox only accepts one-to-one customer conversations.
    if _normalized_name(_value(source, "chat_type", "dm"), "dm") != "dm":
        return {"action": "skip", "reason": "hihunt-group-message"}

    message_id = str(_value(event, "message_id", "") or _value(raw, "messageId", "") or "").strip()
    sender_phone = _resolve_sender_phone(source, raw)
    payload = {
        "platform": "whatsapp",
        "messageId": message_id,
        "text": text,
        "receivedAt": datetime.now(timezone.utc).isoformat(),
        "mediaType": str(_value(raw, "mediaType", "") or _value(raw, "type", "") or "text"),
        "sender": {
            "userId": str(_value(source, "user_id", "") or _value(raw, "senderId", "") or ""),
            "chatId": str(_value(source, "chat_id", "") or _value(raw, "chatId", "") or ""),
            "name": str(_value(source, "user_name", "") or _value(raw, "senderName", "") or ""),
            "phone": sender_phone,
        },
        "raw": {
            "isGroup": bool(_value(raw, "isGroup", False)),
            "hasMedia": bool(_value(raw, "hasMedia", False)),
            "quotedMessageId": _value(raw, "quotedMessageId"),
        },
    }

    try:
        media = _stage_inbound_media(event, raw, message_id)
        if media:
            payload["media"] = media
        _post_to_hihunt(payload)
        print(f"[hihunt-inbox] Forwarded WhatsApp reply {message_id or '(no id)'}", flush=True)
    except Exception as error:  # Fail closed: never let a customer reply reach the AI agent.
        _write_spool(payload, error)
        print(f"[hihunt-inbox] Forward failed and was spooled: {error}", flush=True)

    return {"action": "skip", "reason": "hihunt-inbox"}


def register(ctx):
    ctx.register_hook("pre_gateway_dispatch", _forward_whatsapp)
