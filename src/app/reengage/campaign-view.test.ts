import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import type { CampaignAudience, CampaignRecord, LeadRecord, ReplyConversationRecord } from "../../lib/api";
import {
  audienceHasManualPicks,
  audienceSummary,
  buildCampaignSectionUpdate,
  campaignAttendanceCount,
  campaignAttendanceTotal,
  campaignProgress,
  campaignReplyCount,
  campaignStatus,
  clearManualPicks,
  getCampaignStatusAction,
  leadMatchesCampaignAudience,
} from "./campaign-view";

const audience: CampaignAudience = {
  ageBands: ["55-65"],
  minAge: null,
  maxAge: null,
  topics: ["Investment", "CPF"],
  statuses: ["Untouched"],
  includedLeadIds: [7],
  excludedLeadIds: [9],
};

const campaign: CampaignRecord = {
  id: "campaign-1",
  title: "June Seminar",
  poster_name: "june.pdf",
  poster_path: "campaigns/june.pdf",
  subject: "June Seminar",
  message: "Hi {{first_name}}",
  audience,
  audience_count: 12,
  status: "sending",
  created_at: "2026-08-20T00:00:00.000Z",
  updated_at: "2026-08-25T00:00:00.000Z",
};

test("campaign statuses map into the Phase 1 status vocabulary", () => {
  assert.equal(campaignStatus("sending"), "running");
  assert.equal(campaignStatus("sent"), "done");
  assert.equal(campaignStatus("queued"), "queued");
});

test("audience summaries are concise and include manual overrides", () => {
  assert.equal(audienceSummary(audience), "55-65 · Investment +1 · Untouched · 1 included · 1 excluded");
});

test("a status-only audience is never described as all eligible leads", () => {
  assert.equal(
    audienceSummary({
      ageBands: [],
      topics: [],
      statuses: ["VIP", "Replied"],
      includedLeadIds: [],
      excludedLeadIds: [],
    }),
    "VIP +1",
  );
});

test("manual picks are detected and can be cleared before a rule change", () => {
  assert.equal(audienceHasManualPicks(audience), true);
  const cleared = clearManualPicks(audience);
  assert.deepEqual(cleared.includedLeadIds, []);
  assert.deepEqual(cleared.excludedLeadIds, []);
  assert.deepEqual(cleared.topics, audience.topics);
});

test("progress provides a deterministic, explicitly inexact preview when delivery totals are unavailable", () => {
  assert.deepEqual(campaignProgress({ ...campaign, status: "sent" }), { sent: 12, total: 12, exact: true });
  const preview = campaignProgress(campaign);
  assert.equal(preview.exact, false);
  assert.equal(typeof preview.sent, "number");
  assert.ok(preview.sent > 0 && preview.sent < 12);
  assert.deepEqual(campaignProgress(campaign), preview);
  assert.deepEqual(campaignProgress({ ...campaign, status: "draft" }), { sent: 0, total: 12, exact: true });
});

test("progress uses exact recipient delivery records even when the saved campaign status is stale", () => {
  assert.deepEqual(
    campaignProgress({ ...campaign, status: "queued", delivery_total: 3, delivery_sent: 3 }),
    { sent: 3, total: 3, exact: true },
  );
  assert.deepEqual(
    campaignProgress({ ...campaign, status: "paused", delivery_total: 3, delivery_sent: 2 }),
    { sent: 2, total: 3, exact: true },
  );
});

test("reply totals do not leak across campaigns that share the same title", () => {
  const threads = [
    { campaignId: campaign.id, campaign: campaign.title },
    { campaignId: "another-campaign", campaign: campaign.title },
    { campaignId: null, campaign: campaign.title },
  ] as ReplyConversationRecord[];
  assert.equal(campaignReplyCount(campaign, threads), 2);
});

test("attendance counts only Interested replies against the exact campaign recipient total", () => {
  const threads = [
    { campaignId: campaign.id, campaign: campaign.title, category: "Interested" },
    { campaignId: campaign.id, campaign: campaign.title, category: "Not Interested" },
    { campaignId: "another-campaign", campaign: campaign.title, category: "Interested" },
  ] as ReplyConversationRecord[];
  assert.equal(campaignAttendanceCount(campaign, threads), 1);
  assert.equal(campaignAttendanceTotal(campaign), 12);
  assert.equal(campaignAttendanceTotal({ ...campaign, delivery_total: 3, delivery_sent: 2 }), 3);
});

test("campaign audience matching includes rule matches and respects manual exclusions", () => {
  const lead: LeadRecord = {
    id: 7,
    source_row: 1,
    name: "Aisha Rahman",
    age: 60,
    age_band: "55-65",
    phone: "+6591234567",
    email: "aisha@example.com",
    dob: null,
    topics: ["CPF"],
    status: "Untouched",
    struck: false,
    subscribed: true,
    unsubscribed_at: null,
    first_captured: null,
    remarks: null,
    source_tabs: null,
  };

  assert.equal(leadMatchesCampaignAudience(lead, { ...audience, includedLeadIds: [], excludedLeadIds: [] }), true);
  assert.equal(leadMatchesCampaignAudience(lead, { ...audience, excludedLeadIds: [7] }), false);
  assert.equal(leadMatchesCampaignAudience({ ...lead, id: 8, age_band: "Below 50" }, { ...audience, includedLeadIds: [8], excludedLeadIds: [] }), true);
});

test("campaign detail saves only the requested editor section", () => {
  const editedDraft = { title: "Edited title", subject: "Edited subject", message: "Edited message" };
  const editedAudience = { ...audience, topics: ["Estate planning"] };

  assert.deepEqual(
    buildCampaignSectionUpdate("message", campaign, editedDraft, editedAudience, {
      posterName: "replacement.pdf",
      posterPath: "campaigns/replacement.pdf",
    }),
    {
      ...editedDraft,
      audience: campaign.audience,
      posterName: "replacement.pdf",
      posterPath: "campaigns/replacement.pdf",
    },
  );
  assert.deepEqual(
    buildCampaignSectionUpdate("audience", campaign, editedDraft, editedAudience, {
      posterName: "replacement.pdf",
      posterPath: "campaigns/replacement.pdf",
    }),
    {
      title: campaign.title,
      subject: campaign.subject,
      message: campaign.message,
      audience: editedAudience,
      posterName: campaign.poster_name,
      posterPath: campaign.poster_path,
    },
  );
});

test("campaign status actions distinguish queue, resume, and pause copy", () => {
  assert.deepEqual(getCampaignStatusAction("draft"), {
    operation: "queue",
    label: "Approve & queue",
    successText: "is queued.",
    failureTitle: "Campaign could not be queued",
  });
  assert.equal(getCampaignStatusAction("paused").failureTitle, "Campaign could not be resumed");
  assert.equal(getCampaignStatusAction("sending").failureTitle, "Campaign could not be paused");
});

test("campaign replies request includes both campaign id and legacy title, without an id-only fetch", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/reengage/CampaignDetailPage.tsx"), "utf8");
  assert.match(source, /getThreads\(id,\s*campaign\.title\)/);
  assert.doesNotMatch(source, /getThreads\(id\)/);
  assert.match(source, /campaign\.id !== id/);
  assert.match(source, /const replyRequest = useRef\(0\)/);
  assert.match(source, /request !== replyRequest\.current/);
});

test("campaign detail wires section-specific saves and a system queue confirmation", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/reengage/CampaignDetailPage.tsx"), "utf8");
  assert.match(source, /persist\("message"\)/);
  assert.match(source, /persist\("audience"\)/);
  assert.match(source, /statusConfirmOpen/);
  assert.match(source, /Approve and queue this campaign\?/);
});
