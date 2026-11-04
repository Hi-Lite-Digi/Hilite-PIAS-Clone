import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AssistantLeadPreview, CampaignAudience, WorkspaceSummary } from "../../lib/api";
import { hasAudienceRules } from "../../lib/campaign";
import { AudiencePanel, LeadChoice } from "./AudiencePanel";
import { failAudienceLoad, finishAudienceLoad, startAudienceLoad } from "./audience-panel-model";
import * as audienceModel from "./audience-panel-model";

const person: AssistantLeadPreview = {
  id: 7,
  name: "Aisha Rahman",
  age: 42,
  age_band: "35-44",
  phone: "+65 9123 4567",
  email: "aisha@example.com",
  topics: ["Investment"],
  status: "Untouched",
};

const audience: CampaignAudience = {
  ageBands: [],
  topics: [],
  statuses: [],
  includedLeadIds: [person.id],
  excludedLeadIds: [],
};

test("lead status is a complete audience rule on its own", () => {
  assert.equal(hasAudienceRules({ ...audience, includedLeadIds: [], statuses: ["Untouched"] }), true);
});

test("audience request states clear stale people and preserve real failure copy", () => {
  const loaded = finishAudienceLoad([person], 1);
  assert.equal(loaded.people.length, 1);

  const loading = startAudienceLoad();
  assert.deepEqual(loading.people, []);
  assert.equal(loading.total, 0);
  assert.equal(loading.loading, true);

  const failed = failAudienceLoad(new Error("Audience service timed out"), "Audience unavailable");
  assert.deepEqual(failed.people, []);
  assert.equal(failed.total, 0);
  assert.equal(failed.loading, false);
  assert.equal(failed.error, "Audience service timed out");
});

test("audience include and exclude actions use touch-sized system icon buttons", () => {
  const markup = renderToStaticMarkup(
    <LeadChoice audience={audience} onModeChange={() => undefined} person={person} />,
  );

  assert.equal((markup.match(/data-slot="icon-button"/g) ?? []).length, 2);
  assert.match(markup, /size-11/);
  assert.match(markup, /md:size-9/);
  assert.match(markup, /aria-label="Include Aisha Rahman"/);
  assert.match(markup, /aria-label="Exclude Aisha Rahman"/);
});

test("read-only audiences disable every rule control and manual action", () => {
  const summary: WorkspaceSummary = {
    total: 2,
    sendable: 2,
    ageBands: { "35-44": 2 },
    statuses: { Untouched: 1, VIP: 1 },
    topics: [{ name: "Investment", count: 2 }],
    assistant: { configured: false, mode: "fallback", model: null, provider: null },
  };
  const readOnlyAudience = { ...audience, statuses: ["VIP"] };
  const panelMarkup = renderToStaticMarkup(
    <AudiencePanel
      audience={readOnlyAudience}
      onChange={() => assert.fail("read-only audience must not emit changes")}
      readOnly
      summary={summary}
    />,
  );
  const ruleControls = panelMarkup.match(/<(?:button|input)\b[^>]*>/g) ?? [];

  assert.ok(ruleControls.length > 0);
  assert.ok(ruleControls.every((control) => /\bdisabled(?:="")?/.test(control)));
  assert.match(panelMarkup, />VIP</);
  assert.doesNotMatch(panelMarkup, /Browse all leads/);

  const choiceMarkup = renderToStaticMarkup(
    <LeadChoice audience={readOnlyAudience} onModeChange={() => assert.fail("read-only lead must not change")} person={person} readOnly />,
  );
  assert.doesNotMatch(choiceMarkup, /data-slot="icon-button"/);
  assert.match(choiceMarkup, />Included</);
});

test("manual lead modes update an immutable optimistic audience selection", () => {
  const setAudienceLeadMode = (audienceModel as typeof audienceModel & {
    setAudienceLeadMode?: (value: CampaignAudience, leadId: number, mode: "include" | "exclude" | "auto") => CampaignAudience;
  }).setAudienceLeadMode;
  assert.equal(typeof setAudienceLeadMode, "function", "audience selection helper must exist");
  if (!setAudienceLeadMode) return;

  const excluded = setAudienceLeadMode(audience, person.id, "exclude");
  assert.deepEqual(excluded.includedLeadIds, []);
  assert.deepEqual(excluded.excludedLeadIds, [person.id]);
  assert.deepEqual(audience.includedLeadIds, [person.id], "the parent audience must not be mutated");

  const automatic = setAudienceLeadMode(excluded, person.id, "auto");
  assert.deepEqual(automatic.includedLeadIds, []);
  assert.deepEqual(automatic.excludedLeadIds, []);
});

test("browse request identity ignores manual picks but changes with audience rules", () => {
  const audienceRuleKey = (audienceModel as typeof audienceModel & {
    audienceRuleKey?: (value: CampaignAudience) => string;
  }).audienceRuleKey;
  assert.equal(typeof audienceRuleKey, "function", "audience rule key helper must exist");
  if (!audienceRuleKey) return;

  assert.equal(
    audienceRuleKey(audience),
    audienceRuleKey({ ...audience, includedLeadIds: [], excludedLeadIds: [99] }),
  );
  assert.notEqual(audienceRuleKey(audience), audienceRuleKey({ ...audience, topics: ["CPF"] }));
});

test("browse drawer renders optimistic picks and does not key its fetch to the whole audience", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/reengage/AudiencePanel.tsx"), "utf8");
  assert.match(source, /\[browseAudience, setBrowseAudience\]/);
  assert.match(source, /audience=\{browseAudience\}/);
  assert.match(source, /onModeChange=\{setBrowseLeadMode\}/);
  assert.match(source, /\[browseOpen, browseRetry, browseRuleKey, browseSearch\]/);
});
