export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceConfig } from "../_utils/supabaseConfig";

export default async function handler(req: any, res: any) {
  try {
    res.setHeader("Cache-Control", "no-store");
    const cfg = getSupabaseServiceConfig();
    if (!cfg.ok) {
      return res.status(503).json({ error: cfg.error, detail: cfg.detail || "" });
    }

    const slug = String(req.query?.slug || "").trim();
    if (!slug) return res.status(400).json({ error: "Missing slug" });

    const supabase = createClient(cfg.url, cfg.serviceKey);
    const { data, error } = await supabase
      .from("help_articles")
      .select("id,slug,title,summary,content,updated_at")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01" || error.code === "42703") {
        return res.status(404).json({ error: "Not found" });
      }
      return res.status(500).json({ error: error.message || "Unable to load article." });
    }
    if (!data) return res.status(404).json({ error: "Not found" });

    return res.status(200).json({ article: data });
  } catch (err: any) {
    console.error("public/help-article crash:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
