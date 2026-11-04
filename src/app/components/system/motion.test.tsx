import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as systemMotion from "./motion";

test("the system kit exposes a shared Motion implementation", () => {
  assert.equal(existsSync(new URL("./motion.tsx", import.meta.url)), true);
});

test("page motion keys change for workspace tabs but remain stable for nested records", () => {
  const getPageMotionKey = (systemMotion as unknown as {
    getPageMotionKey?: (pathname: string) => string;
  }).getPageMotionKey;

  assert.equal(typeof getPageMotionKey, "function");
  assert.equal(getPageMotionKey?.("/reengage"), "/reengage");
  assert.equal(getPageMotionKey?.("/reengage/leads"), "/reengage/leads");
  assert.equal(getPageMotionKey?.("/reengage/campaigns/campaign-12"), "/reengage/campaigns");
  assert.equal(getPageMotionKey?.("/reengage/calendar"), "/reengage/calendar");
  assert.equal(getPageMotionKey?.("/hihunt/inbox/thread-7"), "/hihunt/inbox");
});

test("page transitions keep same-tab route children live", () => {
  const source = readFileSync(new URL("./motion.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /function FrozenRoute|useState\(children\)/);
  assert.match(source, /<m\.div[\s\S]*?key=\{motionKey\}[\s\S]*?>[\s\S]*?\{children\}[\s\S]*?<\/m\.div>/);
});

test("list motion uses a calm capped stagger", () => {
  const getSettledItemTransition = (systemMotion as unknown as {
    getSettledItemTransition?: (index: number) => { delay: number; duration: number };
  }).getSettledItemTransition;

  assert.equal(typeof getSettledItemTransition, "function");
  assert.deepEqual(getSettledItemTransition?.(0), { delay: 0, duration: 0.18 });
  assert.deepEqual(getSettledItemTransition?.(1), { delay: 0.03, duration: 0.18 });
  assert.deepEqual(getSettledItemTransition?.(99), { delay: 0.18, duration: 0.18 });
});

test("count-up values are integer, bounded, and finish at the sent count", () => {
  const getCountUpValue = (systemMotion as unknown as {
    getCountUpValue?: (target: number, progress: number) => number;
  }).getCountUpValue;

  assert.equal(typeof getCountUpValue, "function");
  assert.equal(getCountUpValue?.(12, -1), 0);
  assert.equal(getCountUpValue?.(12, 0.5), 6);
  assert.equal(getCountUpValue?.(12, 2), 12);
  assert.equal(getCountUpValue?.(-4, 0.5), 0);
});

test("shared motion components use reduced-motion-aware lightweight imports", () => {
  const source = readFileSync(new URL("./motion.tsx", import.meta.url), "utf8");
  const MotionProvider = (systemMotion as unknown as {
    MotionProvider?: ComponentType<{ children: ReactNode }>;
  }).MotionProvider;
  const PageTransition = (systemMotion as unknown as {
    PageTransition?: ComponentType<{ children?: ReactNode; motionKey: string }>;
  }).PageTransition;
  const SettledItem = (systemMotion as unknown as {
    SettledItem?: ComponentType<{ children?: ReactNode; index: number }>;
  }).SettledItem;
  const BatchActionLabel = (systemMotion as unknown as {
      BatchActionLabel?: ComponentType<{ approveLabel: string; completeLabel?: string; pendingCount: number; sentCount: number }>;
  }).BatchActionLabel;

  assert.match(source, /from "motion\/react"/);
  assert.doesNotMatch(source, /from "framer-motion"|from "motion"/);
  assert.match(source, /reducedMotion="user"/);
  assert.equal(typeof MotionProvider, "function");
  assert.equal(typeof PageTransition, "function");
  assert.equal(typeof SettledItem, "function");
  assert.equal(typeof BatchActionLabel, "function");
  if (!MotionProvider || !PageTransition || !SettledItem || !BatchActionLabel) return;

  const page = renderToStaticMarkup(createElement(
    MotionProvider,
    null,
    createElement(PageTransition, { motionKey: "/reengage/leads" }, createElement("main", null, "Leads")),
  ));
  assert.match(page, /data-slot="page-transition"/);
  assert.match(page, />Leads</);

  const item = renderToStaticMarkup(createElement(SettledItem, { index: 2 }, "Campaign"));
  assert.match(item, /data-slot="settled-item"/);
  assert.match(item, />Campaign</);

  const batch = renderToStaticMarkup(createElement(BatchActionLabel, {
    approveLabel: "Approve batch (0)",
    pendingCount: 0,
    sentCount: 3,
  }));
    assert.match(batch, /lucide-check/);
    assert.match(batch, /Sent <span[^>]*>3<\/span>/);

    const scheduledBatch = renderToStaticMarkup(createElement(BatchActionLabel, {
      approveLabel: "Approve batch (0)",
      completeLabel: "Scheduled",
      pendingCount: 0,
      sentCount: 2,
    }));
    assert.match(scheduledBatch, /Scheduled <span[^>]*>2<\/span>/);
});
