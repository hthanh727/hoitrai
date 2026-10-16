import { z } from "zod";

const money = z.number().int().min(0).max(1_000_000_000);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const passwordSchema = z
  .string()
  .min(6)
  .max(72)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Mật khẩu tối đa 72 byte.",
  );
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.@-]{3,50}$/);
export const loginSchema = z
  .object({ username: usernameSchema, password: z.string().min(1).max(72) })
  .strict();
export const uuidSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/,
    "Mã định danh không hợp lệ",
  );

const productFields = z
  .object({
    sellerId: uuidSchema,
    name: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(60),
    department: z.enum(["food", "handmade", "drinks"]).optional(),
    price: money.min(1),
    stock: z.number().int().min(0).max(1_000_000).nullable(),
    emoji: z.string().max(20),
    color,
    active: z.boolean(),
  })
  .strict();
export const productSchema = productFields.extend({
  emoji: productFields.shape.emoji.default("🍽️"),
  color: color.default("#f97316"),
  active: z.boolean().default(true),
});
export const productPatchSchema = productFields
  .partial()
  .refine((data) => Object.keys(data).length > 0, "Chưa có nội dung cập nhật.");
const sellerFields = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(300),
    color,
    username: usernameSchema,
    password: passwordSchema,
  })
  .strict();
export const sellerSchema = sellerFields.extend({
  description: sellerFields.shape.description.default(""),
  color: color.default("#f97316"),
});
export const sellerPatchSchema = sellerFields
  .omit({ username: true, password: true })
  .partial()
  .extend({ active: z.boolean().optional() })
  .strict()
  .refine((data) => Object.keys(data).length > 0, "Chưa có nội dung cập nhật.");
export const settingsSchema = z
  .object({
    eventName: z.string().trim().min(1).max(120),
    bankBin: z.string().regex(/^(\d{6})?$/),
    bankName: z.string().trim().max(120),
    accountNumber: z
      .string()
      .trim()
      .regex(/^[0-9A-Za-z]{0,19}$/),
    accountName: z.string().trim().max(120),
  })
  .strict()
  .refine(
    (data) =>
      (!data.bankBin && !data.accountNumber && !data.accountName) ||
      (data.bankBin && data.accountNumber && data.accountName),
    "Cần nhập đủ mã BIN, số tài khoản và chủ tài khoản.",
  );
export const orderSchema = z
  .object({
    sellerId: uuidSchema.nullable().optional(),
    customerName: z.string().trim().max(120).default("Khách lẻ"),
    note: z.string().trim().max(500).default(""),
    paymentMethod: z.enum(["cash", "transfer"]),
    items: z
      .array(
        z
          .object({
            productId: uuidSchema,
            quantity: z.number().int().min(1).max(999),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    idempotencyKey: z
      .string()
      .min(16)
      .max(100)
      .regex(/^[a-zA-Z0-9_-]+$/),
    cashReceived: money.optional(),
  })
  .strict();
export const confirmSchema = z
  .object({ cashReceived: money.optional() })
  .strict();
export const preparationSchema = z.object({ status: z.enum(["queued", "preparing", "ready", "delivered"]) }).strict();
export const messageSchema = z.object({
  department: z.enum(["food", "handmade", "drinks"]).nullable().optional(),
  message: z.string().trim().min(1).max(1000),
}).strict();
const userFields = z.object({
  name: z.string().trim().min(1).max(120),
  username: usernameSchema,
  email: z.string().trim().email().max(120).nullable().optional(),
  password: passwordSchema,
  role: z.enum(["admin", "cashier", "sales", "drinks", "seller"]),
  sellerId: uuidSchema.nullable().optional(),
  active: z.boolean(),
}).strict();
export const userSchema = userFields.extend({ active: z.boolean().default(true) }).refine(
  (value) => value.role === "seller" ? Boolean(value.sellerId) : !value.sellerId,
  "Tài khoản người bán phải gắn một gian hàng; các tiểu ban không gắn gian hàng.",
);
export const userPatchSchema = userFields.partial().refine(
  (value) => Object.keys(value).length > 0, "Chưa có nội dung cập nhật.",
);
