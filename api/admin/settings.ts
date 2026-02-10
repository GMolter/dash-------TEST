export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "../_utils/adminAccess";
import { getSupabaseServiceConfig } from "../_utils/supabaseConfig";

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
    const access = await requireAdminAccess(req, { requirePasswordSession: true });
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const cfg = getSupabaseServiceConfig();
    if (!cfg.ok) return res.status(503).json({ error: cfg.error, detail: cfg.detail || "" });

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
    const supabase = createClient(cfg.url, cfg.serviceKey);

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
