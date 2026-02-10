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

export default async function handler(_req: any, res: any) {
  try {
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
      return res.status(200).json({
        bannerEnabled: false,
        bannerText: "",
        updatedAt: null,
        warning: !serviceKey ? "Missing SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_URL is invalid.",
        detail: !serviceKey
          ? ""
          : "Expected format like https://<project-ref>.supabase.co (no quotes, no trailing text).",
      });
    }

    const supabase = createClient(url, serviceKey);

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
