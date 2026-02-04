export const config = { runtime: "nodejs" };

function b64urlFromBase64(b64: string) {
  return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const adminPassword = process.env.ADMIN_PASSWORD;
    const cookieSecret = process.env.ADMIN_COOKIE_SECRET;

    if (!adminPassword || !cookieSecret) {
      return res.status(500).json({ error: "Missing ADMIN_PASSWORD or ADMIN_COOKIE_SECRET" });
    }

    const { password } = req.body || {};
    if (typeof password !== "string") return res.status(400).json({ error: "Invalid payload" });

    if (password !== adminPassword) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const { createHmac } = await import("crypto");

    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = `v1.${issuedAt}`;
    const sig = b64urlFromBase64(
      createHmac("sha256", cookieSecret).update(payload).digest("base64")
    );
    const token = `${payload}.${sig}`;

    const cookie = [
      `admin_session=${token}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      `Max-Age=${60 * 60 * 12}`, // 12h
    ].join("; ");

    res.setHeader("Set-Cookie", cookie);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("admin/login runtime crash:", err);
    return res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
}
