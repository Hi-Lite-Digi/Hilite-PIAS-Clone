import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { createLead, type CreateLeadInput, type LeadRecord } from "../../lib/api";
import { Button, Drawer, toast } from "../components/system";
import { validateLeadContact } from "./lead-validation";

type LeadFormDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (lead: LeadRecord) => void;
};

type LeadForm = {
  name: string;
  phone: string;
  email: string;
  dob: string;
  status: string;
  topics: string;
  source: string;
  remarks: string;
};

const EMPTY_FORM: LeadForm = {
  name: "",
  phone: "",
  email: "",
  dob: "",
  status: "Untouched",
  topics: "",
  source: "Manual entry",
  remarks: "",
};

const FIELD_CLASS =
  "mt-1.5 h-11 w-full rounded-control border border-line bg-surface-2 px-3.5 text-body text-ink outline-none placeholder:text-ink-3 focus:ring-3 focus:ring-ring/40";

function validateLeadForm(form: LeadForm) {
  return validateLeadContact(form);
}

function LeadFormDrawer({ onCreated, onOpenChange, open }: LeadFormDrawerProps) {
  const [form, setForm] = useState<LeadForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof LeadForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const submitRequest = useRef(0);

  useEffect(() => {
    submitRequest.current += 1;
    setSaving(false);
    if (!open) {
      setForm(EMPTY_FORM);
      setErrors({});
    }
  }, [open]);
  useEffect(() => () => { submitRequest.current += 1; }, []);

  const input = useMemo<CreateLeadInput>(() => ({
    name: form.name.trim(),
    phone: form.phone.trim() || undefined,
    email: form.email.trim() || undefined,
    dob: form.dob || undefined,
    status: form.status,
    topics: form.topics.split(",").map((topic) => topic.trim()).filter(Boolean),
    source: form.source.trim() || undefined,
    remarks: form.remarks.trim() || undefined,
  }), [form]);

  const update = (field: keyof LeadForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async () => {
    const nextErrors = validateLeadForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    const request = ++submitRequest.current;
    setSaving(true);
    try {
      const result = await createLead(input);
      onCreated(result.data);
      if (request !== submitRequest.current) return;
      toast.success(`${result.data.name} was added.`);
      handleOpenChange(false);
    } catch (error) {
      if (request !== submitRequest.current) return;
      toast.error(error instanceof Error ? error.message : "The lead could not be added.");
    } finally {
      if (request === submitRequest.current) setSaving(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      submitRequest.current += 1;
      setSaving(false);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Drawer
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={() => handleOpenChange(false)} variant="secondary">Cancel</Button>
          <Button loading={saving} onClick={() => void submit()}><Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />Add lead</Button>
        </div>
      )}
      onOpenChange={handleOpenChange}
      open={open}
      title="Add lead"
      description="Add one person to the RE-engage library."
    >
      <div className="space-y-4">
        <Field label="Name" error={errors.name} required>
          <input className={FIELD_CLASS} onChange={(event) => update("name", event.target.value)} value={form.name} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp phone" error={errors.phone}>
            <input className={FIELD_CLASS} inputMode="tel" onChange={(event) => update("phone", event.target.value)} placeholder="+65 9123 4567" value={form.phone} />
          </Field>
          <Field label="Email" error={errors.email}>
            <input className={FIELD_CLASS} onChange={(event) => update("email", event.target.value)} type="email" value={form.email} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date of birth" error={errors.dob}>
            <input className={FIELD_CLASS} onChange={(event) => update("dob", event.target.value)} type="date" value={form.dob} />
          </Field>
          <Field label="Status">
            <select className={FIELD_CLASS} onChange={(event) => update("status", event.target.value)} value={form.status}>
              <option>Untouched</option><option>Unreachable</option><option>Contacted</option><option>Replied</option>
            </select>
          </Field>
        </div>
        <Field label="Topics" hint="Separate topics with commas.">
          <input className={FIELD_CLASS} onChange={(event) => update("topics", event.target.value)} placeholder="Investment, CPF" value={form.topics} />
        </Field>
        <Field label="Source">
          <input className={FIELD_CLASS} onChange={(event) => update("source", event.target.value)} value={form.source} />
        </Field>
        <Field label="Remarks">
          <textarea className={`${FIELD_CLASS} min-h-28 resize-y py-3`} onChange={(event) => update("remarks", event.target.value)} value={form.remarks} />
        </Field>
      </div>
    </Drawer>
  );
}

function Field({ children, error, hint, label, required }: {
  children: React.ReactNode;
  error?: string;
  hint?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="block text-label font-medium text-ink">
      {label}{required && <span className="text-danger"> *</span>}
      {children}
      {(error || hint) && <span className={`mt-1.5 block text-chip ${error ? "text-danger" : "text-ink-2"}`}>{error ?? hint}</span>}
    </label>
  );
}

export { LeadFormDrawer, validateLeadForm };
export type { LeadForm };
