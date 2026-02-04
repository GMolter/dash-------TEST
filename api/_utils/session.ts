import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function b64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function hmac(data: string, secret: string) {
  return b64url(createHmac("sha256", secret).update(data).digest());
}

export function makeSessionCookie(secret: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `v1.${issuedAt}`;
  const sig = hmac(payload, secret);
  const token = `${payload}.${sig}`;

  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SECONDS}`,
  ].join("; ");
}

export function clearSessionCookie() {
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

export function isAuthed(req: any, secret: string) {
  const header = req.headers?.cookie || "";
  const match = header.match(/(?:^|;\s*)admin_session=([^;]+)/);
  if (!match) return false;

  const token = match[1];
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const payload = `${parts[0]}.${parts[1]}`;
  const sig = parts[2];

  const expected = hmac(payload, secret);

  if (sig.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;

  const issuedAt = Number(parts[1]);
  if (!Number.isFinite(issuedAt)) return false;

  const age = Math.floor(Date.now() / 1000) - issuedAt;
  return age >= 0 && age <= MAX_AGE_SECONDS;
}
