import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAdmin, requireSellerScope } from "./auth";
import { getPool, transaction } from "./db";
import { HttpError } from "./errors";
import { mapManagedUser, mapMessage, mapOrder, mapPreparation, mapProduct, mapSeller, mapSettings } from "./mappers";
import { inferDepartment } from "./domain";
import { isPreparationUser, preparationDepartments, projectPreparationOrder, redactTask } from "./workflow";
import type { User } from "./types";
import {
  productSchema,
  productPatchSchema,
  sellerSchema,
  sellerPatchSchema,
  settingsSchema,
} from "./validation";

export async function bootstrap(user: User) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const scope = user.role === "seller" ? user.sellerId : null;
    const prep = isPreparationUser(user);
    const departments = preparationDepartments(user);
    const sellers = await client.query(
      "SELECT * FROM sellers WHERE ($1::uuid IS NULL OR id=$1) ORDER BY created_at,id",
      [scope],
    );
    const products = await client.query(
      "SELECT * FROM products WHERE ($1::uuid IS NULL OR seller_id=$1) ORDER BY created_at,id",
      [scope],
    );
    const orders = await client.query(
      "SELECT * FROM orders WHERE ($1::uuid IS NULL OR seller_id=$1) AND ($2::boolean=false OR payment_status='paid') ORDER BY created_at DESC,id",
      [scope, prep],
    );
    const settings = await client.query("SELECT * FROM settings WHERE id=1");
    const tasks = await client.query(
      "SELECT t.* FROM preparation_tasks t JOIN orders o ON o.id=t.order_id WHERE o.payment_status='paid' AND ($1::uuid IS NULL OR o.seller_id=$1) ORDER BY t.created_at,t.id",
      [scope],
    );
    const messages = await client.query(
      "SELECT m.* FROM order_messages m JOIN orders o ON o.id=m.order_id WHERE ($1::uuid IS NULL OR o.seller_id=$1) AND ($2::boolean=false OR o.payment_status='paid') ORDER BY m.created_at,m.id",
      [scope, prep],
    );
    const users =
      user.role === "admin"
        ? await client.query("SELECT * FROM users ORDER BY created_at,id")
        : { rows: [] };

    const visibleOrders = orders.rows
      .map(mapOrder)
      .filter(
        (order) =>
          !prep ||
          order.items.some((item) => departments.includes(inferDepartment(item))),
      );
    const orderIds = new Set(visibleOrders.map((order) => order.id));
    const currentSettings = mapSettings(settings.rows[0]);
    return {
      user,
      sellers: sellers.rows.map(mapSeller),
      products: prep ? [] : products.rows.map(mapProduct),
      orders: visibleOrders.map((order) => projectPreparationOrder(user, order)),
      settings: prep
        ? {
            ...currentSettings,
            bankBin: "",
            bankName: "",
            accountNumber: "",
            accountName: "",
          }
        : currentSettings,
      tasks: tasks.rows
        .map(mapPreparation)
        .filter((task) => !prep || departments.includes(task.department))
        .map((task) => redactTask(user, task)),
      messages: messages.rows
        .map(mapMessage)
        .filter(
          (message) =>
            orderIds.has(message.orderId) &&
            (!prep ||
              message.department === null ||
              departments.includes(message.department)),
        ),
      ...(user.role === "admin"
        ? { users: users.rows.map(mapManagedUser) }
        : {}),
    };
  } finally {
    client.release();
  }
}

export async function createProduct(
  user: User,
  input: z.infer<typeof productSchema>,
) {
  requireSellerScope(user, input.sellerId);
  return transaction(async (db) => {
    const seller = (
      await db.query(
        "SELECT id FROM sellers WHERE id=$1 AND active=true FOR SHARE",
        [input.sellerId],
      )
    ).rows[0];
    if (!seller)
      throw new HttpError(409, "Gian hàng không tồn tại hoặc đã tạm ngừng.");
    const { rows } = await db.query(
      "INSERT INTO products(id,seller_id,name,category,price,stock,emoji,color,active,department) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
      [
        randomUUID(),
        input.sellerId,
        input.name,
        input.category,
        input.price,
        input.stock,
        input.emoji,
        input.color,
        input.active,
        inferDepartment(input),
      ],
    );
    return mapProduct(rows[0]);
  });
}
export async function updateProduct(
  user: User,
  id: string,
  input: z.infer<typeof productPatchSchema>,
) {
  return transaction(async (db) => {
    const row = (
      await db.query("SELECT * FROM products WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!row) throw new HttpError(404, "Không tìm thấy món.", "NOT_FOUND");
    requireSellerScope(user, row.seller_id);
    if (input.sellerId && input.sellerId !== row.seller_id)
      throw new HttpError(400, "Không thể chuyển món sang gian hàng khác.");
    const merged = { ...mapProduct(row), ...input };
    const { rows } = await db.query(
      "UPDATE products SET name=$1,category=$2,price=$3,stock=$4,emoji=$5,color=$6,active=$7,department=$8 WHERE id=$9 RETURNING *",
      [
        merged.name,
        merged.category,
        merged.price,
        merged.stock,
        merged.emoji,
        merged.color,
        merged.active,
        inferDepartment(merged),
        id,
      ],
    );
    return mapProduct(rows[0]);
  });
}
export async function createSeller(
  user: User,
  input: z.infer<typeof sellerSchema>,
) {
  requireAdmin(user);
  const passwordHash = await bcrypt.hash(input.password, 12);
  return transaction(async (db) => {
    const id = randomUUID();
    const { rows } = await db.query(
      "INSERT INTO sellers(id,name,description,color) VALUES ($1,$2,$3,$4) RETURNING *",
      [id, input.name, input.description, input.color],
    );
    await db.query(
      "INSERT INTO users(id,username,name,password_hash,role,seller_id) VALUES ($1,$2,$3,$4,'seller',$5)",
      [randomUUID(), input.username, input.name, passwordHash, id],
    );
    return mapSeller(rows[0]);
  });
}
export async function updateSeller(
  user: User,
  id: string,
  input: z.infer<typeof sellerPatchSchema>,
) {
  requireAdmin(user);
  return transaction(async (db) => {
    const row = (
      await db.query("SELECT * FROM sellers WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!row)
      throw new HttpError(404, "Không tìm thấy gian hàng.", "NOT_FOUND");
    const merged = { ...mapSeller(row), ...input };
    const { rows } = await db.query(
      "UPDATE sellers SET name=$1,description=$2,color=$3,active=$4 WHERE id=$5 RETURNING *",
      [merged.name, merged.description, merged.color, merged.active, id],
    );
    if (input.name)
      await db.query("UPDATE users SET name=$1 WHERE seller_id=$2", [
        input.name,
        id,
      ]);
    if (input.active === false)
      await db.query(
        "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE seller_id=$1)",
        [id],
      );
    return mapSeller(rows[0]);
  });
}
export async function updateSettings(
  user: User,
  input: z.infer<typeof settingsSchema>,
) {
  requireAdmin(user);
  const { rows } = await getPool().query(
    "UPDATE settings SET event_name=$1,bank_bin=$2,bank_name=$3,account_number=$4,account_name=$5,updated_at=now() WHERE id=1 RETURNING *",
    [
      input.eventName,
      input.bankBin,
      input.bankName,
      input.accountNumber,
      input.accountName,
    ],
  );
  return mapSettings(rows[0]);
}
