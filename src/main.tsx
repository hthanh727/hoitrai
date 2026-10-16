import React, { Component, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/be-vietnam-pro/800.css";
import App from "./App";
import "./styles.css";
import "./manual.css";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught application error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "24px",
          textAlign: "center",
          fontFamily: "'Be Vietnam Pro', system-ui, sans-serif",
          background: "#fff7f2",
          color: "#333"
        }}>
          <h2 style={{ fontSize: "24px", marginBottom: "12px", color: "#e05320" }}>
            Đã xảy ra lỗi tải giao diện
          </h2>
          <p style={{ maxWidth: "500px", marginBottom: "16px", color: "#666" }}>
            {this.state.error?.message || "Vui lòng làm mới trang để tiếp tục."}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 600,
              color: "#fff",
              background: "#ef6b3a",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer"
            }}
          >
            Tải lại trang (F5)
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
