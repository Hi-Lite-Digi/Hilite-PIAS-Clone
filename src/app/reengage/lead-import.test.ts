import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  analyseImportRows,
  buildImportReport,
  inferImportMapping,
  normalizeImportEmail,
  normalizeImportPhone,
  parseWorkbook,
} from "./lead-import";

test("import mapping recognises common spreadsheet headings", () => {
  assert.deepEqual(
    inferImportMapping(["Full Name", "Mobile No.", "E-mail Address", "Birth Date", "Interest", "Notes"]),
    {
      name: "Full Name",
      phone: "Mobile No.",
      email: "E-mail Address",
      dob: "Birth Date",
      topics: "Interest",
      remarks: "Notes",
    },
  );
});

test("phone and email normalization supports reliable duplicate matching", () => {
  assert.equal(normalizeImportPhone("+65 9123-4567"), "6591234567");
  assert.equal(normalizeImportPhone("(65) 9123 4567"), "6591234567");
  assert.equal(normalizeImportPhone("9123 4567"), "6591234567");
  assert.equal(normalizeImportEmail("  CASEY@EXAMPLE.COM "), "casey@example.com");
});

test("preview marks existing and within-file duplicates without hiding validation errors", () => {
  const rows = [
    { Name: "Casey Lim", Mobile: "+65 9123 4567", Email: "casey@example.com" },
    { Name: "Casey again", Mobile: "65 9123 4567", Email: "other@example.com" },
    { Name: "Existing", Mobile: "81112222", Email: "known@example.com" },
    { Name: "Missing contact", Mobile: "", Email: "" },
  ];
  const preview = analyseImportRows(
    rows,
    { name: "Name", phone: "Mobile", email: "Email" },
    [{ phone: null, email: "KNOWN@example.com" }],
  );

  assert.equal(preview[0].duplicate, false);
  assert.equal(preview[1].duplicateReason, "Duplicate phone in this file");
  assert.equal(preview[2].duplicateReason, "Email already exists");
  assert.deepEqual(preview[3].errors, ["Add a phone number or email address"]);
});

test("SheetJS parses CSV into a stable header and row model", () => {
  const csv = new TextEncoder().encode("Name,Phone\nAri Tan,91234567\n");
  const parsed = parseWorkbook(csv.buffer, "leads.csv");
  assert.deepEqual(parsed.headers, ["Name", "Phone"]);
  assert.equal(parsed.rows[0].Name, "Ari Tan");
  assert.equal(parsed.rows[0].Phone, 91234567);
});

test("downloadable report contains authoritative duplicate and error rows", () => {
  const report = buildImportReport({
    sample: false,
    added: 2,
    skippedDuplicates: [{ row: 4, reason: "Phone already exists" }],
    errors: [{ row: 7, field: "name", message: "Name is required" }],
  });
  assert.match(report, /Added,2/);
  assert.match(report, /Duplicate,4,,Phone already exists/);
  assert.match(report, /Error,7,name,Name is required/);
});

test("closing the import drawer invalidates a late import result", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/reengage/LeadImportDrawer.tsx"), "utf8");

  assert.match(source, /const importRequest = useRef\(0\)/);
  assert.match(source, /importRequest\.current \+= 1/);
  assert.match(source, /const request = \+\+importRequest\.current/);
  assert.match(source, /if \(request !== importRequest\.current\) return/);
  assert.match(source, /onOpenChange=\{handleOpenChange\}/);
});
