export const config = { runtime: "nodejs" };

export default function handler(_req: any, res: any) {
  const cookie = [
    "admin_session=",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");

  res.setHeader("Set-Cookie", cookie);
  return res.status(200).json({ ok: true });
}
