import assert from "node:assert/strict";
import test from "node:test";
import { cn } from "./utils";

test("class merging preserves the Phase 1 type scale beside semantic text colours", () => {
  for (const size of ["display", "page-title", "section-title", "card-title", "body", "label", "chip"]) {
    const classes = cn(`text-${size}`, "text-ink");
    assert.match(classes, new RegExp(`(?:^| )text-${size}(?: |$)`));
    assert.match(classes, /(?:^| )text-ink(?: |$)/);
  }
});

test("class merging still resolves two competing type-scale utilities", () => {
  assert.equal(cn("text-body text-label", "text-ink-2"), "text-label text-ink-2");
});
