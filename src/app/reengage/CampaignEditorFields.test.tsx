import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import CampaignEditorFields from "./CampaignEditorFields";

test("campaign editor fields are disabled in read-only mode", () => {
  const markup = renderToStaticMarkup(
    <CampaignEditorFields
      draft={{ title: "June Seminar", subject: "Internal label", message: "Hi {{first_name}}" }}
      onChange={() => assert.fail("read-only campaign copy must not change")}
      posterMimeType={null}
      posterName={null}
      posterPreviewUrl={null}
      readOnly
    />,
  );
  const fields = markup.match(/<(?:input|textarea)\b[^>]*>/g) ?? [];

  assert.equal(fields.length, 3);
  assert.ok(fields.every((field) => /\bdisabled(?:="")?/.test(field)));
});

test("WhatsApp preview always includes the personalized first-name greeting", () => {
  const markup = renderToStaticMarkup(
    <CampaignEditorFields
      draft={{ title: "June Seminar", subject: "Internal label", message: "You're invited." }}
      onChange={() => undefined}
      posterMimeType={null}
      posterName={null}
      posterPreviewUrl={null}
    />,
  );

  assert.match(markup, /Hi Sarah/);
  assert.match(markup, /personalized greeting is added automatically/i);
});

test("WhatsApp copy exposes Ctrl+K without pretending that URLs can be hidden", () => {
  const markup = renderToStaticMarkup(
    <CampaignEditorFields
      draft={{ title: "June Seminar", subject: "Internal label", message: "Reply YES" }}
      onChange={() => undefined}
      posterMimeType={null}
      posterName={null}
      posterPreviewUrl={null}
    />,
  );

  assert.match(markup, /Add link/);
  assert.match(markup, /Ctrl K/);
  assert.match(markup, /WhatsApp keeps the URL visible/);
});
