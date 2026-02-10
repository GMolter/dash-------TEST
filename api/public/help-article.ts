export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  try {
    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) {
      return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
    }

    const slug = String(req.query?.slug || "").trim();
    if (!slug) return res.status(400).json({ error: "Missing slug" });

    const supabase = createClient(url, service);
    const { data, error } = await supabase
      .from("help_articles")
      .select("id,slug,title,summary,content,updated_at")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Not found" });

    return res.status(200).json({ article: data });
  } catch (err: any) {
    console.error("public/help-article crash:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
