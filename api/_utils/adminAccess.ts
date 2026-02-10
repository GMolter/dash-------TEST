import { createClient } from "@supabase/supabase-js";
import { isAuthed } from "./session";

type AccessResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; status: number; error: string };

function readBearerToken(req: any) {
  const raw = req.headers?.authorization || req.headers?.Authorization || "";
  const value = String(raw);
  if (!value.toLowerCase().startsWith("bearer ")) return null;
  return value.slice(7).trim() || null;
}

async function resolveAppAdmin(req: any): Promise<AccessResult> {
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    return { ok: false, status: 500, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" };
  }

  const accessToken = readBearerToken(req);
  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "You must be signed into the app before using App Admin.",
    };
  }

  const supabase = createClient(url, service);
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return { ok: false, status: 401, error: "Invalid auth session" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("app_admin,email")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    if (profileError.code === "42703") {
      return {
        ok: false,
        status: 500,
        error: "Database migration missing: run migration that adds profiles.app_admin.",
      };
    }
    return { ok: false, status: 500, error: profileError.message };
  }
  if (!profile?.app_admin) {
    return {
      ok: false,
      status: 403,
      error: "Your account is not marked as an app admin (profiles.app_admin must be true).",
    };
  }

  return { ok: true, userId: userData.user.id, email: profile.email || null };
}

export async function requireAdminAccess(
  req: any,
  options?: { requirePasswordSession?: boolean }
): Promise<AccessResult> {
  const requirePasswordSession = options?.requirePasswordSession ?? true;

  if (requirePasswordSession) {
    const cookieSecret = process.env.ADMIN_COOKIE_SECRET;
    if (!cookieSecret) return { ok: false, status: 500, error: "Missing ADMIN_COOKIE_SECRET" };
    if (!isAuthed(req, cookieSecret)) return { ok: false, status: 401, error: "Unauthorized" };
  }

  return resolveAppAdmin(req);
}
