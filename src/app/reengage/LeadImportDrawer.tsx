import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from "lucide-react";
import type { LeadRecord } from "../../lib/api";
import {
  checkLeadImport,
  importLeads,
  type LeadImportField,
  type LeadImportMapping,
  type LeadImportResult,
} from "../../lib/stubs";
import { Button, Drawer, EmptyState, IconButton, toast } from "../components/system";
import {
  analyseImportRows,
  buildImportReport,
  inferImportMapping,
  parseWorkbook,
  type ParsedWorkbook,
} from "./lead-import";

type LeadImportDrawerProps = {
  existingLeads: readonly LeadRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
};

type ImportStep = "upload" | "mapping" | "preview" | "result";

const MAPPING_FIELDS: { field: LeadImportField; label: string; required?: boolean }[] = [
  { field: "name", label: "Name", required: true },
  { field: "phone", label: "WhatsApp phone" },
  { field: "email", label: "Email" },
  { field: "dob", label: "Date of birth" },
  { field: "age", label: "Age" },
  { field: "status", label: "Status" },
  { field: "topics", label: "Topics" },
  { field: "source", label: "Source" },
  { field: "remarks", label: "Remarks" },
];

function LeadImportDrawer({ existingLeads, onImported, onOpenChange, open }: LeadImportDrawerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const importRequest = useRef(0);
  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState("");
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [mapping, setMapping] = useState<LeadImportMapping>({});
  const [result, setResult] = useState<LeadImportResult | null>(null);
  const [authoritativeCheck, setAuthoritativeCheck] = useState<LeadImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    importRequest.current += 1;
    setStep("upload");
    setFileName("");
    setWorkbook(null);
    setMapping({});
    setResult(null);
    setAuthoritativeCheck(null);
    setBusy(false);
    setDragging(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  useEffect(() => {
    if (!open) reset();
    return () => { importRequest.current += 1; };
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const preview = useMemo(() => {
    const rows = workbook ? analyseImportRows(workbook.rows, mapping, existingLeads) : [];
    if (!authoritativeCheck) return rows;
    const duplicates = new Map(authoritativeCheck.skippedDuplicates.map((item) => [item.row, item.reason]));
    const errors = new Map<number, string[]>();
    authoritativeCheck.errors.forEach((item) => errors.set(item.row, [...(errors.get(item.row) ?? []), item.message]));
    return rows.map((row) => ({
      ...row,
      duplicate: row.duplicate || duplicates.has(row.rowNumber),
      duplicateReason: duplicates.get(row.rowNumber) ?? row.duplicateReason,
      errors: errors.get(row.rowNumber) ?? row.errors,
    }));
  }, [authoritativeCheck, existingLeads, mapping, workbook]);
  const readyRows = preview.filter((row) => !row.duplicate && row.errors.length === 0);
  const duplicateCount = preview.filter((row) => row.duplicate).length;
  const invalidCount = preview.filter((row) => row.errors.length > 0).length;

  const readFile = async (file: File) => {
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      toast.error("Choose an .xlsx or .csv file.");
      return;
    }
    const request = ++importRequest.current;
    setBusy(true);
    try {
      const data = await file.arrayBuffer();
      if (request !== importRequest.current) return;
      const parsed = parseWorkbook(data, file.name);
      setFileName(file.name);
      setWorkbook(parsed);
      setMapping(inferImportMapping(parsed.headers));
      setStep("mapping");
    } catch (error) {
      if (request !== importRequest.current) return;
      toast.error(error instanceof Error ? error.message : "The spreadsheet could not be read.");
    } finally {
      if (request === importRequest.current) setBusy(false);
    }
  };

  const submit = async () => {
    if (!workbook || !mapping.name || readyRows.length === 0) return;
    const request = ++importRequest.current;
    setBusy(true);
    try {
      // The service receives every original row so its authoritative result keeps
      // spreadsheet row numbers and includes validation/duplicate exclusions.
      const response = await importLeads(workbook.rows, mapping);
      if (request !== importRequest.current) return;
      setResult(response);
      setStep("result");
      if (response.added > 0) {
        onImported();
        toast.success(`${response.added} lead${response.added === 1 ? "" : "s"} imported.`);
      } else {
        toast.warning("No new leads were imported.");
      }
    } catch (error) {
      if (request !== importRequest.current) return;
      toast.error(error instanceof Error ? error.message : "The leads could not be imported.");
    } finally {
      if (request === importRequest.current) setBusy(false);
    }
  };

  const openPreview = async () => {
    if (!workbook || !mapping.name) return;
    const request = ++importRequest.current;
    setBusy(true);
    try {
      const response = await checkLeadImport(workbook.rows, mapping);
      if (request !== importRequest.current) return;
      setAuthoritativeCheck(response);
      setStep("preview");
    } catch (error) {
      if (request !== importRequest.current) return;
      toast.error(error instanceof Error ? error.message : "Duplicates could not be checked.");
    } finally {
      if (request === importRequest.current) setBusy(false);
    }
  };

  const downloadReport = () => {
    if (!result) return;
    const blob = new Blob([buildImportReport(result)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lead-import-report-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const footer = step === "mapping" ? (
    <div className="flex w-full items-center justify-between gap-2">
      <Button onClick={() => setStep("upload")} variant="secondary">Back</Button>
      <Button disabled={!mapping.name} loading={busy} onClick={() => void openPreview()}>Check & preview leads</Button>
    </div>
  ) : step === "preview" ? (
    <div className="flex w-full items-center justify-between gap-2">
      <Button onClick={() => setStep("mapping")} variant="secondary">Back</Button>
      <Button disabled={readyRows.length === 0} loading={busy} onClick={() => void submit()}>Import {readyRows.length} leads</Button>
    </div>
  ) : step === "result" ? (
    <div className="flex w-full justify-end gap-2">
      <Button onClick={downloadReport} variant="secondary"><Download aria-hidden="true" className="size-4" strokeWidth={1.75} />Download report</Button>
      <Button onClick={() => onOpenChange(false)}>Done</Button>
    </div>
  ) : undefined;

  return (
    <Drawer
      className="md:max-w-[42rem]"
      description={`${step === "upload" ? 1 : step === "mapping" ? 2 : step === "preview" ? 3 : 4} of 4 · Upload, map, review, import`}
      footer={footer}
      onOpenChange={handleOpenChange}
      open={open}
      title="Upload leads"
    >
      {step === "upload" && (
        <div
          className={`flex min-h-64 flex-col items-center justify-center rounded-card border border-dashed p-6 text-center transition-colors ${dragging ? "border-ink bg-accent/30" : "border-line bg-surface-2"}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void readFile(file); }}
        >
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-surface text-ink-2"><FileSpreadsheet aria-hidden="true" className="size-5" strokeWidth={1.75} /></span>
          <h3 className="mt-4 text-section-title font-medium text-ink">Drop an Excel or CSV file</h3>
          <p className="mt-2 max-w-sm text-body text-ink-2">Map the columns first, then HiHunt checks every row against the full existing lead sheet before import.</p>
          <Button className="mt-5" loading={busy} onClick={() => inputRef.current?.click()} variant="secondary"><Upload aria-hidden="true" className="size-4" strokeWidth={1.75} />Browse files</Button>
          <input ref={inputRef} accept=".xlsx,.csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); }} type="file" />
        </div>
      )}

      {step === "mapping" && workbook && (
        <div>
          <div className="mb-5 flex items-center gap-3 rounded-control bg-surface-2 p-3">
            <FileSpreadsheet aria-hidden="true" className="size-5 text-ink-2" strokeWidth={1.75} />
            <div className="min-w-0 flex-1"><p className="truncate text-body font-medium text-ink">{fileName}</p><p className="text-chip text-ink-2">{workbook.rows.length} rows · {workbook.sheetName}</p></div>
            <IconButton icon={X} label="Choose another file" onClick={reset} variant="ghost" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {MAPPING_FIELDS.map(({ field, label, required }) => (
              <label className="text-label font-medium text-ink" key={field}>{label}{required && <span className="text-danger"> *</span>}
                <select className="mt-1.5 h-11 w-full rounded-control border border-line bg-surface-2 px-3 text-body text-ink outline-none focus:ring-3 focus:ring-ring/40" onChange={(event) => { setAuthoritativeCheck(null); setMapping((current) => ({ ...current, [field]: event.target.value || undefined })); }} value={mapping[field] ?? ""}>
                  <option value="">Not mapped</option>
                  {workbook.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
            ))}
          </div>
          {!mapping.name && <p className="mt-3 flex items-center gap-2 text-label text-danger"><AlertCircle aria-hidden="true" className="size-4" strokeWidth={1.75} />Map the required Name field to continue.</p>}
        </div>
      )}

      {step === "preview" && (
        <div>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <PreviewStat label="Ready" value={readyRows.length} /><PreviewStat label="Duplicates" value={duplicateCount} /><PreviewStat label="Errors" value={invalidCount} />
          </div>
          <div className="overflow-hidden rounded-card border border-line">
            <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto] gap-3 border-b border-line bg-surface-2 px-3 py-2 text-label font-medium text-ink-2"><span>Row</span><span>Lead</span><span>Result</span></div>
            <div className="max-h-[26rem] divide-y divide-line overflow-y-auto">
              {preview.slice(0, 100).map((row) => (
                <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3" key={row.rowNumber}>
                  <span className="text-label tabular-nums text-ink-2">{row.rowNumber}</span>
                  <div className="min-w-0"><p className="truncate text-body font-medium text-ink">{row.name || "Missing name"}</p><p className="truncate text-chip text-ink-2">{row.phone || row.email || "No contact"}</p></div>
                  <span className={`rounded-full px-2.5 py-1 text-chip font-medium ${row.duplicate || row.errors.length ? "bg-danger/10 text-danger" : "bg-mint text-ink"}`}>{row.duplicateReason ?? row.errors[0] ?? "Ready"}</span>
                </div>
              ))}
            </div>
          </div>
          {preview.length > 100 && <p className="mt-3 text-label text-ink-2">Showing the first 100 of {preview.length} rows.</p>}
        </div>
      )}

      {step === "result" && result && (
        <div className="space-y-5">
          <EmptyState
            icon={result.added > 0 ? CheckCircle2 : AlertCircle}
            message={result.added > 0
              ? `${result.added} lead${result.added === 1 ? "" : "s"} added successfully.`
              : "No new leads were added. Review the duplicate and error totals below."}
          />
          <div className="grid gap-3 sm:grid-cols-3"><PreviewStat label="Added" value={result.added} /><PreviewStat label="Duplicates skipped" value={result.skippedDuplicates.length} /><PreviewStat label="Errors" value={result.errors.length} /></div>
          {(result.skippedDuplicates.length > 0 || result.errors.length > 0) && <p className="text-body text-ink-2">Download the report for row-by-row duplicate and validation details.</p>}
        </div>
      )}
    </Drawer>
  );
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-control bg-surface-2 p-3"><p className="text-chip text-ink-2">{label}</p><p className="mt-1 text-section-title font-medium tabular-nums text-ink">{value}</p></div>;
}

export { LeadImportDrawer };
