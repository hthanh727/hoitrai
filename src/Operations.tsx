import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { api } from "./api";
import type {
  Bootstrap,
  Department,
  ManagedUser,
  Order,
  OrderItem,
  PreparationStatus,
  PreparationTask,
  Role,
} from "./types";
import { localDay, money, time } from "./utils";
import "./operations.css";

export const roleLabel = (role: Role) =>
  ({
    admin: "Quản trị viên",
    cashier: "Thu ngân",
    sales: "Ban bán hàng",
    drinks: "Ban chuẩn bị nước",
    seller: "Người bán gian hàng",
  })[role];
export const departmentLabel = (department: Department) =>
  ({
    food: "Đồ ăn / cookie",
    handmade: "Đồ handmade",
    drinks: "Nước uống",
  })[department];
const preparationLabel = (status: PreparationStatus | "none") =>
  ({
    none: "Chưa phân việc",
    queued: "Chờ chuẩn bị",
    preparing: "Đang chuẩn bị",
    ready: "Sẵn sàng giao",
    delivered: "Đã giao khách",
  })[status];
const paymentLabel = (status: Order["paymentStatus"]) =>
  ({
    paid: "Đã thanh toán",
    pending: "Chờ thanh toán",
    cancelled: "Đã hủy",
  })[status];
const departments: Department[] = ["food", "handmade", "drinks"];
const preparationStates: PreparationStatus[] = [
  "queued",
  "preparing",
  "ready",
  "delivered",
];
type SharedProps = {
  data: Bootstrap;
  notify: (message: string, error?: boolean) => void;
  refresh: (silent?: boolean) => Promise<void>;
};
export type HistoryFilters = {
  search: string;
  from: string;
  to: string;
  paymentMethod: "all" | Order["paymentMethod"];
  paymentStatus: "all" | Order["paymentStatus"];
  seller: string;
  department: "all" | Department;
  preparation: "all" | "none" | PreparationStatus;
  min: string;
  max: string;
};
export const emptyHistoryFilters: HistoryFilters = {
  search: "",
  from: "",
  to: "",
  paymentMethod: "all",
  paymentStatus: "all",
  seller: "all",
  department: "all",
  preparation: "all",
  min: "",
  max: "",
};
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
const isPreparationUser = (role: Role) => role === "sales" || role === "drinks";
export function itemDepartment(
  item: OrderItem,
  data: Pick<Bootstrap, "products">,
): Department {
  const product = data.products.find((p) => p.id === item.productId);
  if (item.department || product?.department)
    return (item.department || product?.department)!;
  const hint = normalize(`${product?.category || ""} ${item.name}`);
  if (/handmade|thu cong|moc khoa|vong tay|moc len|qua luu niem/.test(hint))
    return "handmade";
  if (/nuoc|tra |tra$|ca phe|coffee|soda|sinh to|juice/.test(hint))
    return "drinks";
  return "food";
}
function allowedDepartments(role: Role): Department[] {
  return role === "sales"
    ? ["food", "handmade"]
    : role === "drinks"
      ? ["drinks"]
      : departments;
}
export function historyOrders(data: Bootstrap): Order[] {
  if (!isPreparationUser(data.user.role)) return data.orders;
  return data.orders
    .map((order) => {
      const items = order.items.filter((item) =>
        allowedDepartments(data.user.role).includes(itemDepartment(item, data)),
      );
      return {
        ...order,
        items,
        total: 0,
      };
    })
    .filter((order) => order.items.length > 0);
}
function tasksForOrder(
  order: Order,
  data: Bootstrap,
  department: HistoryFilters["department"] = "all",
) {
  return (data.tasks || []).filter(
    (task) =>
      task.orderId === order.id &&
      allowedDepartments(data.user.role).includes(task.department) &&
      (department === "all" || task.department === department),
  );
}
function orderPreparation(
  order: Order,
  data: Bootstrap,
): PreparationStatus | "none" {
  const tasks = tasksForOrder(order, data);
  if (!tasks.length) return order.fulfillmentStatus || "none";
  return (
    preparationStates.find((status) =>
      tasks.some((task) => task.status === status),
    ) || "none"
  );
}
export function filterHistory(
  data: Bootstrap,
  filters: HistoryFilters,
): Order[] {
  const search = normalize(filters.search.trim());
  return historyOrders(data)
    .filter((order) => {
      if (
        filters.paymentStatus !== "all" &&
        order.paymentStatus !== filters.paymentStatus
      )
        return false;
      if (
        filters.paymentMethod !== "all" &&
        order.paymentMethod !== filters.paymentMethod
      )
        return false;
      const day = Number.isNaN(Date.parse(order.createdAt))
        ? ""
        : localDay(order.createdAt);
      if (filters.from && day < filters.from) return false;
      if (filters.to && day > filters.to) return false;
      if (
        filters.seller !== "all" &&
        order.sellerId !== filters.seller &&
        !order.items.some(
          (item) =>
            (item.sellerId ||
              data.products.find((p) => p.id === item.productId)?.sellerId) ===
            filters.seller,
        )
      )
        return false;
      if (
        filters.department !== "all" &&
        !order.items.some(
          (item) => itemDepartment(item, data) === filters.department,
        )
      )
        return false;
      if (filters.preparation !== "all") {
        const tasks = tasksForOrder(order, data, filters.department);
        if (
          tasks.length
            ? !tasks.some((task) => task.status === filters.preparation)
            : (order.fulfillmentStatus || "none") !== filters.preparation
        )
          return false;
      }
      if (!isPreparationUser(data.user.role)) {
        if (filters.min !== "" && order.total < Number(filters.min))
          return false;
        if (filters.max !== "" && order.total > Number(filters.max))
          return false;
      }
      return (
        !search ||
        normalize(
          [
            order.code,
            order.customerName,
            order.note,
            ...order.items.map((item) => item.name),
          ].join(" "),
        ).includes(search)
      );
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
export function historySummary(orders: Order[]) {
  return orders.reduce(
    (summary, order) => ({
      count: summary.count + 1,
      paidRevenue:
        summary.paidRevenue +
        (order.paymentStatus === "paid" ? order.total : 0),
      pendingAmount:
        summary.pendingAmount +
        (order.paymentStatus === "pending" ? order.total : 0),
      units:
        summary.units +
        (order.paymentStatus === "cancelled"
          ? 0
          : order.items.reduce((sum, item) => sum + item.quantity, 0)),
    }),
    { count: 0, paidRevenue: 0, pendingAmount: 0, units: 0 },
  );
}
export function historyCsv(orders: Order[], data: Bootstrap) {
  const escape = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const scoped = isPreparationUser(data.user.role);
  const rows: unknown[][] = [
    [
      "Mã đơn",
      "Khách hàng",
      "Gian hàng",
      "Thời gian (Việt Nam)",
      scoped ? "Số món của ban" : "Tổng tiền (VND)",
      "Phương thức",
      "Thanh toán",
      "Chuẩn bị",
      "Món",
      "Ghi chú",
      ...(!scoped ? ["Nguồn xác nhận"] : []),
    ],
  ];
  orders.forEach((order) =>
    rows.push([
      order.code,
      order.customerName,
      order.sellerName,
      new Date(order.createdAt).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
      }),
      scoped
        ? order.items.reduce((sum, item) => sum + item.quantity, 0)
        : order.total,
      order.paymentMethod === "cash" ? "Tiền mặt" : "Chuyển khoản",
      paymentLabel(order.paymentStatus),
      preparationLabel(orderPreparation(order, data)),
      order.items.map((item) => `${item.quantity} × ${item.name}`).join("; "),
      order.note,
      ...(!scoped ? [order.paymentSource] : []),
    ]),
  );
  return "\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n");
}
function downloadHistory(orders: Order[], data: Bootstrap) {
  const url = URL.createObjectURL(
    new Blob([historyCsv(orders, data)], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `lich-su-don-${localDay()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function OrderHistory({
  data,
  onOrder,
}: SharedProps & { onOrder: (id: string) => void }) {
  const [filters, setFilters] = useState<HistoryFilters>({
    ...emptyHistoryFilters,
  });
  const [page, setPage] = useState(1);
  const orders = useMemo(() => filterHistory(data, filters), [data, filters]);
  const summary = historySummary(orders);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(orders.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const scoped = isPreparationUser(data.user.role);
  const filteredTasks = (data.tasks || []).filter(
    (task) =>
      allowedDepartments(data.user.role).includes(task.department) &&
      (filters.department === "all" ||
        task.department === filters.department) &&
      orders.some(
        (order) => order.id === task.orderId && order.paymentStatus === "paid",
      ),
  );
  function change<K extends keyof HistoryFilters>(
    key: K,
    value: HistoryFilters[K],
  ) {
    setFilters((before) => ({ ...before, [key]: value }));
    setPage(1);
  }
  const invalidRange =
    (filters.from && filters.to && filters.from > filters.to) ||
    (!scoped &&
      filters.min !== "" &&
      filters.max !== "" &&
      Number(filters.min) > Number(filters.max));
  return (
    <section className="operations history-panel" aria-label="Lịch sử lên đơn">
      <div className="op-heading">
        <div>
          <h2>Lịch sử lên đơn</h2>
          <p>
            {scoped
              ? "Lịch sử các món thuộc ban của bạn và tiến độ chuẩn bị."
              : "Lọc đơn, theo dõi thanh toán và tiến độ chuẩn bị."}
          </p>
        </div>
        <button
          className="btn secondary small"
          disabled={!orders.length || !!invalidRange}
          onClick={() => downloadHistory(orders, data)}
        >
          <Download size={15} />
          Xuất CSV ({orders.length})
        </button>
      </div>
      <div className="op-stat-grid" aria-label="Thống kê đơn theo bộ lọc">
        <div>
          <span>Đơn phù hợp</span>
          <strong>{summary.count}</strong>
          <small>Bao gồm đơn đã hủy</small>
        </div>
        {scoped ? (
          <>
            <div>
              <span>Phần việc đang chuẩn bị</span>
              <strong>
                {
                  filteredTasks.filter(
                    (task) =>
                      task.status === "queued" || task.status === "preparing",
                  ).length
                }
              </strong>
              <small>Chờ làm hoặc đang làm</small>
            </div>
            <div>
              <span>Phần việc sẵn sàng</span>
              <strong>
                {filteredTasks.filter((task) => task.status === "ready").length}
              </strong>
              <small>Thu ngân có thể giao khách</small>
            </div>
          </>
        ) : (
          <>
            <div>
              <span>Doanh thu đã thanh toán</span>
              <strong>{money(summary.paidRevenue)}</strong>
              <small>Chỉ tính đơn đã thanh toán</small>
            </div>
            <div>
              <span>Tiền chờ thanh toán</span>
              <strong>{money(summary.pendingAmount)}</strong>
              <small>Đơn chưa nhận đủ tiền</small>
            </div>
          </>
        )}
        <div>
          <span>{scoped ? "Số món của ban" : "Số món đã đặt"}</span>
          <strong>{summary.units}</strong>
          <small>Không tính đơn đã hủy</small>
        </div>
      </div>
      <form
        className="op-filters"
        onSubmit={(event) => event.preventDefault()}
        aria-label="Bộ lọc lịch sử"
      >
        <label className="op-field op-search">
          <span>Tìm đơn hàng</span>
          <input
            value={filters.search}
            onChange={(event) => change("search", event.target.value)}
            placeholder="Mã đơn, khách, ghi chú hoặc tên món…"
          />
        </label>
        <label className="op-field">
          <span>Từ ngày</span>
          <input
            type="date"
            value={filters.from}
            onChange={(event) => change("from", event.target.value)}
          />
        </label>
        <label className="op-field">
          <span>Đến ngày</span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) => change("to", event.target.value)}
          />
        </label>
        <label className="op-field">
          <span>Thanh toán</span>
          <select
            value={filters.paymentStatus}
            onChange={(event) =>
              change(
                "paymentStatus",
                event.target.value as HistoryFilters["paymentStatus"],
              )
            }
          >
            <option value="all">Tất cả trạng thái</option>
            {(["pending", "paid", "cancelled"] as const).map((status) => (
              <option key={status} value={status}>
                {paymentLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="op-field">
          <span>Phương thức</span>
          <select
            value={filters.paymentMethod}
            onChange={(event) =>
              change(
                "paymentMethod",
                event.target.value as HistoryFilters["paymentMethod"],
              )
            }
          >
            <option value="all">Tất cả phương thức</option>
            <option value="cash">Tiền mặt</option>
            <option value="transfer">Chuyển khoản</option>
          </select>
        </label>
        <label className="op-field">
          <span>Gian hàng</span>
          <select
            value={filters.seller}
            onChange={(event) => change("seller", event.target.value)}
          >
            <option value="all">Tất cả gian hàng</option>
            {data.sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
        </label>
        <label className="op-field">
          <span>Ban phụ trách</span>
          <select
            value={filters.department}
            onChange={(event) =>
              change(
                "department",
                event.target.value as HistoryFilters["department"],
              )
            }
          >
            <option value="all">Tất cả ban được phân quyền</option>
            {allowedDepartments(data.user.role).map((department) => (
              <option key={department} value={department}>
                {departmentLabel(department)}
              </option>
            ))}
          </select>
        </label>
        <label className="op-field">
          <span>Chuẩn bị</span>
          <select
            value={filters.preparation}
            onChange={(event) =>
              change(
                "preparation",
                event.target.value as HistoryFilters["preparation"],
              )
            }
          >
            <option value="all">Tất cả tiến độ</option>
            {(["none", ...preparationStates] as const).map((status) => (
              <option key={status} value={status}>
                {preparationLabel(status)}
              </option>
            ))}
          </select>
        </label>
        {!scoped && (
          <>
            <label className="op-field">
              <span>Tổng tiền từ (đ)</span>
              <input
                type="number"
                min="0"
                step="1000"
                value={filters.min}
                onChange={(event) => change("min", event.target.value)}
                placeholder="0"
              />
            </label>
            <label className="op-field">
              <span>Tổng tiền đến (đ)</span>
              <input
                type="number"
                min="0"
                step="1000"
                value={filters.max}
                onChange={(event) => change("max", event.target.value)}
                placeholder="Không giới hạn"
              />
            </label>
          </>
        )}
        <button
          type="button"
          className="btn secondary small op-reset"
          onClick={() => {
            setFilters({ ...emptyHistoryFilters });
            setPage(1);
          }}
        >
          <RefreshCw size={14} />
          Xóa bộ lọc
        </button>
      </form>
      {invalidRange && (
        <p className="op-error" role="alert">
          Khoảng lọc chưa hợp lệ. Ngày hoặc số tiền bắt đầu phải nhỏ hơn hoặc
          bằng giá trị kết thúc.
        </p>
      )}
      <div
        className="op-table-scroll"
        role="region"
        aria-label="Kết quả lịch sử lên đơn"
        tabIndex={0}
      >
        <table className="op-table">
          <thead>
            <tr>
              <th>Đơn / khách hàng</th>
              <th>Món đã đặt</th>
              <th>Thời gian</th>
              <th>{scoped ? "Số món của ban" : "Tổng tiền"}</th>
              <th>Thanh toán</th>
              <th>Chuẩn bị</th>
            </tr>
          </thead>
          <tbody>
            {orders
              .slice((currentPage - 1) * pageSize, currentPage * pageSize)
              .map((order) => (
                <tr key={order.id}>
                  <td>
                    <button
                      className="order-link"
                      onClick={() => onOrder(order.id)}
                      aria-label={`Xem đơn ${order.code}`}
                    >
                      {order.code}
                    </button>
                    <small>{order.customerName || "Khách lẻ"}</small>
                    <small>{order.sellerName || "Nhiều gian hàng"}</small>
                  </td>
                  <td className="op-items-cell">
                    {order.items.map((item, index) => (
                      <small key={`${item.productId}-${index}`}>
                        {item.quantity} × {item.name}
                      </small>
                    ))}
                    {order.note && <em>{order.note}</em>}
                  </td>
                  <td>
                    {time(order.createdAt)}
                    <small>{localDay(order.createdAt)}</small>
                  </td>
                  <td>
                    <strong>
                      {scoped
                        ? order.items.reduce(
                            (sum, item) => sum + item.quantity,
                            0,
                          )
                        : money(order.total)}
                    </strong>
                  </td>
                  <td>
                    <span className={`badge ${order.paymentStatus}`}>
                      {paymentLabel(order.paymentStatus)}
                    </span>
                    <small>
                      {order.paymentMethod === "cash"
                        ? "Tiền mặt"
                        : "Chuyển khoản"}
                    </small>
                  </td>
                  <td>
                    <span
                      className={`op-chip ${orderPreparation(order, data)}`}
                    >
                      {preparationLabel(orderPreparation(order, data))}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!orders.length && (
          <div className="op-empty">
            <Filter size={28} />
            <h3>Chưa có đơn hàng phù hợp</h3>
            <p>Thử thay đổi hoặc xóa bộ lọc.</p>
          </div>
        )}
      </div>
      <div className="op-pagination">
        <span>
          {orders.length
            ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, orders.length)} / ${orders.length} đơn`
            : "0 đơn"}{" "}
          · Ngày theo giờ Việt Nam
        </span>
        <div>
          <button
            className="icon-btn"
            aria-label="Trang trước"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span>
            Trang {currentPage} / {pageCount}
          </span>
          <button
            className="icon-btn"
            aria-label="Trang sau"
            disabled={currentPage >= pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}

export function allowedTaskTransition(
  role: Role,
  department: Department,
  current: PreparationStatus,
  next: PreparationStatus,
) {
  if (role === "admin")
    return (
      (current === "queued" && next === "preparing") ||
      (current === "preparing" && next === "ready") ||
      (current === "ready" && next === "delivered")
    );
  if (role === "cashier") return current === "ready" && next === "delivered";
  return (
    allowedDepartments(role).includes(department) &&
    isPreparationUser(role) &&
    ((current === "queued" && next === "preparing") ||
      (current === "preparing" && next === "ready"))
  );
}
function elapsed(createdAt: string, now: number) {
  const minutes = Math.max(
    0,
    Math.floor((now - Date.parse(createdAt)) / 60000),
  );
  return minutes < 1
    ? "Vừa nhận"
    : minutes < 60
      ? `${minutes} phút`
      : `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
}

export function OrderThread({
  data,
  orderId,
  department,
  notify,
  refresh,
}: SharedProps & { orderId: string; department?: Department }) {
  const order = data.orders.find((entry) => entry.id === orderId);
  const visibleDepartments = allowedDepartments(data.user.role).filter(
    (value) =>
      order?.items.some((item) => itemDepartment(item, data) === value),
  );
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<Department | "all">(
    department ||
      (isPreparationUser(data.user.role)
        ? visibleDepartments[0] || "all"
        : "all"),
  );
  const [busy, setBusy] = useState(false);
  const effectiveTarget =
    department ||
    (target !== "all" && visibleDepartments.includes(target)
      ? target
      : isPreparationUser(data.user.role)
        ? visibleDepartments[0] || "all"
        : "all");
  const canSend =
    visibleDepartments.length > 0 &&
    (!department || visibleDepartments.includes(department)) &&
    (!isPreparationUser(data.user.role) || order?.paymentStatus === "paid");
  const messages = (data.messages || [])
    .filter(
      (entry) =>
        entry.orderId === orderId &&
        (entry.department === null ||
          (visibleDepartments.includes(entry.department) &&
            (!department || entry.department === department))),
    )
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!message.trim() || busy || !canSend) return;
    const content = message.trim();
    setBusy(true);
    try {
      await api(`/orders/${orderId}/messages`, {
        method: "POST",
        body: {
          department: effectiveTarget === "all" ? null : effectiveTarget,
          message: content,
        },
      });
      setMessage("");
      notify("Đã gửi lời nhắn cho đơn hàng.");
      await refresh(true);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Chưa gửi được lời nhắn.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="op-thread" aria-label="Trao đổi theo đơn">
      <h4>
        <MessageCircle size={15} />
        Trao đổi với thu ngân & các ban
      </h4>
      <ol
        className="op-messages"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {messages.map((entry) => (
          <li
            key={entry.id}
            className={entry.authorId === data.user.id ? "own" : ""}
          >
            <div>
              <strong>{entry.authorName}</strong>
              <small>
                {roleLabel(entry.role)} · {time(entry.createdAt)}
              </small>
            </div>
            <p>{entry.message}</p>
            <span>
              {entry.department
                ? departmentLabel(entry.department)
                : "Tất cả ban trong đơn"}
            </span>
          </li>
        ))}
      </ol>
      {!messages.length && (
        <p className="op-thread-empty">
          Gửi yêu cầu hoặc phản hồi để các ban phối hợp theo đơn này.
        </p>
      )}
      <form onSubmit={send}>
        {!department && (
          <label className="op-field">
            <span>Gửi tới</span>
            <select
              value={effectiveTarget}
              onChange={(event) =>
                setTarget(event.target.value as Department | "all")
              }
              disabled={busy || !canSend}
            >
              {!isPreparationUser(data.user.role) && (
                <option value="all">Tất cả ban trong đơn</option>
              )}
              {visibleDepartments.map((value) => (
                <option key={value} value={value}>
                  {departmentLabel(value)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="op-field">
          <span>Lời nhắn</span>
          <textarea
            rows={2}
            maxLength={1000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ví dụ: ít đá, cần hỗ trợ, món đã sẵn sàng…"
            required
            disabled={busy || !canSend}
          />
        </label>
        <button
          className="btn secondary small"
          disabled={busy || !message.trim() || !canSend}
        >
          <Send size={14} />
          {busy ? "Đang gửi…" : "Gửi lời nhắn"}
        </button>
      </form>
    </div>
  );
}

export function PreparationBoard({
  data,
  notify,
  refresh,
  onOrder,
}: SharedProps & { onOrder?: (id: string) => void }) {
  const [department, setDepartment] = useState<Department | "all">("all");
  const [status, setStatus] = useState<PreparationStatus | "active" | "all">(
    "active",
  );
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const scopedTasks = (data.tasks || []).filter(
    (task) =>
      allowedDepartments(data.user.role).includes(task.department) &&
      data.orders.some(
        (order) => order.id === task.orderId && order.paymentStatus === "paid",
      ),
  );
  const tasks = scopedTasks
    .filter(
      (task) =>
        (department === "all" || task.department === department) &&
        (status === "all" ||
          (status === "active"
            ? task.status !== "delivered"
            : task.status === status)) &&
        normalize(
          [
            task.orderCode,
            task.customerName,
            task.note,
            ...task.items.map((item) => item.name),
          ].join(" "),
        ).includes(normalize(search.trim())),
    )
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  async function update(task: PreparationTask, next: PreparationStatus) {
    if (
      busy ||
      !allowedTaskTransition(data.user.role, task.department, task.status, next)
    )
      return;
    setBusy(task.id);
    try {
      await api(`/preparation/${task.id}`, {
        method: "PATCH",
        body: { status: next },
      });
      notify(`${task.orderCode}: ${preparationLabel(next).toLowerCase()}.`);
      await refresh(true);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Chưa cập nhật được đơn.",
        true,
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <section
      className="operations preparation-panel"
      aria-label="Bảng chuẩn bị đơn"
    >
      <div className="op-heading">
        <div>
          <h2>Phối hợp chuẩn bị đơn</h2>
          <p>
            {data.user.role === "cashier"
              ? "Theo dõi các ban, trao đổi và xác nhận đã giao món cho khách."
              : "Đơn đã thanh toán được chuyển tới đúng ban. Cập nhật tiến độ để thu ngân biết khi món sẵn sàng."}
          </p>
        </div>
        <button className="btn secondary small" onClick={() => refresh(true)}>
          <RefreshCw size={15} />
          Cập nhật
        </button>
      </div>
      <div className="op-prep-counters">
        {preparationStates.map((value) => (
          <button
            key={value}
            className={status === value ? "selected" : ""}
            onClick={() => setStatus(value)}
            aria-pressed={status === value}
          >
            <span className={`op-status-dot ${value}`} />
            <span>{preparationLabel(value)}</span>
            <strong>
              {scopedTasks.filter((task) => task.status === value).length}
            </strong>
          </button>
        ))}
      </div>
      <div className="op-board-filters">
        <label className="op-field">
          <span>Tìm phần việc</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Mã đơn, khách, món hoặc ghi chú…"
          />
        </label>
        <label className="op-field">
          <span>Ban phụ trách</span>
          <select
            value={department}
            onChange={(event) =>
              setDepartment(event.target.value as Department | "all")
            }
          >
            <option value="all">Tất cả ban được phân quyền</option>
            {allowedDepartments(data.user.role).map((value) => (
              <option key={value} value={value}>
                {departmentLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="op-field">
          <span>Tiến độ</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            <option value="active">Chưa giao khách</option>
            <option value="all">Tất cả tiến độ</option>
            {preparationStates.map((value) => (
              <option key={value} value={value}>
                {preparationLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="op-task-grid">
        {tasks.map((task) => {
          const next: PreparationStatus | null =
            task.status === "queued"
              ? "preparing"
              : task.status === "preparing"
                ? "ready"
                : task.status === "ready"
                  ? "delivered"
                  : null;
          const canUpdate =
            next &&
            allowedTaskTransition(
              data.user.role,
              task.department,
              task.status,
              next,
            );
          const messages = (data.messages || []).filter(
            (entry) =>
              entry.orderId === task.orderId &&
              (entry.department === null ||
                entry.department === task.department),
          );
          return (
            <article
              className={`op-task-card ${task.status}`}
              key={task.id}
              aria-label={`${task.orderCode} · ${departmentLabel(task.department)}`}
            >
              <div className="op-task-top">
                <span className={`op-dept ${task.department}`}>
                  {departmentLabel(task.department)}
                </span>
                <span className={`op-chip ${task.status}`}>
                  {preparationLabel(task.status)}
                </span>
              </div>
              <div className="op-task-customer">
                <div>
                  {onOrder ? (
                    <button
                      className="order-link"
                      onClick={() => onOrder(task.orderId)}
                    >
                      {task.orderCode}
                    </button>
                  ) : (
                    <h3>{task.orderCode}</h3>
                  )}
                  <p>{task.customerName || "Khách lẻ"}</p>
                </div>
                <span title={`Nhận lúc ${time(task.createdAt)}`}>
                  {task.status === "delivered"
                    ? `Đã giao ${time(task.updatedAt)}`
                    : elapsed(task.createdAt, now)}
                </span>
              </div>
              <ul className="op-task-items">
                {task.items.map((item, index) => (
                  <li key={`${item.productId}-${index}`}>
                    <strong>{item.quantity}</strong>
                    <span>{item.name}</span>
                  </li>
                ))}
              </ul>
              {task.note && (
                <p className="op-task-note">
                  <strong>Ghi chú: </strong>
                  {task.note}
                </p>
              )}
              <p className="op-task-updated">
                {task.updatedByName ? `${task.updatedByName} · ` : ""}Cập nhật{" "}
                {time(task.updatedAt)}
              </p>
              <div className="op-task-actions">
                {canUpdate && next && (
                  <button
                    className="btn primary small"
                    disabled={!!busy}
                    onClick={() => update(task, next)}
                  >
                    {next === "delivered" ? (
                      <CheckCheck size={15} />
                    ) : (
                      <ArrowRight size={15} />
                    )}
                    {busy === task.id
                      ? "Đang cập nhật…"
                      : next === "preparing"
                        ? "Bắt đầu chuẩn bị"
                        : next === "ready"
                          ? "Món đã sẵn sàng"
                          : "Đã giao cho khách"}
                  </button>
                )}
                <button
                  className="btn secondary small"
                  onClick={() =>
                    setOpenThread(openThread === task.id ? null : task.id)
                  }
                  aria-expanded={openThread === task.id}
                >
                  <MessageCircle size={14} />
                  Trao đổi{messages.length ? ` (${messages.length})` : ""}
                </button>
              </div>
              {openThread === task.id && (
                <OrderThread
                  data={data}
                  orderId={task.orderId}
                  department={task.department}
                  notify={notify}
                  refresh={refresh}
                />
              )}
            </article>
          );
        })}
      </div>
      {!tasks.length && (
        <div className="op-empty">
          <CheckCheck size={30} />
          <h3>Không có phần việc phù hợp</h3>
          <p>
            Đơn đã thanh toán sẽ tự xuất hiện tại ban phụ trách. Thử đổi bộ lọc
            để xem đơn đã giao.
          </p>
        </div>
      )}
    </section>
  );
}

type AccountDraft = {
  name: string;
  username: string;
  password: string;
  role: Role;
  sellerId: string;
  active: boolean;
};
const newAccount = (): AccountDraft => ({
  name: "",
  username: "",
  password: "",
  role: "cashier",
  sellerId: "",
  active: true,
});
export function AccountsPanel({ data, notify, refresh }: SharedProps) {
  const [loadedUsers, setLoadedUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(!data.users);
  const [editing, setEditing] = useState<ManagedUser | "new" | null>(null);
  const [draft, setDraft] = useState<AccountDraft>(newAccount);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Role | "all">("all");
  useEffect(() => {
    if (data.user.role !== "admin" || data.users) {
      setLoading(false);
      return;
    }
    let alive = true;
    api<{ users: ManagedUser[] } | ManagedUser[]>("/users")
      .then((response) => {
        if (alive)
          setLoadedUsers(Array.isArray(response) ? response : response.users);
      })
      .catch((error) => {
        if (alive)
          notify(
            error instanceof Error ? error.message : "Chưa tải được tài khoản.",
            true,
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [data.user.role, data.users, notify]);
  if (data.user.role !== "admin")
    return (
      <section className="operations">
        <div className="op-empty">
          <ShieldCheck size={28} />
          <h3>Chỉ quản trị viên được quản lý tài khoản</h3>
        </div>
      </section>
    );
  const allUsers = data.users || loadedUsers;
  const users = allUsers.filter(
    (user) =>
      (role === "all" || user.role === role) &&
      normalize(`${user.name} ${user.username}`).includes(
        normalize(search.trim()),
      ),
  );
  const editingSelf =
    !!editing && editing !== "new" && editing.id === data.user.id;
  function openEditor(user: ManagedUser | "new") {
    setEditing(user);
    setDraft(
      user === "new"
        ? newAccount()
        : {
            name: user.name,
            username: user.username,
            password: "",
            role: user.role,
            sellerId: user.sellerId || "",
            active: user.active,
          },
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    const payload: Record<string, unknown> = {
      name: draft.name.trim(),
      username: draft.username.trim(),
      role: editingSelf ? data.user.role : draft.role,
      active: editingSelf ? true : draft.active,
      sellerId: draft.role === "seller" ? draft.sellerId || null : null,
    };
    if (draft.password) payload.password = draft.password;
    try {
      await api(editing === "new" ? "/users" : `/users/${editing.id}`, {
        method: editing === "new" ? "POST" : "PATCH",
        body: payload,
      });
      notify(
        editing === "new"
          ? "Đã tạo tài khoản cho tiểu ban."
          : "Đã cập nhật tài khoản.",
      );
      setEditing(null);
      setDraft(newAccount());
      if (!data.users) {
        const response = await api<{ users: ManagedUser[] } | ManagedUser[]>(
          "/users",
        );
        setLoadedUsers(Array.isArray(response) ? response : response.users);
      }
      await refresh(true);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Chưa lưu được tài khoản.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="operations accounts-panel"
      aria-label="Quản lý tài khoản và phân quyền"
    >
      <div className="op-heading">
        <div>
          <h2>Tài khoản & tiểu ban</h2>
          <p>
            Mỗi người dùng đăng nhập riêng để nhận đúng đơn và lưu người xử lý.
          </p>
        </div>
        <button
          className="btn primary small"
          onClick={() => openEditor("new")}
          disabled={busy}
        >
          <Plus size={16} />
          Thêm tài khoản
        </button>
      </div>
      <details className="op-permissions">
        <summary>
          <ShieldCheck size={17} />
          Quyền của từng tiểu ban
        </summary>
        <div className="op-table-scroll">
          <table className="op-table">
            <thead>
              <tr>
                <th>Tài khoản</th>
                <th>Quyền và trách nhiệm</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Quản trị viên</td>
                <td>
                  Toàn bộ đơn, báo cáo, thực đơn, tài khoản, cài đặt và tiến độ
                  của các ban.
                </td>
              </tr>
              <tr>
                <td>Thu ngân</td>
                <td>
                  Lên đơn cho các gian hàng, thu tiền, theo dõi các ban, trao
                  đổi và xác nhận giao khách.
                </td>
              </tr>
              <tr>
                <td>Ban bán hàng</td>
                <td>
                  Nhận phần việc đồ ăn / cookie và handmade, bắt đầu chuẩn bị,
                  báo sẵn sàng và phản hồi thu ngân.
                </td>
              </tr>
              <tr>
                <td>Ban chuẩn bị nước</td>
                <td>
                  Nhận phần việc nước uống, bắt đầu chuẩn bị, báo sẵn sàng và
                  phản hồi thu ngân.
                </td>
              </tr>
              <tr>
                <td>Người bán gian hàng</td>
                <td>
                  Tài khoản cũ: lên đơn, xem đơn và quản lý thực đơn trong gian
                  được gán.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
      {editing && (
        <form
          className="op-account-editor"
          onSubmit={save}
          aria-label={editing === "new" ? "Thêm tài khoản" : "Sửa tài khoản"}
        >
          <div className="op-editor-heading">
            <h3>
              {editing === "new"
                ? "Thêm tài khoản"
                : `Sửa tài khoản ${editing.username}`}
            </h3>
            <button
              className="icon-btn"
              type="button"
              aria-label="Đóng biểu mẫu tài khoản"
              onClick={() => setEditing(null)}
              disabled={busy}
            >
              <X size={19} />
            </button>
          </div>
          <div className="op-account-fields">
            <label className="op-field">
              <span>Họ tên</span>
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                required
                minLength={1}
                maxLength={120}
                autoComplete="name"
                disabled={busy}
              />
            </label>
            <label className="op-field">
              <span>Tên đăng nhập</span>
              <input
                value={draft.username}
                onChange={(event) =>
                  setDraft({ ...draft, username: event.target.value })
                }
                required
                minLength={3}
                maxLength={50}
                pattern="[a-zA-Z0-9_.@\-]+"
                title="Dùng chữ không dấu, số, dấu chấm, @, gạch dưới hoặc gạch ngang."
                autoComplete="off"
                disabled={busy}
              />
            </label>
            <label className="op-field">
              <span>{editing === "new" ? "Mật khẩu" : "Mật khẩu mới"}</span>
              <input
                type="password"
                aria-label={editing === "new" ? "Mật khẩu" : "Mật khẩu mới"}
                aria-describedby="account-password-hint"
                value={draft.password}
                onChange={(event) =>
                  setDraft({ ...draft, password: event.target.value })
                }
                required={editing === "new"}
                minLength={6}
                maxLength={72}
                autoComplete="new-password"
                disabled={busy}
              />
              <small id="account-password-hint">
                {editing === "new"
                  ? "Tối thiểu 6 ký tự."
                  : "Để trống để giữ mật khẩu. Mật khẩu mới cần tối thiểu 6 ký tự."}
              </small>
            </label>
            <label className="op-field">
              <span>Tiểu ban / vai trò</span>
              <select
                value={draft.role}
                disabled={busy || editingSelf}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    role: event.target.value as Role,
                    sellerId: "",
                  })
                }
              >
                {(
                  ["admin", "cashier", "sales", "drinks", "seller"] as Role[]
                ).map((value) => (
                  <option key={value} value={value}>
                    {roleLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            {draft.role === "seller" && (
              <label className="op-field">
                <span>Gian hàng được gán</span>
                <select
                  value={draft.sellerId}
                  onChange={(event) =>
                    setDraft({ ...draft, sellerId: event.target.value })
                  }
                  required
                  disabled={busy}
                >
                  <option value="">Chọn gian hàng</option>
                  {data.sellers.map((seller) => (
                    <option key={seller.id} value={seller.id}>
                      {seller.name}
                      {seller.active ? "" : " (đã tắt)"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="op-check">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) =>
                  setDraft({ ...draft, active: event.target.checked })
                }
                disabled={busy || editingSelf}
              />
              <span>Tài khoản được phép đăng nhập</span>
            </label>
          </div>
          {editingSelf && (
            <p className="op-hint">
              Bạn đang sửa tài khoản của mình. Vai trò và quyền đăng nhập được
              giữ để tránh tự mất quyền quản trị.
            </p>
          )}
          <div className="op-editor-actions">
            <button
              type="button"
              className="btn secondary small"
              onClick={() => setEditing(null)}
              disabled={busy}
            >
              Hủy
            </button>
            <button className="btn primary small" disabled={busy}>
              {busy ? "Đang lưu…" : "Lưu tài khoản"}
            </button>
          </div>
        </form>
      )}
      <div className="op-board-filters">
        <label className="op-field">
          <span>Tìm tài khoản</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Họ tên hoặc tên đăng nhập…"
          />
        </label>
        <label className="op-field">
          <span>Lọc tiểu ban</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as Role | "all")}
          >
            <option value="all">Tất cả vai trò</option>
            {(["admin", "cashier", "sales", "drinks", "seller"] as Role[]).map(
              (value) => (
                <option key={value} value={value}>
                  {roleLabel(value)}
                </option>
              ),
            )}
          </select>
        </label>
        <span className="op-result-count">{users.length} tài khoản</span>
      </div>
      <div
        className="op-table-scroll"
        role="region"
        aria-label="Danh sách tài khoản"
        tabIndex={0}
      >
        <table className="op-table">
          <thead>
            <tr>
              <th>Người dùng</th>
              <th>Tiểu ban</th>
              <th>Gian hàng</th>
              <th>Đăng nhập</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.name}</strong>
                  <small>
                    @{user.username}
                    {user.id === data.user.id ? " · Bạn" : ""}
                  </small>
                </td>
                <td>{roleLabel(user.role)}</td>
                <td>
                  {user.role === "seller"
                    ? data.sellers.find((seller) => seller.id === user.sellerId)
                        ?.name || "Chưa gán"
                    : "Theo vai trò"}
                </td>
                <td>
                  <span
                    className={`badge ${user.active ? "paid" : "cancelled"}`}
                  >
                    {user.active ? "Đang hoạt động" : "Đã khóa"}
                  </span>
                </td>
                <td>
                  <button
                    className="btn secondary small"
                    onClick={() => openEditor(user)}
                    disabled={busy}
                    aria-label={`Sửa tài khoản ${user.username}`}
                  >
                    Sửa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <p className="op-loading" role="status">
            Đang tải tài khoản…
          </p>
        ) : (
          !users.length && (
            <div className="op-empty">
              <Users size={28} />
              <h3>Không có tài khoản phù hợp</h3>
              <p>Thử thay đổi bộ lọc hoặc thêm tài khoản mới.</p>
            </div>
          )
        )}
      </div>
    </section>
  );
}
