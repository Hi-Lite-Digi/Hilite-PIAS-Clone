import assert from "node:assert/strict";
import test from "node:test";
import type { HRProspectRecord } from "../../lib/api";
import { hasSendableHRWorkEmail } from "./prospect-eligibility";

function prospect(overrides: Partial<HRProspectRecord> = {}): HRProspectRecord {
  return {
    id: "prospect-1",
    full_name: "Aisha Lim",
    first_name: "Aisha",
    last_name: "Lim",
    job_title: "Talent Acquisition",
    seniority: null,
    company_name: "Example",
    company_domain: "example.com",
    work_email: "aisha.lim@example.com",
    email_status: "public",
    linkedin_url: null,
    location: "Singapore",
    hr_match_reason: "Published on the company careers page",
    review_status: "new",
    provider: "public_web",
    discovered_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
    ...overrides,
  };
}

test("public company listings are sendable without being labelled verified", () => {
  assert.equal(hasSendableHRWorkEmail(prospect()), true);
  assert.equal(hasSendableHRWorkEmail(prospect({ provider: "apollo" })), false);
  assert.equal(hasSendableHRWorkEmail(prospect({ email_status: "verified", provider: "apollo" })), true);
  assert.equal(hasSendableHRWorkEmail(prospect({ work_email: "person@gmail.com", company_domain: "gmail.com" })), false);
  assert.equal(hasSendableHRWorkEmail(prospect({ work_email: "person@other.example" })), false);
  assert.equal(hasSendableHRWorkEmail(prospect({ work_email: null })), false);
});
