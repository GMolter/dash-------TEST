export const config = { runtime: "nodejs" };

function b64urlFromBase64(b64: string) {
  return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export default async function handler(req: any, res: any) {
  try {
    const cookieSecret = process.env.ADMIN_COOKIE_SECRET;
    if (!cookieSecret) return res.status(500).json({ error: "Missing ADMIN_COOKIE_SECRET" });

    const header = req.headers?.cookie || "";
    const match = header.match(/(?:^|;\s*)admin_session=([^;]+)/);
    if (!match) return res.status(200).json({ authed: false });

    const token = match[1];
    const parts = token.split(".");
    if (parts.length !== 3) return res.status(200).json({ authed: false });

    const payload = `${parts[0]}.${parts[1]}`; // v1.<iat>
    const sig = parts[2];

    const { createHmac, timingSafeEqual } = await import("crypto");

    const expected = b64urlFromBase64(
      createHmac("sha256", cookieSecret).update(payload).digest("base64")
    );

    if (sig.length !== expected.length) return res.status(200).json({ authed: false });
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return res.status(200).json({ authed: false });
    }

    // Optional: expire after 12h (same as cookie Max-Age)
    const issuedAt = Number(parts[1]);
    const age = Math.floor(Date.now() / 1000) - issuedAt;
    if (!Number.isFinite(issuedAt) || age < 0 || age > 60 * 60 * 12) {
      return res.status(200).json({ authed: false });
    }

    return res.status(200).json({ authed: true });
  } catch (err: any) {
    console.error("admin/me runtime crash:", err);
    return res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
}
