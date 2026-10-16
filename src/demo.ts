import type {
  BankDetails,
  Bootstrap,
  Order,
  OrderItem,
  Product,
  Seller,
  Settings,
  Department,
  Role,
  ManagedUser,
  PreparationTask,
  OrderMessage,
} from "./types";
import { localDay, randomUUID } from "./utils";

// This key contains only the browser's sample workspace. Live requests never use it.
const STORAGE_KEY = "hoi-trai-pos:demo:v3";
const VERSION = 3;
type IdempotencyEntry = { key: string; orderId: string; fingerprint: string };
type DemoState = Bootstrap & {
  version: number;
  idempotency: IdempotencyEntry[];
  users: ManagedUser[];
  tasks: PreparationTask[];
  messages: OrderMessage[];
};
const departmentOf = (item: {
  department?: Department;
  category?: string;
  name?: string;
}): Department =>
  item.department ||
  (/handmade|thủ công|móc khóa/i.test(
    (item.category || "") + " " + (item.name || ""),
  )
    ? "handmade"
    : /nước|uống|trà|milo/i.test(
          (item.category || "") + " " + (item.name || ""),
        )
      ? "drinks"
      : "food");
function dispatchDemo(state: DemoState, order: Order) {
  if (order.paymentStatus !== "paid") return;
  for (const department of ["food", "handmade", "drinks"] as Department[]) {
    const items = order.items.filter((i) => departmentOf(i) === department);
    if (
      !items.length ||
      state.tasks.some(
        (t) => t.orderId === order.id && t.department === department,
      )
    )
      continue;
    state.tasks.push({
      id: randomUUID(),
      orderId: order.id,
      department,
      status: "queued",
      items: clone(items),
      orderCode: order.code,
      customerName: order.customerName,
      note: order.note,
      createdAt: order.paidAt || order.createdAt,
      updatedAt: order.paidAt || order.createdAt,
    });
  }
  order.fulfillmentStatus = "queued";
}
function demoPermissions(state: DemoState) {
  return ["admin", "cashier", "seller"].includes(state.user.role);
}
function summarizeDemo(state: DemoState, orderId: string) {
  const order = state.orders.find((o) => o.id === orderId);
  const tasks = state.tasks.filter((t) => t.orderId === orderId);
  if (!order || !tasks.length) return;
  order.fulfillmentStatus = tasks.every((t) => t.status === "delivered")
    ? "delivered"
    : tasks.every((t) => ["ready", "delivered"].includes(t.status))
      ? "ready"
      : tasks.some((t) => t.status !== "queued")
        ? "preparing"
        : "queued";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function bankSnapshot(settings: Settings): BankDetails {
  return {
    bankBin: settings.bankBin,
    bankName: settings.bankName,
    accountNumber: settings.accountNumber,
    accountName: settings.accountName,
  };
}

function initialState(): DemoState {
  const sellers: Seller[] = [
    {
      id: "demo-seller-1",
      name: "Trạm Giải Khát",
      description: "Một ngụm mát lành, tiếp thêm năng lượng",
      color: "#DDF5E6",
      active: true,
    },
    {
      id: "demo-seller-2",
      name: "Bếp Lửa Trại",
      description: "Đồ ăn vặt nóng hổi, cùng nhau vui hết mình",
      color: "#FFF0D8",
      active: true,
    },
    {
      id: "demo-seller-3",
      name: "Góc Ăn Vui",
      description: "Món ngon nhỏ xinh cho một ngày đầy niềm vui",
      color: "#EEE5FF",
      active: true,
    },
  ];
  const products: Product[] = [
    {
      id: "demo-product-1",
      sellerId: sellers[0].id,
      name: "Trà đào cam sả",
      category: "Nước uống",
      price: 25000,
      stock: 48,
      emoji: "🍑",
      color: "#FFF0D8",
      active: true,
    },
    {
      id: "demo-product-2",
      sellerId: sellers[0].id,
      name: "Trà tắc",
      category: "Nước uống",
      price: 15000,
      stock: 65,
      emoji: "🍋",
      color: "#EFF7D9",
      active: true,
    },
    {
      id: "demo-product-3",
      sellerId: sellers[0].id,
      name: "Milo dầm",
      category: "Nước uống",
      price: 25000,
      stock: 32,
      emoji: "🍫",
      color: "#F1E6DE",
      active: true,
    },
    {
      id: "demo-product-4",
      sellerId: sellers[0].id,
      name: "Soda dâu",
      category: "Nước uống",
      price: 20000,
      stock: 24,
      emoji: "🍓",
      color: "#FCE7EB",
      active: true,
    },
    {
      id: "demo-product-5",
      sellerId: sellers[1].id,
      name: "Xúc xích nướng",
      category: "Đồ nướng",
      price: 15000,
      stock: 46,
      emoji: "🌭",
      color: "#FDEBD9",
      active: true,
    },
    {
      id: "demo-product-6",
      sellerId: sellers[1].id,
      name: "Viên chiên thập cẩm",
      category: "Ăn vặt",
      price: 25000,
      stock: 38,
      emoji: "🍢",
      color: "#FFF2D3",
      active: true,
    },
    {
      id: "demo-product-7",
      sellerId: sellers[1].id,
      name: "Khoai tây chiên",
      category: "Ăn vặt",
      price: 20000,
      stock: 40,
      emoji: "🍟",
      color: "#FAF0C7",
      active: true,
    },
    {
      id: "demo-product-8",
      sellerId: sellers[2].id,
      name: "Bánh tráng trộn",
      category: "Ăn vặt",
      price: 20000,
      stock: 44,
      emoji: "🥗",
      color: "#E5F1DB",
      active: true,
    },
    {
      id: "demo-product-9",
      sellerId: sellers[2].id,
      name: "Cơm cuộn",
      category: "Ăn no",
      price: 30000,
      stock: 18,
      emoji: "🍙",
      color: "#EEE8F7",
      active: true,
    },
    {
      id: "demo-product-10",
      sellerId: sellers[2].id,
      name: "Bánh flan",
      category: "Tráng miệng",
      price: 12000,
      stock: 35,
      emoji: "🍮",
      color: "#FFF0D8",
      active: true,
    },
  ];
  const settings: Settings = {
    eventName: "Hội Trại Thanh Xuân",
    bankBin: "",
    bankName: "",
    accountNumber: "",
    accountName: "",
  };
  const samples: Array<{
    seller: number;
    customer: string;
    rows: Array<[number, number]>;
    method: "cash" | "transfer";
    paid: boolean;
  }> = [
    {
      seller: 0,
      customer: "Nhóm Hoa Nắng",
      rows: [
        [0, 2],
        [1, 1],
      ],
      method: "transfer",
      paid: false,
    },
    {
      seller: 1,
      customer: "Minh Anh",
      rows: [
        [4, 2],
        [6, 1],
      ],
      method: "cash",
      paid: true,
    },
    {
      seller: 2,
      customer: "Lớp 11A2",
      rows: [
        [7, 3],
        [8, 2],
      ],
      method: "transfer",
      paid: true,
    },
    {
      seller: 0,
      customer: "Gia Hân",
      rows: [[2, 2]],
      method: "cash",
      paid: true,
    },
    {
      seller: 1,
      customer: "Đội Sao Mai",
      rows: [
        [5, 3],
        [4, 2],
      ],
      method: "transfer",
      paid: false,
    },
    {
      seller: 2,
      customer: "Khách lẻ",
      rows: [[9, 4]],
      method: "cash",
      paid: true,
    },
    {
      seller: 0,
      customer: "Nhóm Mây Trắng",
      rows: [
        [3, 2],
        [1, 2],
      ],
      method: "transfer",
      paid: true,
    },
    {
      seller: 1,
      customer: "Tuấn Kiệt",
      rows: [[6, 2]],
      method: "cash",
      paid: true,
    },
  ];
  const today = new Date();
  products.forEach((product) => {
    product.department = departmentOf(product);
  });
  products.push(
    {
      id: "demo-handmade",
      sellerId: sellers[2].id,
      name: "Móc khóa len handmade",
      category: "Đồ handmade",
      department: "handmade",
      price: 30000,
      stock: 20,
      emoji: "🧶",
      color: "#EEE5FF",
      active: true,
    },
    {
      id: "demo-cookie",
      sellerId: sellers[1].id,
      name: "Bánh cookie",
      category: "Đồ ăn",
      department: "food",
      price: 15000,
      stock: 40,
      emoji: "🍪",
      color: "#FFF0D8",
      active: true,
    },
  );
  const vietnamDay = localDay(today.toISOString());
  const midnight = new Date(`${vietnamDay}T00:00:00+07:00`);
  const dateCode = vietnamDay.replaceAll("-", "").slice(2);
  const orders: Order[] = samples.map((sample, index) => {
    const items: OrderItem[] = sample.rows.map(([productIndex, quantity]) => ({
      productId: products[productIndex].id,
      name: products[productIndex].name,
      price: products[productIndex].price,
      quantity,
      department: products[productIndex].department,
      sellerId: products[productIndex].sellerId,
      sellerName: sellers.find((s) => s.id === products[productIndex].sellerId)
        ?.name,
    }));
    const total = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const createdAt = new Date(
      Math.max(midnight.getTime(), today.getTime() - (index * 17 + 8) * 60000),
    ).toISOString();
    return {
      id: `demo-order-${index + 1}`,
      code: `HT${dateCode}DEMO${String(index + 1).padStart(8, "0")}`,
      sellerId: sellers[sample.seller].id,
      sellerName: sellers[sample.seller].name,
      customerName: sample.customer,
      note: index === 2 ? "Giao tại khu sinh hoạt chung" : "",
      items,
      total,
      paymentMethod: sample.method,
      paymentStatus: sample.paid ? "paid" : "pending",
      cashReceived:
        sample.method === "cash" ? Math.ceil(total / 10000) * 10000 : null,
      createdAt,
      paidAt: sample.paid ? createdAt : null,
      paymentSource: sample.paid
        ? sample.method === "cash"
          ? "cash"
          : "manual"
        : null,
      bankDetails: sample.method === "transfer" ? bankSnapshot(settings) : null,
    };
  });
  const state: DemoState = {
    version: VERSION,
    user: {
      id: "demo-admin",
      name: "Nguyễn Minh Anh",
      username: "demo",
      role: "admin",
      sellerId: null,
    },
    sellers,
    products,
    orders,
    settings,
    idempotency: [],
    users: [
      {
        id: "demo-admin",
        name: "Nguyễn Minh Anh",
        username: "demo",
        role: "admin",
        sellerId: null,
        active: true,
      },
      {
        id: "demo-cashier",
        name: "Ban thu ngân",
        username: "thungan",
        role: "cashier",
        sellerId: null,
        active: true,
      },
      {
        id: "demo-sales",
        name: "Ban bán hàng",
        username: "banhang",
        role: "sales",
        sellerId: null,
        active: true,
      },
      {
        id: "demo-drinks",
        name: "Ban chuẩn bị nước",
        username: "hauncan",
        role: "drinks",
        sellerId: null,
        active: true,
      },
    ],
    tasks: [],
    messages: [],
  };
  orders.forEach((order) => dispatchDemo(state, order));
  return state;
}

function save(state: DemoState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new Error(
      "Trình duyệt không thể lưu dữ liệu dùng thử. Hãy cho phép lưu trữ hoặc giải phóng dung lượng.",
    );
  }
}

function read(): DemoState {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new Error(
      "Hãy cho phép trình duyệt lưu trữ để sử dụng bản dùng thử.",
    );
  }
  if (raw === null) {
    const state = initialState();
    save(state);
    return state;
  }
  try {
    const state = JSON.parse(raw) as DemoState;
    if (
      state.version !== VERSION ||
      !Array.isArray(state.products) ||
      !Array.isArray(state.orders) ||
      !Array.isArray(state.sellers) ||
      !Array.isArray(state.idempotency) ||
      !state.settings ||
      !state.user
    ) {
      throw new Error("invalid");
    }
    return state;
  } catch {
    throw new Error(
      "Dữ liệu dùng thử trong trình duyệt không hợp lệ. Hãy đặt lại dữ liệu mẫu.",
    );
  }
}

function textField(
  value: unknown,
  label: string,
  max: number,
  required = false,
): string {
  if (typeof value !== "string") throw new Error(`${label} phải là văn bản.`);
  const result = value.trim();
  if (required && !result)
    throw new Error(`Vui lòng nhập ${label.toLowerCase()}.`);
  if (result.length > max)
    throw new Error(`${label} không được dài quá ${max} ký tự.`);
  return result;
}

function amount(value: unknown, label: string, min = 0): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > 100000000
  ) {
    throw new Error(
      `${label} phải là số nguyên từ ${min.toLocaleString("vi-VN")} đến 100.000.000.`,
    );
  }
  return value;
}

function color(value: unknown): string {
  if (typeof value !== "string" || !/^#[a-f\d]{6}$/i.test(value))
    throw new Error("Màu phải có dạng mã HEX, ví dụ #DDF5E6.");
  return value;
}

function active(value: unknown): boolean {
  if (typeof value !== "boolean")
    throw new Error("Trạng thái hoạt động không hợp lệ.");
  return value;
}

function sellerById(state: DemoState, id: unknown): Seller {
  const seller = state.sellers.find((entry) => entry.id === id);
  if (!seller) throw new Error("Không tìm thấy gian hàng.");
  return seller;
}

function productFields(
  state: DemoState,
  body: Record<string, unknown>,
  previous?: Product,
): Product {
  const sellerId = body.sellerId ?? previous?.sellerId;
  const seller = sellerById(state, sellerId);
  const stock =
    body.stock === undefined ? (previous?.stock ?? null) : body.stock;
  return {
    id: previous?.id ?? randomUUID(),
    sellerId: seller.id,
    name: textField(body.name ?? previous?.name, "Tên món", 120, true),
    category: textField(
      body.category ?? previous?.category ?? "Khác",
      "Danh mục",
      60,
      true,
    ),
    price: amount(body.price ?? previous?.price, "Giá bán", 1),
    stock: stock === null ? null : amount(stock, "Tồn kho"),
    emoji: textField(
      body.emoji ?? previous?.emoji ?? "🍴",
      "Biểu tượng",
      24,
      true,
    ),
    color: color(body.color ?? previous?.color ?? "#E5F1DB"),
    active: active(body.active ?? previous?.active ?? true),
    department: departmentOf({
      department: (body.department as Department) || previous?.department,
      category: String(body.category ?? previous?.category ?? ""),
      name: String(body.name ?? previous?.name ?? ""),
    }),
  };
}

function sellerFields(
  body: Record<string, unknown>,
  previous?: Seller,
): Seller {
  return {
    id: previous?.id ?? randomUUID(),
    name: textField(body.name ?? previous?.name, "Tên gian hàng", 120, true),
    description: textField(
      body.description ?? previous?.description ?? "",
      "Mô tả gian hàng",
      500,
    ),
    color: color(body.color ?? previous?.color ?? "#DDF5E6"),
    active: active(body.active ?? previous?.active ?? true),
  };
}

function newOrder(state: DemoState, body: Record<string, unknown>): Order {
  if (
    typeof body.idempotencyKey !== "string" ||
    !/^[a-z\d_-]{16,100}$/i.test(body.idempotencyKey)
  ) {
    throw new Error("Khóa yêu cầu tạo đơn không hợp lệ. Hãy thử lại.");
  }
  const paymentMethod = body.paymentMethod;
  if (paymentMethod !== "cash" && paymentMethod !== "transfer")
    throw new Error("Vui lòng chọn tiền mặt hoặc chuyển khoản.");
  const customerName = textField(
    body.customerName ?? "",
    "Tên khách hàng",
    120,
  );
  const note = textField(body.note ?? "", "Ghi chú", 500);
  const cashReceived =
    paymentMethod === "cash" && body.cashReceived != null
      ? amount(body.cashReceived, "Tiền khách đưa")
      : null;
  if (
    !Array.isArray(body.items) ||
    body.items.length === 0 ||
    body.items.length > 100
  )
    throw new Error("Đơn hàng phải có từ 1 đến 100 món.");
  const quantities = new Map<string, number>();
  for (const rawItem of body.items) {
    if (
      !rawItem ||
      typeof rawItem !== "object" ||
      typeof rawItem.productId !== "string"
    )
      throw new Error("Món trong đơn không hợp lệ.");
    const quantity = rawItem.quantity;
    if (
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 999
    )
      throw new Error("Số lượng mỗi món phải từ 1 đến 999.");
    const combined = (quantities.get(rawItem.productId) ?? 0) + quantity;
    if (combined > 999) throw new Error("Số lượng mỗi món không được quá 999.");
    quantities.set(rawItem.productId, combined);
  }
  const fingerprint = JSON.stringify({
    sellerId: body.sellerId,
    items: [...quantities.entries()].sort(([a], [b]) => a.localeCompare(b)),
    customerName,
    note,
    paymentMethod,
    cashReceived,
  });
  const cached = state.idempotency.find(
    (entry) => entry.key === body.idempotencyKey,
  );
  if (cached) {
    if (cached.fingerprint !== fingerprint)
      throw new Error(
        "Yêu cầu tạo đơn đã được sử dụng với nội dung khác. Vui lòng tạo đơn mới.",
      );
    const original = state.orders.find((entry) => entry.id === cached.orderId);
    if (!original) throw new Error("Không tìm thấy đơn hàng của yêu cầu này.");
    return original;
  }
  const seller = body.sellerId ? sellerById(state, body.sellerId) : null;
  if (seller && !seller.active)
    throw new Error("Gian hàng đang tạm ngưng bán.");
  const items: OrderItem[] = [...quantities.entries()].map(
    ([productId, quantity]) => {
      const product = state.products.find((entry) => entry.id === productId);
      if (!product || !product.active)
        throw new Error(
          "Có món không còn được bán. Vui lòng kiểm tra giỏ hàng.",
        );
      if (seller && product.sellerId !== seller.id)
        throw new Error(
          "Một đơn hàng chỉ được chứa món của cùng một gian hàng.",
        );
      if (product.stock !== null && product.stock < quantity)
        throw new Error(`${product.name} chỉ còn ${product.stock} phần.`);
      const owner = sellerById(state, product.sellerId);
      if (!owner.active) throw new Error("Gian hàng đang tạm ngưng bán.");
      return {
        productId,
        name: product.name,
        quantity,
        price: product.price,
        department: departmentOf(product),
        sellerId: owner.id,
        sellerName: owner.name,
      };
    },
  );
  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  if (cashReceived !== null && cashReceived < total)
    throw new Error("Tiền khách đưa chưa đủ để thanh toán đơn hàng.");
  const now = new Date();
  const dateCode = localDay(now.toISOString()).replaceAll("-", "").slice(2);
  const order: Order = {
    id: randomUUID(),
    code: `HT${dateCode}${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
    sellerId:
      seller?.id ||
      (new Set(items.map((i) => i.sellerId)).size === 1
        ? items[0].sellerId!
        : null),
    sellerName:
      seller?.name || [...new Set(items.map((i) => i.sellerName))].join(" · "),
    customerName,
    note,
    items,
    total,
    paymentMethod,
    paymentStatus: cashReceived !== null ? "paid" : "pending",
    cashReceived,
    createdAt: now.toISOString(),
    paidAt: cashReceived !== null ? now.toISOString() : null,
    paymentSource: cashReceived !== null ? "cash" : null,
    bankDetails:
      paymentMethod === "transfer" ? bankSnapshot(state.settings) : null,
  };
  for (const item of items) {
    const product = state.products.find(
      (entry) => entry.id === item.productId,
    )!;
    if (product.stock !== null) product.stock -= item.quantity;
  }
  state.orders.unshift(order);
  dispatchDemo(state, order);
  state.idempotency.push({
    key: body.idempotencyKey,
    orderId: order.id,
    fingerprint,
  });
  return order;
}

function transitionOrder(
  state: DemoState,
  orderId: string,
  action: string,
  body: Record<string, unknown>,
): Order {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) throw new Error("Không tìm thấy đơn hàng.");
  if (action === "cancel") {
    if (order.paymentStatus === "paid")
      throw new Error("Đơn đã thanh toán không thể hủy.");
    if (order.paymentStatus === "pending") {
      for (const item of order.items) {
        const product = state.products.find(
          (entry) => entry.id === item.productId,
        );
        if (product && product.stock !== null) product.stock += item.quantity;
      }
      order.paymentStatus = "cancelled";
    }
    return order;
  }
  if (order.paymentStatus === "cancelled")
    throw new Error("Không thể thanh toán đơn đã hủy.");
  if (order.paymentStatus === "paid") return order;
  if (order.paymentMethod === "cash") {
    const cashReceived = amount(body.cashReceived, "Tiền khách đưa");
    if (cashReceived < order.total)
      throw new Error("Tiền khách đưa chưa đủ để thanh toán đơn hàng.");
    order.cashReceived = cashReceived;
    order.paymentSource = "cash";
  } else {
    order.paymentSource = "manual";
  }
  order.paymentStatus = "paid";
  order.paidAt = new Date().toISOString();
  dispatchDemo(state, order);
  return order;
}

export function resetDemo(): void {
  save(initialState());
}

export async function demoRequest<T>(
  path: string,
  options: { method?: string; body?: any } = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const route = path.split("?")[0].replace(/\/$/, "") || "/";
  let body: Record<string, unknown> = {};
  if (options.body !== undefined) {
    let decoded: unknown;
    try {
      decoded =
        typeof options.body === "string"
          ? JSON.parse(options.body)
          : options.body;
    } catch {
      throw new Error("Nội dung yêu cầu không hợp lệ.");
    }
    if (
      decoded === null ||
      typeof decoded !== "object" ||
      Array.isArray(decoded)
    )
      throw new Error("Nội dung yêu cầu không hợp lệ.");
    body = decoded as Record<string, unknown>;
  }
  const state = read();
  let response: unknown;
  if (method === "GET" && route === "/bootstrap") {
    const {
      version: _version,
      idempotency: _idempotency,
      ...bootstrap
    } = state;
    const result = clone(bootstrap);
    if (["sales", "drinks"].includes(state.user.role)) {
      const allowed: Department[] =
        state.user.role === "drinks" ? ["drinks"] : ["food", "handmade"];
      result.tasks = state.tasks
        .filter((t) => allowed.includes(t.department))
        .map((task) => ({
          ...task,
          items: task.items.map((item) => ({ ...item, price: 0 })),
        }));
      result.orders = state.orders
        .filter((o) => o.paymentStatus === "paid")
        .map((o) => ({
          ...o,
          items: o.items
            .filter((i) => allowed.includes(departmentOf(i)))
            .map((item) => ({ ...item, price: 0 })),
          bankDetails: null,
          cashReceived: null,
          paymentSource: null,
          total: 0,
        }))
        .filter((o) => o.items.length);
      result.products = [];
      result.messages = state.messages.filter(
        (m) =>
          result.orders.some((o) => o.id === m.orderId) &&
          (!m.department || allowed.includes(m.department)),
      );
      result.settings = {
        ...state.settings,
        bankBin: "",
        bankName: "",
        accountNumber: "",
        accountName: "",
      };
    }
    if (state.user.role !== "admin")
      delete (result as Partial<DemoState>).users;
    return result as T;
  }
  if (route === "/demo/role" && method === "POST") {
    const user = state.users.find((u) => u.role === body.role && u.active);
    if (!user) throw new Error("Vai trò demo không tồn tại.");
    state.user = user;
    save(state);
    return { user: clone(user) } as T;
  }
  const isAdmin = state.user.role === "admin";
  if (
    ["/products", "/settings", "/sellers", "/users"].some(
      (base) => route === base || route.startsWith(base + "/"),
    ) &&
    !isAdmin
  )
    throw new Error("Chỉ quản trị được quản lý dữ liệu trong demo.");
  if (
    (route === "/orders" ||
      /^\/orders\/[^/]+\/(confirm|cancel)$/.test(route)) &&
    !demoPermissions(state)
  )
    throw new Error("Ban chuẩn bị không có quyền thu tiền hoặc tạo đơn.");
  if (route === "/users" && method === "GET")
    return { users: clone(state.users) } as T;
  if (route === "/users" && method === "POST") {
    const role = String(body.role) as Role;
    if (!["admin", "cashier", "sales", "drinks", "seller"].includes(role))
      throw new Error("Vai trò không hợp lệ.");
    const username = textField(
      body.username,
      "Tên đăng nhập",
      40,
      true,
    ).toLowerCase();
    if (
      !/^[a-z0-9_.-]{3,40}$/.test(username) ||
      state.users.some((u) => u.username === username)
    )
      throw new Error("Tên đăng nhập không hợp lệ hoặc đã có.");
    const password = textField(body.password, "Mật khẩu", 72, true);
    if (
      password.length < 12 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password)
    )
      throw new Error(
        "Mật khẩu cần ít nhất 12 ký tự, chữ hoa, chữ thường và số.",
      );
    const user: ManagedUser = {
      id: randomUUID(),
      name: textField(body.name, "Tên người dùng", 120, true),
      username,
      role,
      sellerId: role === "seller" ? sellerById(state, body.sellerId).id : null,
      active: true,
    };
    state.users.push(user);
    response = { user };
  } else if (/^\/users\/[^/]+$/.test(route) && method === "PATCH") {
    const user = state.users.find((u) => u.id === route.split("/")[2]);
    if (!user) throw new Error("Không tìm thấy tài khoản.");
    if (
      user.id === state.user.id &&
      (body.active === false || (body.role && body.role !== "admin"))
    )
      throw new Error("Không được tự khóa hoặc hạ quyền quản trị.");
    if (body.name !== undefined)
      user.name = textField(body.name, "Tên", 120, true);
    if (body.username !== undefined) {
      const username = textField(
        body.username,
        "Tên đăng nhập",
        40,
        true,
      ).toLowerCase();
      if (
        !/^[a-z0-9_.-]{3,40}$/.test(username) ||
        state.users.some(
          (other) => other.id !== user.id && other.username === username,
        )
      )
        throw new Error("Tên đăng nhập không hợp lệ hoặc đã có.");
      user.username = username;
    }
    if (body.role !== undefined) {
      if (
        !["admin", "cashier", "sales", "drinks", "seller"].includes(
          String(body.role),
        )
      )
        throw new Error("Vai trò không hợp lệ.");
      user.role = body.role as Role;
    }
    if (body.active !== undefined) user.active = active(body.active);
    if (user.role !== "seller") user.sellerId = null;
    else if (body.sellerId) user.sellerId = sellerById(state, body.sellerId).id;
    if (user.id === state.user.id) state.user = clone(user);
    response = { user };
  } else if (/^\/preparation\/[^/]+$/.test(route) && method === "PATCH") {
    const task = state.tasks.find((t) => t.id === route.split("/")[2]);
    if (!task) throw new Error("Không tìm thấy phần việc.");
    const allowed =
      isAdmin ||
      (state.user.role === "sales" &&
        ["food", "handmade"].includes(task.department)) ||
      (state.user.role === "drinks" && task.department === "drinks") ||
      state.user.role === "cashier";
    if (!allowed)
      throw new Error("Không có quyền xử lý phần việc của ban khác.");
    const next = {
      queued: "preparing",
      preparing: "ready",
      ready: "delivered",
      delivered: "delivered",
    }[task.status];
    if (body.status !== task.status && body.status !== next)
      throw new Error(
        "Cần xử lý theo thứ tự nhận đơn, chuẩn bị, sẵn sàng, đã giao.",
      );
    if (
      (state.user.role === "cashier" && body.status !== "delivered") ||
      (["sales", "drinks"].includes(state.user.role) &&
        body.status === "delivered")
    )
      throw new Error("Ban chuẩn bị báo sẵn sàng; thu ngân xác nhận đã giao.");
    task.status = body.status as PreparationTask["status"];
    task.updatedAt = new Date().toISOString();
    task.updatedByName = state.user.name;
    summarizeDemo(state, task.orderId);
    response = { task };
  } else if (/^\/orders\/[^/]+\/messages$/.test(route) && method === "POST") {
    const order = state.orders.find((o) => o.id === route.split("/")[2]);
    if (!order || order.paymentStatus !== "paid")
      throw new Error("Chỉ trao đổi đơn đã thanh toán.");
    const department = body.department
      ? (String(body.department) as Department)
      : null;
    if (department && !["food", "handmade", "drinks"].includes(department))
      throw new Error("Ban nhận không hợp lệ.");
    if (department && !order.items.some((i) => departmentOf(i) === department))
      throw new Error("Đơn không có phần việc của ban này.");
    if (
      state.user.role === "drinks" &&
      (department !== "drinks" ||
        !order.items.some((i) => departmentOf(i) === "drinks"))
    )
      throw new Error("Chỉ trao đổi phần việc nước.");
    if (
      state.user.role === "sales" &&
      (!department ||
        department === "drinks" ||
        !order.items.some((i) => departmentOf(i) === department))
    )
      throw new Error("Chỉ trao đổi phần việc bán hàng.");
    const message: OrderMessage = {
      id: randomUUID(),
      orderId: order.id,
      department,
      authorId: state.user.id,
      authorName: state.user.name,
      role: state.user.role,
      message: textField(body.message, "Phản hồi", 1000, true),
      createdAt: new Date().toISOString(),
    };
    state.messages.push(message);
    response = { message };
  } else if (method === "POST" && route === "/products") {
    const product = productFields(state, body);
    state.products.push(product);
    response = { product };
  } else if (method === "PATCH" && /^\/products\/[^/]+$/.test(route)) {
    const id = route.split("/")[2];
    const index = state.products.findIndex((entry) => entry.id === id);
    if (index < 0) throw new Error("Không tìm thấy món.");
    const product = productFields(state, body, state.products[index]);
    state.products[index] = product;
    response = { product };
  } else if (method === "POST" && route === "/sellers") {
    const seller = sellerFields(body);
    state.sellers.push(seller);
    response = { seller };
  } else if (method === "PATCH" && /^\/sellers\/[^/]+$/.test(route)) {
    const id = route.split("/")[2];
    const index = state.sellers.findIndex((entry) => entry.id === id);
    if (index < 0) throw new Error("Không tìm thấy gian hàng.");
    const seller = sellerFields(body, state.sellers[index]);
    state.sellers[index] = seller;
    response = { seller };
  } else if (method === "PUT" && route === "/settings") {
    const settings: Settings = {
      eventName: textField(
        body.eventName ?? state.settings.eventName,
        "Tên hội trại",
        160,
        true,
      ),
      bankBin: textField(
        body.bankBin ?? state.settings.bankBin,
        "Mã ngân hàng",
        6,
      ),
      bankName: textField(
        body.bankName ?? state.settings.bankName,
        "Tên ngân hàng",
        120,
      ),
      accountNumber: textField(
        body.accountNumber ?? state.settings.accountNumber,
        "Số tài khoản",
        19,
      ),
      accountName: textField(
        body.accountName ?? state.settings.accountName,
        "Tên chủ tài khoản",
        120,
      ),
    };
    if (settings.bankBin && !/^\d{6}$/.test(settings.bankBin))
      throw new Error("Mã BIN ngân hàng phải gồm 6 chữ số.");
    if (
      settings.accountNumber &&
      !/^[0-9A-Za-z]{1,19}$/.test(settings.accountNumber)
    )
      throw new Error("Số tài khoản chỉ gồm chữ hoặc số, tối đa 19 ký tự.");
    state.settings = settings;
    response = { settings };
  } else if (method === "POST" && route === "/orders") {
    response = { order: newOrder(state, body) };
  } else if (
    method === "POST" &&
    /^\/orders\/[^/]+\/(confirm|cancel)$/.test(route)
  ) {
    const [, , orderId, action] = route.split("/");
    response = { order: transitionOrder(state, orderId, action, body) };
  } else {
    throw new Error("Chức năng này không có trong bản dùng thử.");
  }
  save(state);
  return clone(response) as T;
}
