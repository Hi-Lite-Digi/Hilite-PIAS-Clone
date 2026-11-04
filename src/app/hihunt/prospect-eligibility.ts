import type { HRProspectRecord } from "../../lib/api";

type ProspectEmailEligibility = Pick<HRProspectRecord, "company_domain" | "email_status" | "provider" | "work_email">;

const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
  "yahoo.com.sg",
]);

function normalizedDomain(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
}

export function isPublicCompanyListing(prospect: ProspectEmailEligibility): boolean {
  const emailDomain = String(prospect.work_email || "").trim().toLowerCase().split("@")[1] || "";
  const companyDomain = normalizedDomain(prospect.company_domain);
  return prospect.provider === "public_web"
    && prospect.email_status?.toLowerCase() === "public"
    && Boolean(companyDomain)
    && emailDomain === companyDomain
    && !PERSONAL_EMAIL_DOMAINS.has(emailDomain);
}

export function hasSendableHRWorkEmail(prospect: ProspectEmailEligibility): boolean {
  if (!prospect.work_email?.trim()) return false;
  return prospect.email_status?.toLowerCase() === "verified"
    || isPublicCompanyListing(prospect);
}
