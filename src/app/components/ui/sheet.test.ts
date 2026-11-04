import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.join(process.cwd(), "src/app/components/ui/sheet.tsx"), "utf8");

test("sheet close control uses the approved touch target, radius, icon, and stroke", () => {
  assert.match(source, /size-11/);
  assert.match(source, /md:size-9/);
  assert.match(source, /rounded-full/);
  assert.match(source, /<XIcon[^>]*className="size-4"[^>]*strokeWidth=\{1\.75\}/);
  assert.doesNotMatch(source, /rounded-xs/);
});
