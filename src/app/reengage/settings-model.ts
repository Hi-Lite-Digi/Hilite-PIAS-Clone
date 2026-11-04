import type { WhatsAppGatewayStatus } from "../../lib/api";
import type { Status } from "../components/system";

export type ReengageSettings = {
  senderEmail: string;
  sendWindowStart: string;
  sendWindowEnd: string;
};

export const DEFAULT_REENGAGE_SETTINGS: ReengageSettings = {
  senderEmail: "",
  sendWindowStart: "09:00",
  sendWindowEnd: "18:00",
};

export type GatewayPresentation = {
  state: "connected" | "checking" | "attention" | "not-configured";
  label: string;
  copy: string;
  status: Status;
};

const SETTINGS_KEY = "reengage-settings-v2";

export function getGatewayPresentation(
  gateway: WhatsAppGatewayStatus | null,
  checking: boolean,
): GatewayPresentation {
  if (checking) {
    return {
      state: "checking",
      label: "Checking",
      copy: "Confirming the Hermes WhatsApp connection now.",
      status: "queued",
    };
  }
  if (!gateway) {
    return {
      state: "attention",
      label: "Needs attention",
      copy: "The connection could not be checked. Try again before approving a send.",
      status: "error",
    };
  }
  if (!gateway.configured) {
    return {
      state: "not-configured",
      label: "Not configured",
      copy: "Hermes has not been configured for this workspace.",
      status: "draft",
    };
  }
  if (gateway.connected && gateway.deliveryReady) {
    return {
      state: "connected",
      label: "Connected",
      copy: gateway.accountName
        ? `WhatsApp is ready to send as ${gateway.accountName}.`
        : "WhatsApp is connected and ready to send.",
      status: "done",
    };
  }
  if (gateway.diagnosticCode === "bridge_unavailable") {
    return {
      state: "attention",
      label: "Bridge offline",
      copy: "The Droplet relay is online, but the internal Hermes WhatsApp bridge is not running.",
      status: "error",
    };
  }
  if (gateway.diagnosticCode === "whatsapp_disconnected") {
    return {
      state: "attention",
      label: "WhatsApp disconnected",
      copy: "Hermes is running, but the paired WhatsApp session is not connected.",
      status: "error",
    };
  }
  return {
    state: "attention",
    label: "Needs attention",
    copy: "Hermes is configured, but WhatsApp is not ready to send.",
    status: "error",
  };
}

export function validateSendWindow(start: string, end: string): string | null {
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(start) || !timePattern.test(end)) {
    return "Enter a valid start and end time.";
  }
  if (start >= end) return "The end time must be after the start time.";
  return null;
}

export function validateSenderEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? null
    : "Enter a valid client-facing email address.";
}

export function loadReengageSettings(
  storage?: Pick<Storage, "getItem">,
): ReengageSettings {
  const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
  if (!target) return { ...DEFAULT_REENGAGE_SETTINGS };
  try {
    const raw = target.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_REENGAGE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ReengageSettings>;
    if (typeof parsed.sendWindowStart !== "string" || typeof parsed.sendWindowEnd !== "string") {
      return { ...DEFAULT_REENGAGE_SETTINGS };
    }
    if (validateSendWindow(parsed.sendWindowStart, parsed.sendWindowEnd)) {
      return { ...DEFAULT_REENGAGE_SETTINGS };
    }
    return {
      senderEmail: typeof parsed.senderEmail === "string" && !validateSenderEmail(parsed.senderEmail)
        ? parsed.senderEmail.trim().toLowerCase()
        : "",
      sendWindowStart: parsed.sendWindowStart,
      sendWindowEnd: parsed.sendWindowEnd,
    };
  } catch {
    return { ...DEFAULT_REENGAGE_SETTINGS };
  }
}

export function saveReengageSettings(
  settings: ReengageSettings,
  storage?: Pick<Storage, "setItem">,
): void {
  const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
  target?.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function isReengageSettingsDirty(
  saved: ReengageSettings,
  current: ReengageSettings,
): boolean {
  return saved.senderEmail !== current.senderEmail
    || saved.sendWindowStart !== current.sendWindowStart
    || saved.sendWindowEnd !== current.sendWindowEnd;
}
