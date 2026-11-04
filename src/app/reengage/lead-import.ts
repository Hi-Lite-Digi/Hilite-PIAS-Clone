import * as XLSX from "xlsx";
import type { LeadRecord } from "../../lib/api";
import type { LeadImportMapping, LeadImportRow } from "../../lib/stubs";
import { normaliseWhatsAppPhone } from "../../lib/whatsapp";

type ImportField = keyof LeadImportMapping;

type ParsedWorkbook = {
  headers: string[];
  rows: LeadImportRow[];
  sheetName: string;
};

type ImportPreviewRow = {
  rowNumber: number;
  source: LeadImportRow;
  name: string;
  phone: string;
  email: string;
  duplicate: boolean;
  duplicateReason: string | null;
  errors: string[];
};

type ImportReportResult = {
  sample: false;
  added: number;
  skippedDuplicates: { row: number; reason: string }[];
  errors: { row: number; field?: string; message: string }[];
};

const FIELD_ALIASES: Record<ImportField, readonly string[]> = {
  name: ["name", "full name", "fullname", "contact name", "client name"],
  email: ["email", "e-mail", "email address", "e-mail address", "work email"],
  phone: ["phone", "phone number", "mobile", "mobile no", "mobile number", "contact number", "whatsapp"],
  dob: ["dob", "date of birth", "birth date", "birthday"],
  age: ["age", "current age"],
  status: ["status", "lead status", "contact status"],
  topics: ["topic", "topics", "interest", "interests", "area of interest"],
  source: ["source", "lead source", "origin"],
  remarks: ["remarks", "remark", "notes", "note", "comments"],
};

function normalizeHeading(value: string) {
  return value.toLowerCase().replace(/[._-]+/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeImportPhone(value: unknown) {
  return normaliseWhatsAppPhone(String(value ?? "")) ?? "";
}

function normalizeImportEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function cellValue(row: LeadImportRow, header: string | undefined) {
  return header ? row[header] : "";
}

function inferImportMapping(headers: readonly string[]): LeadImportMapping {
  const normalizedHeaders = headers.map((header) => ({ header, normalized: normalizeHeading(header) }));
  return (Object.keys(FIELD_ALIASES) as ImportField[]).reduce((mapping, field) => {
    const match = normalizedHeaders.find(({ normalized }) =>
      FIELD_ALIASES[field].some((alias) => normalizeHeading(alias) === normalized),
    );
    return match ? { ...mapping, [field]: match.header } : mapping;
  }, {} as LeadImportMapping);
}

function parseWorkbook(data: ArrayBuffer, fileName: string): ParsedWorkbook {
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The spreadsheet does not contain a worksheet.");
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<LeadImportRow>(sheet, { defval: "", raw: true });
  if (rows.length === 0) throw new Error(`${fileName} does not contain any lead rows.`);
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  if (headers.length === 0) throw new Error(`${fileName} does not contain a header row.`);
  return { headers, rows, sheetName };
}

function analyseImportRows(
  rows: readonly LeadImportRow[],
  mapping: LeadImportMapping,
  existing: readonly Pick<LeadRecord, "phone" | "email">[] = [],
): ImportPreviewRow[] {
  const existingPhones = new Set(existing.map((lead) => normalizeImportPhone(lead.phone)).filter(Boolean));
  const existingEmails = new Set(existing.map((lead) => normalizeImportEmail(lead.email)).filter(Boolean));
  const filePhones = new Set<string>();
  const fileEmails = new Set<string>();

  return rows.map((source, index) => {
    const name = String(cellValue(source, mapping.name) ?? "").trim();
    const phone = normalizeImportPhone(cellValue(source, mapping.phone));
    const email = normalizeImportEmail(cellValue(source, mapping.email));
    const errors: string[] = [];
    if (!name) errors.push("Name is required");
    if (!phone && !email) errors.push("Add a phone number or email address");

    let duplicateReason: string | null = null;
    if (phone && existingPhones.has(phone)) duplicateReason = "Phone already exists";
    else if (email && existingEmails.has(email)) duplicateReason = "Email already exists";
    else if (phone && filePhones.has(phone)) duplicateReason = "Duplicate phone in this file";
    else if (email && fileEmails.has(email)) duplicateReason = "Duplicate email in this file";

    if (phone) filePhones.add(phone);
    if (email) fileEmails.add(email);
    return {
      rowNumber: index + 2,
      source,
      name,
      phone,
      email,
      duplicate: duplicateReason !== null,
      duplicateReason,
      errors,
    };
  });
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildImportReport(result: ImportReportResult) {
  const lines = ["Type,Row,Field,Message"];
  lines.push(`Added,${result.added},,Leads added`);
  result.skippedDuplicates.forEach((duplicate) => {
    lines.push(["Duplicate", duplicate.row, "", duplicate.reason].map(csvCell).join(","));
  });
  result.errors.forEach((error) => {
    lines.push(["Error", error.row, error.field ?? "", error.message].map(csvCell).join(","));
  });
  return lines.join("\r\n");
}

export {
  FIELD_ALIASES,
  analyseImportRows,
  buildImportReport,
  inferImportMapping,
  normalizeImportEmail,
  normalizeImportPhone,
  parseWorkbook,
};
export type { ImportField, ImportPreviewRow, ImportReportResult, ParsedWorkbook };
