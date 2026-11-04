import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../system/button";
import { AlertDialog, AlertDialogAction } from "./alert-dialog";

const source = readFileSync(path.join(process.cwd(), "src/app/components/ui/alert-dialog.tsx"), "utf8");

test("alert dialog actions defer styling to an asChild system button", () => {
  const action = renderToStaticMarkup(
    <AlertDialog open>
      <AlertDialogAction asChild>
        <Button variant="destructive">Delete lead</Button>
      </AlertDialogAction>
    </AlertDialog>,
  );
  assert.match(action, /rounded-full/);
  assert.match(action, /bg-danger/);
  assert.doesNotMatch(action, /rounded-md/);
  assert.doesNotMatch(action, /bg-primary/);
  assert.match(source, /!asChild\s*&&\s*buttonVariants\(\{\s*variant:\s*"outline"\s*\}\)/);
});
