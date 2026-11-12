import test from "node:test";
import assert from "node:assert/strict";
import { companyUrl, publicAddress, loadPublicPage, robotsAllows, scrapeCompany, handlePublicHRDiscovery } from "../worker/public-hr-discovery.js";

test("public crawler rejects local, private, reserved and alternate hosts", async () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "172.16.1.1", "100.64.1.1", "::1", "::ffff:127.0.0.1"]) assert.equal(publicAddress(address), false);
  assert.equal(publicAddress("8.8.8.8"), true);
  for (const url of ["http://company.sg", "https://company.sg:8443", "https://evil.sg", "https://user:pass@company.sg"]) assert.throws(() => companyUrl(url, "company.sg"));
  await assert.rejects(loadPublicPage("https://company.sg", "company.sg", Date.now() + 10000, async () => [{ address: "127.0.0.1", family: 4 }]), /Private/);
});

test("crawler obeys robots allow/disallow and skips requested slow crawls", () => {
  assert.equal(robotsAllows("User-agent: *\nDisallow: /", "/careers"), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /\nAllow: /careers", "/careers"), true);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /private*", "/private/contact"), false);
  assert.equal(robotsAllows("User-agent: *\nCrawl-delay: 10", "/"), false);
  assert.equal(robotsAllows("User-agent: HilitePublicHR\nDisallow: /\nUser-agent: *\nAllow: /", "/"), false);
});

test("scraper follows bounded company pages, excludes personal and generic emails, retains evidence", async () => {
  const calls = [];
  const result = await scrapeCompany("unit-company.com", { delay: async () => {}, load: async url => {
    calls.push(url);
    if (url.endsWith("robots.txt")) return { status: 404, type: "text/plain", body: "", url };
    return { status: 200, type: "text/html", url, body: url.endsWith("careers") ? "Singapore recruitment: careers@unit-company.com info@unit-company.com someone@gmail.com" : '<p>Singapore</p><a href="/careers">Careers</a><a href="https://evil.sg/careers">Careers</a>' };
  } });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].email, "careers@unit-company.com");
  assert.equal(result.candidates[0].verificationStatus, "public");
  assert.equal(result.candidates[0].sendEligible, false);
  assert(result.candidates[0].sourceUrl.endsWith("/careers"));
  assert(!calls.some(url => url.includes("evil.sg")));
});

test("manual discovery saves unreviewed contacts without outbound sends", async () => {
  const writes = [];
  const response = await handlePublicHRDiscovery(new Request("https://hilite-outreach.vercel.app/api/public-hr-discovery", { method: "POST", body: JSON.stringify({ domains: "unit-company.sg" }) }), {}, {
    authorize: async () => {},
    db: async (path, options = {}) => { if (!options.method) return []; writes.push({ path, body: JSON.parse(options.body) }); if (path === "hr_discovery_runs") return [{ id: "unit-run" }]; if (path.startsWith("rpc/")) return 1; return []; },
    scrape: async () => ({ pages: 2, singaporeEvidence: true, candidates: [{ email: "hr@unit-company.sg", fullName: "HR Team", jobTitle: "Human Resources", companyName: "Unit", companyDomain: "unit-company.sg", evidence: "Public HR mailbox", sourceUrl: "https://unit-company.sg/careers", nameSource: "role-inbox" }] }),
  });
  const result = await response.json();
  assert.equal(result.saved, 1); assert.equal(result.emailsSent, 0);
  const prospect = writes.find(write => write.path.startsWith("rpc/")).body.p_prospects[0];
  assert.equal(prospect.provider, "public_web"); assert.equal(prospect.review_status, "new"); assert.equal(prospect.source_metadata.reviewed_for_outreach, false);
  assert(!writes.some(write => /campaign|message|send/.test(write.path)));
});
