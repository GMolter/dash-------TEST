import React, { useEffect, useMemo, useState } from "react";
import { Layout, Shield, LogOut, Save, Megaphone } from "lucide-react";

type BannerState = {
  enabled: boolean;
  text: string;
};

export default function Admin() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  // login
  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);

  // banner
  const [banner, setBanner] = useState<BannerState>({ enabled: false, text: "" });
  const [bannerLoading, setBannerLoading] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const canSaveBanner = useMemo(() => {
    // allow saving disabled banners even if text empty
    if (!banner.enabled) return true;
    return banner.text.trim().length > 0;
  }, [banner.enabled, banner.text]);

  async function refreshAuth() {
    const r = await fetch("/api/admin/me", { credentials: "include" });
    const text = await r.text();
    try {
      const j = JSON.parse(text);
      setAuthed(Boolean(j.authed));
    } catch {
      console.error("Non-JSON response from /api/admin/me:", text);
      setAuthed(false);
    }
  }

  async function loadBanner() {
    setBannerLoading(true);
    setBannerMsg(null);
    try {
      const r = await fetch("/api/public/settings");
      const j = await r.json();
      setBanner({
        enabled: !!j.bannerEnabled,
        text: j.bannerText || "",
      });
    } catch (e) {
      setBannerMsg({ kind: "err", text: "Couldn’t load banner settings. Is /api/public/settings deployed?" });
    } finally {
      setBannerLoading(false);
    }
  }

  useEffect(() => {
    refreshAuth();
  }, []);

  useEffect(() => {
    if (authed) loadBanner();
  }, [authed]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginErr(null);

    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ password }),
    });

    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setLoginErr(j.error || "Login failed");
      return;
    }

    setPassword("");
    await refreshAuth();
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    await refreshAuth();
  }

  async function saveBanner() {
    if (!canSaveBanner) {
      setBannerMsg({ kind: "err", text: "Banner text can’t be empty when enabled." });
      return;
    }

    setBannerSaving(true);
    setBannerMsg(null);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bannerEnabled: banner.enabled,
          bannerText: banner.text,
        }),
      });

      const text = await r.text();
      if (!r.ok) {
        let msg = "Failed to save banner.";
        try {
          const j = JSON.parse(text);
          msg = j.error || msg;
        } catch {
          // ignore
        }
        setBannerMsg({ kind: "err", text: msg });
        return;
      }

      setBannerMsg({ kind: "ok", text: "Saved! Banner updated." });
    } catch {
      setBannerMsg({ kind: "err", text: "Network error while saving." });
    } finally {
      setBannerSaving(false);
    }
  }

  // ---------- UI ----------
  if (authed === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
        <div className="max-w-4xl mx-auto px-6 py-12 text-slate-300">Loading…</div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
        <div className="relative z-10 max-w-6xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Admin
              </h1>
              <p className="text-sm text-slate-400">Enter the password to unlock admin tools.</p>
            </div>
          </div>

          <div className="mt-10 max-w-md">
            <form
              onSubmit={login}
              className="rounded-2xl bg-slate-950/40 border border-slate-800/60 backdrop-blur p-6 shadow-lg"
            >
              <label className="block text-sm text-slate-300">Admin password</label>
              <input
                className="mt-2 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-600 outline-none focus:border-blue-500/50"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoFocus
              />

              {loginErr && <div className="mt-3 text-red-400 text-sm">{loginErr}</div>}

              <button
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 hover:border-blue-400/40 text-white py-2 font-medium transition"
              >
                Unlock
              </button>

              <p className="mt-3 text-xs text-slate-500">
                Tip: This uses an HttpOnly session cookie — the password never lives in the browser after login.
              </p>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-10">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20 flex items-center justify-center">
              <Layout className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Admin Panel
              </h1>
              <p className="text-sm text-slate-400">Manage your dashboard services safely.</p>
            </div>
          </div>

          <button
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 bg-white/10 hover:bg-white/15 border border-slate-700/70 text-slate-100 transition"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>

        {/* Cards */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Maintenance Banner */}
          <section className="lg:col-span-2 rounded-2xl bg-slate-950/40 border border-slate-800/60 backdrop-blur p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Megaphone className="w-4 h-4 text-amber-300" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">Maintenance Banner</h2>
                  <p className="text-sm text-slate-400">
                    Shows a notice at the top of the site (like “Maintenance at 2AM”).
                  </p>
                </div>
              </div>

              <button
                onClick={loadBanner}
                disabled={bannerLoading}
                className="rounded-xl px-3 py-2 bg-white/10 hover:bg-white/15 border border-slate-700/70 text-slate-100 transition disabled:opacity-60"
              >
                {bannerLoading ? "Loading…" : "Reload"}
              </button>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setBanner((b) => ({ ...b, enabled: !b.enabled }))}
                  className={`w-12 h-7 rounded-full border transition relative ${
                    banner.enabled
                      ? "bg-amber-500/20 border-amber-500/40"
                      : "bg-slate-900/60 border-slate-700/70"
                  }`}
                  aria-label="Toggle banner"
                >
                  <span
                    className={`absolute top-0.5 w-6 h-6 rounded-full transition ${
                      banner.enabled ? "left-5 bg-amber-200" : "left-0.5 bg-slate-300"
                    }`}
                  />
                </button>
                <div>
                  <div className="text-sm text-slate-200 font-medium">
                    {banner.enabled ? "Enabled" : "Disabled"}
                  </div>
                  <div className="text-xs text-slate-500">When disabled, nothing is shown.</div>
                </div>
              </div>

              <button
                onClick={saveBanner}
                disabled={bannerSaving || !canSaveBanner}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 hover:border-blue-400/40 text-white transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {bannerSaving ? "Saving…" : "Save"}
              </button>
            </div>

            <div className="mt-4">
              <label className="block text-sm text-slate-300">Banner text</label>
              <textarea
                value={banner.text}
                onChange={(e) => setBanner((b) => ({ ...b, text: e.target.value }))}
                rows={3}
                className="mt-2 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-500/40"
                placeholder="e.g. Scheduled maintenance tonight at 2:00 AM (EST)."
              />
              {!canSaveBanner && (
                <div className="mt-2 text-xs text-amber-300">
                  Banner text can’t be empty when enabled.
                </div>
              )}
            </div>

            {bannerMsg && (
              <div
                className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
                  bannerMsg.kind === "ok"
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-200"
                    : "bg-red-500/10 border-red-500/20 text-red-200"
                }`}
              >
                {bannerMsg.text}
              </div>
            )}

            <div className="mt-4 rounded-xl bg-slate-900/40 border border-slate-800/60 p-3">
              <div className="text-xs text-slate-400 mb-1">Preview</div>
              {banner.enabled && banner.text.trim() ? (
                <div className="border border-amber-500/20 bg-amber-500/10 text-amber-200 rounded-lg px-3 py-2 text-sm">
                  {banner.text}
                </div>
              ) : (
                <div className="text-sm text-slate-500">Banner is hidden.</div>
              )}
            </div>
          </section>

          {/* Placeholder card for next features */}
          <section className="rounded-2xl bg-slate-950/40 border border-slate-800/60 backdrop-blur p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-100">Next up</h2>
            <p className="text-sm text-slate-400 mt-1">
              Global search, audit log, and home ordering will go here.
            </p>

            <div className="mt-4 rounded-xl bg-slate-900/40 border border-slate-800/60 p-3 text-sm text-slate-300">
              If you want, we can add tabs and make this feel like a real “panel” instead of cards.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
