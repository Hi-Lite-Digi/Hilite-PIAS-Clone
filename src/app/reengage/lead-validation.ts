import { normaliseWhatsAppPhone } from "../../lib/whatsapp";

type LeadContactFields = {
  name: string;
  phone: string;
  email: string;
  dob: string;
};

type LeadContactErrors = Partial<Record<keyof LeadContactFields, string>>;

function calculateLeadAge(dob: string, today = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birthDate = new Date(year, month - 1, day);
  if (birthDate.getFullYear() !== year
    || birthDate.getMonth() !== month - 1
    || birthDate.getDate() !== day) return null;

  let age = today.getFullYear() - year;
  if (today.getMonth() < month - 1
    || (today.getMonth() === month - 1 && today.getDate() < day)) age -= 1;
  return age;
}

function validateLeadContact(fields: LeadContactFields): LeadContactErrors {
  const errors: LeadContactErrors = {};
  const name = fields.name.trim();
  const phone = fields.phone.trim();
  const email = fields.email.trim();
  const dob = fields.dob.trim();

  if (!name) errors.name = "Enter the lead's name.";
  if (!phone && !email) {
    errors.phone = "Add a phone number or email address.";
  } else if (phone && !normaliseWhatsAppPhone(phone)) {
    errors.phone = "Enter a valid phone number.";
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }
  if (dob) {
    const age = calculateLeadAge(dob);
    if (age === null) {
      errors.dob = "Enter a valid date of birth.";
    } else if (age < 0 || age > 120) errors.dob = "Date of birth must produce an age between 0 and 120.";
  }
  return errors;
}

export { calculateLeadAge, validateLeadContact };
export type { LeadContactErrors, LeadContactFields };
