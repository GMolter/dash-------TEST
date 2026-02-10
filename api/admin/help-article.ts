export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "../_utils/adminAccess";
import { getSupabaseServiceConfig } from "../_utils/supabaseConfig";

function toSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseBody(raw: any) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString("utf8"));
    } catch {
      return {};
    }
  }
  return raw;
}

function toBoolean(value: any) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") return false;
  }
  return Boolean(value);
}

export default async function handler(req: any, res: any) {
  try {
    const access = await requireAdminAccess(req, { requirePasswordSession: true });
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const cfg = getSupabaseServiceConfig();
    if (!cfg.ok) {
      return res.status(503).json({ error: cfg.error, detail: cfg.detail || "" });
    }

    const id = String(req.query?.id || "").trim();
    if (!id) return res.status(400).json({ error: "Missing id" });

    const supabase = createClient(cfg.url, cfg.serviceKey);

    if (req.method === "DELETE") {
      const { error } = await supabase.from("help_articles").delete().eq("id", id);
      if (error) {
        if (error.code === "42P01") {
          return res.status(400).json({ error: "help_articles table not found. Run DB migrations." });
        }
        return res.status(400).json({ error: error.message || "Unable to delete article." });
      }
      return res.status(200).json({ ok: true });
    }

    if (req.method === "PUT") {
      const body = parseBody(req.body);
      const title = String(body.title || "").trim();
      if (!title) return res.status(400).json({ error: "title is required" });

      const slugInput = String(body.slug || "").trim();
      const slug = toSlug(slugInput || title);
      if (!slug) return res.status(400).json({ error: "slug is required" });

      const summary = String(body.summary || "");
      const content = String(body.content || "");
      const isPublished = toBoolean(body.isPublished);
      const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;

      const { data, error } = await supabase
        .from("help_articles")
        .update({
          slug,
          title,
          summary,
          content,
          is_published: isPublished,
          sort_order: sortOrder,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("id,slug,title,summary,content,is_published,sort_order,created_at,updated_at")
        .maybeSingle();

      if (error) {
        if (error.code === "23505") return res.status(409).json({ error: "Slug already exists" });
        if (error.code === "42P01") {
          return res.status(400).json({ error: "help_articles table not found. Run DB migrations." });
        }
        if (error.code === "42703") {
          return res.status(400).json({ error: "help_articles schema is outdated. Run DB migrations." });
        }
        return res.status(400).json({
          error: error.message || "Unable to save article.",
          code: error.code || null,
          detail: error.details || error.hint || null,
        });
      }

      if (!data) {
        return res.status(404).json({ error: "Article not found" });
      }

      return res.status(200).json({ article: data });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("admin/help-article crash:", err);
    return res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
}
