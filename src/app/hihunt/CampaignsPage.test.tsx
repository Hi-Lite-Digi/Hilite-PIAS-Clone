import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.join(process.cwd(), "src/app/hihunt/CampaignsPage.tsx"), "utf8");

test("Hi-Hunt campaigns mirror the five-step campaign flow and keep a human-approved Gmail send", () => {
  assert.match(source, /getHRCampaigns/);
  assert.match(source, /createHRCampaign/);
  assert.match(source, /sendHRCampaign/);
  assert.match(source, /Poster/);
  assert.match(source, /Delivery/);
  assert.match(source, /Message/);
  assert.match(source, /Audience/);
  assert.match(source, /Review/);
  assert.match(source, /ConfirmDialog/);
  assert.match(source, /Send this Hi-Hunt campaign now\?/);
});

test("a lead deep link preselects the contact and every campaign explains Gmail-native unsubscribe handling", () => {
  assert.match(source, /get\("prospectId"\)/);
  assert.match(source, /new Set\(preselectedId \? \[preselectedId\] : \[\]\)/);
  assert.match(source, /native unsubscribe control/);
  assert.doesNotMatch(source, />Unsubscribe<\/p>/);
  assert.match(source, /status !== "suppressed"/);
  assert.match(source, /hasSendableHRWorkEmail\(prospect\)/);
});

test("campaign rows reopen drafts for editing and let completed campaigns be duplicated", () => {
  assert.match(source, /getHRCampaign\(campaignId\)/);
  assert.match(source, /updateHRCampaign\(savedCampaign\.id, input\)/);
  assert.match(source, /savedCampaign\.status !== "draft"/);
  assert.match(source, /disabled=\{locked\}/);
  assert.match(source, /campaignEditorHref\(campaign\.id\)/);
  assert.match(source, /duplicateCampaign/);
  assert.match(source, /Campaign duplicated as an editable draft/);
  assert.match(source, /recipientIds: source\.recipient_ids/);
  assert.match(source, /posterPath: source\.poster_path/);
  assert.match(source, /Duplicate/);
  assert.match(source, /onRowClick=\{\(campaign\) => navigate\(campaignEditorHref\(campaign\.id\)\)\}/);
  assert.match(source, /ready to retry/);
});

test("Hi-Hunt campaign attachments and deletion stay in the email-only campaign path", () => {
  assert.match(source, /getPosterUploadTicket/);
  assert.match(source, /uploadPosterFile/);
  assert.match(source, /analyzeHRPoster/);
  assert.match(source, /Reading poster and preparing the email/);
  assert.match(source, /AI-filled poster template/);
  assert.match(source, /Regenerate from poster/);
  assert.match(source, /fillEmailFromPoster/);
  assert.match(source, /setSubject\(result\.draft\.subject\)/);
  assert.match(source, /setBody\(result\.draft\.body\)/);
  assert.match(source, /attached to every email/);
  assert.match(source, /deleteHRCampaign/);
  assert.match(source, /sent only through the connected Gmail account/);
  assert.doesNotMatch(source, /sendCampaignWhatsApp|sendWhatsAppMessage|getWhatsAppStatus/);
});

test("Hi-Hunt email copy supports Ctrl+K linked words with a rich preview", () => {
  assert.match(source, /event\.key\.toLowerCase\(\) === "k"/);
  assert.match(source, /openLinkEditor/);
  assert.match(source, /insertEmailLink/);
  assert.match(source, /renderEmailLinks/);
  assert.match(source, /Select words such as YES/);
});
