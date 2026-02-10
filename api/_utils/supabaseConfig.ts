type SupabaseConfigResult =
  | { ok: true; url: string; serviceKey: string }
  | { ok: false; error: string; detail?: string };

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

export function normalizeSupabaseUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = stripWrappingQuotes(raw);
  if (!cleaned) return null;

  const candidate = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

  try {
    const parsed = new URL(candidate);
    return parsed.origin;
  } catch {
    return null;
  }
}

export function getSupabaseServiceConfig(): SupabaseConfigResult {
  const rawUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!serviceKey) {
    return { ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY" };
  }

  const url = normalizeSupabaseUrl(rawUrl);
  if (!url) {
    return {
      ok: false,
      error: "SUPABASE_URL is invalid.",
      detail:
        "Expected format like https://<project-ref>.supabase.co (no quotes, no trailing text).",
    };
  }

  return { ok: true, url, serviceKey };
}
