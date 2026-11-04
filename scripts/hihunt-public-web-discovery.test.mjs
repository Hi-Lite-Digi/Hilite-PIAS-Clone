import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import {
  parseArguments,
  toSupabaseProspect,
} from "./hihunt-public-web-discovery.mjs";
import {
  buildGoogleQuery,
  candidatesToCsv,
  extractPageCandidates,
  isCompanyDomainEmail,
  uniqueCandidates,
} from "./lib/hihunt-public-web-discovery.mjs";

test("import options stay explicit and use the local server environment by default", () => {
  const options = parseArguments(["--seeds", "seeds.json", "--import-supabase"]);
  assert.equal(options.importSupabase, true);
  assert.match(options.envFile, /\.env\.local$/);
});

test("Google query stays limited to a company domain, Singapore and HR titles", () => {
  const query = buildGoogleQuery({ companyDomain: "https://www.example.com/careers", location: "Singapore" });
  assert.match(query, /^site:example\.com/);
  assert.match(query, /"talent acquisition"/);
  assert.match(query, /"Singapore"/);
  assert.match(query, /"@example\.com"/);
});

test("company email guard rejects personal providers and domain mismatches", () => {
  assert.equal(isCompanyDomainEmail("jane.doe@example.com", "example.com"), true);
  assert.equal(isCompanyDomainEmail("jane.doe@gmail.com", "gmail.com"), false);
  assert.equal(isCompanyDomainEmail("jane.doe@other.test", "example.com"), false);
});

test("page extraction keeps HR evidence and makes public company listings sendable", () => {
  const candidates = extractPageCandidates({
    companyDomain: "example.com",
    companyName: "Example Pte Ltd",
    sourceUrl: "https://careers.example.com/people",
    pageText: "Jane Doe — Talent Acquisition Director — jane.doe@example.com. Support support@example.com.",
    mailtoEmails: ["jane.doe@example.com", "hr@example.com"],
  });

  assert.deepEqual(candidates.map((candidate) => candidate.email), ["jane.doe@example.com", "hr@example.com"]);
  assert.equal(candidates[0].fullName, "Jane Doe");
  assert.equal(candidates[0].jobTitle, "Talent Acquisition");
  assert.ok(candidates.every((candidate) => candidate.provider === "public_web"));
  assert.ok(candidates.every((candidate) => candidate.verificationStatus === "public"));
  assert.ok(candidates.every((candidate) => candidate.sendEligible === true));
});

test("Playwright can render a public company page before extraction", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("data:text/html,<main><h1>People%20Operations</h1><p>Aisha%20Lim</p><a%20href='mailto:aisha.lim@example.com'>Email</a></main>");
    const pageText = await page.locator("body").innerText();
    const mailtoEmails = await page.locator('a[href^="mailto:"]').evaluateAll((anchors) => (
      anchors.map((anchor) => anchor.getAttribute("href").slice(7))
    ));
    const candidates = extractPageCandidates({
      companyDomain: "example.com",
      companyName: "Example",
      sourceUrl: "https://example.com/team",
      pageText,
      mailtoEmails,
    });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].email, "aisha.lim@example.com");
  } finally {
    await browser.close();
  }
});

test("report helpers deduplicate emails and generate reviewable CSV", () => {
  const candidate = {
    email: "hr@example.com",
    fullName: "HR Team",
    nameSource: "role-inbox",
    jobTitle: "Human Resources",
    companyName: "Example, Pte Ltd",
    companyDomain: "example.com",
    location: "Singapore",
    sourceUrl: "https://example.com/careers",
    provider: "public_web",
    verificationStatus: "public",
    sendEligible: true,
    evidence: "Human Resources hr@example.com",
  };
  assert.equal(uniqueCandidates([candidate, { ...candidate }]).length, 1);
  assert.match(candidatesToCsv([candidate]), /"Example, Pte Ltd"/);
  assert.match(candidatesToCsv([candidate]), /public_web,public,true/);
  const prospect = toSupabaseProspect(candidate);
  assert.equal(prospect.provider, "apollo");
  assert.equal(prospect.email_status, "public");
  assert.equal(prospect.suppressed, false);
  assert.equal(prospect.source_metadata.public_company_listing, true);
  assert.equal(prospect.source_metadata.source_provider, "public_web");
});
