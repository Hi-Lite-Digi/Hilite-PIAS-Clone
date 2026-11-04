from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


PLUGIN_PATH = Path(__file__).parent / "hihunt-inbox" / "__init__.py"
SPEC = importlib.util.spec_from_file_location("hihunt_inbox_plugin", PLUGIN_PATH)
assert SPEC and SPEC.loader
PLUGIN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PLUGIN)


def whatsapp_event(
    text: str = "hello",
    *,
    from_owner: bool = False,
    media_path: str | None = None,
    media_type: str = "image/webp",
) -> dict:
    event = {
        "source": {
            "platform": "whatsapp",
            "chat_type": "dm",
            "user_id": "6581234567@s.whatsapp.net",
            "chat_id": "6581234567@s.whatsapp.net",
            "user_name": "New contact",
        },
        "metadata": {"whatsapp_from_owner": from_owner},
        "message_id": "message-1",
        "text": text,
        "raw_message": {"mediaType": "sticker" if media_path else "text"},
    }
    if media_path:
        event["media_urls"] = [media_path]
        event["media_types"] = [media_type]
        event["message_type"] = "photo"
    return event


class HiHuntInboxPluginTests(unittest.TestCase):
    def test_forwards_an_unknown_number_and_skips_agent_dispatch(self) -> None:
        with patch.object(PLUGIN, "_post_to_hihunt") as post:
            directive = PLUGIN._forward_whatsapp(whatsapp_event())

        post.assert_called_once()
        payload = post.call_args.args[0]
        self.assertEqual(payload["sender"]["phone"], "6581234567")
        self.assertEqual(directive, {"action": "skip", "reason": "hihunt-inbox"})

    def test_forwards_slash_text_instead_of_exposing_hermes_commands(self) -> None:
        with patch.object(PLUGIN, "_post_to_hihunt") as post:
            directive = PLUGIN._forward_whatsapp(whatsapp_event("/status"))

        post.assert_called_once()
        self.assertEqual(post.call_args.args[0]["text"], "/status")
        self.assertEqual(directive, {"action": "skip", "reason": "hihunt-inbox"})

    def test_does_not_forward_messages_typed_by_the_linked_owner(self) -> None:
        with patch.object(PLUGIN, "_post_to_hihunt") as post:
            directive = PLUGIN._forward_whatsapp(whatsapp_event(from_owner=True))

        post.assert_not_called()
        self.assertEqual(directive, {"action": "skip", "reason": "hihunt-owner-message"})

    def test_uploads_a_cached_sticker_before_forwarding_its_private_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            media_path = Path(directory) / "sticker.webp"
            media_path.write_bytes(b"RIFF\x04\x00\x00\x00WEBP")
            posted_payloads = []

            def post(payload):
                posted_payloads.append(payload)
                if payload.get("action") == "media-upload-ticket":
                    return {
                        "uploadUrl": "https://storage.example.test/signed-upload",
                        "path": "inbound/11111111-1111-4111-8111-111111111111.webp",
                    }
                return {}

            with (
                patch.object(PLUGIN, "_post_to_hihunt", side_effect=post),
                patch.object(PLUGIN, "_upload_media") as upload,
            ):
                directive = PLUGIN._forward_whatsapp(
                    whatsapp_event("", media_path=str(media_path))
                )

        self.assertEqual(directive, {"action": "skip", "reason": "hihunt-inbox"})
        upload.assert_called_once()
        self.assertEqual(posted_payloads[0]["media"]["kind"], "sticker")
        self.assertEqual(posted_payloads[1]["media"], {
            "kind": "sticker",
            "name": "sticker.webp",
            "mimeType": "image/webp",
            "path": "inbound/11111111-1111-4111-8111-111111111111.webp",
            "bytes": 12,
        })


if __name__ == "__main__":
    unittest.main()
