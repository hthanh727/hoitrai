import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { requireAdmin, requireOrderScope } from "./auth";
import { transaction } from "./db";
import { cashStatus, planOrder } from "./domain";
import { HttpError } from "./errors";
import { mapOrder, mapProduct, mapSettings } from "./mappers";
import type { Order, User } from "./types";
import { orderSchema } from "./validation";
import { ensurePreparationTasks } from "./workflow";

async function audit(
  db: PoolClient,
  orderId: string,
  actorId: string | null,
  action: string,
  details: unknown = {},
) {
  await db.query(
    "INSERT INTO order_audit(id,order_id,actor_id,action,details) VALUES ($1,$2,$3,$4,$5)",
    [randomUUID(), orderId, actorId, action, JSON.stringify(details)],
  );
}
function orderCode() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  return `HT${parts.year}${parts.month}${parts.day}${randomBytes(6).toString("hex").toUpperCase()}`;
}
function requestHash(data: z.infer<typeof orderSchema>) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sellerId: data.sellerId ?? null,
        customerName: data.customerName,
        note: data.note,
        paymentMethod: data.paymentMethod,
        cashReceived: data.cashReceived ?? null,
        items: [...data.items].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        ),
      }),
    )
    .digest("hex");
}
async function lockKey(db: PoolClient, key: string) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    key,
  ]);
}

export async function createOrder(
  user: User,
  input: z.infer<typeof orderSchema>,
): Promise<Order> {
  const requestedSellerId = input.sellerId ?? null;
  requireOrderScope(user, requestedSellerId);
  const fingerprint = requestHash(input);
  return transaction(async (db) => {
    await lockKey(db, `order:${user.id}:${input.idempotencyKey}`);
    const existing = await db.query(
      "SELECT * FROM orders WHERE created_by=$1 AND idempotency_key=$2",
      [user.id, input.idempotencyKey],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].request_hash !== fingerprint)
        throw new HttpError(
          409,
          "Mã gửi đơn đã dùng cho nội dung khác. Hãy tạo mã mới.",
          "IDEMPOTENCY_CONFLICT",
        );
      return mapOrder(existing.rows[0]);
    }
    const seller = requestedSellerId ? (
      await db.query(
        "SELECT * FROM sellers WHERE id=$1 AND active=true FOR SHARE",
        [requestedSellerId],
      )
    ).rows[0] : null;
    if (requestedSellerId && !seller)
      throw new HttpError(
        409,
        "Gian hàng đã tạm ngừng bán.",
        "SELLER_INACTIVE",
      );
    // All transactions lock product rows in the same order, preventing cart-order deadlocks.
    const productIds = input.items.map((item) => item.productId);
    const placeholders = productIds
      .map((_, index) => `$${index + 1}`)
      .join(",");
    const products = (
      await db.query(
        `SELECT p.* FROM products p WHERE p.id IN (${placeholders}) ORDER BY p.id FOR UPDATE`,
        productIds,
      )
    ).rows.map(mapProduct);
    const sellerIds = [...new Set(products.map((product) => product.sellerId))].sort();
    const sellerPlaceholders = sellerIds.map((_, index) => `$${index + 1}`).join(",");
    const sellerRows = sellerIds.length ? (await db.query(`SELECT * FROM sellers WHERE id IN (${sellerPlaceholders}) AND active=true ORDER BY id FOR SHARE`, sellerIds)).rows : [];
    if (sellerRows.length !== sellerIds.length) throw new HttpError(409, "Gian hàng đã tạm ngừng bán.", "SELLER_INACTIVE");
    const { items, total } = planOrder(requestedSellerId, input.items, products);
    for (const item of items) item.sellerName = sellerRows.find((row) => row.id === item.sellerId)?.name;
    const orderSellerId = sellerIds.length === 1 ? sellerIds[0] : null;
    const orderSellerName = orderSellerId ? sellerRows.find((row) => row.id === orderSellerId)!.name : "Nhiều gian hàng";
    let bankDetails: Record<string, string> | null = null;
    if (input.paymentMethod === "transfer") {
      const settings = mapSettings(
        (await db.query("SELECT * FROM settings WHERE id=1")).rows[0],
      );
      if (!settings.bankBin || !settings.accountNumber || !settings.accountName)
        throw new HttpError(
          409,
          "Quản trị viên cần cấu hình tài khoản ngân hàng trước.",
          "BANK_NOT_CONFIGURED",
        );
      const { eventName: _event, ...bank } = settings;
      bankDetails = bank;
    }
    const status =
      input.paymentMethod === "cash"
        ? cashStatus(total, input.cashReceived)
        : "pending";
    for (const item of items)
      if (item.trackedStock)
        await db.query(
          "UPDATE products SET stock=stock-$1::integer WHERE id=$2",
          [item.quantity, item.productId],
        );
    const id = randomUUID();
    const paidAt = status === "paid" ? new Date() : null;
    const { rows } = await db.query(
      `INSERT INTO orders(id,code,seller_id,seller_name,customer_name,note,items,total,payment_method,payment_status,cash_received,bank_details,payment_source,created_by,confirmed_by,idempotency_key,request_hash,paid_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [
        id,
        orderCode(),
        orderSellerId,
        orderSellerName,
        input.customerName || "Khách lẻ",
        input.note,
        JSON.stringify(items),
        total,
        input.paymentMethod,
        status,
        input.paymentMethod === "cash" ? (input.cashReceived ?? null) : null,
        bankDetails ? JSON.stringify(bankDetails) : null,
        status === "paid" ? "cash" : null,
        user.id,
        status === "paid" ? user.id : null,
        input.idempotencyKey,
        fingerprint,
        paidAt,
      ],
    );
    await audit(db, id, user.id, "created", {
      paymentMethod: input.paymentMethod,
      status,
      total,
    });
    if (status === "paid") {
      await audit(db, id, user.id, "confirmed", {
        source: "cash",
        cashReceived: input.cashReceived,
      });
      await ensurePreparationTasks(db, rows[0]);
    }
    return mapOrder({ ...rows[0], fulfillment_status: status === "paid" ? "queued" : "none" });
  });
}

export async function confirmOrder(
  user: User,
  id: string,
  cashReceived?: number,
): Promise<Order> {
  return transaction(async (db) => {
    const row = (
      await db.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!row) throw new HttpError(404, "Không tìm thấy đơn.", "NOT_FOUND");
    requireOrderScope(user, row.seller_id);
    if (row.payment_status === "paid") return mapOrder(row);
    if (row.payment_status !== "pending")
      throw new HttpError(409, "Đơn đã bị hủy.", "ORDER_CLOSED");
    if (row.payment_method === "cash") {
      if (cashReceived === undefined)
        throw new HttpError(
          400,
          "Vui lòng nhập tiền khách đưa.",
          "CASH_REQUIRED",
        );
      cashStatus(row.total, cashReceived);
    }
    const source = row.payment_method === "cash" ? "cash" : "manual";
    const updated = (
      await db.query(
        `UPDATE orders SET payment_status='paid',paid_at=now(),confirmed_by=$1,payment_source=$2,cash_received=$3 WHERE id=$4 RETURNING *`,
        [user.id, source, source === "cash" ? cashReceived : null, id],
      )
    ).rows[0];
    await audit(db, id, user.id, "confirmed", {
      source,
      cashReceived: source === "cash" ? cashReceived : null,
    });
    await ensurePreparationTasks(db, updated);
    return mapOrder({ ...updated, fulfillment_status: "queued" });
  });
}

export async function cancelOrder(user: User, id: string): Promise<Order> {
  return transaction(async (db) => {
    const row = (
      await db.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!row) throw new HttpError(404, "Không tìm thấy đơn.", "NOT_FOUND");
    requireOrderScope(user, row.seller_id);
    if (row.payment_status === "cancelled") return mapOrder(row);
    if (row.payment_status === "paid")
      throw new HttpError(
        409,
        "Không thể hủy đơn đã thanh toán.",
        "ORDER_PAID",
      );
    const items = [...row.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    );
    for (const item of items)
      if (item.trackedStock)
        await db.query(
          "UPDATE products SET stock=stock+$1::integer WHERE id=$2 AND stock IS NOT NULL",
          [item.quantity, item.productId],
        );
    const updated = (
      await db.query(
        `UPDATE orders SET payment_status='cancelled',cancelled_at=now() WHERE id=$1 RETURNING *`,
        [id],
      )
    ).rows[0];
    await audit(db, id, user.id, "cancelled");
    return mapOrder(updated);
  });
}

export async function deleteOrder(
  user: User,
  id: string,
): Promise<{ success: boolean; id: string }> {
  return transaction(async (db) => {
    const row = (
      await db.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!row) throw new HttpError(404, "Không tìm thấy đơn hàng.", "NOT_FOUND");
    requireOrderScope(user, row.seller_id);

    // Hoàn lại tồn kho nếu đơn chưa bị hủy
    if (row.payment_status !== "cancelled") {
      const items = [...row.items].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      );
      for (const item of items)
        if (item.trackedStock)
          await db.query(
            "UPDATE products SET stock=stock+$1::integer WHERE id=$2 AND stock IS NOT NULL",
            [item.quantity, item.productId],
          );
    }

    await db.query("DELETE FROM order_messages WHERE order_id=$1", [id]);
    await db.query("DELETE FROM preparation_tasks WHERE order_id=$1", [id]);
    await db.query("DELETE FROM order_audit WHERE order_id=$1", [id]);

    await db.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'payment_requests') THEN
          DELETE FROM payment_requests WHERE order_id = '${id}';
        END IF;
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'payment_receipts') THEN
          DELETE FROM payment_receipts WHERE order_id = '${id}';
        END IF;
      END $$;
    `).catch(() => undefined);

    await db.query("DELETE FROM orders WHERE id=$1", [id]);
    return { success: true, id };
  });
}

export async function clearAllOrders(
  user: User,
): Promise<{ success: boolean; count: number }> {
  requireAdmin(user);
  return transaction(async (db) => {
    const { rows: uncancelledOrders } = await db.query(
      "SELECT items FROM orders WHERE payment_status <> 'cancelled'",
    );
    for (const order of uncancelledOrders) {
      if (Array.isArray(order.items)) {
        for (const item of order.items) {
          if (item.trackedStock && item.productId && item.quantity) {
            await db.query(
              "UPDATE products SET stock=stock+$1::integer WHERE id=$2 AND stock IS NOT NULL",
              [item.quantity, item.productId],
            );
          }
        }
      }
    }

    await db.query("DELETE FROM order_messages");
    await db.query("DELETE FROM preparation_tasks");
    await db.query("DELETE FROM order_audit");

    await db.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'payment_requests') THEN
          DELETE FROM payment_requests;
        END IF;
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'payment_receipts') THEN
          DELETE FROM payment_receipts;
        END IF;
      END $$;
    `).catch(() => undefined);

    const result = await db.query("DELETE FROM orders");
    return { success: true, count: result.rowCount || 0 };
  });
}

