type HiHuntDefaults = {
  senderName: string;
  signoff: string;
};

type HiHuntDefaultsErrors = Partial<Record<keyof HiHuntDefaults, string>>;

type HiHuntSenderPreference = {
  senderEmail: string;
};

const DEFAULT_HIHUNT_SENDER_PREFERENCE: HiHuntSenderPreference = {
  senderEmail: "",
};

const SENDER_PREFERENCE_KEY = "hihunt-email-sender-v1";

function normalizeDefaults(defaults: HiHuntDefaults): HiHuntDefaults {
  return { senderName: defaults.senderName.trim(), signoff: defaults.signoff.trim() };
}

function validateHiHuntDefaults(defaults: HiHuntDefaults): HiHuntDefaultsErrors {
  const errors: HiHuntDefaultsErrors = {};
  if (!defaults.senderName.trim()) errors.senderName = "Enter a sender name.";
  if (!defaults.signoff.trim()) errors.signoff = "Enter a sign-off.";
  return errors;
}

function isHiHuntDefaultsDirty(saved: HiHuntDefaults, current: HiHuntDefaults): boolean {
  const normalizedSaved = normalizeDefaults(saved);
  const normalizedCurrent = normalizeDefaults(current);
  return normalizedSaved.senderName !== normalizedCurrent.senderName || normalizedSaved.signoff !== normalizedCurrent.signoff;
}

function validateHiHuntSenderEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? null
    : "Enter a valid client-facing email address.";
}

function normalizeHiHuntSenderPreference(preference: HiHuntSenderPreference): HiHuntSenderPreference {
  return { senderEmail: preference.senderEmail.trim().toLowerCase() };
}

function loadHiHuntSenderPreference(
  storage?: Pick<Storage, "getItem">,
): HiHuntSenderPreference {
  const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
  if (!target) return { ...DEFAULT_HIHUNT_SENDER_PREFERENCE };
  try {
    const raw = target.getItem(SENDER_PREFERENCE_KEY);
    if (!raw) return { ...DEFAULT_HIHUNT_SENDER_PREFERENCE };
    const parsed = JSON.parse(raw) as Partial<HiHuntSenderPreference>;
    if (typeof parsed.senderEmail !== "string" || validateHiHuntSenderEmail(parsed.senderEmail)) {
      return { ...DEFAULT_HIHUNT_SENDER_PREFERENCE };
    }
    return normalizeHiHuntSenderPreference({ senderEmail: parsed.senderEmail });
  } catch {
    return { ...DEFAULT_HIHUNT_SENDER_PREFERENCE };
  }
}

function saveHiHuntSenderPreference(
  preference: HiHuntSenderPreference,
  storage?: Pick<Storage, "setItem">,
): void {
  const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
  target?.setItem(SENDER_PREFERENCE_KEY, JSON.stringify(normalizeHiHuntSenderPreference(preference)));
}

function isHiHuntSenderPreferenceDirty(saved: HiHuntSenderPreference, current: HiHuntSenderPreference): boolean {
  return normalizeHiHuntSenderPreference(saved).senderEmail !== normalizeHiHuntSenderPreference(current).senderEmail;
}

export {
  DEFAULT_HIHUNT_SENDER_PREFERENCE,
  isHiHuntDefaultsDirty,
  isHiHuntSenderPreferenceDirty,
  loadHiHuntSenderPreference,
  normalizeDefaults,
  normalizeHiHuntSenderPreference,
  saveHiHuntSenderPreference,
  validateHiHuntDefaults,
  validateHiHuntSenderEmail,
};
export type { HiHuntDefaults, HiHuntDefaultsErrors, HiHuntSenderPreference };
