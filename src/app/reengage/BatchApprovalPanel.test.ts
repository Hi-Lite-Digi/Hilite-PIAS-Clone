import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { SendQueueItem } from "../../lib/stubs";
import * as homeModel from "./home-model";

function queueItem(overrides: Partial<SendQueueItem> = {}): SendQueueItem {
  return {
    recipientId: "recipient-1",
    campaignId: "campaign-1",
    campaignTitle: "Welcome back",
    leadId: 1,
    name: "Avery Tan",
    phone: "+65 8123 4567",
    ageBand: "35-44",
    queuedAt: "2026-08-26T02:00:00.000Z",
    message: "Hi Avery, we would love to reconnect.",
    ...overrides,
  };
}

test("a partial approval update completes only returned ids and keeps the remainder retryable", () => {
  const items = [queueItem(), queueItem({ recipientId: "recipient-2", leadId: 2 })];
  const getBatchApprovalUpdate = (homeModel as unknown as {
    getBatchApprovalUpdate?: (
      items: SendQueueItem[],
      result: { approved: number; itemIds: string[]; retryableItemIds: string[]; intervalSeconds: number; firstScheduledAt: string; lastScheduledAt: string },
    ) => {
      approvedItemKeys: string[];
      approvedCount: number;
      retryableCount: number;
      retryableMessage: string | null;
    };
  }).getBatchApprovalUpdate;

  assert.equal(typeof getBatchApprovalUpdate, "function");
  const update = getBatchApprovalUpdate?.(
    items,
    {
      approved: 1,
      itemIds: ["recipient-1"],
      retryableItemIds: ["recipient-2"],
      intervalSeconds: 60,
      firstScheduledAt: "2026-08-30T02:00:00.000Z",
      lastScheduledAt: "2026-08-30T02:00:00.000Z",
    },
  );

  assert.deepEqual(update, {
    approvedItemKeys: ["campaign-1:recipient-1"],
    approvedCount: 1,
    retryableCount: 1,
    retryableMessage: "1 message was scheduled one minute apart. 1 message remains queued and can be retried.",
  });
  assert.deepEqual(
    homeModel
      .groupQueueByCampaign(items, new Set(update?.approvedItemKeys), 2)
      .flatMap((group) => group.items.map((item) => item.recipientId)),
    ["recipient-2"],
  );
});

test("queue cap presentation clamps overage and floors fractional remaining allowance", () => {
  const getQueueCapDisplay = (homeModel as unknown as {
    getQueueCapDisplay?: (
      cap: { limit: number; used: number },
      approvedCount: number,
    ) => { limit: number; used: number; remaining: number };
  }).getQueueCapDisplay;

  assert.equal(typeof getQueueCapDisplay, "function");
  assert.deepEqual(getQueueCapDisplay?.({ limit: 20, used: 4.5 }, 0), {
    limit: 20,
    used: 4.5,
    remaining: 15,
  });
  assert.deepEqual(getQueueCapDisplay?.({ limit: 20, used: 24.5 }, 0), {
    limit: 20,
    used: 20,
    remaining: 0,
  });
});

test("a fresh server cap reconciles session approvals even when its numbers are unchanged", async () => {
  const source = await readFile(new URL("./BatchApprovalPanel.tsx", import.meta.url), "utf8");

  assert.match(source, /useEffect\(\(\) => \{[\s\S]*?setApprovedItemKeys\(new Set<string>\(\)\);[\s\S]*?setApprovedCount\(0\);[\s\S]*?setLastApprovedCount\(0\);[\s\S]*?\}, \[queue\?\.cap\]\);/);
});

test("each campaign header sends only that campaign through the shared approval contract", async () => {
  const source = await readFile(new URL("./BatchApprovalPanel.tsx", import.meta.url), "utf8");

  assert.match(source, /const approveItems = async \(items: SendQueueItem\[\], targetId: string, campaignTitle\?: string\)/);
  assert.match(source, /const itemIds = items\.map\(\(item\) => item\.recipientId\);/);
  assert.match(source, /const result = await approveSendBatch\(itemIds\);/);
  assert.match(source, /getBatchApprovalUpdate\(items, result\)/);
  assert.match(source, /onConfirm=\{\(\) => void approveItems\(group\.items, group\.id, group\.title\)\}/);
  assert.match(source, /Schedule campaign \(\{group\.items\.length\}\)/);
  assert.match(source, /Other campaigns will stay queued\./);
});
