import type { Order, Settings } from "./types";
export const money = (amount: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
export const time = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
export function localDay(value = new Date().toISOString()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).formatToParts(new Date(value));
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}-${parts.find((p) => p.type === "day")!.value}`;
}
export function qrUrl(order: Order, settings: Settings) {
  const bank = order.bankDetails || settings;
  if (
    !bank.bankBin ||
    !bank.accountNumber ||
    !bank.accountName ||
    order.total <= 0
  )
    return null;
  const query = new URLSearchParams({
    amount: String(order.total),
    addInfo: order.code,
    accountName: bank.accountName,
  });
  return `https://img.vietqr.io/image/${encodeURIComponent(bank.bankBin)}-${encodeURIComponent(bank.accountNumber)}-qr_only.png?${query}`;
}
export function exportOrders(orders: Order[]) {
  const escape = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows: unknown[][] = [
    [
      "Mã đơn",
      "Gian hàng",
      "Khách hàng",
      "Thời gian",
      "Tổng tiền (VND)",
      "Phương thức",
      "Trạng thái",
      "Nguồn xác nhận",
    ],
  ];
  orders.forEach((o) =>
    rows.push([
      o.code,
      o.sellerName,
      o.customerName,
      new Date(o.createdAt).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
      }),
      o.total,
      o.paymentMethod,
      o.paymentStatus,
      o.paymentSource,
    ]),
  );
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF" + rows.map((r) => r.map(escape).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `don-hang-${localDay()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function randomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
