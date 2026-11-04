const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const FREE_EMAIL_DOMAINS = new Set([
  "aol.com",
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "mail.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
  "yahoo.com.sg",
  "ymail.com",
]);

const BLOCKED_LOCAL_PARTS = new Set([
  "abuse",
  "admin",
  "billing",
  "contact",
  "hello",
  "info",
  "marketing",
  "noreply",
  "no-reply",
  "privacy",
  "sales",
  "security",
  "support",
  "webmaster",
]);

const HR_ROLE_LOCAL_PARTS = new Set([
  "career",
  "careers",
  "hr",
  "humanresources",
  "jobs",
  "people",
  "recruit",
  "recruiter",
  "recruiting",
  "recruitment",
  "talent",
]);

const HR_TITLE_MATCHERS = [
  ["Chief People Officer", /chief\s+people\s+officer/i],
  ["Head of Human Resources", /head\s+of\s+(?:human\s+resources|hr)/i],
  ["Human Resources Director", /(?:human\s+resources|\bhr\b)\s+director/i],
  ["Human Resources Manager", /(?:human\s+resources|\bhr\b)\s+manager/i],
  ["Talent Acquisition", /talent\s+acquisition/i],
  ["People Operations", /people\s+operations?/i],
  ["People & Culture", /people\s+(?:&|and)\s+culture/i],
  ["Recruitment", /recruit(?:er|ing|ment)/i],
  ["Human Resources", /human\s+resources|\bhr\b/i],
];

export const DEFAULT_HR_TITLES = [
  "human resources",
  "talent acquisition",
  "people operations",
  "people and culture",
  "recruiter",
];

function trimDot(value) {
  return value.replace(/^\.+|\.+$/g, "");
}

export function normaliseDomain(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return trimDot(parsed.hostname.replace(/^www\./, ""));
  } catch {
    return "";
  }
}

export function normaliseEmail(value) {
  const email = String(value || "").trim().toLowerCase().replace(/[),.;:]+$/g, "");
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return "";
  return email;
}

export function emailDomain(email) {
  return normaliseEmail(email).split("@")[1] || "";
}

export function isCompanyDomainEmail(email, companyDomain) {
  const normalizedEmail = normaliseEmail(email);
  const expectedDomain = normaliseDomain(companyDomain);
  const actualDomain = emailDomain(normalizedEmail);
  return Boolean(
    normalizedEmail
      && expectedDomain
      && actualDomain === expectedDomain
      && !FREE_EMAIL_DOMAINS.has(actualDomain),
  );
}

export function isCompanyPageUrl(value, companyDomain) {
  const expectedDomain = normaliseDomain(companyDomain);
  if (!expectedDomain) return false;
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const hostname = normaliseDomain(url.hostname);
    return hostname === expectedDomain || hostname.endsWith(`.${expectedDomain}`);
  } catch {
    return false;
  }
}

export function buildGoogleQuery({ companyDomain, location = "Singapore", titles = DEFAULT_HR_TITLES }) {
  const domain = normaliseDomain(companyDomain);
  if (!domain) throw new Error("A valid company domain is required");
  const safeLocation = String(location || "Singapore").replace(/["\r\n]/g, " ").trim() || "Singapore";
  const titleParts = titles
    .map((title) => String(title || "").replace(/["\r\n]/g, " ").trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((title) => `"${title}"`);
  if (!titleParts.length) throw new Error("At least one HR title is required");
  return `site:${domain} (${titleParts.join(" OR ")}) "${safeLocation}" "@${domain}"`;
}

export function extractEmails(text) {
  return [...new Set((String(text || "").match(EMAIL_PATTERN) || []).map(normaliseEmail).filter(Boolean))];
}

export function titleFromEvidence(evidence) {
  const value = String(evidence || "");
  return HR_TITLE_MATCHERS.find(([, matcher]) => matcher.test(value))?.[0] || "";
}

export function contextAroundEmail(text, email, radius = 420) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return "";
  const index = source.toLowerCase().indexOf(normaliseEmail(email));
  if (index < 0) return source.slice(0, radius * 2);
  return source.slice(Math.max(0, index - radius), Math.min(source.length, index + email.length + radius));
}

function titleCase(value) {
  return value
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function inferCandidateName(email) {
  const localPart = normaliseEmail(email).split("@")[0] || "";
  if (HR_ROLE_LOCAL_PARTS.has(localPart.replace(/[._-]/g, ""))) {
    return { fullName: "HR Team", nameSource: "role-inbox" };
  }
  const parts = localPart.split(/[._-]+/).filter((part) => /^[a-z]{2,24}$/i.test(part));
  if (parts.length >= 2 && parts.length <= 4) {
    return { fullName: titleCase(parts.join(" ")), nameSource: "email-local-part" };
  }
  return { fullName: "HR Contact", nameSource: "unknown" };
}

export function extractPageCandidates({
  companyDomain,
  companyName = "",
  location = "Singapore",
  sourceUrl,
  pageText = "",
  mailtoEmails = [],
}) {
  const domain = normaliseDomain(companyDomain);
  if (!domain || !isCompanyPageUrl(sourceUrl, domain)) return [];

  const emails = [...new Set([...extractEmails(pageText), ...mailtoEmails.map(normaliseEmail).filter(Boolean)])];
  return emails.flatMap((email) => {
    if (!isCompanyDomainEmail(email, domain)) return [];
    const localPart = email.split("@")[0];
    const evidence = contextAroundEmail(pageText, email);
    const title = titleFromEvidence(evidence);
    const isHRRoleInbox = HR_ROLE_LOCAL_PARTS.has(localPart.replace(/[._-]/g, ""));
    if (!title && !isHRRoleInbox) return [];
    if (BLOCKED_LOCAL_PARTS.has(localPart) && !isHRRoleInbox) return [];
    const identity = inferCandidateName(email);
    return [{
      email,
      fullName: identity.fullName,
      nameSource: identity.nameSource,
      jobTitle: title || "Human Resources",
      companyName: String(companyName || "").trim() || domain,
      companyDomain: domain,
      location: String(location || "Singapore").trim() || "Singapore",
      sourceUrl: String(sourceUrl),
      evidence: evidence.slice(0, 900),
      provider: "public_web",
      discoveryMethod: "playwright-public-company-page",
      verificationStatus: "public",
      sendEligible: true,
    }];
  });
}

export function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = normaliseEmail(candidate?.email);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function candidatesToCsv(candidates) {
  const headers = [
    "email",
    "fullName",
    "nameSource",
    "jobTitle",
    "companyName",
    "companyDomain",
    "location",
    "sourceUrl",
    "provider",
    "verificationStatus",
    "sendEligible",
    "evidence",
  ];
  const rows = candidates.map((candidate) => headers.map((header) => csvEscape(candidate?.[header])).join(","));
  return `${headers.join(",")}\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
}
