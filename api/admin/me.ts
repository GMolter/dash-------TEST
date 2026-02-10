export const config = { runtime: "nodejs" };
import { requireAdminAccess } from "../_utils/adminAccess";

export default async function handler(req: any, res: any) {
  try {
    const access = await requireAdminAccess(req, { requirePasswordSession: true });
    if (!access.ok) return res.status(200).json({ authed: false, reason: access.error });
    return res.status(200).json({ authed: true, userId: access.userId });
  } catch (err: any) {
    console.error("admin/me runtime crash:", err);
    return res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
}
