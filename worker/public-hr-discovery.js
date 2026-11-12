import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { extractPageCandidates, normaliseDomain, uniqueCandidates } from "../scripts/lib/hihunt-public-web-discovery.mjs";
import { createWorkspaceDb, requireWorkspaceAccess } from "./workspace-session.js";

const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const AGENT = "HilitePublicHR/1.0";
export function publicAddress(address) {
  // Reject all IPv6 for now, including mapped private IPv4 and link-local addresses.
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
}

export function companyUrl(value, domain) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.port || url.username || url.password || normaliseDomain(url.hostname) !== domain || isIP(url.hostname) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(url.hostname)) throw failure("Use a public HTTPS company website.");
  url.hash = "";
  return url;
}

export async function loadPublicPage(value, domain, deadline, resolver = lookup, canVisit = () => true) {
  let url = companyUrl(value, domain);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (Date.now() >= deadline) throw failure("This search reached its time limit.");
    if (!canVisit(url)) throw failure("The website does not allow this page to be crawled.");
    const addresses = await resolver(url.hostname, { all: true, family: 4 });
    if (!addresses.length || addresses.some(row => !publicAddress(row.address))) throw failure("Private or reserved websites cannot be scraped.");
    const pinned = addresses[0];
    const response = await new Promise((resolve, reject) => {
      const remaining = Math.max(1, Math.min(7000, deadline - Date.now()));
      const req = httpsRequest(url, { headers: { "user-agent": AGENT, accept: "text/html,text/plain" }, signal: AbortSignal.timeout(remaining), lookup: (_host, opts, callback) => opts?.all ? callback(null, [pinned]) : callback(null, pinned.address, 4), timeout: remaining }, res => {
        let size = 0; const chunks = [];
        res.on("data", chunk => { size += chunk.length; if (size > 750_000) { res.destroy(); reject(failure("The company page is too large.")); } else chunks.push(chunk); });
        res.on("end", () => resolve({ status: res.statusCode, location: res.headers.location, type: String(res.headers["content-type"] || ""), body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      });
      req.on("timeout", () => req.destroy(failure("The company website timed out.")));
      req.on("error", reject); req.end();
    });
    if ([301, 302, 303, 307, 308].includes(response.status) && response.location) { url = companyUrl(new URL(response.location, url).href, domain); continue; }
    return { ...response, url: url.href };
  }
  throw failure("The company website redirected too many times.");
}

export function robotsAllows(text, pathname) {
  const groups = []; let group = null; let hasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0]; const match = line.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
    if (!match) continue;
    const [, rawKey, value] = match; const key = rawKey.toLowerCase();
    if (key === "user-agent") {
      if (!group || hasRules) { group = { agents: [], rules: [], delay: 0 }; groups.push(group); hasRules = false; }
      group.agents.push(value.toLowerCase());
    } else if (group) {
      hasRules = true;
      if (["allow", "disallow"].includes(key) && value) group.rules.push({ allow: key === "allow", value });
      if (key === "crawl-delay") group.delay = Math.max(group.delay, Number(value) || 0);
    }
  }
  const named = groups.filter(g => g.agents.some(a => a !== "*" && AGENT.toLowerCase().startsWith(a)));
  const selected = named.length ? named : groups.filter(g => g.agents.includes("*"));
  // Skip hosts requesting slower crawls; never ignore their stated delay.
  if (selected.some(g => g.delay > 1)) return false;
  const matching = selected.flatMap(g => g.rules).filter(r => {
    const escaped = r.value.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
    return new RegExp(`^${escaped}`).test(pathname);
  }).sort((a, b) => b.value.length - a.value.length || Number(b.allow) - Number(a.allow));
  return !matching.length || matching[0].allow;
}

function pageText(html) {
  return html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&#(?:x([a-f0-9]+)|(\d+));/gi, (_, hex, dec) => String.fromCodePoint(Math.min(parseInt(hex || dec, hex ? 16 : 10), 0x10ffff))).replaceAll("&commat;", "@").replaceAll("&amp;", "&").replaceAll("&nbsp;", " ").replace(/\s+/g, " ");
}

export async function scrapeCompany(domain, { load = loadPublicPage, delay = ms => new Promise(resolve => setTimeout(resolve, ms)), deadline = Date.now() + 40_000 } = {}) {
  const root = `https://${domain}/`;
  const robots = await load(`${root}robots.txt`, domain, deadline);
  if (robots.status !== 404 && (robots.status !== 200 || !/text\//i.test(robots.type))) throw failure("The website's crawl permissions could not be checked.");
  const rules = robots.status === 404 ? "" : robots.body;
  const urls = [root]; const results = []; let pages = 0; let singaporeEvidence = /\.sg$/.test(domain);
  for (let i = 0; i < urls.length && pages < 3 && Date.now() < deadline; i++) {
    const url = companyUrl(urls[i], domain);
    if (!robotsAllows(rules, url.pathname + url.search)) continue;
    await delay(1000);
    const page = await load(url.href, domain, deadline, undefined, target => robotsAllows(rules, target.pathname + target.search));
    if (page.status !== 200 || !/text\/html/i.test(page.type) || !robotsAllows(rules, new URL(page.url).pathname)) continue;
    pages++;
    const text = pageText(page.body);
    if (/\bSingapore\b/i.test(text)) singaporeEvidence = true;
    results.push(...extractPageCandidates({ companyDomain: domain, sourceUrl: page.url, pageText: text }).map(candidate => ({ ...candidate, discoveryMethod: "public-company-website", sendEligible: false })));
    for (const match of page.body.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      if (!/career|recruit|human.?resource|contact|people|team|about|jobs/i.test(`${match[1]} ${match[2]}`)) continue;
      try { const link = companyUrl(new URL(match[1].replaceAll("&amp;", "&"), page.url).href, domain); if (!link.search && !urls.includes(link.href) && urls.length < 12) urls.push(link.href); } catch { /* Other hosts are outside this search. */ }
    }
  }
  return { pages, candidates: singaporeEvidence ? uniqueCandidates(results).slice(0, 30) : [], singaporeEvidence };
}

export function prospectFromPublicCandidate(candidate, runId) {
  return { provider: "public_web", provider_person_id: candidate.email, full_name: candidate.fullName, job_title: candidate.jobTitle, company_name: candidate.companyName, company_domain: candidate.companyDomain, work_email: candidate.email, email_status: "public", location: "Singapore", hr_match_reason: candidate.evidence, review_status: "new", suppressed: false, source_metadata: { public_company_listing: true, source_provider: "public_web", source_url: candidate.sourceUrl, evidence: candidate.evidence, name_source: candidate.nameSource, discovery_method: "public-company-website", discovery_run_id: runId, reviewed_for_outreach: false } };
}

export async function handlePublicHRDiscovery(request, env, options = {}) {
  await (options.authorize || requireWorkspaceAccess)(request, env);
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const input = await request.json();
  const raw = String(input.domains || "");
  if (raw.length > 1500) throw failure("Search up to three company websites at a time.");
  const domains = [...new Set(raw.split(/[\s,;]+/).filter(Boolean).map(normaliseDomain))];
  if (!domains.length || domains.length > 3) throw failure("Enter one to three company websites.");
  domains.forEach(domain => companyUrl(`https://${domain}/`, domain));
  const db = options.db || createWorkspaceDb(env);
  const active = await db(`hr_discovery_runs?provider=eq.public_web&status=eq.running&started_at=gte.${encodeURIComponent(new Date(Date.now() - 180_000).toISOString())}&select=id&limit=1`);
  if (active.length) throw failure("A public website search is already running. Try again shortly.", 409);
  const [run] = await db("hr_discovery_runs", { method: "POST", body: JSON.stringify({ provider: "public_web", status: "running", requested_count: 90, filters: { domains, location: "Singapore", mode: "public_company_websites", manual: true }, triggered_by: "manual" }) });
  const details = []; let saved = 0; let pages = 0;
  try {
    for (const domain of domains) {
      try {
        const result = await (options.scrape || scrapeCompany)(domain);
        pages += result.pages;
        const candidates = result.candidates.map(candidate => prospectFromPublicCandidate(candidate, run.id));
        const inserted = candidates.length ? await db("rpc/ingest_hr_prospects", { method: "POST", body: JSON.stringify({ p_prospects: candidates }) }) : 0;
        saved += Number(inserted) || 0;
        details.push({ domain, pages: result.pages, found: candidates.length, saved: Number(inserted) || 0, note: !result.singaporeEvidence ? "No Singapore location evidence found." : null });
      } catch { details.push({ domain, pages: 0, found: 0, saved: 0, note: "This website could not be searched or does not allow this crawler." }); }
    }
    await db(`hr_discovery_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "completed", searched_count: pages, saved_count: saved, verified_count: 0, completed_at: new Date().toISOString(), filters: { domains, location: "Singapore", manual: true, results: details } }) });
    return new Response(JSON.stringify({ runId: run.id, saved, pages, details, emailsSent: 0 }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (error) {
    await db(`hr_discovery_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "failed", error_message: "Public website discovery could not finish.", completed_at: new Date().toISOString() }) }).catch(() => {});
    throw error;
  }
}
