export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";

export default async function handler(_req: any, res: any) {
  try {
    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) {
      return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
    }

    const supabase = createClient(url, service);
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
