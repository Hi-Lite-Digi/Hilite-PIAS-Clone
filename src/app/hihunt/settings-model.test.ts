import assert from "node:assert/strict";
import test from "node:test";
import {
  isHiHuntDefaultsDirty,
  isHiHuntSenderPreferenceDirty,
  loadHiHuntSenderPreference,
  normalizeHiHuntSenderPreference,
  saveHiHuntSenderPreference,
  validateHiHuntDefaults,
  validateHiHuntSenderEmail,
} from "./settings-model";

test("defaults validation and dirty comparison are deterministic", () => {
  assert.deepEqual(validateHiHuntDefaults({ senderName: "", signoff: "" }), {
    senderName: "Enter a sender name.",
    signoff: "Enter a sign-off.",
  });
  assert.deepEqual(validateHiHuntDefaults({ senderName: "JJ", signoff: "Warm regards" }), {});
  assert.equal(isHiHuntDefaultsDirty({ senderName: "JJ", signoff: "Warm regards" }, { senderName: " JJ ", signoff: "Warm regards" }), false);
  assert.equal(isHiHuntDefaultsDirty({ senderName: "JJ", signoff: "Warm regards" }, { senderName: "Hilite", signoff: "Warm regards" }), true);
});

test("legacy sender email validation and normalization remain backward compatible", () => {
  assert.equal(validateHiHuntSenderEmail(""), null);
  assert.equal(validateHiHuntSenderEmail(" Events@Hilite.COM.SG "), null);
  assert.match(validateHiHuntSenderEmail("not-an-email") || "", /valid client-facing email/);
  assert.deepEqual(normalizeHiHuntSenderPreference({ senderEmail: " Events@Hilite.COM.SG " }), { senderEmail: "events@hilite.com.sg" });
  assert.equal(isHiHuntSenderPreferenceDirty({ senderEmail: "events@hilite.com.sg" }, { senderEmail: " Events@Hilite.COM.SG " }), false);
});

test("sender preference persists safely in browser storage", () => {
  let stored = "";
  saveHiHuntSenderPreference({ senderEmail: " Events@Hilite.COM.SG " }, { setItem: (_key, value) => { stored = value; } });
  assert.deepEqual(loadHiHuntSenderPreference({ getItem: () => stored }), { senderEmail: "events@hilite.com.sg" });
  assert.deepEqual(loadHiHuntSenderPreference({ getItem: () => "not-json" }), { senderEmail: "" });
});
