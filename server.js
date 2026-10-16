import { createServer } from "vite";
import os from "node:os";

const port = Number(process.env.PORT) || 5173;

async function start() {
  const server = await createServer({
    configFile: "./vite.config.ts",
    server: {
      host: "0.0.0.0",
      port,
      strictPort: false,
    },
  });

  await server.listen();
  console.log("\n🚀 Server Hội Trại POS đang chạy!");
  server.printUrls();

  const networkInterfaces = os.networkInterfaces();
  console.log("\n📱 Địa chỉ IP để các máy khác / điện thoại trong cùng mạng WiFi kết nối:");
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        console.log(`  👉 http://${net.address}:${server.config.server.port || port}`);
      }
    }
  }
  console.log("\n(Nhấn Ctrl + C để dừng server)\n");
}

start().catch((err) => {
  console.error("Lỗi khởi động server:", err);
  process.exit(1);
});
