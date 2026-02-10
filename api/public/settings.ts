export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceConfig } from "../_utils/supabaseConfig";

export default async function handler(_req: any, res: any) {
  try {
    const cfg = getSupabaseServiceConfig();
    if (!cfg.ok) {
      return res.status(200).json({
        bannerEnabled: false,
        bannerText: "",
        updatedAt: null,
        warning: cfg.error,
        detail: cfg.detail || "",
      });
    }

    const supabase = createClient(cfg.url, cfg.serviceKey);

    const { data, error } = await supabase
      .from("app_settings")
      .select("banner_enabled,banner_text,updated_at")
      .eq("id", "global")
      .maybeSingle();

    if (error) {
      // Missing table in an older environment should not break app startup.
      if (error.code === "42P01") {
        return res.status(200).json({
          bannerEnabled: false,
          bannerText: "",
          updatedAt: null,
          warning: "app_settings table not found.",
        });
      }
      return res.status(200).json({
        bannerEnabled: false,
        bannerText: "",
        updatedAt: null,
        warning: error.message || "Failed to load app settings.",
      });
    }

    return res.status(200).json({
      bannerEnabled: !!data?.banner_enabled,
      bannerText: data?.banner_text || "",
      updatedAt: data?.updated_at || null,
    });
  } catch (err: any) {
    console.error("public/settings crash:", err);
    return res.status(200).json({
      bannerEnabled: false,
      bannerText: "",
      updatedAt: null,
      warning: "Settings endpoint fallback due to runtime error.",
    });
  }
}
