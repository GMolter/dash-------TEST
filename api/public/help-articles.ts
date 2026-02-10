export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceConfig } from "../_utils/supabaseConfig";

export default async function handler(_req: any, res: any) {
  try {
    res.setHeader("Cache-Control", "no-store");
    const cfg = getSupabaseServiceConfig();
    if (!cfg.ok) {
      return res.status(503).json({ error: cfg.error, detail: cfg.detail || "" });
    }

    const supabase = createClient(cfg.url, cfg.serviceKey);
    const { data, error } = await supabase
      .from("help_articles")
      .select("id,slug,title,summary,updated_at")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ articles: data || [] });
  } catch (err: any) {
    console.error("public/help-articles crash:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
