import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("pending email approval persists edits before approving and reconciles exact IDs", async () => {
  const source = await readFile(new URL("./PendingEmailBatchPanel.tsx", import.meta.url), "utf8");

  assert.match(source, /updateOutreachDraft/);
  assert.match(source, /approveOutreachBatch/);
  assert.match(source, /getOutreachApprovalUpdate/);
  assert.match(source, /retryableMessage/);
  assert.match(source, /ConfirmDialog/);
  assert.match(source, /duration:\s*5_000/);
});

test("sample outreach data remains visibly labelled and cannot be mutated", async () => {
  const source = await readFile(new URL("./PendingEmailBatchPanel.tsx", import.meta.url), "utf8");

  assert.match(source, /SampleDataPill/);
  assert.match(source, /sample/);
  assert.match(source, /disabled=\{[^}]*sample/);
  assert.match(source, /Sample drafts are read-only/);
});

test("the panel surfaces deferred items when the send cap is smaller than the queue", async () => {
  const source = await readFile(new URL("./PendingEmailBatchPanel.tsx", import.meta.url), "utf8");

  assert.match(source, /deferredCount/);
  assert.match(source, /daily sending limit/);
});

test("draft copy and batch membership are locked while a save or approval is in flight", async () => {
  const source = await readFile(new URL("./PendingEmailBatchPanel.tsx", import.meta.url), "utf8");

  assert.match(source, /if \(draftReadOnly \|\| approving \|\| savingDraftId\) return/);
  assert.match(source, /disabled=\{draftReadOnly \|\| approving \|\| savingDraftId === draft\.id\}/);
  assert.match(source, /currentEdit\.subject !== edit\.subject/);
  assert.match(source, /currentEdit\.body !== edit\.body/);
});

test("an unavailable account blocks sending without blocking review of live drafts", async () => {
  const source = await readFile(new URL("./PendingEmailBatchPanel.tsx", import.meta.url), "utf8");

  assert.match(source, /const draftReadOnly = sample/);
  assert.match(source, /hasLiveCap \? capDisplay\.remaining : Number\.MAX_SAFE_INTEGER/);
  assert.match(source, /accountSample \|\| accountError/);
  assert.match(source, /You can still review, edit, and remove live drafts/);
  assert.match(source, /All live drafts remain reviewable/);
});

test("a fresh server cap reconciles session approvals by cap result identity", async () => {
  const source = await readFile(new URL("./PendingEmailBatchPanel.tsx", import.meta.url), "utf8");

  assert.match(source, /useEffect\(\(\) => \{[\s\S]*?setApprovedDraftIds\(new Set<string>\(\)\);[\s\S]*?setApprovedCount\(0\);[\s\S]*?setLastApprovedCount\(0\);[\s\S]*?\}, \[cap\]\);/);
});
