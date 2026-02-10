export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceConfig } from "../_utils/supabaseConfig";

function b64urlFromBase64(b64: string) {
  return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function readBearerToken(req: any) {
  const raw = req.headers?.authorization || req.headers?.Authorization || "";
  const value = String(raw);
  if (!value.toLowerCase().startsWith("bearer ")) return null;
  return value.slice(7).trim() || null;
}

function readAdminSessionCookie(req: any) {
  const header = req.headers?.cookie || "";
  const match = header.match(/(?:^|;\s*)admin_session=([^;]+)/);
  return match ? match[1] : null;
}

async function hasValidAdminPasswordSession(req: any) {
  try {
    const secret = process.env.ADMIN_COOKIE_SECRET || process.env.ADMIN_PASSWORD;
    if (!secret) return false;

    const token = readAdminSessionCookie(req);
    if (!token) return false;

    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const payload = `${parts[0]}.${parts[1]}`;
    const sig = parts[2];

    const { createHmac, timingSafeEqual } = await import("crypto");
    const expected = b64urlFromBase64(
      createHmac("sha256", secret).update(payload).digest("base64")
    );

    if (sig.length !== expected.length) return false;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;

    const issuedAt = Number(parts[1]);
    if (!Number.isFinite(issuedAt)) return false;
    const age = Math.floor(Date.now() / 1000) - issuedAt;
    return age >= 0 && age <= 60 * 60 * 12;
  } catch {
    return false;
  }
}

async function isAppAdmin(req: any, supabase: any) {
  try {
    const accessToken = readBearerToken(req);
    if (!accessToken) return false;

    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData.user) return false;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("app_admin")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError) return false;
    return !!profile?.app_admin;
  } catch {
    return false;
  }
}

function toSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default async function handler(req: any, res: any) {
  const isGet = req.method === "GET";

  try {
    const cfg = getSupabaseServiceConfig();
    if (!cfg.ok) {
      if (isGet) {
        return res.status(200).json({
          articles: [],
          warning: cfg.error,
          detail: cfg.detail || "",
        });
      }
      return res.status(503).json({
        error: cfg.error,
        detail: cfg.detail || "",
        code: "INVALID_SUPABASE_CONFIG",
      });
    }

    const supabase = createClient(cfg.url, cfg.serviceKey);

    const hasSession = await hasValidAdminPasswordSession(req);
    if (!hasSession) {
      if (isGet) return res.status(200).json({ articles: [], warning: "Unauthorized Account" });
      return res.status(401).json({ error: "Unauthorized" });
    }

    const appAdmin = await isAppAdmin(req, supabase);
    if (!appAdmin) {
      if (isGet) return res.status(200).json({ articles: [], warning: "Unauthorized Account" });
      return res.status(403).json({ error: "Unauthorized Account" });
    }

    if (isGet) {
      const { data, error } = await supabase
        .from("help_articles")
        .select("id,slug,title,summary,content,is_published,sort_order,created_at,updated_at")
        .order("sort_order", { ascending: true })
        .order("updated_at", { ascending: false });

      if (error) {
        if (error.code === "42P01") {
          return res.status(200).json({ articles: [], warning: "help_articles table not found." });
        }
        return res.status(200).json({ articles: [], warning: error.message || "Unable to load help articles." });
      }

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
        if (error.code === "23505") return res.status(409).json({ error: "Slug already exists", code: error.code });
        if (error.code === "42P01") {
          return res.status(400).json({
            error: "help_articles table not found. Run DB migrations.",
            code: error.code,
          });
        }
        if (error.code === "42703") {
          return res.status(400).json({
            error: "help_articles schema is outdated. Run DB migrations.",
            code: error.code,
          });
        }
        return res.status(400).json({
          error: error.message || "Unable to create article.",
          code: error.code || null,
        });
      }
      return res.status(200).json({ article: data });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("admin/help-articles crash:", err);
    if (isGet) {
      return res.status(200).json({
        articles: [],
        warning: "Help articles endpoint fallback due to runtime error.",
        detail: String(err?.message || err),
      });
    }
    const detail = String(err?.message || err);
    if (req.method === "POST") {
      return res.status(400).json({
        error: "Unable to create article.",
        detail,
        code: "POST_RUNTIME_ERROR",
      });
    }
    return res.status(500).json({ error: "Internal error", detail });
  }
}
