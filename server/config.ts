import { HttpError } from "./errors";

export function databaseConfig(env: NodeJS.ProcessEnv = process.env) {
  if (
    !env.DATABASE_URL ||
    !(env.DATABASE_CA_CERT || env.DATABASE_CA_CERT_BASE64)
  ) {
    throw new HttpError(
      503,
      "Chưa cấu hình kết nối PostgreSQL và chứng chỉ CA của Aiven.",
      "NOT_CONFIGURED",
    );
  }
  const url = new URL(env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new HttpError(
      503,
      "DATABASE_URL phải là PostgreSQL.",
      "NOT_CONFIGURED",
    );
  // pg connection-string SSL options replace the explicit ssl object. Remove them
  // so the CA and rejectUnauthorized cannot accidentally be overridden.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(key);
  const ca = env.DATABASE_CA_CERT_BASE64
    ? Buffer.from(env.DATABASE_CA_CERT_BASE64, "base64").toString("utf8")
    : env.DATABASE_CA_CERT!.replace(/\\n/g, "\n");
  if (!ca.includes("-----BEGIN CERTIFICATE-----"))
    throw new HttpError(503, "Chứng chỉ CA không hợp lệ.", "NOT_CONFIGURED");
  return {
    connectionString: url.toString(),
    ssl: { ca, rejectUnauthorized: true },
    max: 3,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    statement_timeout: 15_000,
  };
}

export function jwtKey(env: NodeJS.ProcessEnv = process.env) {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32)
    throw new HttpError(
      503,
      "JWT_SECRET cần ít nhất 32 ký tự ngẫu nhiên.",
      "NOT_CONFIGURED",
    );
  return new TextEncoder().encode(env.JWT_SECRET);
}

export function configurationStatus() {
  try {
    databaseConfig();
    jwtKey();
    return true;
  } catch {
    return false;
  }
}
