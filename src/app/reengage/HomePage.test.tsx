import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import type { CampaignRecord, ReplyConversationRecord } from "../../lib/api";
import CampaignBentoGrid from "./CampaignBentoGrid";
import HomePage, * as homePageModule from "./HomePage";

const campaign: CampaignRecord = {
  id: "campaign-1",
  title: "Welcome back",
  poster_name: null,
  poster_path: null,
  subject: "",
  message: "Hello",
  audience: { ageBands: [], statuses: [], topics: [] },
  audience_count: 18,
  status: "sending",
  created_at: "2026-08-20T00:00:00.000Z",
  updated_at: "2026-08-26T00:00:00.000Z",
};

const reply: ReplyConversationRecord = {
  id: 1,
  leadId: 1,
  campaignId: "campaign-1",
  leadName: "Avery Tan",
  initials: "AT",
  color: "",
  company: "",
  title: "",
  email: "avery@example.com",
  phone: "+65 8123 4567",
  campaign: "Welcome back",
  subject: "",
  preview: "Interested",
  occurredAt: "2026-08-26T00:00:00.000Z",
  read: false,
  starred: false,
  category: "Interested",
  thread: [],
};

test("home exposes the approved header actions", () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/reengage">
      <HomePage />
    </StaticRouter>,
  );

  assert.match(markup, />Home</);
  assert.match(markup, /href="\/reengage\/campaigns\/new"/);
  assert.match(markup, /href="\/reengage\/leads\?action=import"/);
  assert.match(markup, /href="\/reengage\/leads\?action=add"/);
  assert.match(markup, />Today&#x27;s batch</);
});

test("campaign bento links to detail and labels modelled performance", () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/reengage">
      <CampaignBentoGrid campaigns={[campaign]} replies={[reply]} />
    </StaticRouter>,
  );

  assert.match(markup, /href="\/reengage\/campaigns\/campaign-1"/);
  assert.match(markup, />Welcome back</);
  assert.match(markup, />Sample performance</);
  assert.match(markup, />Interested</);
});

test("reply donut config uses every category name as a distinct token-colour key", () => {
  const config = (homePageModule as unknown as {
    replyChartConfig?: Record<string, { color?: string; label?: string }>;
  }).replyChartConfig;
  const categories = [
    "Interested",
    "Question",
    "Follow-up",
    "Not Interested",
    "Out of Office",
    "Unsubscribe",
  ];

  assert.ok(config);
  assert.deepEqual(Object.keys(config), categories);
  assert.deepEqual(Object.values(config).map((entry) => entry.label), categories);
  assert.equal(new Set(Object.values(config).map((entry) => entry.color)).size, categories.length);
  assert.ok(Object.values(config).every((entry) => /^var\(--[a-z0-9-]+\)$/.test(entry.color ?? "")));
});
