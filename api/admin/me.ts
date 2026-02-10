export const config = { runtime: "nodejs" };
import { isAuthed } from "../_utils/session";
import { resolveAppAdminFromRequest } from "../_utils/adminAccess";

export default async function handler(req: any, res: any) {
  try {
    const cookieSecret = process.env.ADMIN_COOKIE_SECRET || process.env.ADMIN_PASSWORD;
    if (!cookieSecret) return res.status(200).json({ authed: false, appAdmin: false, reason: "Admin auth is not configured." });

    if (!isAuthed(req, cookieSecret)) {
      return res.status(200).json({ authed: false, appAdmin: false });
    }

    const access = await resolveAppAdminFromRequest(req);
    if (!access.ok) {
      return res.status(200).json({
        authed: true,
        appAdmin: false,
        reason: access.error,
      });
    }

    return res.status(200).json({
      authed: true,
      appAdmin: true,
      userId: access.userId,
    });
  } catch (err: any) {
    console.error("admin/me runtime crash:", err);
    return res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
}
