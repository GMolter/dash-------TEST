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

  // Try to recover a valid Supabase origin even if env has extra characters.
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

export function getSupabaseServiceConfig(): SupabaseConfigResult {
  const rawCandidates = [
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
  ];
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!serviceKey) {
    return { ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY" };
  }

  const url = rawCandidates
    .map((candidate) => normalizeSupabaseUrl(candidate))
    .find((candidate) => !!candidate) || null;
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
