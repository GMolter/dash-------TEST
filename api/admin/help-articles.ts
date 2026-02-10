export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "../_utils/adminAccess";

function toSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default async function handler(req: any, res: any) {
  try {
    const access = await requireAdminAccess(req, { requirePasswordSession: true });
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) {
      return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
    }

    const supabase = createClient(url, service);

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("help_articles")
        .select("id,slug,title,summary,content,is_published,sort_order,created_at,updated_at")
        .order("sort_order", { ascending: true })
        .order("updated_at", { ascending: false });

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ articles: data || [] });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const title = String(body.title || "").trim();
      if (!title) return res.status(400).json({ error: "title is required" });

      const slugInput = String(body.slug || "").trim();
      const slug = toSlug(slugInput || title);
      if (!slug) return res.status(400).json({ error: "slug is required" });

      const summary = String(body.summary || "");
      const content = String(body.content || "");
      const isPublished = Boolean(body.isPublished);
      const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;

      const { data, error } = await supabase
        .from("help_articles")
        .insert({
          slug,
          title,
          summary,
          content,
          is_published: isPublished,
          sort_order: sortOrder,
          updated_at: new Date().toISOString(),
        })
        .select("id,slug,title,summary,content,is_published,sort_order,created_at,updated_at")
        .single();

      if (error) {
        if (error.code === "23505") return res.status(409).json({ error: "Slug already exists" });
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ article: data });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("admin/help-articles crash:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
