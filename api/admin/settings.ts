export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";

function b64urlFromBase64(b64: string) {
  return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function isAdmin(req: any) {
  const cookieSecret = process.env.ADMIN_COOKIE_SECRET;
  if (!cookieSecret) return false;

  const header = req.headers?.cookie || "";
  const match = header.match(/(?:^|;\s*)admin_session=([^;]+)/);
  if (!match) return false;

  const token = match[1];
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const payload = `${parts[0]}.${parts[1]}`;
  const sig = parts[2];

  const { createHmac, timingSafeEqual } = await import("crypto");
  const expected = b64urlFromBase64(
    createHmac("sha256", cookieSecret).update(payload).digest("base64")
  );

  if (sig.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;

  const issuedAt = Number(parts[1]);
  const age = Math.floor(Date.now() / 1000) - issuedAt;
  return Number.isFinite(issuedAt) && age >= 0 && age <= 60 * 60 * 12;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (!(await isAdmin(req))) return res.status(401).json({ error: "Unauthorized" });

    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });

    const { bannerEnabled, bannerText } = req.body || {};
    if (typeof bannerEnabled !== "boolean") return res.status(400).json({ error: "bannerEnabled must be boolean" });
    if (typeof bannerText !== "string") return res.status(400).json({ error: "bannerText must be string" });

    const supabase = createClient(url, service);

    const { error } = await supabase
      .from("app_settings")
      .upsert({
        id: "global",
        banner_enabled: bannerEnabled,
        banner_text: bannerText,
        updated_at: new Date().toISOString(),
      });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("admin/settings crash:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
