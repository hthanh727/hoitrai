import { readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { newDb, DataType } from "pg-mem";
import type { Pool } from "pg";
import api from "../netlify/functions/api";
import { closePool, setPoolForTests } from "../server/db";
import { databaseConfig } from "../server/config";
import { productPatchSchema, sellerPatchSchema } from "../server/validation";

const ids = {
  admin: "10000000-0000-4000-8000-000000000001",
  sellerUser: "10000000-0000-4000-8000-000000000002",
  seller: "20000000-0000-4000-8000-000000000001",
  other: "20000000-0000-4000-8000-000000000002",
  product: "30000000-0000-4000-8000-000000000001",
  otherProduct: "30000000-0000-4000-8000-000000000002",
};
const origin = "https://camp.example.test";
let db: Pool;
let hash: string;
let adminCookie: string;
let sellerCookie: string;
const password = "TestOnlyPassword123!";

async function call(
  path: string,
  method = "GET",
  data?: unknown,
  cookie = adminCookie,
  headers: Record<string, string> = {},
) {
  const response = await api(
    new Request(`${origin}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
  );
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
    raw: response,
  };
}
async function order(
  overrides: Record<string, unknown> = {},
  cookie = adminCookie,
) {
  return call(
    "/orders",
    "POST",
    {
      sellerId: ids.seller,
      paymentMethod: "transfer",
      items: [{ productId: ids.product, quantity: 2 }],
      idempotencyKey: crypto.randomUUID(),
      ...overrides,
    },
    cookie,
  );
}

beforeAll(async () => {
  hash = await bcrypt.hash(password, 4);
});
beforeEach(async () => {
  process.env.JWT_SECRET = "integration-only-jwt-secret-0123456789";
  const memory = newDb();
  // pg-mem does not emulate PostgreSQL advisory/row locks. Tests cover persisted
  // state, permissions and idempotent results; production concurrency uses pg locks.
  memory.public.registerFunction({
    name: "hashtextextended",
    args: [DataType.text, DataType.integer],
    returns: DataType.integer,
    implementation: () => 1,
  });
  memory.public.registerFunction({
    name: "pg_advisory_xact_lock",
    args: [DataType.integer],
    returns: DataType.integer,
    implementation: () => 1,
  });
  memory.public.none(
    await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"),
  );
  const adapter = memory.adapters.createPg();
  db = new adapter.Pool() as unknown as Pool;
  setPoolForTests(db);
  await db.query("INSERT INTO sellers(id,name) VALUES ($1,$2),($3,$4)", [
    ids.seller,
    "Bếp lửa",
    ids.other,
    "Gian khác",
  ]);
  await db.query(
    "INSERT INTO users(id,username,name,password_hash,role,seller_id) VALUES ($1,'admin_test','Quản trị',$2,'admin',NULL),($3,'seller_test','Người bán',$2,'seller',$4)",
    [ids.admin, hash, ids.sellerUser, ids.seller],
  );
  await db.query(
    "INSERT INTO products(id,seller_id,name,category,price,stock) VALUES ($1,$2,'Bánh mì','Đồ ăn',20000,10),($3,$4,'Trà','Đồ uống',15000,20)",
    [ids.product, ids.seller, ids.otherProduct, ids.other],
  );
  await db.query(
    "UPDATE settings SET bank_bin='970422',bank_name='MB',account_number='123456789',account_name='BAN TO CHUC' WHERE id=1",
  );
  adminCookie = (
    await call("/auth/login", "POST", { username: "admin_test", password }, "")
  ).cookie!;
  sellerCookie = (
    await call("/auth/login", "POST", { username: "seller_test", password }, "")
  ).cookie!;
});
afterEach(async () => {
  await closePool();
});

describe("session and authorization", () => {
  it("returns HttpOnly HTTPS cookie, limits sellers to their catalog, and revokes logout", async () => {
    const login = await call(
      "/auth/login",
      "POST",
      { username: "seller_test", password },
      "",
    );
    expect(login.status).toBe(200);
    expect(login.raw.headers.get("set-cookie")).toContain("HttpOnly");
    expect(login.raw.headers.get("set-cookie")).toContain("Secure");
    const bootstrap = await call("/bootstrap", "GET", undefined, login.cookie!);
    expect(
      bootstrap.data.sellers.map((item: { id: string }) => item.id),
    ).toEqual([ids.seller]);
    expect(
      bootstrap.data.products.map((item: { id: string }) => item.id),
    ).toEqual([ids.product]);
    expect((await call("/settings", "PUT", {}, login.cookie!)).status).toBe(
      400,
    );
    expect(
      (
        await call(
          "/settings",
          "PUT",
          {
            eventName: "Test",
            bankBin: "",
            bankName: "",
            accountNumber: "",
            accountName: "",
          },
          login.cookie!,
        )
      ).status,
    ).toBe(403);
    await call("/auth/logout", "POST", {}, login.cookie!);
    expect(
      (await call("/session", "GET", undefined, login.cookie!)).status,
    ).toBe(401);
  });
  it("blocks cross-origin writes and forged sessions", async () => {
    expect(
      (
        await call("/orders", "POST", {}, adminCookie, {
          Origin: "https://evil.test",
        })
      ).status,
    ).toBe(403);
    expect(
      (await call("/session", "GET", undefined, "camp_pos_session=forged"))
        .status,
    ).toBe(401);
    expect(
      (
        await call(
          "/auth/login",
          "POST",
          { username: "admin_test", password: "wrong" },
          "",
        )
      ).status,
    ).toBe(401);
  });
  it("prevents a seller reading or ordering another seller products", async () => {
    expect(
      (
        await order(
          {
            sellerId: ids.other,
            items: [{ productId: ids.otherProduct, quantity: 1 }],
          },
          sellerCookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await order(
          { items: [{ productId: ids.otherProduct, quantity: 1 }] },
          sellerCookie,
        )
      ).status,
    ).toBe(409);
  });
});

describe("orders, cash and inventory", () => {
  it("calculates server prices and deducts inventory once when submitted again", async () => {
    const key = crypto.randomUUID();
    const first = await order({ idempotencyKey: key });
    expect(first.status, JSON.stringify(first.data)).toBe(201);
    expect(first.data.order.total).toBe(40000);
    expect(first.data.order.bankDetails.accountNumber).toBe("123456789");
    const again = await order({ idempotencyKey: key });
    expect(again.data.order.id).toBe(first.data.order.id);
    expect(
      (await db.query("SELECT stock FROM products WHERE id=$1", [ids.product]))
        .rows[0].stock,
    ).toBe(8);
    expect((await order({ idempotencyKey: key, note: "Changed" })).status).toBe(
      409,
    );
  });
  it("rejects sold-out and duplicate carts without changing inventory", async () => {
    expect(
      (await order({ items: [{ productId: ids.product, quantity: 11 }] }))
        .status,
    ).toBe(409);
    expect(
      (
        await order({
          items: [
            { productId: ids.product, quantity: 1 },
            { productId: ids.product, quantity: 1 },
          ],
        })
      ).status,
    ).toBe(400);
    expect(
      (await db.query("SELECT stock FROM products WHERE id=$1", [ids.product]))
        .rows[0].stock,
    ).toBe(10);
  });
  it("requires enough cash, records payment actor, and prevents cancelling paid orders", async () => {
    expect(
      (await order({ paymentMethod: "cash", cashReceived: 39000 })).status,
    ).toBe(400);
    const paid = await order({ paymentMethod: "cash", cashReceived: 50000 });
    expect(paid.data.order.paymentStatus).toBe("paid");
    expect(paid.data.order.paymentSource).toBe("cash");
    expect(
      (await call(`/orders/${paid.data.order.id}/cancel`, "POST", {})).status,
    ).toBe(409);
    expect(
      (
        await db.query(
          "SELECT actor_id FROM order_audit WHERE order_id=$1 AND action='confirmed'",
          [paid.data.order.id],
        )
      ).rows[0].actor_id,
    ).toBe(ids.admin);
  });
  it("cancels pending orders and restores tracked inventory once", async () => {
    const pending = (await order()).data.order;
    expect(
      (await call(`/orders/${pending.id}/cancel`, "POST", {})).data.order
        .paymentStatus,
    ).toBe("cancelled");
    await call(`/orders/${pending.id}/cancel`, "POST", {});
    expect(
      (await db.query("SELECT stock FROM products WHERE id=$1", [ids.product]))
        .rows[0].stock,
    ).toBe(10);
    expect(
      (await call(`/orders/${pending.id}/confirm`, "POST", {})).status,
    ).toBe(409);
  });
  it("leaves unlimited inventory unlimited and requires cash on pending cash confirmation", async () => {
    await db.query("UPDATE products SET stock=NULL WHERE id=$1", [ids.product]);
    const pending = (await order({ paymentMethod: "cash" })).data.order;
    expect(pending.paymentStatus).toBe("pending");
    expect(
      (await call(`/orders/${pending.id}/confirm`, "POST", {})).status,
    ).toBe(400);
    expect(
      (
        await call(`/orders/${pending.id}/confirm`, "POST", {
          cashReceived: 40000,
        })
      ).data.order.paymentSource,
    ).toBe("cash");
    expect(
      (await db.query("SELECT stock FROM products WHERE id=$1", [ids.product]))
        .rows[0].stock,
    ).toBeNull();
  });
});

describe("manual bank transfer confirmation", () => {
  it("persists a pending transfer until an authorized seller confirms it", async () => {
    const pending = (await order({}, sellerCookie)).data.order;
    expect(pending.paymentStatus).toBe("pending");
    expect(pending.paidAt).toBeNull();
    expect(pending.paymentSource).toBeNull();
    const bootstrap = await call("/bootstrap", "GET", undefined, sellerCookie);
    expect(
      bootstrap.data.orders.find(
        (item: { id: string }) => item.id === pending.id,
      ).paymentStatus,
    ).toBe("pending");
    const confirmed = await call(
      `/orders/${pending.id}/confirm`,
      "POST",
      {},
      sellerCookie,
    );
    expect(confirmed.data.order.paymentStatus).toBe("paid");
    expect(confirmed.data.order.paymentSource).toBe("manual");
    expect(confirmed.data.order.paidAt).toEqual(expect.any(String));
    const row = (
      await db.query("SELECT * FROM orders WHERE id=$1", [pending.id])
    ).rows[0];
    expect(row.payment_status).toBe("paid");
    expect(row.confirmed_by).toBe(ids.sellerUser);
    const audit = (
      await db.query(
        "SELECT * FROM order_audit WHERE order_id=$1 AND action='confirmed'",
        [pending.id],
      )
    ).rows[0];
    expect(audit.actor_id).toBe(ids.sellerUser);
    expect(audit.details.source).toBe("manual");
  });
  it("confirms once when an action is repeated and preserves the first payment time", async () => {
    const pending = (await order()).data.order;
    const first = (await call(`/orders/${pending.id}/confirm`, "POST", {})).data
      .order;
    const repeated = (await call(`/orders/${pending.id}/confirm`, "POST", {}))
      .data.order;
    expect(repeated.paidAt).toBe(first.paidAt);
    expect(repeated.paymentStatus).toBe("paid");
    expect(
      (
        await db.query(
          "SELECT * FROM order_audit WHERE order_id=$1 AND action='confirmed'",
          [pending.id],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("SELECT stock FROM products WHERE id=$1", [ids.product]))
        .rows[0].stock,
    ).toBe(8);
  });
  it("prevents a seller confirming or cancelling orders from another stall", async () => {
    const otherOrder = (
      await order({
        sellerId: ids.other,
        items: [{ productId: ids.otherProduct, quantity: 1 }],
      })
    ).data.order;
    expect(
      (await call(`/orders/${otherOrder.id}/confirm`, "POST", {}, sellerCookie))
        .status,
    ).toBe(403);
    expect(
      (await call(`/orders/${otherOrder.id}/cancel`, "POST", {}, sellerCookie))
        .status,
    ).toBe(403);
    const bootstrap = await call("/bootstrap", "GET", undefined, sellerCookie);
    expect(bootstrap.data.orders).toHaveLength(0);
    expect(
      (
        await db.query("SELECT payment_status FROM orders WHERE id=$1", [
          otherOrder.id,
        ])
      ).rows[0].payment_status,
    ).toBe("pending");
  });
  it("retains original bank details when settings change and preserves paid/cancelled state", async () => {
    const pending = (await order()).data.order;
    await db.query("UPDATE settings SET account_number='987654321' WHERE id=1");
    const bootstrap = await call("/bootstrap");
    expect(bootstrap.data.settings.accountNumber).toBe("987654321");
    expect(
      bootstrap.data.orders.find(
        (item: { id: string }) => item.id === pending.id,
      ).bankDetails.accountNumber,
    ).toBe("123456789");
    expect(
      (await call(`/orders/${pending.id}/confirm`, "POST", {})).data.order
        .paymentStatus,
    ).toBe("paid");
    expect(
      (await call(`/orders/${pending.id}/cancel`, "POST", {})).status,
    ).toBe(409);
    const cancelled = (await order()).data.order;
    await call(`/orders/${cancelled.id}/cancel`, "POST", {});
    expect(
      (await call(`/orders/${cancelled.id}/confirm`, "POST", {})).status,
    ).toBe(409);
    expect(
      (
        await db.query("SELECT payment_status FROM orders WHERE id=$1", [
          cancelled.id,
        ])
      ).rows[0].payment_status,
    ).toBe("cancelled");
  });
  it("allows deleting an individual order and clearing all orders", async () => {
    const order1 = (await order()).data.order;
    const order2 = (await order()).data.order;
    expect((await db.query("SELECT id FROM orders")).rows).toHaveLength(2);

    // Delete single order
    const del1 = await call(`/orders/${order1.id}`, "DELETE");
    expect(del1.status).toBe(200);
    expect(del1.data.result.success).toBe(true);
    expect((await db.query("SELECT id FROM orders WHERE id=$1", [order1.id])).rows).toHaveLength(0);
    expect((await db.query("SELECT id FROM orders WHERE id=$1", [order2.id])).rows).toHaveLength(1);

    // Clear all orders
    const clearRes = await call("/orders/clear", "POST");
    expect(clearRes.status).toBe(200);
    expect(clearRes.data.result.success).toBe(true);
    expect((await db.query("SELECT id FROM orders")).rows).toHaveLength(0);
  });
});

it("keeps CA verification despite sslmode=require in the supplied Aiven URL", () => {
  const config = databaseConfig({
    DATABASE_URL:
      "postgresql://user:pass@example.test:5432/defaultdb?sslmode=require&sslrootcert=wrong",
    DATABASE_CA_CERT:
      "-----BEGIN CERTIFICATE-----\\nCERT\\n-----END CERTIFICATE-----",
  });
  expect(config.ssl.rejectUnauthorized).toBe(true);
  expect(config.ssl.ca).toContain("\nCERT\n");
  expect(config.connectionString).not.toContain("sslmode");
  expect(config.connectionString).not.toContain("sslrootcert");
});
it("does not apply create defaults during partial catalog updates", () => {
  expect(productPatchSchema.parse({ name: "New" })).toEqual({ name: "New" });
  expect(sellerPatchSchema.parse({ active: false })).toEqual({ active: false });
});
