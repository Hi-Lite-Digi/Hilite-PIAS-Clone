import type { TemplateDelivery } from "./api";

export const deliveryLabels: Record<TemplateDelivery["status"], string> = { draft: "Ready to send", sending: "Awaiting confirmation", accepted: "Accepted by Meta", sent: "Sent", delivered: "Delivered", read: "Read", failed: "Failed", unknown: "Delivery unconfirmed", suppressed: "Unsubscribed" };
