import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Tent,
  ShoppingBag,
  ClipboardList,
  UtensilsCrossed,
  Store,
  BarChart3,
  Settings as SettingsIcon,
  ArrowUpRight,
  Search,
  Plus,
  Minus,
  X,
  ChevronRight,
  ChevronDown,
  Trash2,
  Banknote,
  QrCode,
  Check,
  CheckCircle2,
  Clock3,
  LogOut,
  RefreshCw,
  Download,
  Copy,
  Pencil,
  Sparkles,
  Flame,
  CircleHelp,
  ArrowRight,
  Package,
  Wifi,
  AlertCircle,
  Printer,
  ShieldCheck,
  Bell,
  BellOff,
  BellRing,
  ExternalLink,
} from "lucide-react";
import type {
  Bootstrap,
  Order,
  Product,
  Seller,
  Settings,
  User,
} from "./types";
import { api, ApiError, isDemo, setDemo } from "./api";
import { money, time, localDay, qrUrl, exportOrders, randomUUID } from "./utils";
import { resetDemo } from "./demo";
import {
  OrderHistory,
  PreparationBoard,
  AccountsPanel,
  OrderThread,
  roleLabel,
} from "./Operations";
import type { Department } from "./types";
import {
  freshDraft,
  restoreDraft,
  persistDraft,
  type Draft,
  type OrderSubmission,
} from "./cart";

type View =
  | "sale"
  | "orders"
  | "products"
  | "sellers"
  | "reports"
  | "settings"
  | "preparation"
  | "accounts";
type Notify = (message: string, error?: boolean) => void;
const navigation: {
  id: View;
  label: string;
  icon: typeof Tent;
  admin?: boolean;
  roles?: User["role"][];
}[] = [
  {
    id: "sale",
    label: "Bán hàng",
    icon: ShoppingBag,
    roles: ["admin", "cashier", "seller"],
  },
  { id: "orders", label: "Đơn hàng", icon: ClipboardList },
  { id: "preparation", label: "Chuẩn bị & trao đổi", icon: CheckCircle2 },
  {
    id: "products",
    label: "Thực đơn",
    icon: UtensilsCrossed,
    roles: ["admin", "seller"],
  },
  { id: "sellers", label: "Gian hàng", icon: Store, admin: true },
  {
    id: "accounts",
    label: "Tài khoản & tiểu ban",
    icon: ShieldCheck,
    admin: true,
  },
  {
    id: "reports",
    label: "Báo cáo",
    icon: BarChart3,
    roles: ["admin", "cashier", "seller"],
  },
  { id: "settings", label: "Cài đặt", icon: SettingsIcon, admin: true },
];
const viewTitles = {
  sale: "Bán hàng",
  orders: "Đơn hàng",
  products: "Thực đơn",
  sellers: "Gian hàng",
  reports: "Báo cáo",
  settings: "Cài đặt",
  preparation: "Chuẩn bị & trao đổi",
  accounts: "Tài khoản & tiểu ban",
};
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={"brand " + (small ? "small" : "")}>
      <span className="brand-icon">
        <Tent size={small ? 24 : 29} strokeWidth={2.2} />
      </span>
      <div>
        <strong>
          trại vui<span>.</span>
        </strong>
        {!small && <small>BÁN HÀNG HỘI TRẠI</small>}
      </div>
    </div>
  );
}
function Badge({ status }: { status: Order["paymentStatus"] }) {
  return (
    <span className={"badge " + status}>
      {status === "paid" ? (
        <CheckCircle2 size={12} />
      ) : status === "pending" ? (
        <Clock3 size={12} />
      ) : (
        <X size={12} />
      )}{" "}
      {status === "paid"
        ? "Đã thanh toán"
        : status === "pending"
          ? "Chờ thanh toán"
          : "Đã hủy"}
    </span>
  );
}
function Empty({
  title,
  description,
  icon: Icon = ShoppingBag,
}: {
  title: string;
  description: string;
  icon?: typeof Tent;
}) {
  return (
    <div className="empty">
      <span>
        <Icon size={32} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,a[href],[tabindex="0"]',
        ) || [],
      );
    focusables()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const list = focusables();
        const first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", key);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Stat({
  label,
  value,
  icon: Icon,
  sub,
  color = "orange",
}: {
  label: string;
  value: string | number;
  icon: typeof Tent;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="stat">
      <span className={"stat-icon " + color}>
        <Icon size={20} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}

function Login({
  onReady,
  notify,
}: {
  onReady: () => Promise<void>;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(false),
    [health, setHealth] = useState<boolean | null>(null);
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState("");
  useEffect(() => {
    api<{ configured: boolean }>("/health")
      .then((r) => setHealth(r.configured))
      .catch(() => setHealth(false));
  }, []);
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setDemo(false);
      await api("/auth/login", {
        method: "POST",
        body: { username, password },
      });
      await onReady();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function demo() {
    setBusy(true);
    setDemo(true);
    try {
      await onReady();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-story">
        <Brand />
        <span className="eyebrow">
          <Sparkles size={15} /> MỘT HỘI TRẠI. NGÀN NIỀM VUI.
        </span>
        <h1>
          Bán hàng nhẹ tênh.
          <br />
          Hội trại hết mình<span>!</span>
        </h1>
        <p>
          Từ món đầu tiên đến đơn cuối cùng.
          <br />
          Một nơi để quản lý tất cả gian hàng của bạn.
        </p>
        <div className="camp-art" aria-hidden="true">
          <span className="art-sun" />
          <span className="art-cloud c1" />
          <span className="art-cloud c2" />
          <div className="art-tent">
            <Tent size={185} strokeWidth={1.25} />
          </div>
          <span className="art-tree t1">♣</span>
          <span className="art-tree t2">♣</span>
          <span className="art-food f1">🧋</span>
          <span className="art-food f2">🍢</span>
          <span className="art-food f3">🍊</span>
          <div className="art-order">
            <CheckCircle2 size={20} />
            <div>
              <b>Đơn mới đã thanh toán</b>
              <small>Thêm một niềm vui tại gian hàng!</small>
            </div>
          </div>
          <div className="art-ground" />
        </div>
        <div className="story-bottom">
          <ShieldCheck size={17} /> Từng gian hàng riêng. Mọi đơn hàng rõ ràng.
        </div>
      </div>
      <div className="login-form-area">
        <div className="login-card">
          <span className="welcome-icon">👋</span>
          <h2>Chào bạn, vào ca thôi!</h2>
          <p>Đăng nhập để bắt đầu bán hàng tại hội trại.</p>
          <form onSubmit={login}>
            <Field label="Tên đăng nhập">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Tên đăng nhập của bạn"
                required
                maxLength={40}
              />
            </Field>
            <Field label="Mật khẩu">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Nhập mật khẩu"
                required
              />
            </Field>
            <button className="btn primary full" disabled={busy}>
              {busy ? "Đang kết nối…" : "Đăng nhập"}
              <ArrowRight size={18} />
            </button>
          </form>
          {health === false && (
            <div className="notice compact">
              <AlertCircle size={17} />
              <span>
                Chưa kết nối database. Xem README để cấu hình Netlify và Aiven.
              </span>
            </div>
          )}
          <div className="divider">
            <span>muốn xem trước?</span>
          </div>
          <button className="btn secondary full" onClick={demo} disabled={busy}>
            <Sparkles size={17} /> Khám phá bản demo
          </button>
          <small className="login-footnote">
            Demo sử dụng dữ liệu mẫu trên trình duyệt.
          </small>
        </div>
        <div className="login-bottom">
          Được tạo cho những ngày hội đáng nhớ <span>✦</span>
        </div>
      </div>
    </div>
  );
}

function playOrderChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0, now + idx * 0.1);
      gain.gain.linearRampToValueAtTime(0.35, now + idx * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.38);
    });
    [659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + 0.35 + idx * 0.1);
      gain.gain.setValueAtTime(0, now + 0.35 + idx * 0.1);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.35 + idx * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 0.35 + idx * 0.1 + 0.4,
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + 0.35 + idx * 0.1);
      osc.stop(now + 0.35 + idx * 0.1 + 0.45);
    });
  } catch {
    /* AudioContext not allowed or unsupported */
  }
}

function NewOrderAlertModal({
  order,
  onClose,
  onViewOrder,
  showAmount,
  onPrepare,
}: {
  order: Order;
  onClose: () => void;
  onViewOrder: (id: string) => void;
  showAmount: boolean;
  onPrepare: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyCode = () => {
    void navigator.clipboard?.writeText(order.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="new-order-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal new-order-modal" role="dialog" aria-modal="true">
        <div className="new-order-header">
          <div className="new-order-header-left">
            <div className="new-order-bell-wrap">
              <CheckCircle2 size={32} />
            </div>
            <div>
              <h2>
                {showAmount
                  ? "ĐÃ NHẬN ĐỦ TIỀN! LÀM ĐỒ NGAY! 🎉"
                  : "ĐƠN ĐÃ THANH TOÁN · PHẦN VIỆC MỚI"}
              </h2>
              <p>
                {order.paymentMethod === "cash"
                  ? "Thu ngân đã thu đủ tiền mặt"
                  : "Thu ngân đã xác nhận chuyển khoản"}{" "}
                · Các ban chuẩn bị đơn
              </p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        <div className="new-order-body">
          <div className="new-order-code-bar">
            <div>
              <span
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "#8c8278",
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}
              >
                Mã đơn hàng
              </span>
              <strong>{order.code}</strong>
            </div>
            <button
              className="btn text"
              onClick={copyCode}
              style={{ padding: "4px 8px", fontSize: 12 }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Đã chép" : "Sao chép"}
            </button>
          </div>

          <div className="new-order-meta-grid">
            <div className="new-order-meta-item">
              <span>Gian hàng</span>
              <strong>{order.sellerName || "Hội trại"}</strong>
            </div>
            <div className="new-order-meta-item">
              <span>Khách hàng</span>
              <strong>{order.customerName || "Khách lẻ"}</strong>
            </div>
            <div className="new-order-meta-item">
              <span>Hình thức thanh toán</span>
              <strong>
                {order.paymentMethod === "transfer"
                  ? "Chuyển khoản VietQR"
                  : "Tiền mặt trực tiếp"}
              </strong>
            </div>
            <div className="new-order-meta-item">
              <span>Trạng thái tiền</span>
              <strong
                style={{
                  color: "#16a34a",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Check size={16} /> ĐÃ THU ĐỦ TIỀN
              </strong>
            </div>
          </div>

          <div className="new-order-items-box">
            <div className="new-order-items-box-title">
              <span>Danh sách món cần làm</span>
              <span>{order.items.reduce((s, i) => s + i.quantity, 0)} món</span>
            </div>
            {order.items.map((item, idx) => (
              <div key={idx} className="new-order-item-row">
                <div>
                  <span className="new-order-item-qty">x{item.quantity}</span>
                  <strong>{item.name}</strong>
                </div>
                {showAmount && <span>{money(item.price * item.quantity)}</span>}
              </div>
            ))}
          </div>

          {order.note && (
            <div
              className="notice compact"
              style={{ borderColor: "#fed7aa", background: "#fffbeb" }}
            >
              <AlertCircle size={16} color="#d97706" />
              <span>
                <strong>Ghi chú:</strong> {order.note}
              </span>
            </div>
          )}

          {showAmount && (
            <div className="new-order-total-bar">
              <span>TỔNG TIỀN ĐÃ NHẬN</span>
              <strong>{money(order.total)}</strong>
            </div>
          )}
        </div>

        <div className="new-order-footer">
          <button className="btn secondary" onClick={onPrepare}>
            Mở bảng chuẩn bị
          </button>
          <button
            className="btn primary"
            onClick={() => {
              onViewOrder(order.id);
            }}
          >
            <Printer size={18} />
            {showAmount
              ? "Xem chi tiết / In phiếu"
              : "Xem phần việc / phản hồi"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<Bootstrap | null>(null),
    [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("sale"),
    [sellerId, setSellerId] = useState("");
  const [toast, setToast] = useState<{
      message: string;
      error: boolean;
    } | null>(null),
    [syncing, setSyncing] = useState(false),
    [offline, setOffline] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null),
    [orderAlerts, setOrderAlerts] = useState<Order[]>([]),
    [menuOpen, setMenuOpen] = useState(false);
  const newOrderAlert = orderAlerts[0] || null;
  const setNewOrderAlert = (order: Order | null) =>
    setOrderAlerts((queue) =>
      order
        ? queue.some((item) => item.id === order.id)
          ? queue
          : [...queue, order]
        : queue.slice(1),
    );
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem("pos_sound_enabled") !== "false";
  });
  const [showNotifBanner, setShowNotifBanner] = useState(() => {
    return (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    );
  });
  const knownPaidOrderIds = useRef<Set<string>>(new Set());
  const knownTaskStates = useRef<Map<string, string>>(new Map());
  const knownMessages = useRef<Set<string>>(new Set());
  const operationBaselineLoaded = useRef(false);
  const initialOrdersLoaded = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const notify: Notify = (message, error = false) => {
    setToast({ message, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6500);
  };
  async function refresh(silent = false) {
    if (!silent) setSyncing(true);
    try {
      const result = await api<Bootstrap>("/bootstrap");
      if (!initialOrdersLoaded.current) {
        // Chỉ ghi nhận các đơn đã thanh toán để tránh báo chuông lịch sử cũ
        result.orders
          .filter((o) => o.paymentStatus === "paid")
          .forEach((o) => knownPaidOrderIds.current.add(o.id));
        initialOrdersLoaded.current = true;
      } else {
        // CHỈ THÔNG BÁO VÀ HIỆN POPUP KHI ĐÃ NHẬN TIỀN (paymentStatus === 'paid')
        const newlyPaidOrders = result.orders.filter(
          (o) =>
            o.paymentStatus === "paid" && !knownPaidOrderIds.current.has(o.id),
        );
        if (newlyPaidOrders.length > 0) {
          newlyPaidOrders.forEach((o) => knownPaidOrderIds.current.add(o.id));
          const newest = newlyPaidOrders[0];
          const summary = newest.items
            .map((i) => `${i.name} (x${i.quantity})`)
            .join(", ");
          if (soundEnabled) {
            playOrderChime();
          }
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            try {
              navigator.vibrate([300, 150, 300, 150, 500]);
            } catch {}
          }
          newlyPaidOrders.forEach(setNewOrderAlert);
          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            try {
              const notif = new Notification(
                ["sales", "drinks"].includes(result.user.role)
                  ? `Đơn cần chuẩn bị: ${newest.code}`
                  : `💰 ĐÃ NHẬN TIỀN: ${money(newest.total)}`,
                {
                  body: `Mã #${newest.code} - ${newest.sellerName || "Hội trại"}\nĐã nhận đủ tiền! Chuẩn bị làm món ngay:\n${summary}`,
                  icon: "/favicon.svg",
                  tag: newest.id,
                },
              );
              notif.onclick = () => {
                window.focus();
                setOrderAlerts((queue) =>
                  queue.filter((order) => order.id !== newest.id),
                );
                setOrderId(newest.id);
                notif.close();
              };
            } catch {
              /* Ignore notification errors */
            }
          }
        }
      }
      setData(result);
      if (operationBaselineLoaded.current) {
        const readyTasks = (result.tasks || []).filter(
          (task) =>
            task.status === "ready" &&
            !["ready", "delivered"].includes(
              knownTaskStates.current.get(task.id) || "",
            ),
        );
        const incoming = (result.messages || []).filter(
          (message) =>
            !knownMessages.current.has(message.id) &&
            message.authorId !== result.user.id,
        );
        if (
          ["admin", "cashier"].includes(result.user.role) &&
          readyTasks.length
        ) {
          notify(
            `${readyTasks.length} phần việc đã sẵn sàng giao. Xem Chuẩn bị & trao đổi.`,
          );
          if (soundEnabled) playOrderChime();
        } else if (incoming.length) {
          const message = incoming[incoming.length - 1];
          notify(`${message.authorName}: ${message.message}`);
          if (soundEnabled) playOrderChime();
        }
      }
      knownTaskStates.current = new Map(
        (result.tasks || []).map((task) => [task.id, task.status]),
      );
      knownMessages.current = new Set(
        (result.messages || []).map((message) => message.id),
      );
      operationBaselineLoaded.current = true;
      setView((current) =>
        navigation.some(
          (n) =>
            n.id === current &&
            (!n.admin || result.user.role === "admin") &&
            (!n.roles || n.roles.includes(result.user.role)),
        )
          ? current
          : result.user.role === "sales" || result.user.role === "drinks"
            ? "preparation"
            : "sale",
      );
      setOffline(false);
      setSellerId((current) =>
        (current === "all" &&
          ["admin", "cashier"].includes(result.user.role)) ||
        result.sellers.some((s) => s.id === current && s.active)
          ? current
          : (result.user.role === "cashier" ? "all" : result.user.sellerId) ||
            result.sellers.find((s) => s.active)?.id ||
            "",
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setData(null);
        setOrderAlerts([]);
        setOrderId(null);
        knownPaidOrderIds.current.clear();
        knownTaskStates.current.clear();
        knownMessages.current.clear();
        initialOrdersLoaded.current = false;
        operationBaselineLoaded.current = false;
        if (!silent)
          notify("Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.", true);
      } else {
        setOffline(true);
        if (!silent) notify((e as Error).message, true);
      }
      if (!silent) throw e;
    } finally {
      setSyncing(false);
    }
  }
  useEffect(() => {
    const demoQuery = new URLSearchParams(location.search).get("demo") === "1";
    if (demoQuery) setDemo(true);
    (async () => {
      try {
        if (isDemo()) await refresh();
        else {
          await api("/session");
          await refresh();
        }
      } catch {
        /* Show sign-in; never silently switch to sample data. */
      } finally {
        setLoading(false);
      }
    })();
    return () => clearTimeout(toastTimer.current);
  }, []);
  useEffect(() => {
    if (!data) return;
    const id = setInterval(() => {
      void refresh(true);
    }, 3000);
    return () => clearInterval(id);
  }, [data?.user.id, soundEnabled]);
  async function logout() {
    try {
      if (!isDemo()) await api("/auth/logout", { method: "POST" });
      setDemo(false);
      history.replaceState(null, "", location.pathname);
      setData(null);
      setOrderId(null);
      setOrderAlerts([]);
      setView("sale");
      knownPaidOrderIds.current.clear();
      knownTaskStates.current.clear();
      knownMessages.current.clear();
      operationBaselineLoaded.current = false;
      initialOrdersLoaded.current = false;
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  const selectedOrder = data?.orders.find((o) => o.id === orderId);
  const todayOrders =
    data?.orders.filter((o) => localDay(o.createdAt) === localDay()) || [];
  const pending =
    data?.orders.filter((o) => o.paymentStatus === "pending").length || 0;
  if (loading)
    return (
      <div className="loading-page">
        <Brand />
        <span className="loading-dot" />
        Đang chuẩn bị gian hàng…
      </div>
    );
  const toastEl = toast && (
    <div className={"toast " + (toast.error ? "error" : "")} role="status">
      {toast.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
      <span>{toast.message}</span>
      <button onClick={() => setToast(null)} aria-label="Đóng thông báo">
        <X size={15} />
      </button>
    </div>
  );
  if (!data)
    return (
      <>
        <Login onReady={() => refresh()} notify={notify} />
        {toastEl}
      </>
    );
  const currentSeller =
    sellerId === "all"
      ? {
          id: "all",
          name: "Tất cả gian hàng",
          description: "Đơn nhiều tiểu ban",
          color: "#ee6c3a",
          active: true,
        }
      : data.sellers.find((s) => s.id === sellerId);
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (menuOpen ? "open" : "")}>
        <Brand />
        <div className="event-card">
          <span className="event-symbol">✦</span>
          <div>
            <b>{data.settings.eventName || "Hội trại của chúng ta"}</b>
            <small>
              <span className="live-dot" /> Đang mở bán
            </small>
          </div>
        </div>
        <div className="nav-label">KHÔNG GIAN LÀM VIỆC</div>
        <nav>
          {navigation
            .filter(
              (n) =>
                (!n.admin || data.user.role === "admin") &&
                (!n.roles || n.roles.includes(data.user.role)),
            )
            .map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setView(n.id);
                  if (n.id === "products" && sellerId === "all")
                    setSellerId(data.sellers.find((s) => s.active)?.id || "");
                  setMenuOpen(false);
                }}
                className={view === n.id ? "active" : ""}
              >
                <n.icon size={20} />
                <span>{n.label}</span>
                {n.id === "orders" && pending > 0 ? (
                  <b>{pending}</b>
                ) : (
                  view === n.id && <ChevronRight size={16} />
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="tip-card">
            <Flame size={21} />
            <b>
              Gian hàng nhỏ,
              <br />
              niềm vui lớn.
            </b>
            <p>
              Mỗi đơn hàng là một phần
              <br />
              kỷ niệm của hội trại.
            </p>
          </div>
          <div className="user-card">
            <span className="avatar">{initials(data.user.name)}</span>
            <div>
              <b>{data.user.name}</b>
              <small>{roleLabel(data.user.role)}</small>
            </div>
            <button
              className="icon-btn"
              aria-label="Đăng xuất"
              title="Đăng xuất"
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {menuOpen && (
        <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />
      )}
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-btn"
              onClick={() => setMenuOpen(true)}
              aria-label="Mở menu"
            >
              <Store size={22} />
            </button>
            <span>Không gian hội trại</span>
            <ChevronRight size={14} />
            <strong>{viewTitles[view]}</strong>
          </div>
          <div className="topbar-right">
            {isDemo() && (
              <select
                aria-label="Thử vai trò demo"
                style={{ width: 160, padding: 6 }}
                value={data.user.role}
                onChange={async (e) => {
                  try {
                    await api("/demo/role", {
                      method: "POST",
                      body: { role: e.target.value },
                    });
                    knownPaidOrderIds.current.clear();
                    knownTaskStates.current.clear();
                    knownMessages.current.clear();
                    operationBaselineLoaded.current = false;
                    initialOrdersLoaded.current = false;
                    setOrderAlerts([]);
                    setOrderId(null);
                    await refresh();
                  } catch (error) {
                    notify((error as Error).message, true);
                  }
                }}
              >
                <option value="admin">Demo · Quản trị</option>
                <option value="cashier">Demo · Thu ngân</option>
                <option value="sales">Demo · Bán hàng</option>
                <option value="drinks">Demo · Chuẩn bị nước</option>
              </select>
            )}
            <span className={"connection " + (offline ? "offline" : "")}>
              <Wifi size={14} />
              {offline ? "Mất kết nối" : isDemo() ? "Bản demo" : "Đã kết nối"}
            </span>
            <span className="topbar-date">
              {new Intl.DateTimeFormat("vi-VN", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                timeZone: "Asia/Ho_Chi_Minh",
              }).format(new Date())}
            </span>
            <button
              className="btn secondary"
              style={{
                minHeight: 32,
                padding: "4px 10px",
                fontSize: 11,
                borderRadius: 8,
                gap: 5,
              }}
              onClick={() => {
                playOrderChime();
                if (typeof navigator !== "undefined" && navigator.vibrate) {
                  try {
                    navigator.vibrate([300, 150, 300, 150, 500]);
                  } catch {}
                }
                setNewOrderAlert({
                  id: "test-popup-" + Date.now(),
                  code: "HT" + Math.floor(100000 + Math.random() * 900000),
                  sellerId: "test",
                  sellerName: "Bếp lửa trại",
                  customerName: "Khách lẻ",
                  note: "Ăn liền, thêm tương ớt",
                  items: [
                    {
                      productId: "1",
                      name: "Bánh mì nướng muối ớt",
                      quantity: 2,
                      price: 20000,
                    },
                    {
                      productId: "2",
                      name: "Xúc xích nướng",
                      quantity: 1,
                      price: 15000,
                    },
                  ],
                  total: 55000,
                  paymentMethod: "transfer",
                  paymentStatus: "paid",
                  cashReceived: null,
                  createdAt: new Date().toISOString(),
                  paidAt: new Date().toISOString(),
                });
              }}
              title="Bấm để thử nghiệm xem Popup nhận tiền hiện lên như thế nào"
            >
              <Sparkles size={13} /> Thử popup nhận tiền
            </button>
            <button
              className={"icon-btn " + (soundEnabled ? "sound-active" : "")}
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                localStorage.setItem("pos_sound_enabled", String(next));
                if (next) {
                  playOrderChime();
                  if (
                    "Notification" in window &&
                    Notification.permission === "default"
                  ) {
                    void Notification.requestPermission();
                  }
                  notify("Đã bật chuông báo & thông báo đơn mới! 🔔");
                } else {
                  notify("Đã tắt chuông báo đơn.");
                }
              }}
              title={
                soundEnabled
                  ? "Chuông báo đơn đang bật (bấm để tắt)"
                  : "Bật chuông báo đơn mới"
              }
              aria-label="Chuông thông báo đơn"
            >
              {soundEnabled ? <Bell size={17} /> : <BellOff size={17} />}
            </button>
            <button
              className={"icon-btn " + (syncing ? "spin" : "")}
              disabled={syncing}
              onClick={() => void refresh().catch(() => {})}
              aria-label="Làm mới dữ liệu"
              title="Làm mới"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>
        {showNotifBanner && (
          <div className="notif-perm-banner">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <BellRing size={16} />
              <span>
                Bật thông báo để nhận cảnh báo đơn khi trang đang hoạt động.
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                className="notif-perm-banner-btn"
                onClick={() => {
                  void Notification.requestPermission().then((perm) => {
                    if (perm === "granted") {
                      playOrderChime();
                      notify("Đã bật thông báo thiết bị thành công! 🔔");
                    }
                    setShowNotifBanner(false);
                  });
                }}
              >
                <Bell size={14} /> Bật thông báo
              </button>
              <button
                className="icon-btn"
                style={{ width: 24, height: 24 }}
                onClick={() => setShowNotifBanner(false)}
                aria-label="Đóng"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
        {isDemo() && (
          <div className="demo-banner">
            <Sparkles size={15} />
            <span>
              <b>Chế độ demo</b> · Dữ liệu mẫu được lưu trên trình duyệt. Không
              xử lý giao dịch thật.
            </span>
            <button
              onClick={() => {
                resetDemo();
                void refresh().catch(() => {});
                notify("Đã khôi phục dữ liệu mẫu.");
              }}
            >
              Đặt lại demo
            </button>
          </div>
        )}
        {offline && (
          <div className="offline-banner">
            <AlertCircle size={16} /> Dữ liệu có thể chưa cập nhật. Kết nối lại
            mạng trước khi tạo hoặc xác nhận đơn.
          </div>
        )}
        <div className="workspace">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "sale"
                  ? "MỘT NGÀY HỘI, THẬT NHIỀU NIỀM VUI"
                  : "GỌN GÀNG HƠN. BÁN HÀNG DỄ HƠN."}
              </div>
              <h1>
                {view === "sale" ? "Lên đơn, thêm niềm vui" : viewTitles[view]}
                {view === "sale" && <span className="heading-spark">✦</span>}
              </h1>
              <p>
                {view === "sale"
                  ? "Chọn món yêu thích, phần còn lại để Trại Vui lo."
                  : view === "orders"
                    ? "Theo dõi từng đơn hàng và trạng thái thanh toán."
                    : view === "products"
                      ? "Những món ngon tạo nên màu sắc riêng của mỗi gian hàng."
                      : view === "sellers"
                        ? "Cùng nhau tạo nên một hội trại thật đáng nhớ."
                        : view === "reports"
                          ? "Mỗi con số kể một câu chuyện của hội trại."
                          : view === "preparation"
                            ? "Nhận phần việc, cập nhật tiến độ và trao đổi theo từng đơn."
                            : view === "accounts"
                              ? "Phân quyền cho thu ngân, ban bán hàng và ban chuẩn bị nước."
                              : "Chuẩn bị mọi thứ trước khi bắt đầu mở bán."}
              </p>
            </div>
            {(view === "sale" || view === "products") && (
              <div className="seller-select">
                <Store size={19} />
                <select
                  aria-label="Chọn gian hàng"
                  value={sellerId}
                  onChange={(e) => setSellerId(e.target.value)}
                >
                  {view === "sale" &&
                    ["admin", "cashier"].includes(data.user.role) && (
                      <option value="all">Tất cả gian hàng · giỏ chung</option>
                    )}
                  {data.sellers
                    .filter((s) => s.active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
                <ChevronDown size={15} />
              </div>
            )}
          </div>
          {view === "sale" && (
            <>
              <div className="stats-row compact-stats">
                <Stat
                  label="Doanh thu hôm nay"
                  value={money(
                    todayOrders
                      .filter((o) => o.paymentStatus === "paid")
                      .reduce((n, o) => n + o.total, 0),
                  )}
                  icon={Banknote}
                  sub="Chỉ tính đơn đã thanh toán"
                />
                <Stat
                  label="Đơn đã thanh toán"
                  value={
                    todayOrders.filter((o) => o.paymentStatus === "paid").length
                  }
                  icon={ShoppingBag}
                  color="green"
                  sub="Hôm nay tại hội trại"
                />
                <Stat
                  label="Đang chờ thanh toán"
                  value={
                    todayOrders.filter((o) => o.paymentStatus === "pending")
                      .length
                  }
                  icon={Clock3}
                  color="purple"
                  sub="Tự cập nhật mỗi 3 giây"
                />
              </div>
              {currentSeller ? (
                <SalePanel
                  key={data.user.id + sellerId}
                  data={data}
                  seller={currentSeller}
                  refresh={refresh}
                  notify={notify}
                  onOrder={(order) => {
                    setData((d) =>
                      d
                        ? {
                            ...d,
                            orders: [
                              order,
                              ...d.orders.filter((o) => o.id !== order.id),
                            ],
                          }
                        : d,
                    );
                    setOrderId(order.id);
                  }}
                  disabled={offline}
                />
              ) : (
                <Empty
                  title="Sẵn sàng cho gian hàng đầu tiên?"
                  description="Vào mục Gian hàng để thêm người bán, sau đó thêm món vào Thực đơn."
                  icon={Store}
                />
              )}
            </>
          )}
          {view === "orders" && (
            <OrderHistory
              data={data}
              onOrder={setOrderId}
              notify={notify}
              refresh={refresh}
            />
          )}
          {view === "preparation" && (
            <PreparationBoard data={data} notify={notify} refresh={refresh} />
          )}
          {view === "accounts" && data.user.role === "admin" && (
            <AccountsPanel data={data} notify={notify} refresh={refresh} />
          )}
          {view === "products" && (
            <ProductsPanel
              data={data}
              sellerId={sellerId}
              notify={notify}
              refresh={refresh}
            />
          )}
          {view === "sellers" && data.user.role === "admin" && (
            <SellersPanel data={data} notify={notify} refresh={refresh} />
          )}
          {view === "reports" && <ReportsPanel data={data} />}
          {view === "settings" && data.user.role === "admin" && (
            <SettingsPanel data={data} notify={notify} refresh={refresh} />
          )}
        </div>
        <footer className="app-footer">
          <span>
            trại vui<span className="orange">.</span>{" "}
            <span className="footer-dot">·</span> Để hội trại chỉ còn niềm vui
          </span>
          <span>
            <ShieldCheck size={13} />{" "}
            {isDemo() ? "Dữ liệu mẫu" : "Dữ liệu được bảo vệ"}
          </span>
        </footer>
      </main>
      {selectedOrder &&
        ["admin", "cashier", "seller"].includes(data.user.role) && (
          <PaymentModal
            key={selectedOrder.id}
            order={selectedOrder}
            settings={data.settings}
            onClose={() => setOrderId(null)}
            refresh={refresh}
            notify={notify}
            canManagePayment={["admin", "cashier", "seller"].includes(
              data.user.role,
            )}
            data={data}
          />
        )}
      {selectedOrder && ["sales", "drinks"].includes(data.user.role) && (
        <Modal
          title="Chi tiết phần việc"
          subtitle={selectedOrder.code + " · " + selectedOrder.customerName}
          onClose={() => setOrderId(null)}
        >
          <div className="modal-form">
            <p>{selectedOrder.note || "Không có ghi chú."}</p>
            <ul>
              {selectedOrder.items.map((item) => (
                <li key={item.productId}>
                  {item.quantity} × {item.name}
                </li>
              ))}
            </ul>
            <p>Nhận việc và báo sẵn sàng trong mục Chuẩn bị & trao đổi.</p>
            <OrderThread
              data={data}
              orderId={selectedOrder.id}
              notify={notify}
              refresh={refresh}
            />
            <button
              className="btn primary"
              onClick={() => {
                setOrderId(null);
                setView("preparation");
              }}
            >
              Mở bảng chuẩn bị
            </button>
          </div>
        </Modal>
      )}
      {newOrderAlert && (
        <NewOrderAlertModal
          order={newOrderAlert}
          showAmount={["admin", "cashier", "seller"].includes(data.user.role)}
          onPrepare={() => {
            setNewOrderAlert(null);
            setView("preparation");
          }}
          onClose={() => setNewOrderAlert(null)}
          onViewOrder={(id) => {
            setOrderAlerts((queue) => queue.filter((order) => order.id !== id));
            setOrderId(id);
          }}
        />
      )}
      {toastEl}
    </div>
  );
}

type SharedProps = {
  data: Bootstrap;
  notify: Notify;
  refresh: (silent?: boolean) => Promise<void>;
};
function SalePanel({
  data,
  seller,
  refresh,
  notify,
  onOrder,
  disabled,
}: {
  data: Bootstrap;
  seller: Seller;
  refresh: SharedProps["refresh"];
  notify: Notify;
  onOrder: (order: Order) => void;
  disabled: boolean;
}) {
  const storageKey = `traivui-cart-${isDemo() ? "demo" : "live"}-${data.user.id}-${seller.id}`;
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      return restoreDraft(localStorage.getItem(storageKey));
    } catch {
      return freshDraft();
    }
  });
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("Tất cả"),
    [busy, setBusy] = useState(false);
  const method = draft.method,
    cash = draft.cash,
    locked = busy || !!draft.submission;
  const setMethod = (method: Draft["method"]) =>
    setDraft((d) =>
      d.method === method ? d : { ...d, method, key: randomUUID() },
    );
  const setCash = (cash: string) =>
    setDraft((d) =>
      d.cash === cash ? d : { ...d, cash, key: randomUUID() },
    );
  const products = data.products.filter(
    (p) =>
      (seller.id === "all" || p.sellerId === seller.id) &&
      p.active &&
      data.sellers.some((s) => s.id === p.sellerId && s.active),
  );
  const categories = ["Tất cả", ...new Set(products.map((p) => p.category))];
  const cart = Object.entries(draft.items)
    .map(([id, quantity]) => ({
      product: data.products.find(
        (p) => p.id === id && (seller.id === "all" || p.sellerId === seller.id),
      ),
      quantity,
    }))
    .filter(
      (i): i is { product: Product; quantity: number } =>
        !!i.product && Number.isSafeInteger(i.quantity) && i.quantity > 0,
    );
  const total = cart.reduce((sum, i) => sum + i.quantity * i.product.price, 0),
    count = cart.reduce((sum, i) => sum + i.quantity, 0);
  useEffect(() => {
    persistDraft(storageKey, draft);
  }, [draft, storageKey]);
  function change(id: string, amount: number) {
    const p = data.products.find((p) => p.id === id);
    if (!p || locked) return;
    const quantity = (draft.items[id] || 0) + amount;
    if (amount > 0 && (!p.active || quantity > Math.min(p.stock ?? 999, 999))) {
      notify("Món tạm ngừng bán hoặc số lượng vượt tồn kho.", true);
      return;
    }
    setDraft((d) => {
      const items = { ...d.items };
      if (quantity <= 0) delete items[id];
      else items[id] = quantity;
      return { ...d, items, key: randomUUID() };
    });
  }
  async function checkout() {
    if ((!cart.length && !draft.submission) || busy) return;
    const submission: OrderSubmission = draft.submission || {
      ...(seller.id !== "all" ? { sellerId: seller.id } : {}),
      customerName: draft.customerName,
      note: draft.note,
      paymentMethod: method,
      items: cart.map((i) => ({
        productId: i.product.id,
        quantity: i.quantity,
      })),
      idempotencyKey: draft.key,
      ...(method === "cash" ? { cashReceived: Number(cash) } : {}),
    };
    const sending = { ...draft, submission };
    if (!persistDraft(storageKey, sending)) {
      notify(
        "Trình duyệt chưa lưu được đơn chờ gửi. Hãy cho phép lưu trữ hoặc giải phóng bộ nhớ rồi thử lại.",
        true,
      );
      return;
    }
    setDraft(sending);
    setBusy(true);
    try {
      const result = await api<{ order: Order }>("/orders", {
        method: "POST",
        body: submission,
      });
      const empty = freshDraft();
      persistDraft(storageKey, empty);
      setDraft(empty);
      onOrder(result.order);
      notify(
        result.order.paymentStatus === "paid"
          ? "Đã thu tiền và tạo đơn hàng."
          : "Đã tạo đơn. Chờ khách chuyển khoản.",
      );
      await refresh(true);
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        e.status !== 401 &&
        e.status !== 403
      ) {
        const editable = { ...draft, submission: undefined };
        persistDraft(storageKey, editable);
        setDraft(editable);
      }
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const bankReady = !!(
    data.settings.bankBin &&
    data.settings.accountNumber &&
    data.settings.accountName
  );
  const visible = products.filter(
    (p) =>
      (category === "Tất cả" || category === p.category) &&
      p.name.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")),
  );
  return (
    <div className="sale-layout">
      <section className="menu-panel">
        <div className="section-heading">
          <h2>
            Thực đơn gian hàng <span>{products.length} món</span>
          </h2>
          <div className="searchbox">
            <Search size={17} />
            <input
              aria-label="Tìm món"
              placeholder="Tìm món ngon…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Xóa tìm kiếm">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="category-tabs">
          {categories.map((c, i) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={category === c ? "selected" : ""}
            >
              {i === 0 && <UtensilsCrossed size={14} />} {c}
            </button>
          ))}
        </div>
        {visible.length ? (
          <div className="product-grid">
            {visible.map((p) => (
              <button
                key={p.id}
                className={"product-card " + (p.stock === 0 ? "sold-out" : "")}
                disabled={p.stock === 0 || locked || disabled}
                onClick={() => change(p.id, 1)}
                aria-label={`Thêm ${p.name}, ${money(p.price)}`}
              >
                <div
                  className="product-art"
                  style={{ background: p.color || "#f7e8d8" }}
                >
                  <span className="food-shadow" />
                  <span className="food-emoji" aria-hidden="true">
                    {p.emoji || "🍽️"}
                  </span>
                  <span className="stock-pill">
                    {p.stock === 0
                      ? "Hết món"
                      : p.stock === null
                        ? "Luôn sẵn sàng"
                        : `Còn ${p.stock}`}
                  </span>
                  {(draft.items[p.id] || 0) > 0 && (
                    <span className="added-pill">{draft.items[p.id]}</span>
                  )}
                </div>
                <div className="product-detail">
                  <small>{p.category}</small>
                  <h3>{p.name}</h3>
                  <div>
                    <strong>{money(p.price)}</strong>
                    <span className="add-product">
                      <Plus size={18} />
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            title={
              products.length
                ? "Chưa tìm thấy món này"
                : "Gian hàng chưa có món"
            }
            description={
              products.length
                ? "Thử tìm theo tên khác hoặc chọn một nhóm món khác."
                : "Thêm món trong mục Thực đơn để bắt đầu lên đơn."
            }
            icon={UtensilsCrossed}
          />
        )}
        <div className="menu-note">
          <Sparkles size={15} /> Chạm vào món để thêm vào đơn. Niềm vui bắt đầu
          từ đây!
        </div>
      </section>
      <aside className="cart-panel">
        <div className="cart-title">
          <div>
            <ShoppingBag size={20} />
            <h2>Đơn hàng mới</h2>
          </div>
          <span>{count} món</span>
        </div>
        <div className="cart-stall">
          <span className="live-dot" />
          {seller.name}
        </div>
        <div className="cart-items">
          {cart.length ? (
            cart.map(({ product: p, quantity }) => (
              <div className="cart-item" key={p.id}>
                <span className="cart-emoji" style={{ background: p.color }}>
                  {p.emoji}
                </span>
                <div className="cart-item-info">
                  <b>{p.name}</b>
                  <small>{money(p.price)}</small>
                  <div className="quantity">
                    <button
                      disabled={locked}
                      onClick={() => change(p.id, -1)}
                      aria-label={`Giảm ${p.name}`}
                    >
                      <Minus size={12} />
                    </button>
                    <span>{quantity}</span>
                    <button
                      disabled={locked}
                      onClick={() => change(p.id, 1)}
                      aria-label={`Tăng ${p.name}`}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
                <div className="cart-item-right">
                  <b>{money(p.price * quantity)}</b>
                  <button
                    disabled={locked}
                    aria-label={`Xóa ${p.name}`}
                    onClick={() =>
                      setDraft((d) => {
                        const items = { ...d.items };
                        delete items[p.id];
                        return { ...d, items, key: randomUUID() };
                      })
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="cart-empty">
              <div>🧺</div>
              <b>Giỏ hàng đang đợi món ngon</b>
              <p>Chọn vài món ở bên trái nhé.</p>
            </div>
          )}
        </div>
        <div className="cart-fields">
          <input
            placeholder="Tên khách / số bàn (không bắt buộc)"
            aria-label="Tên khách hoặc số bàn"
            value={draft.customerName}
            maxLength={80}
            disabled={locked}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                customerName: e.target.value,
                key: randomUUID(),
              }))
            }
          />
          <input
            placeholder="Ghi chú: ít đá, không cay…"
            aria-label="Ghi chú đơn hàng"
            value={draft.note}
            maxLength={300}
            disabled={locked}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                note: e.target.value,
                key: randomUUID(),
              }))
            }
          />
        </div>
        <div className="cart-payment">
          <span className="form-label">Phương thức thanh toán</span>
          <div className="payment-switch">
            <button
              className={method === "cash" ? "selected" : ""}
              disabled={locked}
              onClick={() => setMethod("cash")}
            >
              <Banknote size={17} />
              Tiền mặt
            </button>
            <button
              className={method === "transfer" ? "selected" : ""}
              disabled={locked}
              onClick={() => setMethod("transfer")}
            >
              <QrCode size={17} />
              Chuyển khoản
            </button>
          </div>
          {method === "cash" ? (
            <>
              <Field label="Tiền khách đưa">
                <div className="currency-input">
                  <input
                    inputMode="numeric"
                    type="number"
                    min={0}
                    step={1000}
                    value={cash}
                    disabled={locked}
                    onChange={(e) => setCash(e.target.value)}
                    placeholder={String(total || "0")}
                  />
                  <span>₫</span>
                </div>
              </Field>
              <div className="quick-cash">
                {[total, 50000, 100000, 200000]
                  .filter(
                    (n, i, a) => n > 0 && n >= total && a.indexOf(n) === i,
                  )
                  .slice(0, 3)
                  .map((n) => (
                    <button
                      key={n}
                      disabled={locked}
                      onClick={() => setCash(String(n))}
                    >
                      {n === total ? "Đủ tiền" : money(n)}
                    </button>
                  ))}
              </div>
              {Number(cash) >= total && cash && (
                <div className="change-row">
                  <span>Tiền trả lại</span>
                  <b>{money(Number(cash) - total)}</b>
                </div>
              )}
            </>
          ) : (
            <div className={"notice compact " + (bankReady ? "green" : "")}>
              <QrCode size={17} />
              <span>
                {isDemo()
                  ? "Demo không chuyển tiền thật. Người bán xác nhận để hoàn tất đơn."
                  : bankReady
                    ? "Hiện QR cho khách. Thu ngân kiểm tra tiền vào rồi xác nhận hoàn tất."
                    : "Cần cấu hình tài khoản ngân hàng trong Cài đặt."}
              </span>
            </div>
          )}
        </div>
        {draft.submission && (
          <div className="notice compact">
            <AlertCircle size={17} />
            <span>
              Đơn đang chờ xác minh. Bấm thử lại để tìm đơn đã lưu hoặc gửi lại
              cùng mã; không thu tiền lần nữa.
            </span>
          </div>
        )}
        <div className="cart-total">
          <span>Tổng thanh toán</span>
          <strong>{money(total)}</strong>
        </div>
        <button
          className="btn primary checkout"
          disabled={
            disabled ||
            busy ||
            (!draft.submission &&
              (!cart.length ||
                (method === "cash" && (!cash || Number(cash) < total)) ||
                (method === "transfer" && !isDemo() && !bankReady)))
          }
          onClick={checkout}
        >
          {busy
            ? "Đang tạo đơn…"
            : draft.submission
              ? "Thử lại & kiểm tra đơn"
              : method === "cash"
                ? "Thu tiền & hoàn tất"
                : "Tạo đơn & hiện QR"}
          <ArrowRight size={19} />
        </button>
        <small className="cart-footer">
          <ShieldCheck size={12} /> Đơn được lưu trước khi hiển thị thanh toán
        </small>
      </aside>
    </div>
  );
}

function OrdersPanel({
  data,
  onOrder,
}: {
  data: Bootstrap;
  onOrder: (id: string) => void;
}) {
  const [status, setStatus] = useState("all"),
    [search, setSearch] = useState(""),
    [seller, setSeller] = useState("all");
  const orders = data.orders.filter(
    (o) =>
      (status === "all" || o.paymentStatus === status) &&
      (seller === "all" || o.sellerId === seller) &&
      `${o.code} ${o.customerName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section className="content-panel">
      <div className="table-toolbar">
        <div className="filter-tabs">
          {[
            ["all", "Tất cả"],
            ["pending", "Chờ thanh toán"],
            ["paid", "Đã thanh toán"],
            ["cancelled", "Đã hủy"],
          ].map(([id, name]) => (
            <button
              key={id}
              className={status === id ? "selected" : ""}
              onClick={() => setStatus(id)}
            >
              {name}
              {id === "pending" && (
                <span>
                  {
                    data.orders.filter((o) => o.paymentStatus === "pending")
                      .length
                  }
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          className="btn secondary small"
          onClick={() => exportOrders(orders)}
        >
          <Download size={15} />
          Xuất CSV
        </button>
      </div>
      <div className="table-filter">
        <div className="searchbox">
          <Search size={17} />
          <input
            aria-label="Tìm đơn hàng"
            placeholder="Mã đơn hoặc tên khách…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Lọc gian hàng"
          value={seller}
          onChange={(e) => setSeller(e.target.value)}
        >
          <option value="all">Tất cả gian hàng</option>
          {data.sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span>{orders.length} đơn hàng</span>
      </div>
      {orders.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Mã đơn / khách hàng</th>
                <th>Gian hàng</th>
                <th>Thời gian</th>
                <th>Thanh toán</th>
                <th>Tổng tiền</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} onClick={() => onOrder(o.id)}>
                  <td>
                    <button
                      className="order-link"
                      onClick={() => onOrder(o.id)}
                    >
                      {o.code}
                    </button>
                    <small>{o.customerName || "Khách lẻ"}</small>
                  </td>
                  <td>{o.sellerName}</td>
                  <td>
                    {time(o.createdAt)}
                    <small>{localDay(o.createdAt)}</small>
                  </td>
                  <td>
                    <span className="payment-text">
                      {o.paymentMethod === "cash" ? (
                        <Banknote size={15} />
                      ) : (
                        <QrCode size={15} />
                      )}{" "}
                      {o.paymentMethod === "cash" ? "Tiền mặt" : "Chuyển khoản"}
                    </span>
                  </td>
                  <td className="bold">{money(o.total)}</td>
                  <td>
                    <Badge status={o.paymentStatus} />
                  </td>
                  <td>
                    <ChevronRight size={17} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Chưa có đơn hàng phù hợp"
          description="Đơn mới sẽ xuất hiện ở đây ngay sau khi được tạo."
          icon={ClipboardList}
        />
      )}
      <p className="table-caption">
        Hiển thị đơn hàng của các gian hàng được phân quyền. Trạng thái được cập
        nhật mỗi 5 giây.
      </p>
    </section>
  );
}

function ProductsPanel({
  data,
  sellerId,
  notify,
  refresh,
}: SharedProps & { sellerId: string }) {
  const [editing, setEditing] = useState<Product | "new" | null>(null),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false);
  const products = data.products.filter(
    (p) =>
      p.sellerId === sellerId &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  async function toggle(p: Product) {
    setBusy(true);
    try {
      await api("/products/" + p.id, {
        method: "PATCH",
        body: { active: !p.active },
      });
      await refresh();
      notify(p.active ? "Đã tạm ngừng bán món." : "Đã mở bán món.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="content-panel">
      <div className="table-toolbar">
        <div className="searchbox">
          <Search size={17} />
          <input
            aria-label="Tìm trong thực đơn"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm trong thực đơn…"
          />
        </div>
        <button
          className="btn primary small"
          disabled={!sellerId}
          onClick={() => setEditing("new")}
        >
          <Plus size={17} />
          Thêm món mới
        </button>
      </div>
      {products.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Món ăn / thức uống</th>
                <th>Nhóm món</th>
                <th>Giá bán</th>
                <th>Tồn kho</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="product-cell">
                      <span style={{ background: p.color }}>{p.emoji}</span>
                      <b>{p.name}</b>
                    </div>
                  </td>
                  <td>{p.category}</td>
                  <td className="bold">{money(p.price)}</td>
                  <td>{p.stock === null ? "Không giới hạn" : p.stock}</td>
                  <td>
                    <button
                      className={"status-toggle " + (p.active ? "on" : "")}
                      disabled={busy}
                      onClick={() => toggle(p)}
                    >
                      <span />
                      {p.active ? "Đang bán" : "Tạm ngừng"}
                    </button>
                  </td>
                  <td>
                    <button
                      className="btn text small"
                      onClick={() => setEditing(p)}
                    >
                      <Pencil size={15} />
                      Sửa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Thêm món ngon đầu tiên"
          description="Đặt tên món, giá bán và tồn kho để bắt đầu bán hàng."
          icon={UtensilsCrossed}
        />
      )}
      <p className="table-caption">
        Mỗi món thuộc một gian hàng. Thay đổi giá không ảnh hưởng đến các đơn đã
        tạo.
      </p>
      {editing && (
        <ProductForm
          product={editing === "new" ? null : editing}
          sellerId={sellerId}
          onClose={() => setEditing(null)}
          notify={notify}
          refresh={refresh}
        />
      )}
    </section>
  );
}
function ProductForm({
  product,
  sellerId,
  onClose,
  notify,
  refresh,
}: {
  product: Product | null;
  sellerId: string;
  onClose: () => void;
  notify: Notify;
  refresh: SharedProps["refresh"];
}) {
  const [name, setName] = useState(product?.name || ""),
    [category, setCategory] = useState(product?.category || "Đồ ăn"),
    [department, setDepartment] = useState<Department>(
      product?.department ||
        (/nước|uống/i.test(product?.category || "") ? "drinks" : "food"),
    ),
    [price, setPrice] = useState(String(product?.price || "")),
    [stock, setStock] = useState(
      product?.stock == null ? "" : String(product.stock),
    ),
    [emoji, setEmoji] = useState(product?.emoji || "🍢"),
    [color, setColor] = useState(product?.color || "#fae7d7"),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(product ? "/products/" + product.id : "/products", {
        method: product ? "PATCH" : "POST",
        body: {
          sellerId,
          name,
          category,
          department,
          price: Number(price),
          stock: stock === "" ? null : Number(stock),
          emoji,
          color,
          active: product?.active ?? true,
        },
      });
      await refresh();
      notify(product ? "Đã cập nhật món." : "Món mới đã sẵn sàng mở bán.");
      onClose();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={product ? "Chỉnh sửa món" : "Thêm món ngon"}
      subtitle="Một món nhỏ, thêm nhiều lựa chọn cho khách."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save} className="modal-form">
        <Field
          label="Ban phụ trách chuẩn bị"
          hint="Đơn đã thanh toán sẽ chuyển đến đúng ban theo mục này."
        >
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value as Department)}
          >
            <option value="food">Bán hàng · đồ ăn / cookie</option>
            <option value="handmade">Bán hàng · đồ handmade</option>
            <option value="drinks">Hậu cần · chuẩn bị nước</option>
          </select>
        </Field>
        <Field label="Tên món">
          <input
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ví dụ: Trà đào cam sả"
          />
        </Field>
        <div className="form-grid">
          <Field label="Nhóm món">
            <input
              required
              maxLength={40}
              list="categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <datalist id="categories">
              <option>Đồ ăn</option>
              <option>Đồ uống</option>
              <option>Ăn vặt</option>
            </datalist>
          </Field>
          <Field label="Giá bán (VND)">
            <input
              required
              type="number"
              min={1}
              max={1000000000}
              step={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Tồn kho"
          hint="Để trống nếu không giới hạn. Tồn kho được trừ khi tạo đơn."
        >
          <input
            type="number"
            min={0}
            max={1000000}
            step={1}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            placeholder="Không giới hạn"
          />
        </Field>
        <Field label="Biểu tượng món">
          <div className="emoji-picker">
            {[
              "🧋",
              "🥤",
              "🍹",
              "🍊",
              "🍢",
              "🍟",
              "🍗",
              "🍙",
              "🥪",
              "🍜",
              "🍰",
              "🍦",
            ].map((v) => (
              <button
                type="button"
                key={v}
                className={emoji === v ? "selected" : ""}
                onClick={() => setEmoji(v)}
                aria-label={`Chọn ${v}`}
              >
                {v}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Màu thẻ món">
          <div className="color-picker">
            {[
              "#fae7d7",
              "#e8efd7",
              "#f9ecd0",
              "#f1e4ed",
              "#ddebef",
              "#fae2df",
            ].map((v) => (
              <button
                type="button"
                key={v}
                style={{ background: v }}
                className={color === v ? "selected" : ""}
                onClick={() => setColor(v)}
                aria-label={`Chọn màu ${v}`}
              >
                {color === v && <Check size={18} />}
              </button>
            ))}
          </div>
        </Field>
        <div className="modal-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={onClose}
          >
            Đóng
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Đang lưu…" : "Lưu món"}
            <Check size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SellersPanel({ data, notify, refresh }: SharedProps) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  async function toggle(s: Seller) {
    setBusy(true);
    try {
      await api("/sellers/" + s.id, {
        method: "PATCH",
        body: { active: !s.active },
      });
      await refresh();
      notify(s.active ? "Đã tạm đóng gian hàng." : "Đã mở lại gian hàng.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="standalone-toolbar">
        <span>{data.sellers.length} gian hàng cùng tạo nên hội trại</span>
        <button className="btn primary" onClick={() => setOpen(true)}>
          <Plus size={18} />
          Thêm gian hàng
        </button>
      </div>
      <div className="seller-grid">
        {data.sellers.map((s) => (
          <div className="seller-card" key={s.id}>
            <div className="seller-card-top">
              <span
                className="seller-emblem"
                style={{ background: s.color || "#e8efd7" }}
              >
                <Store size={29} />
              </span>
              <span className={"badge " + (s.active ? "paid" : "cancelled")}>
                {s.active ? "Đang mở" : "Tạm đóng"}
              </span>
            </div>
            <h2>{s.name}</h2>
            <p>{s.description || "Gian hàng của hội trại"}</p>
            <div className="seller-metrics">
              <div>
                <b>
                  {
                    data.products.filter((p) => p.sellerId === s.id && p.active)
                      .length
                  }
                </b>
                <small>Món đang bán</small>
              </div>
              <div>
                <b>
                  {
                    data.orders.filter(
                      (o) =>
                        (o.sellerId === s.id ||
                          o.items.some((item) => item.sellerId === s.id)) &&
                        o.paymentStatus === "paid",
                    ).length
                  }
                </b>
                <small>Đơn đã thanh toán</small>
              </div>
            </div>
            <button
              className="btn secondary full"
              disabled={busy}
              onClick={() => toggle(s)}
            >
              {s.active ? "Tạm đóng gian hàng" : "Mở lại gian hàng"}
            </button>
          </div>
        ))}
      </div>
      {!data.sellers.length && (
        <Empty
          title="Mở gian hàng đầu tiên"
          description="Mỗi gian hàng có tài khoản đăng nhập riêng để quản lý món và lên đơn."
          icon={Store}
        />
      )}
      <div className="notice">
        <ShieldCheck size={20} />
        <div>
          <b>Tài khoản riêng, gian hàng riêng</b>
          <p>
            Người bán chỉ quản lý món và đơn của gian hàng mình. Quản trị viên
            có thể xem và bán hàng cho tất cả gian hàng.
          </p>
        </div>
      </div>
      {open && (
        <SellerForm
          onClose={() => setOpen(false)}
          notify={notify}
          refresh={refresh}
        />
      )}
    </>
  );
}
function SellerForm({
  onClose,
  notify,
  refresh,
}: {
  onClose: () => void;
  notify: Notify;
  refresh: SharedProps["refresh"];
}) {
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("/sellers", {
        method: "POST",
        body: {
          name: form.get("name"),
          description: form.get("description"),
          username: form.get("username"),
          password: form.get("password"),
          color: "#e8efd7",
        },
      });
      await refresh();
      notify("Đã tạo gian hàng và tài khoản người bán.");
      onClose();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Thêm gian hàng"
      subtitle="Tạo một không gian riêng cho người bán."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="modal-form" onSubmit={save}>
        <Field label="Tên gian hàng">
          <input
            name="name"
            required
            maxLength={80}
            placeholder="Ví dụ: Góc Nhà Lá"
          />
        </Field>
        <Field label="Giới thiệu ngắn">
          <input
            name="description"
            maxLength={200}
            placeholder="Đồ ăn vặt ngon, giá học sinh"
          />
        </Field>
        <div className="form-section-title">
          <ShieldCheck size={17} />
          Tài khoản người bán
        </div>
        <Field
          label="Tên đăng nhập"
          hint="Chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới."
        >
          <input
            name="username"
            required
            minLength={3}
            maxLength={40}
            pattern="[a-zA-Z0-9_.-]+"
            autoComplete="off"
            placeholder="gocnhala"
          />
        </Field>
        <Field
          label="Mật khẩu"
          hint="Ít nhất 12 ký tự, gồm chữ hoa, chữ thường và số."
        >
          <input
            name="password"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,}"
          />
        </Field>
        <div className="modal-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={onClose}
          >
            Đóng
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Đang tạo…" : "Tạo gian hàng"}
            <Plus size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReportsPanel({ data }: { data: Bootstrap }) {
  const [date, setDate] = useState(localDay()),
    [seller, setSeller] = useState("all");
  const orders = data.orders
    .filter((o) => localDay(o.createdAt) === date)
    .map((order) => {
      if (seller === "all") return order;
      const items = order.items.filter(
        (item) => (item.sellerId || order.sellerId) === seller,
      );
      return {
        ...order,
        items,
        total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
        sellerName:
          data.sellers.find((stall) => stall.id === seller)?.name ||
          order.sellerName,
      };
    })
    .filter((order) => order.items.length > 0);
  const paid = orders.filter((o) => o.paymentStatus === "paid"),
    revenue = paid.reduce((n, o) => n + o.total, 0);
  const byProduct = new Map<
    string,
    { name: string; quantity: number; total: number }
  >();
  paid.forEach((o) =>
    o.items.forEach((i) => {
      const p = byProduct.get(i.productId) || {
        name: i.name,
        quantity: 0,
        total: 0,
      };
      p.quantity += i.quantity;
      p.total += i.price * i.quantity;
      byProduct.set(i.productId, p);
    }),
  );
  const best = [...byProduct.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 6),
    max = best[0]?.quantity || 1;
  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    total: paid
      .filter(
        (o) =>
          Number(
            new Intl.DateTimeFormat("en-GB", {
              hour: "2-digit",
              hourCycle: "h23",
              timeZone: "Asia/Ho_Chi_Minh",
            }).format(new Date(o.createdAt)),
          ) === hour,
      )
      .reduce((n, o) => n + o.total, 0),
  }));
  const hourMax = Math.max(...byHour.map((h) => h.total), 1);
  return (
    <>
      <div className="report-filters">
        <Field label="Ngày báo cáo">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Gian hàng">
          <select value={seller} onChange={(e) => setSeller(e.target.value)}>
            <option value="all">Tất cả gian hàng</option>
            {data.sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <button className="btn secondary" onClick={() => exportOrders(orders)}>
          <Download size={17} />
          Xuất báo cáo CSV
        </button>
      </div>
      <div className="stats-row">
        <Stat label="Tổng doanh thu" value={money(revenue)} icon={Banknote} />
        <Stat
          label="Đơn đã thanh toán"
          value={paid.length}
          icon={CheckCircle2}
          color="green"
        />
        <Stat
          label="Giá trị đơn trung bình"
          value={money(paid.length ? Math.round(revenue / paid.length) : 0)}
          icon={ShoppingBag}
          color="purple"
        />
      </div>
      <div className="reports-grid">
        <section className="content-panel report-chart">
          <h2>Nhịp bán hàng trong ngày</h2>
          <p>Doanh thu theo giờ · múi giờ Việt Nam</p>
          <div className="hour-chart">
            {byHour.map((h) => (
              <div
                className="hour-column"
                key={h.hour}
                title={`${h.hour}:00 — ${money(h.total)}`}
              >
                <div>
                  <span
                    style={{
                      height: `${h.total ? Math.max((h.total / hourMax) * 100, 3) : 0}%`,
                    }}
                  />
                </div>
                <small>{h.hour % 3 === 0 ? `${h.hour}h` : ""}</small>
              </div>
            ))}
          </div>
          <div className="chart-legend">
            <span /> Đơn đã thanh toán
          </div>
        </section>
        <section className="content-panel best-sellers">
          <h2>Món được yêu thích</h2>
          <p>Những ngôi sao của gian hàng hôm nay</p>
          {best.length ? (
            best.map((p, i) => (
              <div className="best-row" key={p.name + i}>
                <span className="rank">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div>
                    <b>{p.name}</b>
                    <small>{p.quantity} món</small>
                  </div>
                  <div className="bar-track">
                    <span style={{ width: `${(p.quantity / max) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <Empty
              title="Chờ những đơn đầu tiên"
              description="Các món bán chạy sẽ xuất hiện tại đây."
              icon={Flame}
            />
          )}
        </section>
      </div>
      <div className="payment-summary">
        <div>
          <Banknote size={24} />
          <span>Tiền mặt</span>
          <b>
            {money(
              paid
                .filter((o) => o.paymentMethod === "cash")
                .reduce((n, o) => n + o.total, 0),
            )}
          </b>
        </div>
        <div>
          <QrCode size={24} />
          <span>Chuyển khoản</span>
          <b>
            {money(
              paid
                .filter((o) => o.paymentMethod === "transfer")
                .reduce((n, o) => n + o.total, 0),
            )}
          </b>
        </div>
        <div>
          <Clock3 size={24} />
          <span>Chưa thanh toán</span>
          <b>
            {money(
              orders
                .filter((o) => o.paymentStatus === "pending")
                .reduce((n, o) => n + o.total, 0),
            )}
          </b>
        </div>
      </div>
      <p className="table-caption">
        Báo cáo tính theo ngày tạo đơn (múi giờ Việt Nam), chỉ cộng doanh thu
        các đơn đã thanh toán trong dữ liệu của tài khoản.
      </p>
    </>
  );
}

function SettingsPanel({ data, notify, refresh }: SharedProps) {
  const [form, setForm] = useState(data.settings),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setForm(data.settings);
  }, [
    data.settings.eventName,
    data.settings.bankBin,
    data.settings.bankName,
    data.settings.accountNumber,
    data.settings.accountName,
    dirty,
  ]);
  const change = (key: keyof Settings, value: string) => {
    setDirty(true);
    setForm((f) => ({ ...f, [key]: value }));
  };
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/settings", { method: "PUT", body: form });
      setDirty(false);
      await refresh();
      notify("Đã lưu cài đặt hội trại.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-grid">
      <form className="content-panel settings-form" onSubmit={save}>
        <h2>
          <Tent size={21} />
          Thông tin hội trại
        </h2>
        <Field label="Tên hội trại">
          <input
            required
            maxLength={100}
            value={form.eventName}
            onChange={(e) => change("eventName", e.target.value)}
            placeholder="Hội trại Thanh Xuân"
          />
        </Field>
        <h2 className="settings-divider">
          <QrCode size={21} />
          Tài khoản nhận chuyển khoản
        </h2>
        <p>Áp dụng chung cho các gian hàng. QR tự điền số tiền và mã đơn.</p>
        <div className="form-grid">
          <Field label="Ngân hàng">
            <input
              maxLength={60}
              value={form.bankName}
              onChange={(e) => change("bankName", e.target.value)}
              placeholder="Ví dụ: MB Bank"
            />
          </Field>
          <Field
            label="Mã BIN ngân hàng"
            hint="Mã 6 chữ số từ ngân hàng/VietQR."
          >
            <input
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={form.bankBin}
              onChange={(e) => change("bankBin", e.target.value)}
              placeholder="Nhập mã BIN"
            />
          </Field>
        </div>
        <Field label="Số tài khoản">
          <input
            maxLength={19}
            pattern="[a-zA-Z0-9]+"
            value={form.accountNumber}
            onChange={(e) => change("accountNumber", e.target.value)}
            placeholder="Số tài khoản nhận tiền"
            autoComplete="off"
          />
        </Field>
        <Field label="Tên chủ tài khoản">
          <input
            maxLength={100}
            value={form.accountName}
            onChange={(e) =>
              change("accountName", e.target.value.toUpperCase())
            }
            placeholder="NGUYEN VAN A"
          />
        </Field>
        {isDemo() && (
          <div className="notice compact">
            <AlertCircle size={17} />
            <span>
              Demo không chuyển tiền thật. Chỉ dùng thông tin thử nghiệm.
            </span>
          </div>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? "Đang lưu…" : "Lưu cài đặt"}
          <Check size={17} />
        </button>
      </form>
      <div className="settings-info">
        <section className="content-panel">
          <span className="manual-payment-icon">
            <QrCode size={31} />
          </span>
          <h2>Chuyển khoản & xác nhận</h2>
          <div className="notice compact">
            <ShieldCheck size={17} />
            <span>
              {isDemo()
                ? "Demo dùng QR thử nghiệm và thao tác xác nhận của thu ngân."
                : "Thu ngân kiểm tra tiền vào tài khoản rồi xác nhận thanh toán."}
            </span>
          </div>
          <span
            className={
              "badge " + (data.settings.accountNumber ? "paid" : "pending")
            }
          >
            {data.settings.accountNumber
              ? "Đã cấu hình tài khoản"
              : "Chờ cấu hình tài khoản"}
          </span>
          <p>
            Khách chuyển tiền bằng QR. Thu ngân kiểm tra giao dịch rồi xác nhận
            để hoàn tất, lưu đơn và gửi phần việc tới các ban.
          </p>
          <ol className="payment-steps">
            <li>
              <span>1</span>
              <div>
                <b>Tạo đơn chuyển khoản</b>
                <small>Hệ thống lưu đơn ở trạng thái chờ thanh toán.</small>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <b>Khách quét QR</b>
                <small>QR chứa tài khoản nhận, số tiền và mã đơn.</small>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <b>Kiểm tra tài khoản ngân hàng</b>
                <small>
                  Thu ngân đối chiếu số tiền và nội dung khách đã chuyển.
                </small>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <b>Xác nhận đã nhận tiền</b>
                <small>
                  Lưu thời điểm và người xác nhận; các ban nhận phần việc của mình.
                </small>
              </div>
            </li>
          </ol>
          <div className="notice compact">
            <CircleHelp size={17} />
            <span>
              QR hỗ trợ điền thông tin chuyển khoản. Đơn chỉ hoàn tất sau khi
              thu ngân xác nhận.
            </span>
          </div>
        </section>
        <section className="content-panel">
          <h3>
            <ShieldCheck size={18} />
            Dữ liệu của hội trại
          </h3>
          <p>
            Thông tin đăng nhập database được bảo vệ trên máy chủ. Người bán chỉ
            truy cập dữ liệu gian hàng được phân quyền.
          </p>
          <div className="stack-tags">
            <span>Netlify Functions</span>
            <span>Aiven PostgreSQL</span>
          </div>
        </section>
      </div>
    </div>
  );
}

function PaymentModal({
  order,
  settings,
  onClose,
  refresh,
  notify,
  canManagePayment,
  data,
}: {
  order: Order;
  settings: Settings;
  onClose: () => void;
  refresh: SharedProps["refresh"];
  notify: Notify;
  canManagePayment: boolean;
  data: Bootstrap;
}) {
  const [busy, setBusy] = useState(false),
    [cash, setCash] = useState(String(order.cashReceived || order.total)),
    [confirming, setConfirming] = useState<"manual" | "cancel" | null>(null),
    [qrFailed, setQrFailed] = useState(false),
    [deleting, setDeleting] = useState(false),
    [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const bank = order.bankDetails || settings;
  const transferContent = order.code;
  const qr = qrUrl(order, { ...settings, ...bank });

  async function handleDeleteOrder() {
    setDeleting(true);
    try {
      await api("/orders/" + order.id, { method: "DELETE" });
      notify("Đã xóa vĩnh viễn đơn hàng " + order.code + ".");
      onClose();
      await refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  async function action(kind: "confirm" | "cancel") {
    setBusy(true);
    try {
      await api("/orders/" + order.id + "/" + kind, {
        method: "POST",
        body:
          kind === "confirm" && order.paymentMethod === "cash"
            ? { cashReceived: Number(cash) }
            : {},
      });
      await refresh();
      setConfirming(null);
      notify(
        kind === "cancel"
          ? "Đã hủy đơn và hoàn lại tồn kho."
          : "Đã xác nhận thanh toán và lưu đơn hàng.",
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("Đã sao chép.");
    } catch {
      notify(
        "Trình duyệt chưa cho phép sao chép. Bạn có thể chọn nội dung bằng tay.",
        true,
      );
    }
  }
  function print() {
    window.print();
  }
  return (
    <Modal
      wide
      title={
        order.paymentStatus === "paid"
          ? "Thanh toán hoàn tất"
          : order.paymentStatus === "cancelled"
            ? "Đơn hàng đã hủy"
            : "Thanh toán đơn hàng"
      }
      subtitle={`${order.code} · ${order.sellerName}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="payment-modal-body">
        <section className="receipt">
          <div className="receipt-heading">
            <Brand small />
            <Badge status={order.paymentStatus} />
          </div>
          <div className="receipt-meta">
            <span>
              Khách hàng<b>{order.customerName || "Khách lẻ"}</b>
            </span>
            <span>
              Thời gian
              <b>
                {time(order.createdAt)} · {localDay(order.createdAt)}
              </b>
            </span>
          </div>
          <div className="receipt-items">
            {order.items.map((i) => (
              <div key={i.productId}>
                <span>
                  <b>{i.quantity}×</b> {i.name}
                  <small>{money(i.price)} / món</small>
                </span>
                <strong>{money(i.quantity * i.price)}</strong>
              </div>
            ))}
          </div>
          {order.note && (
            <div className="receipt-note">Ghi chú: {order.note}</div>
          )}
          <div className="receipt-total">
            <span>Tổng thanh toán</span>
            <strong>{money(order.total)}</strong>
          </div>
          <div className="receipt-method">
            <span>Phương thức</span>
            <b>
              {order.paymentMethod === "cash" ? "Tiền mặt" : "Chuyển khoản"}
            </b>
          </div>
          {order.paymentStatus === "paid" && order.paymentMethod === "cash" && (
            <>
              <div className="receipt-method">
                <span>Tiền khách đưa</span>
                <b>{money(order.cashReceived || order.total)}</b>
              </div>
              <div className="receipt-method">
                <span>Tiền trả lại</span>
                <b>
                  {money((order.cashReceived || order.total) - order.total)}
                </b>
              </div>
            </>
          )}
          <p className="receipt-thanks">Cảm ơn bạn đã góp vui tại hội trại ✦</p>
        </section>
        <section className="payment-instructions">
          {order.paymentStatus === "paid" ? (
            <div className="paid-state">
              <span>
                <Check size={38} />
              </span>
              <h2>Đã nhận đủ tiền!</h2>
              <p>
                {order.paymentMethod === "transfer"
                  ? "Người phụ trách đã xác nhận tiền chuyển khoản."
                  : "Tiền mặt đã được ghi nhận."}
              </p>
              {order.paidAt && (
                <small>
                  {time(order.paidAt)} · {localDay(order.paidAt)}
                </small>
              )}
              <button className="btn secondary full" onClick={print}>
                <Printer size={17} />
                In phiếu bán hàng
              </button>
              <button className="btn primary full" onClick={onClose}>
                Tiếp tục bán hàng
                <ArrowRight size={17} />
              </button>
            </div>
          ) : order.paymentStatus === "cancelled" ? (
            <Empty
              title="Đơn đã được hủy"
              description="Tồn kho các món đã được hoàn lại. Đơn này không thể nhận thanh toán."
              icon={X}
            />
          ) : !canManagePayment ? (
            <Empty
              title="Thông tin phần việc"
              description="Thanh toán do thu ngân phụ trách. Cập nhật tiến độ và phản hồi trong mục Chuẩn bị & trao đổi."
              icon={ClipboardList}
            />
          ) : (
            <>
              {order.paymentMethod === "transfer" ? (
                <>
                  <div className="qr-title">
                    <QrCode size={20} />
                    <h3>Quét mã để chuyển khoản</h3>
                  </div>
                  <div className="qr-container">
                    {isDemo() ? (
                      <div className="demo-qr">
                        <QrCode size={90} />
                        <b>QR thử nghiệm</b>
                        <small>Không dùng để chuyển tiền thật</small>
                      </div>
                    ) : qr && !qrFailed ? (
                      <img
                        src={qr}
                        alt={`QR chuyển khoản ${money(order.total)}, nội dung ${order.code}`}
                        onError={() => setQrFailed(true)}
                      />
                    ) : (
                      <div className="qr-fallback">
                        <AlertCircle size={30} />
                        <p>
                          {qrFailed
                            ? "Chưa tải được QR. Khách có thể chuyển khoản theo thông tin bên dưới."
                            : "Chưa có thông tin tài khoản. Kiểm tra Cài đặt."}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="transfer-details">
                    <span>
                      Ngân hàng<b>{bank.bankName || "Chưa cấu hình"}</b>
                    </span>
                    <span>
                      Chủ tài khoản<b>{bank.accountName || "Chưa cấu hình"}</b>
                    </span>
                    <span>
                      Số tài khoản
                      <b>
                        {bank.accountNumber || "Chưa cấu hình"}
                        {bank.accountNumber && (
                          <button
                            onClick={() => copy(bank.accountNumber)}
                            aria-label="Sao chép số tài khoản"
                          >
                            <Copy size={13} />
                          </button>
                        )}
                      </b>
                    </span>
                    <span>
                      Nội dung
                      <b className="orange">
                        {transferContent}
                        <button
                          onClick={() => copy(transferContent)}
                          aria-label="Sao chép mã đơn"
                        >
                          <Copy size={13} />
                        </button>
                      </b>
                    </span>
                    <span>
                      Số tiền<b className="orange">{money(order.total)}</b>
                    </span>
                  </div>
                  <div className="waiting">
                    <span className="pulse-dot" />
                    <span>Đang chờ thu ngân xác nhận nhận tiền</span>
                  </div>
                  <small className="payment-hint">
                    Khách chuyển đúng số tiền và mã đơn. Thu ngân kiểm tra tài
                    khoản ngân hàng trước khi xác nhận.
                  </small>
                  {!confirming && (
                    <button
                      className="btn primary full"
                      disabled={busy}
                      onClick={() => setConfirming("manual")}
                    >
                      <CheckCircle2 size={17} />
                      Xác nhận đã nhận tiền
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="cash-payment-icon">
                    <Banknote size={48} />
                  </div>
                  <h3>Thu tiền mặt</h3>
                  <p>Kiểm tra đủ số tiền trước khi xác nhận.</p>
                  <Field label="Tiền khách đưa (VND)">
                    <input
                      type="number"
                      min={order.total}
                      value={cash}
                      onChange={(e) => setCash(e.target.value)}
                    />
                  </Field>
                  <div className="change-row">
                    <span>Tiền trả lại</span>
                    <b>{money(Math.max(0, Number(cash) - order.total))}</b>
                  </div>
                  <button
                    className="btn primary full"
                    disabled={busy || Number(cash) < order.total}
                    onClick={() => action("confirm")}
                  >
                    Xác nhận đã thu tiền
                    <Check size={17} />
                  </button>
                </>
              )}
              {confirming ? (
                <div className="confirmation-box">
                  <b>
                    {confirming === "cancel"
                      ? "Hủy đơn này?"
                      : "Bạn đã kiểm tra tiền vào ngân hàng?"}
                  </b>
                  <p>
                    {confirming === "cancel"
                      ? "Hủy đơn sẽ hoàn lại tồn kho. Chỉ hủy khi khách chưa chuyển tiền."
                      : "Chỉ xác nhận sau khi thấy giao dịch đúng số tiền trong tài khoản nhận."}
                  </p>
                  <div>
                    <button
                      className="btn secondary small"
                      disabled={busy}
                      onClick={() => setConfirming(null)}
                    >
                      Quay lại
                    </button>
                    <button
                      className={
                        "btn small " +
                        (confirming === "cancel" ? "danger" : "primary")
                      }
                      disabled={busy}
                      onClick={() =>
                        action(confirming === "cancel" ? "cancel" : "confirm")
                      }
                    >
                      {busy ? "Đang xử lý…" : "Xác nhận"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="payment-secondary-actions">
                  <button
                    disabled={busy}
                    className="danger-text"
                    onClick={() => setConfirming("cancel")}
                  >
                    Hủy đơn
                  </button>
                </div>
              )}
            </>
          )}
          {canManagePayment && (
            <div
              style={{
                marginTop: 16,
                borderTop: "1px dashed var(--line)",
                paddingTop: 12,
                textAlign: "center",
              }}
            >
              <button
                type="button"
                disabled={busy || deleting}
                className="danger-text btn text small"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 size={14} style={{ marginRight: 6 }} />
                Xóa vĩnh viễn đơn hàng này
              </button>
            </div>
          )}
        </section>
      </div>
      {order.paymentStatus === "paid" && (
        <OrderThread
          data={data}
          orderId={order.id}
          notify={notify}
          refresh={refresh}
        />
      )}

      {showDeleteConfirm && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleting)
              setShowDeleteConfirm(false);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: 420 }}
          >
            <div className="modal-header">
              <div>
                <h2 style={{ color: "#dc2626" }}>Xác nhận xóa đơn</h2>
                <p>
                  {order.code} · {order.customerName || "Khách lẻ"}
                </p>
              </div>
              <button
                className="icon-btn"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-form">
              <p style={{ lineHeight: 1.6 }}>
                Bạn có chắc chắn muốn xóa vĩnh viễn đơn hàng{" "}
                <strong>{order.code}</strong>?
              </p>
              <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                Phiếu chuẩn bị liên quan và các tin nhắn của đơn này cũng sẽ bị xóa. Tồn kho các món (nếu có theo dõi) sẽ được hoàn lại.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                  marginTop: 16,
                }}
              >
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={handleDeleteOrder}
                  disabled={deleting}
                >
                  {deleting ? "Đang xóa…" : "Xác nhận xóa đơn"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
