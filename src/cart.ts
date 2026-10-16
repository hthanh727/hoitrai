import { randomUUID } from "./utils";

export type OrderSubmission = {
  sellerId?: string;
  customerName: string;
  note: string;
  paymentMethod: "cash" | "transfer";
  items: { productId: string; quantity: number }[];
  idempotencyKey: string;
  cashReceived?: number;
};
export type Draft = {
  items: Record<string, number>;
  customerName: string;
  note: string;
  key: string;
  method: "cash" | "transfer";
  cash: string;
  submission?: OrderSubmission;
};
export function freshDraft(): Draft {
  return {
    items: {},
    customerName: "",
    note: "",
    key: randomUUID(),
    method: "cash",
    cash: "",
  };
}
export function restoreDraft(raw: string | null): Draft {
  try {
    const d = JSON.parse(raw || "null");
    if (
      !d ||
      !d.items ||
      Array.isArray(d.items) ||
      typeof d.items !== "object" ||
      typeof d.key !== "string" ||
      !/^[A-Za-z0-9_-]{16,100}$/.test(d.key) ||
      typeof d.customerName !== "string" ||
      typeof d.note !== "string"
    )
      return freshDraft();
    if (
      Object.values(d.items).some(
        (v) => !Number.isSafeInteger(v) || Number(v) < 1 || Number(v) > 999,
      )
    )
      return freshDraft();
    d.method = d.method === "transfer" ? "transfer" : "cash";
    d.cash = typeof d.cash === "string" ? d.cash : "";
    if (d.submission) {
      const s = d.submission;
      if (
        s.idempotencyKey !== d.key ||
        (s.sellerId !== undefined && typeof s.sellerId !== "string") ||
        typeof s.customerName !== "string" ||
        typeof s.note !== "string" ||
        !["cash", "transfer"].includes(s.paymentMethod) ||
        !Array.isArray(s.items) ||
        s.items.length === 0 ||
        s.items.some(
          (i: { productId?: unknown; quantity?: unknown }) =>
            !i ||
            typeof i.productId !== "string" ||
            !Number.isSafeInteger(i.quantity) ||
            Number(i.quantity) < 1 ||
            Number(i.quantity) > 999,
        ) ||
        (s.paymentMethod === "cash" &&
          (!Number.isSafeInteger(s.cashReceived) || s.cashReceived < 0))
      )
        return freshDraft();
    }
    return d;
  } catch {
    return freshDraft();
  }
}
export function persistDraft(key: string, draft: Draft): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}
