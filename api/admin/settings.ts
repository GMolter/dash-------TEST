export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";

function b64urlFromBase64(b64: string) {
  return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function readBearerToken(req: any) {
  const raw = req.headers?.authorization || req.headers?.Authorization || "";
  const value = String(raw);
  if (!value.toLowerCase().startsWith("bearer ")) return null;
  return value.slice(7).trim() || null;
}

function readAdminSessionCookie(req: any) {
  const header = req.headers?.cookie || "";
  const match = header.match(/(?:^|;\s*)admin_session=([^;]+)/);
  return match ? match[1] : null;
}

async function hasValidAdminPasswordSession(req: any) {
  try {
    const secret = process.env.ADMIN_COOKIE_SECRET || process.env.ADMIN_PASSWORD;
    if (!secret) return false;

    const token = readAdminSessionCookie(req);
    if (!token) return false;

    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const payload = `${parts[0]}.${parts[1]}`;
    const sig = parts[2];

    const { createHmac, timingSafeEqual } = await import("crypto");
    const expected = b64urlFromBase64(
      createHmac("sha256", secret).update(payload).digest("base64")
    );

    if (sig.length !== expected.length) return false;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;

    const issuedAt = Number(parts[1]);
    if (!Number.isFinite(issuedAt)) return false;
    const age = Math.floor(Date.now() / 1000) - issuedAt;
    return age >= 0 && age <= 60 * 60 * 12;
  } catch {
    return false;
  }
}

async function isAppAdmin(req: any, supabase: any) {
  try {
    const accessToken = readBearerToken(req);
    if (!accessToken) return false;

    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData.user) return false;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("app_admin")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError) return false;
    return !!profile?.app_admin;
  } catch {
    return false;
  }
}

function stripWrappingQuotes(value: string) {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1).trim();
  }
  return v;
}

function normalizeSupabaseUrl(raw: string | undefined | null) {
  if (!raw) return null;
  const cleaned = stripWrappingQuotes(raw);
  if (!cleaned) return null;
  const embedded = cleaned.match(/https?:\/\/[a-z0-9-]+\.supabase\.co/i)?.[0]
    || cleaned.match(/[a-z0-9-]+\.supabase\.co/i)?.[0];
  const base = embedded || cleaned;
  const candidate = /^https?:\/\//i.test(base) ? base : `https://${base}`;
  try {
    const parsed = new URL(candidate);
    return parsed.origin;
  } catch {
    return null;
  }
}

function parseBody(raw: any) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString("utf8"));
    } catch {
      return {};
    }
  }
  return raw;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const rawCandidates = [
      process.env.SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.VITE_SUPABASE_URL,
    ];
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const url = rawCandidates
      .map((candidate) => normalizeSupabaseUrl(candidate))
      .find((candidate) => !!candidate) || null;

    if (!serviceKey || !url) {
      return res.status(503).json({
        error: !serviceKey ? "Missing SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_URL is invalid.",
        detail: !serviceKey
          ? ""
          : "Expected format like https://<project-ref>.supabase.co (no quotes, no trailing text).",
      });
    }

    const supabase = createClient(url, serviceKey);

    const hasSession = await hasValidAdminPasswordSession(req);
    if (!hasSession) return res.status(401).json({ error: "Unauthorized" });

    const appAdmin = await isAppAdmin(req, supabase);
    if (!appAdmin) return res.status(403).json({ error: "Unauthorized Account" });

    const body = parseBody(req.body);
    const { bannerEnabled, bannerText } = body || {};
    const hasBannerEnabled = bannerEnabled !== undefined;
    const hasBannerText = bannerText !== undefined;

    if (!hasBannerEnabled && !hasBannerText) {
      return res.status(400).json({ error: "No settings provided" });
    }
    if (hasBannerEnabled && typeof bannerEnabled !== "boolean") {
      return res.status(400).json({ error: "bannerEnabled must be boolean" });
    }
    if (hasBannerText && typeof bannerText !== "string") {
      return res.status(400).json({ error: "bannerText must be string" });
    }

    const { error } = await supabase
      .from("app_settings")
      .upsert({
        id: "global",
        banner_enabled: hasBannerEnabled ? bannerEnabled : false,
        banner_text: hasBannerText ? bannerText : "",
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (error) {
      if (error.code === "42P01" || error.code === "42703" || error.code === "42P10") {
        return res.status(400).json({
          error: "app_settings schema is outdated. Run DB migrations.",
          code: error.code,
        });
      }
      return res.status(400).json({
        error: error.message || "Unable to save settings.",
        code: error.code || null,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("admin/settings crash:", err);
    return res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
}
