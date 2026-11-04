#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import {
  buildGoogleQuery,
  candidatesToCsv,
  extractPageCandidates,
  isCompanyPageUrl,
  normaliseDomain,
  uniqueCandidates,
} from "./lib/hihunt-public-web-discovery.mjs";

const DEFAULT_OUTPUT = `public-hr-discovery-${new Date().toISOString().slice(0, 10)}.json`;

function usage() {
  return `Hi-Hunt public work-email discovery

Usage:
  npm run discover:public-hr -- --seeds <file.json> [options]

Options:
  --seeds <path>           JSON array of { companyDomain, companyName?, urls? }
  --seed-api <url>         Read company domains from a Hi-Hunt prospects API response
  --output <path>          JSON report path (default: ${DEFAULT_OUTPUT})
  --max-domains <1-70>     Maximum company domains per run (default: 10)
  --max-pages <1-5>        Maximum public pages visited per domain (default: 3)
  --delay-ms <1000-15000>  Delay between search/page requests (default: 2500)
  --location <value>       Required location phrase (default: Singapore)
  --import-supabase        Add reviewed public listings to the Hi-Hunt audience
  --env-file <path>        Server environment file (default: .env.local)
  --headed                 Show the Playwright browser
  --help                   Show this help

The collector does not send email. Every result retains its public source evidence.
Use --import-supabase only after reviewing the output to add the candidates to
Hi-Hunt's selectable audience.`;
}

function parseNumber(value, { name, minimum, maximum, fallback }) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

export function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--headed" || argument === "--help" || argument === "--import-supabase") {
      values[argument.slice(2)] = true;
      continue;
    }
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`${argument} requires a value`);
    values[argument.slice(2)] = next;
    index += 1;
  }
  return {
    help: Boolean(values.help),
    headed: Boolean(values.headed),
    seeds: values.seeds ? path.resolve(String(values.seeds)) : "",
    seedApi: String(values["seed-api"] || "").trim(),
    importSupabase: Boolean(values["import-supabase"]),
    envFile: path.resolve(String(values["env-file"] || ".env.local")),
    output: path.resolve(String(values.output || DEFAULT_OUTPUT)),
    maxDomains: parseNumber(values["max-domains"], { name: "--max-domains", minimum: 1, maximum: 70, fallback: 10 }),
    maxPages: parseNumber(values["max-pages"], { name: "--max-pages", minimum: 1, maximum: 5, fallback: 3 }),
    delayMs: parseNumber(values["delay-ms"], { name: "--delay-ms", minimum: 1000, maximum: 15_000, fallback: 2500 }),
    location: String(values.location || "Singapore").replace(/[\r\n]/g, " ").trim() || "Singapore",
  };
}

export function toSupabaseProspect(candidate) {
  const nameParts = String(candidate?.fullName || "HR Contact").trim().split(/\s+/).filter(Boolean);
  const namedPerson = candidate?.nameSource === "email-local-part" && nameParts.length >= 2;
  return {
    provider: "apollo",
    provider_person_id: candidate.email,
    full_name: candidate.fullName,
    first_name: namedPerson ? nameParts[0] : null,
    last_name: namedPerson ? nameParts.slice(1).join(" ") : null,
    job_title: candidate.jobTitle,
    seniority: null,
    company_name: candidate.companyName,
    company_domain: candidate.companyDomain,
    work_email: candidate.email,
    email_status: "public",
    linkedin_url: null,
    location: candidate.location,
    hr_match_reason: `Public company page: ${candidate.evidence}`.slice(0, 900),
    review_status: "new",
    suppressed: false,
    source_metadata: {
      public_company_listing: true,
      source_provider: "public_web",
      source_url: candidate.sourceUrl,
      evidence: candidate.evidence,
      discovery_method: candidate.discoveryMethod,
      hihunt_status: "new",
    },
  };
}

async function importSupabaseCandidates(options, candidates) {
  if (!options.importSupabase || !candidates.length) return 0;
  process.loadEnvFile(options.envFile);
  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const secretKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !secretKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required for --import-supabase");
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/ingest_hr_prospects`, {
    method: "POST",
    headers: {
      apikey: secretKey,
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ p_prospects: candidates.map(toSupabaseProspect) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 400);
    throw new Error(`Supabase import returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return Math.max(0, Number(await response.json()) || 0);
}

function cleanSeed(seed) {
  const companyDomain = normaliseDomain(seed?.companyDomain || seed?.company_domain);
  if (!companyDomain) return null;
  const urls = Array.isArray(seed?.urls)
    ? seed.urls.map(String).filter((url) => isCompanyPageUrl(url, companyDomain)).slice(0, 10)
    : [];
  return {
    companyDomain,
    companyName: String(seed?.companyName || seed?.company_name || companyDomain).trim().slice(0, 240),
    urls,
  };
}

async function loadSeedsFromFile(filePath) {
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("The seed file must contain a JSON array");
  return parsed;
}

async function loadSeedsFromApi(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`The seed API returned HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function collectSeeds(options) {
  const rawSeeds = [];
  if (options.seeds) rawSeeds.push(...await loadSeedsFromFile(options.seeds));
  if (options.seedApi) rawSeeds.push(...await loadSeedsFromApi(options.seedApi));
  const seen = new Set();
  return rawSeeds.map(cleanSeed).filter((seed) => {
    if (!seed || seen.has(seed.companyDomain)) return false;
    seen.add(seed.companyDomain);
    return true;
  }).slice(0, options.maxDomains);
}

function googleSearchUrl(seed, location) {
  const query = buildGoogleQuery({ companyDomain: seed.companyDomain, location });
  return `https://www.google.com/search?hl=en&filter=0&num=10&q=${encodeURIComponent(query)}`;
}

function googleResultTarget(href) {
  try {
    const url = new URL(href);
    if (/^\/url$/.test(url.pathname) && url.searchParams.get("q")) return url.searchParams.get("q");
    return url.toString();
  } catch {
    return "";
  }
}

async function searchCompanyPages(page, seed, location) {
  await page.goto(googleSearchUrl(seed, location), { waitUntil: "domcontentloaded", timeout: 45_000 });
  const pageText = await page.locator("body").innerText().catch(() => "");
  if (/unusual traffic|automated queries|not a robot|captcha/i.test(pageText)) {
    throw new Error("Google displayed an automation checkpoint; the scan stopped without bypassing it");
  }
  const hrefs = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => anchor.href));
  return hrefs
    .map(googleResultTarget)
    .filter((url) => isCompanyPageUrl(url, seed.companyDomain));
}

const COMPANY_PAGE_PATTERN = /(?:career|jobs?|people|team|about|contact|talent|human[-_/ ]?resources?|\bhr\b)/i;

async function directCompanyPages(page, seed) {
  const homepages = [`https://${seed.companyDomain}/`, `https://www.${seed.companyDomain}/`];
  let lastError;
  for (const homepage of homepages) {
    try {
      await page.goto(homepage, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const currentUrl = page.url();
      const links = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => ({
        href: anchor.href,
        text: String(anchor.textContent || "").trim(),
      })));
      return [
        currentUrl,
        ...links
          .filter((link) => COMPANY_PAGE_PATTERN.test(`${link.text} ${link.href}`))
          .map((link) => link.href)
          .filter((url) => isCompanyPageUrl(url, seed.companyDomain)),
      ];
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Could not open ${seed.companyDomain}`);
}

async function scanPage(page, seed, location, sourceUrl) {
  await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const pageText = await page.locator("body").innerText().catch(() => "");
  const mailtoEmails = (await page.locator('a[href^="mailto:"]').evaluateAll((anchors) => (
    anchors.map((anchor) => anchor.getAttribute("href")?.slice(7).split("?")[0] || "")
  ))).filter(Boolean);
  return extractPageCandidates({
    companyDomain: seed.companyDomain,
    companyName: seed.companyName,
    location,
    sourceUrl: page.url(),
    pageText,
    mailtoEmails,
  });
}

export async function runPublicWebDiscovery(options) {
  const seeds = await collectSeeds(options);
  if (!seeds.length) throw new Error("Provide at least one valid --seeds file or --seed-api URL");

  const browser = await chromium.launch({ headless: !options.headed });
  const context = await browser.newContext({ locale: "en-SG", timezoneId: "Asia/Singapore" });
  const page = await context.newPage();
  const candidates = [];
  const errors = [];

  try {
    for (const seed of seeds) {
      let targets = seed.urls;
      if (!targets.length) {
        try {
          targets = await directCompanyPages(page, seed);
        } catch (error) {
          errors.push({ companyDomain: seed.companyDomain, stage: "company-homepage", message: String(error?.message || error) });
        }
        if (targets.length < options.maxPages) {
          try {
            targets = [...targets, ...await searchCompanyPages(page, seed, options.location)];
          } catch (error) {
            errors.push({ companyDomain: seed.companyDomain, stage: "search", message: String(error?.message || error) });
          }
        }
      }

      const uniqueTargets = [...new Set(targets)].slice(0, options.maxPages);
      if (!uniqueTargets.length) continue;
      for (const target of uniqueTargets) {
        await page.waitForTimeout(options.delayMs);
        try {
          candidates.push(...await scanPage(page, seed, options.location, target));
        } catch (error) {
          errors.push({ companyDomain: seed.companyDomain, sourceUrl: target, stage: "page", message: String(error?.message || error) });
        }
      }
      await page.waitForTimeout(options.delayMs);
    }
  } finally {
    await browser.close();
  }

  return {
    generatedAt: new Date().toISOString(),
    location: options.location,
    seedCount: seeds.length,
    candidateCount: uniqueCandidates(candidates).length,
    candidates: uniqueCandidates(candidates),
    errors,
    policy: {
      publicCompanyPagesOnly: true,
      personalEmailDomainsRejected: true,
      socialNetworkPagesRejected: true,
      verificationRequiredBeforeSend: true,
      captchaBypass: false,
    },
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const report = await runPublicWebDiscovery(options);
  report.importedCount = await importSupabaseCandidates(options, report.candidates);
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const csvPath = options.output.replace(/\.json$/i, "") + ".csv";
  await writeFile(csvPath, candidatesToCsv(report.candidates), "utf8");
  console.log(`Scanned ${report.seedCount} company domains.`);
  console.log(`Found ${report.candidateCount} review candidates.`);
  if (options.importSupabase) console.log(`Added ${report.importedCount} public listings to Hi-Hunt.`);
  console.log(`JSON: ${options.output}`);
  console.log(`CSV: ${csvPath}`);
  console.log("Public company-domain HR listings are sendable without being labelled verified.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Public HR discovery failed: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
