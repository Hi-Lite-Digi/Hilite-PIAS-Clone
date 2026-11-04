import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import * as pagingModule from "./lead-paging";

type Page<T> = { data: T[]; total: number };
type PagingModule = {
  fetchPagedCollection?: <T>(
    fetchPage: (request: { limit: number; offset: number }) => Promise<Page<T>>,
    options?: { maxItems?: number; pageSize?: number },
  ) => Promise<{ items: T[]; total: number; capReached: boolean }>;
};

async function loadPagingModule(): Promise<PagingModule> {
  return pagingModule;
}

test("paged lead loading follows server offsets until every reported row is present", async () => {
  const { fetchPagedCollection } = await loadPagingModule();
  assert.equal(typeof fetchPagedCollection, "function", "lead paging helper must exist");
  if (!fetchPagedCollection) return;

  const allRows = Array.from({ length: 230 }, (_, index) => index + 1);
  const requests: { limit: number; offset: number }[] = [];
  const result = await fetchPagedCollection(async ({ limit, offset }) => {
    requests.push({ limit, offset });
    return { data: allRows.slice(offset, offset + Math.min(limit, 100)), total: allRows.length };
  }, { pageSize: 100, maxItems: 500 });

  assert.deepEqual(requests, [
    { limit: 100, offset: 0 },
    { limit: 100, offset: 100 },
    { limit: 100, offset: 200 },
  ]);
  assert.deepEqual(result.items, allRows);
  assert.equal(result.total, 230);
  assert.equal(result.capReached, false);
});

test("paged lead loading reports a safety cap instead of silently truncating", async () => {
  const { fetchPagedCollection } = await loadPagingModule();
  assert.equal(typeof fetchPagedCollection, "function", "lead paging helper must exist");
  if (!fetchPagedCollection) return;

  const allRows = Array.from({ length: 320 }, (_, index) => index + 1);
  const requests: { limit: number; offset: number }[] = [];
  const result = await fetchPagedCollection(async ({ limit, offset }) => {
    requests.push({ limit, offset });
    return { data: allRows.slice(offset, offset + Math.min(limit, 100)), total: allRows.length };
  }, { pageSize: 100, maxItems: 250 });

  assert.deepEqual(requests, [
    { limit: 100, offset: 0 },
    { limit: 100, offset: 100 },
    { limit: 50, offset: 200 },
  ]);
  assert.equal(result.items.length, 250);
  assert.equal(result.total, 320);
  assert.equal(result.capReached, true);
});

test("paged lead loading rejects a stalled response before returning incomplete data", async () => {
  const { fetchPagedCollection } = await loadPagingModule();
  assert.equal(typeof fetchPagedCollection, "function", "lead paging helper must exist");
  if (!fetchPagedCollection) return;

  await assert.rejects(
    fetchPagedCollection(async ({ offset }) => ({
      data: offset === 0 ? Array.from({ length: 100 }, (_, index) => index) : [],
      total: 150,
    }), { pageSize: 100, maxItems: 500 }),
    /incomplete page/i,
  );
});

test("the complete audience surface renders a visible safety-cap notice", () => {
  const leadsSource = readFileSync(path.join(process.cwd(), "src/app/reengage/LeadsPage.tsx"), "utf8");
  const audienceSource = readFileSync(path.join(process.cwd(), "src/app/reengage/AudiencePanel.tsx"), "utf8");

  assert.match(audienceSource, /capReached/);
  assert.match(audienceSource, /role="status"/);
  assert.doesNotMatch(leadsSource, /fetchPagedCollection/);
  assert.match(leadsSource, /const DEFAULT_LEAD_PAGE_SIZE = 10/);
  assert.match(leadsSource, /<PageSizeSelect value=\{pageSize\}/);
  assert.match(leadsSource, /aria-label="Lead pages"/);
  assert.match(leadsSource, /offset: pageIndex \* pageSize/);
});
