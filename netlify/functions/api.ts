import { z, ZodError } from "zod";
import { currentUser, login, logout, sessionCookie } from "../../server/auth";
import {
  bootstrap,
  createProduct,
  createSeller,
  updateProduct,
  updateSeller,
  updateSettings,
} from "../../server/catalog";
import { configurationStatus } from "../../server/config";
import { HttpError } from "../../server/errors";
import { cancelOrder, clearAllOrders, confirmOrder, createOrder, deleteOrder } from "../../server/orders";
import { addOrderMessage, updatePreparation } from "../../server/workflow";
import { createUser, listUsers, updateUser } from "../../server/users";
import {
  confirmSchema,
  loginSchema,
  orderSchema,
  productPatchSchema,
  productSchema,
  sellerPatchSchema,
  sellerSchema,
  settingsSchema,
  preparationSchema,
  messageSchema,
  userSchema,
  userPatchSchema,
  uuidSchema,
} from "../../server/validation";

const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
function pathOf(request: Request) {
  return (
    new URL(request.url).pathname
      .replace(/^\/\.netlify\/functions\/api(?=\/|$)/, "")
      .replace(/^\/api(?=\/|$)/, "")
      .replace(/\/$/, "") || "/"
  );
}
async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new HttpError(415, "Yêu cầu phải dùng application/json.");
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 32_768)
    throw new HttpError(413, "Nội dung yêu cầu quá lớn.");
  try {
    return schema.parse(JSON.parse(raw || "{}"));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new HttpError(400, "JSON không hợp lệ.");
    throw error;
  }
}
function enforceSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new HttpError(
      403,
      "Yêu cầu khác nguồn đã bị chặn.",
      "INVALID_ORIGIN",
    );
}
export default async function handler(request: Request): Promise<Response> {
  try {
    const path = pathOf(request);
    const method = request.method.toUpperCase();
    if (method === "GET" && path === "/health")
      return json({ configured: configurationStatus() });
    if (!["GET", "POST", "PATCH", "PUT", "DELETE"].includes(method))
      throw new HttpError(
        405,
        "Phương thức không được hỗ trợ.",
        "METHOD_NOT_ALLOWED",
      );
    if (method !== "GET") enforceSameOrigin(request);
    if (path === "/auth/login" && method === "POST") {
      const input = await body(request, loginSchema);
      const result = await login(input.username, input.password);
      return json({ user: result.user }, 200, {
        "Set-Cookie": sessionCookie(result.token, request),
      });
    }
    if (path === "/auth/logout" && method === "POST") {
      await logout(request);
      return json({ success: true }, 200, {
        "Set-Cookie": sessionCookie("", request, true),
      });
    }
    const user = await currentUser(request);
    if (path === "/session" && method === "GET") return json({ user });
    if (path === "/bootstrap" && method === "GET")
      return json(await bootstrap(user));
    if (path === "/users" && method === "GET")
      return json({ users: await listUsers(user) });
    if (path === "/users" && method === "POST")
      return json(
        { user: await createUser(user, await body(request, userSchema)) },
        201,
      );
    const account = path.match(/^\/users\/([^/]+)$/);
    if (account && method === "PATCH")
      return json({
        user: await updateUser(
          user,
          uuidSchema.parse(account[1]),
          await body(request, userPatchSchema),
        ),
      });
    const preparation = path.match(/^\/preparation\/([^/]+)$/);
    if (preparation && method === "PATCH")
      return json({
        task: await updatePreparation(
          user,
          uuidSchema.parse(preparation[1]),
          await body(request, preparationSchema),
        ),
      });
    const message = path.match(/^\/orders\/([^/]+)\/messages$/);
    if (message && method === "POST")
      return json(
        {
          message: await addOrderMessage(
            user,
            uuidSchema.parse(message[1]),
            await body(request, messageSchema),
          ),
        },
        201,
      );
    if (path === "/products" && method === "POST")
      return json(
        {
          product: await createProduct(
            user,
            await body(request, productSchema),
          ),
        },
        201,
      );
    if (path === "/sellers" && method === "POST")
      return json(
        { seller: await createSeller(user, await body(request, sellerSchema)) },
        201,
      );
    if (path === "/settings" && method === "PUT")
      return json({
        settings: await updateSettings(
          user,
          await body(request, settingsSchema),
        ),
      });
    if (path === "/orders" && method === "POST")
      return json(
        { order: await createOrder(user, await body(request, orderSchema)) },
        201,
      );
    if ((path === "/orders" && method === "DELETE") || (path === "/orders/clear" && method === "POST"))
      return json({ result: await clearAllOrders(user) });
    const orderDelete = path.match(/^\/orders\/([^/]+)$/);
    if (orderDelete && method === "DELETE") {
      const id = uuidSchema.parse(orderDelete[1]);
      return json({ result: await deleteOrder(user, id) });
    }
    const resource = path.match(/^\/(products|sellers)\/([^/]+)$/);
    if (resource && method === "PATCH") {
      const id = uuidSchema.parse(resource[2]);
      return resource[1] === "products"
        ? json({
            product: await updateProduct(
              user,
              id,
              await body(request, productPatchSchema),
            ),
          })
        : json({
            seller: await updateSeller(
              user,
              id,
              await body(request, sellerPatchSchema),
            ),
          });
    }
    const orderAction = path.match(/^\/orders\/([^/]+)\/(confirm|cancel)$/);
    if (orderAction && method === "POST") {
      const id = uuidSchema.parse(orderAction[1]);
      if (orderAction[2] === "cancel")
        return json({ order: await cancelOrder(user, id) });
      const input = await body(request, confirmSchema);
      return json({ order: await confirmOrder(user, id, input.cashReceived) });
    }
    throw new HttpError(404, "Không tìm thấy API.", "NOT_FOUND");
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message, code: error.code }, error.status);
    if (error instanceof ZodError) {
      console.error("Zod validation error:", error.issues);
      const details = error.issues
        .map((issue) => `${issue.path.join(".") || "Dữ liệu"}: ${issue.message}`)
        .join("; ");
      return json(
        {
          error: `Dữ liệu không hợp lệ. ${details}`,
          code: "VALIDATION_ERROR",
          fields: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        400,
      );
    }
    const dbCode = (error as { code?: string }).code;
    if (dbCode === "23505")
      return json(
        { error: "Tên đăng nhập hoặc mã đã tồn tại.", code: "CONFLICT" },
        409,
      );
    if (dbCode === "42P01")
      return json(
        {
          error: "Chưa khởi tạo cơ sở dữ liệu. Chạy npm run db:setup.",
          code: "MIGRATION_REQUIRED",
        },
        503,
      );
    // Do not log DB connection strings, passwords, or JWTs.
    console.error("API request failed", {
      code: dbCode ?? "INTERNAL_ERROR",
      type: error instanceof Error ? error.name : "Unknown",
    });
    return json(
      {
        error: "Máy chủ chưa xử lý được yêu cầu. Vui lòng thử lại.",
        code: "SERVER_ERROR",
      },
      503,
    );
  }
}
