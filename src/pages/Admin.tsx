import React, { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Shield,
  LogOut,
  Save,
  Megaphone,
  FileText,
  Settings,
  RefreshCw,
  BookOpenText,
} from "lucide-react";

type BannerState = {
  enabled: boolean;
  text: string;
};

type AdminTab = "overview" | "banner" | "help-docs";

export default function Admin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);

  const [banner, setBanner] = useState<BannerState>({ enabled: false, text: "" });
  const [helpDocs, setHelpDocs] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [bannerLoading, setBannerLoading] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [helpSaving, setHelpSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const canSaveBanner = useMemo(() => {
    if (!banner.enabled) return true;
    return banner.text.trim().length > 0;
  }, [banner.enabled, banner.text]);

  const helpPreview = useMemo(() => helpDocs.trim(), [helpDocs]);

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

  async function loadSettings() {
    setBannerLoading(true);
    setMsg(null);
    try {
      const r = await fetch("/api/public/settings");
      const j = await r.json();
      setBanner({
        enabled: !!j.bannerEnabled,
        text: j.bannerText || "",
      });
      setHelpDocs(j.helpDocs || "");
      setUpdatedAt(j.updatedAt || null);
    } catch {
      setMsg({ kind: "err", text: "Could not load app settings." });
    } finally {
      setBannerLoading(false);
    }
  }

  useEffect(() => {
    refreshAuth();
  }, []);

  useEffect(() => {
    if (authed) loadSettings();
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
      setMsg({ kind: "err", text: "Banner text cannot be empty when enabled." });
      return;
    }

    setBannerSaving(true);
    setMsg(null);
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
        let errorMessage = "Failed to save banner.";
        try {
          const j = JSON.parse(text);
          errorMessage = j.error || errorMessage;
        } catch {
          // ignore json parse error
        }
        setMsg({ kind: "err", text: errorMessage });
        return;
      }

      await loadSettings();
      setMsg({ kind: "ok", text: "Maintenance banner updated." });
    } catch {
      setMsg({ kind: "err", text: "Network error while saving banner." });
    } finally {
      setBannerSaving(false);
    }
  }

  async function saveHelpDocs() {
    setHelpSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          helpDocs,
        }),
      });

      const text = await r.text();
      if (!r.ok) {
        let errorMessage = "Failed to save help docs.";
        try {
          const j = JSON.parse(text);
          errorMessage = j.error || errorMessage;
        } catch {
          // ignore json parse error
        }
        setMsg({ kind: "err", text: errorMessage });
        return;
      }

      await loadSettings();
      setMsg({ kind: "ok", text: "Help documentation updated." });
    } catch {
      setMsg({ kind: "err", text: "Network error while saving docs." });
    } finally {
      setHelpSaving(false);
    }
  }

  function formatUpdatedAt(value: string | null) {
    if (!value) return "Never";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Unknown";
    return d.toLocaleString();
  }

  if (authed === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white">
        <div className="max-w-5xl mx-auto px-6 py-12 text-slate-300">Loading...</div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white">
        <div className="relative z-10 max-w-5xl mx-auto px-6 py-12">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-blue-200">App Admin</h1>
              <p className="text-sm text-slate-400">Enter your admin password to unlock controls.</p>
            </div>
          </div>

          <div className="mt-10 max-w-md">
            <form
              onSubmit={login}
              className="rounded-2xl bg-slate-950/45 border border-slate-700/70 backdrop-blur p-6 shadow-lg"
            >
              <label className="block text-sm text-slate-300">Admin password</label>
              <input
                className="mt-2 w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder:text-slate-600 outline-none focus:border-blue-500/50"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                autoFocus
              />

              {loginErr && <div className="mt-3 text-red-400 text-sm">{loginErr}</div>}

              <button className="mt-4 w-full rounded-xl bg-blue-500/15 border border-blue-500/30 hover:border-blue-400/40 text-white py-2 font-medium transition">
                Unlock
              </button>

              <p className="mt-3 text-xs text-slate-500">
                This uses an HttpOnly session cookie. The password is not retained after login.
              </p>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white">
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-blue-200">App Admin Panel</h1>
              <p className="text-sm text-slate-400">Platform-level controls and publishing.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadSettings}
              disabled={bannerLoading}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 bg-slate-900/70 hover:bg-slate-800 border border-slate-700 text-slate-100 transition disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              {bannerLoading ? "Refreshing..." : "Refresh"}
            </button>
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 bg-slate-900/70 hover:bg-slate-800 border border-slate-700 text-slate-100 transition"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/45 backdrop-blur">
          <div className="flex flex-wrap gap-2 border-b border-slate-700/70 p-3">
            <button
              onClick={() => setActiveTab("overview")}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                activeTab === "overview"
                  ? "bg-blue-500/20 border border-blue-500/40 text-blue-100"
                  : "border border-transparent text-slate-300 hover:bg-slate-800/70"
              }`}
            >
              <Settings className="w-4 h-4" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab("banner")}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                activeTab === "banner"
                  ? "bg-blue-500/20 border border-blue-500/40 text-blue-100"
                  : "border border-transparent text-slate-300 hover:bg-slate-800/70"
              }`}
            >
              <Megaphone className="w-4 h-4" />
              Maintenance Banner
            </button>
            <button
              onClick={() => setActiveTab("help-docs")}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                activeTab === "help-docs"
                  ? "bg-blue-500/20 border border-blue-500/40 text-blue-100"
                  : "border border-transparent text-slate-300 hover:bg-slate-800/70"
              }`}
            >
              <BookOpenText className="w-4 h-4" />
              Help Docs
            </button>
          </div>

          <div className="p-6">
            {activeTab === "overview" && (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-100">Overview</h2>
                <p className="text-sm text-slate-400">
                  Manage app-wide content and announcements from one place.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Banner Status</div>
                    <div className="text-sm text-slate-100">{banner.enabled ? "Enabled" : "Disabled"}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {banner.enabled
                        ? "A maintenance notice is currently visible."
                        : "No maintenance notice is visible."}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Last Settings Update</div>
                    <div className="text-sm text-slate-100">{formatUpdatedAt(updatedAt)}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      Includes banner and help documentation changes.
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "banner" && (
              <section className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <Megaphone className="w-4 h-4 text-amber-300" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-100">Maintenance Banner</h2>
                    <p className="text-sm text-slate-400">
                      Show a temporary notice at the top of the main app shell.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4">
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
                      <div className="text-xs text-slate-500">Disabled state hides all banner text.</div>
                    </div>
                  </div>

                  <button
                    onClick={saveBanner}
                    disabled={bannerSaving || !canSaveBanner}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 bg-blue-500/15 border border-blue-500/30 hover:border-blue-400/40 text-white transition disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {bannerSaving ? "Saving..." : "Save Banner"}
                  </button>
                </div>

                <div>
                  <label className="block text-sm text-slate-300">Banner text</label>
                  <textarea
                    value={banner.text}
                    onChange={(e) => setBanner((b) => ({ ...b, text: e.target.value }))}
                    rows={3}
                    className="mt-2 w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-500/40"
                    placeholder="Scheduled maintenance tonight at 2:00 AM."
                  />
                  {!canSaveBanner && (
                    <div className="mt-2 text-xs text-amber-300">
                      Banner text cannot be empty when enabled.
                    </div>
                  )}
                </div>

                <div className="rounded-xl bg-slate-900/50 border border-slate-700/70 p-3">
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
            )}

            {activeTab === "help-docs" && (
              <section className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-blue-300" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-100">Help Documentation</h2>
                    <p className="text-sm text-slate-400">
                      Content published here is shown on the standalone <code>/help</code> page.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-300">Docs content</label>
                  <textarea
                    value={helpDocs}
                    onChange={(e) => setHelpDocs(e.target.value)}
                    rows={14}
                    className="mt-2 w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder:text-slate-600 outline-none focus:border-blue-500/40"
                    placeholder="Add internal docs, support notes, links, and common procedures."
                  />
                </div>

                <div className="flex items-center justify-end">
                  <button
                    onClick={saveHelpDocs}
                    disabled={helpSaving}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 bg-blue-500/15 border border-blue-500/30 hover:border-blue-400/40 text-white transition disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {helpSaving ? "Saving..." : "Save Docs"}
                  </button>
                </div>

                <div className="rounded-xl bg-slate-900/50 border border-slate-700/70 p-3">
                  <div className="text-xs text-slate-400 mb-1">Live preview</div>
                  {helpPreview ? (
                    <pre className="whitespace-pre-wrap text-sm text-slate-100 font-sans">{helpPreview}</pre>
                  ) : (
                    <div className="text-sm text-slate-500">No docs content yet.</div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>

        {msg && (
          <div
            className={`rounded-xl border px-3 py-2 text-sm ${
              msg.kind === "ok"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-200"
                : "bg-red-500/10 border-red-500/20 text-red-200"
            }`}
          >
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
