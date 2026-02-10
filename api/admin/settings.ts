export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "../_utils/adminAccess";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const access = await requireAdminAccess(req, { requirePasswordSession: true });
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });

    const { bannerEnabled, bannerText } = req.body || {};
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
    const supabase = createClient(url, service);
    const { data: existing, error: readError } = await supabase
      .from("app_settings")
      .select("banner_enabled,banner_text")
      .eq("id", "global")
      .maybeSingle();

    if (readError) return res.status(500).json({ error: readError.message });

    const { error } = await supabase
      .from("app_settings")
      .upsert({
        id: "global",
        banner_enabled: hasBannerEnabled ? bannerEnabled : !!existing?.banner_enabled,
        banner_text: hasBannerText ? bannerText : existing?.banner_text || "",
        updated_at: new Date().toISOString(),
      });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("admin/settings crash:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
