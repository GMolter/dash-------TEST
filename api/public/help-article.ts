export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";

function stripWrappingQuotes(value: string) {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1).trim();
  }
  return v;
}

function normalizeSupabaseUrl(raw: string | undefined | null) {
  if (!raw) return null;
  const cleaned = stripWrappingQuotes(raw);
  if (!cleaned) return null;
  const embedded = cleaned.match(/https?:\/\/[a-z0-9-]+\.supabase\.co/i)?.[0]
    || cleaned.match(/[a-z0-9-]+\.supabase\.co/i)?.[0];
  const base = embedded || cleaned;
  const candidate = /^https?:\/\//i.test(base) ? base : `https://${base}`;
  try {
    const parsed = new URL(candidate);
    return parsed.origin;
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  try {
    res.setHeader("Cache-Control", "no-store");
    const rawCandidates = [
      process.env.SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.VITE_SUPABASE_URL,
    ];
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const url = rawCandidates
      .map((candidate) => normalizeSupabaseUrl(candidate))
      .find((candidate) => !!candidate) || null;

    if (!serviceKey || !url) {
      return res.status(503).json({
        error: !serviceKey ? "Missing SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_URL is invalid.",
        detail: !serviceKey
          ? ""
          : "Expected format like https://<project-ref>.supabase.co (no quotes, no trailing text).",
      });
    }

    const slug = String(req.query?.slug || "").trim();
    if (!slug) return res.status(400).json({ error: "Missing slug" });

    const supabase = createClient(url, serviceKey);
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
