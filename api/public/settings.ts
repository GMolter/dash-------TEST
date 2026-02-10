export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";

export default async function handler(_req: any, res: any) {
  try {
    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) {
      return res.status(200).json({
        bannerEnabled: false,
        bannerText: "",
        updatedAt: null,
        warning: "Settings backend is not configured.",
      });
    }

    const supabase = createClient(url, service);

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
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      bannerEnabled: !!data?.banner_enabled,
      bannerText: data?.banner_text || "",
      updatedAt: data?.updated_at || null,
    });
  } catch (err: any) {
    console.error("public/settings crash:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
