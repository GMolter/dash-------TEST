import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
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
  Plus,
  Trash2,
  HelpCircle,
} from "lucide-react";

type BannerState = {
  enabled: boolean;
  text: string;
};

type AdminTab = "overview" | "banner" | "help-docs";

type HelpArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function Admin() {
  const [authed, setAuthed] = useState<boolean>(false);
  const [appAdmin, setAppAdmin] = useState(false);
  const [accessReason, setAccessReason] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);

  const [banner, setBanner] = useState<BannerState>({ enabled: false, text: "" });
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);

  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [articleSaving, setArticleSaving] = useState(false);
  const [articleCreating, setArticleCreating] = useState(false);
  const [articleDeleting, setArticleDeleting] = useState(false);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteNameInput, setDeleteNameInput] = useState("");
  const [deleteAcknowledge, setDeleteAcknowledge] = useState(false);

  const [articleTitle, setArticleTitle] = useState("");
  const [articleSlug, setArticleSlug] = useState("");
  const [articleSummary, setArticleSummary] = useState("");
  const [articleContent, setArticleContent] = useState("");
  const [articlePublished, setArticlePublished] = useState(false);
  const [articleSortOrder, setArticleSortOrder] = useState(0);

  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const canSaveBanner = useMemo(() => {
    if (!banner.enabled) return true;
    return banner.text.trim().length > 0;
  }, [banner.enabled, banner.text]);

  const selectedArticle = useMemo(
    () => articles.find((a) => a.id === selectedArticleId) || null,
    [articles, selectedArticleId]
  );

  async function adminFetch(url: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const headers = new Headers(init?.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, {
      ...init,
      headers,
      credentials: "include",
    });
  }

  async function loadSettings() {
    setLoadingSettings(true);
    try {
      const r = await fetch("/api/public/settings");
      const j = await r.json();
      setBanner({ enabled: !!j.bannerEnabled, text: j.bannerText || "" });
      setUpdatedAt(j.updatedAt || null);
    } catch {
      setMsg({ kind: "err", text: "Could not load app settings." });
    } finally {
      setLoadingSettings(false);
    }
  }

  async function loadArticles(preferredId?: string) {
    setLoadingArticles(true);
    try {
      const r = await adminFetch("/api/admin/help-articles");
      const j = await r.json();
      const warning = typeof j.warning === "string" ? j.warning : "";
      const warningDetail = typeof j.detail === "string" ? j.detail : "";

      if (!r.ok) {
        setAppAdmin(false);
        setAccessReason("Unauthorized Account");
        setArticles([]);
        return;
      }
      if (/unauthorized/i.test(warning)) {
        setAppAdmin(false);
        setAccessReason("Unauthorized Account");
        setArticles([]);
        return;
      }
      if (warning) {
        setMsg({ kind: "err", text: warningDetail ? `${warning} ${warningDetail}` : warning });
      }
      setAppAdmin(true);
      setAccessReason(null);
      const list = Array.isArray(j.articles) ? (j.articles as HelpArticle[]) : [];
      setArticles(list);

      const targetId = preferredId || selectedArticleId;
      if (targetId) {
        const match = list.find((x) => x.id === targetId);
        if (match) {
          hydrateEditor(match);
        } else {
          if (list.length > 0) hydrateEditor(list[0]);
          else clearEditor();
        }
      } else if (list.length > 0) {
        hydrateEditor(list[0]);
      }
    } catch {
      setAppAdmin(false);
      setAccessReason("Unauthorized Account");
      setMsg({ kind: "err", text: "Could not load help articles." });
    } finally {
      setLoadingArticles(false);
    }
  }

  function clearEditor() {
    setSelectedArticleId(null);
    setArticleTitle("");
    setArticleSlug("");
    setArticleSummary("");
    setArticleContent("");
    setArticlePublished(false);
    setArticleSortOrder(0);
  }

  function hydrateEditor(article: HelpArticle) {
    setSelectedArticleId(article.id);
    setArticleTitle(article.title);
    setArticleSlug(article.slug);
    setArticleSummary(article.summary || "");
    setArticleContent(article.content || "");
    setArticlePublished(!!article.is_published);
    setArticleSortOrder(Number(article.sort_order || 0));
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const r = await adminFetch("/api/admin/help-articles");
        const j = await r.json().catch(() => ({}));
        const warning = typeof j.warning === "string" ? j.warning : "";
        if (cancelled) return;
        if (r.ok && !/unauthorized/i.test(warning)) {
          setAuthed(true);
          setAppAdmin(true);
          setAccessReason(null);
          await loadSettings();
          await loadArticles();
        } else {
          setAuthed(false);
          setAppAdmin(false);
          setAccessReason(j.error || null);
        }
      } catch {
        if (cancelled) return;
        setAuthed(false);
        setAppAdmin(false);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginErr(null);

    const r = await adminFetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setLoginErr(j.error || j.detail || "Login failed");
      return;
    }

    setPassword("");
    setAuthed(true);
    await loadSettings();
    await loadArticles();
  }

  async function logout() {
    await adminFetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setAppAdmin(false);
    setAccessReason(null);
    setArticles([]);
    clearEditor();
  }

  async function saveBanner() {
    if (!canSaveBanner) {
      setMsg({ kind: "err", text: "Banner text cannot be empty when enabled." });
      return;
    }

    setBannerSaving(true);
    setMsg(null);
    try {
      const r = await adminFetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerEnabled: banner.enabled, bannerText: banner.text }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg({ kind: "err", text: j.error || "Failed to save banner." });
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

  async function createArticle() {
    const title = articleTitle.trim();
    if (!title) {
      setMsg({ kind: "err", text: "Article title is required." });
      return;
    }

    setArticleCreating(true);
    setMsg(null);
    try {
      const r = await adminFetch("/api/admin/help-articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug: articleSlug,
          summary: articleSummary,
          content: articleContent,
          isPublished: articlePublished,
          sortOrder: articleSortOrder,
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const base = j.error || "Failed to create article.";
        const codePart = j.code ? ` (${j.code})` : "";
        const detailPart = j.detail ? ` ${j.detail}` : "";
        setMsg({ kind: "err", text: `${base}${codePart}${detailPart}` });
        return;
      }

      const created = j.article as HelpArticle;
      await loadArticles(created?.id);
      setMsg({ kind: "ok", text: "Article created." });
    } catch {
      setMsg({ kind: "err", text: "Network error while creating article." });
    } finally {
      setArticleCreating(false);
    }
  }

  async function saveArticle() {
    if (!selectedArticleId) {
      setMsg({ kind: "err", text: "Select an article first." });
      return;
    }
    const title = articleTitle.trim();
    if (!title) {
      setMsg({ kind: "err", text: "Article title is required." });
      return;
    }

    setArticleSaving(true);
    setMsg(null);
    try {
      const r = await adminFetch(`/api/admin/help-article?id=${encodeURIComponent(selectedArticleId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug: articleSlug,
          summary: articleSummary,
          content: articleContent,
          isPublished: articlePublished,
          sortOrder: articleSortOrder,
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const base = j.error || "Failed to save article.";
        const codePart = j.code ? ` (${j.code})` : "";
        const detailPart = j.detail ? ` ${j.detail}` : "";
        setMsg({ kind: "err", text: `${base}${codePart}${detailPart}` });
        return;
      }

      await loadArticles();
      setMsg({ kind: "ok", text: "Article updated." });
    } catch {
      setMsg({ kind: "err", text: "Network error while saving article." });
    } finally {
      setArticleSaving(false);
    }
  }

  async function deleteArticle() {
    if (!selectedArticleId) return;

    setArticleDeleting(true);
    setMsg(null);
    try {
      const r = await adminFetch(`/api/admin/help-article?id=${encodeURIComponent(selectedArticleId)}`, {
        method: "DELETE",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const base = j.error || "Failed to delete article.";
        const codePart = j.code ? ` (${j.code})` : "";
        const detailPart = j.detail ? ` ${j.detail}` : "";
        setMsg({ kind: "err", text: `${base}${codePart}${detailPart}` });
        return;
      }

      await loadArticles();
      clearEditor();
      setShowDeleteModal(false);
      setDeleteNameInput("");
      setDeleteAcknowledge(false);
      setMsg({ kind: "ok", text: "Article deleted." });
    } catch {
      setMsg({ kind: "err", text: "Network error while deleting article." });
    } finally {
      setArticleDeleting(false);
    }
  }

  function formatUpdatedAt(value: string | null) {
    if (!value) return "Never";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Unknown";
    return d.toLocaleString();
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

  if (!appAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white">
        <div className="relative z-10 max-w-5xl mx-auto px-6 py-10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
                <LayoutDashboard className="w-5 h-5 text-blue-300" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-blue-200">App Admin Panel</h1>
                <p className="text-sm text-slate-400">Password session is active.</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 bg-slate-900/70 hover:bg-slate-800 border border-slate-700 text-slate-100 transition"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
            <h2 className="text-lg font-semibold text-amber-100">Data Access Blocked</h2>
            <p className="mt-2 text-sm text-amber-50/90">
              You can open this page with the admin password, but only app-admin accounts can view or change admin data.
            </p>
            {accessReason && (
              <p className="mt-3 text-xs text-amber-100/80">
                Reason: {accessReason}
              </p>
            )}
            <p className="mt-3 text-xs text-amber-100/80">
              Ask a database administrator to set <code>profiles.app_admin = true</code> for your account.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white">
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-blue-200">App Admin Panel</h1>
              <p className="text-sm text-slate-400">Platform-level controls and help publishing.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                loadSettings();
                loadArticles();
              }}
              disabled={loadingSettings || loadingArticles}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 bg-slate-900/70 hover:bg-slate-800 border border-slate-700 text-slate-100 transition disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              {loadingSettings || loadingArticles ? "Refreshing..." : "Refresh"}
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
              Help Articles
            </button>
          </div>

          <div className="p-6">
            {activeTab === "overview" && (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-100">Overview</h2>
                <p className="text-sm text-slate-400">Manage global app announcements and published help resources.</p>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Banner Status</div>
                    <div className="text-sm text-slate-100">{banner.enabled ? "Enabled" : "Disabled"}</div>
                  </div>
                  <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Published Articles</div>
                    <div className="text-sm text-slate-100">{articles.filter((a) => a.is_published).length}</div>
                  </div>
                  <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Last Settings Update</div>
                    <div className="text-sm text-slate-100">{formatUpdatedAt(updatedAt)}</div>
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
                    <p className="text-sm text-slate-400">Show a temporary notice at the top of the main app shell.</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setBanner((b) => ({ ...b, enabled: !b.enabled }))}
                      className={`w-12 h-7 rounded-full border transition relative ${
                        banner.enabled ? "bg-amber-500/20 border-amber-500/40" : "bg-slate-900/60 border-slate-700/70"
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
                      <div className="text-sm text-slate-200 font-medium">{banner.enabled ? "Enabled" : "Disabled"}</div>
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
                  {!canSaveBanner && <div className="mt-2 text-xs text-amber-300">Banner text cannot be empty when enabled.</div>}
                </div>

                <div className="rounded-xl bg-slate-900/50 border border-slate-700/70 p-3">
                  <div className="text-xs text-slate-400 mb-1">Preview</div>
                  {banner.enabled && banner.text.trim() ? (
                    <div className="border border-amber-500/20 bg-amber-500/10 text-amber-200 rounded-lg px-3 py-2 text-sm">{banner.text}</div>
                  ) : (
                    <div className="text-sm text-slate-500">Banner is hidden.</div>
                  )}
                </div>
              </section>
            )}

            {activeTab === "help-docs" && (
              <section className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3 space-y-2">
                  <button
                    onClick={() => {
                      clearEditor();
                      setArticleTitle("New Help Article");
                      setArticleSlug("new-help-article");
                      setArticleSummary("");
                      setArticleContent("");
                      setArticlePublished(false);
                      setArticleSortOrder(0);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 bg-blue-500/15 border border-blue-500/30 hover:border-blue-400/40 text-blue-100 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    New Article Draft
                  </button>

                  <div className="text-xs text-slate-400 px-1 pt-2">Articles</div>
                  <div className="max-h-[460px] overflow-auto space-y-1 pr-1">
                    {loadingArticles ? (
                      <div className="text-sm text-slate-400 px-2 py-2">Loading...</div>
                    ) : articles.length === 0 ? (
                      <div className="text-sm text-slate-500 px-2 py-2">No articles yet.</div>
                    ) : (
                      articles.map((article) => (
                        <button
                          key={article.id}
                          onClick={() => hydrateEditor(article)}
                          className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition ${
                            selectedArticleId === article.id
                              ? "bg-blue-500/15 border-blue-500/35 text-blue-100"
                              : "bg-slate-950/60 border-slate-700/70 text-slate-200 hover:bg-slate-900/70"
                          }`}
                        >
                          <div className="font-medium truncate">{article.title}</div>
                          <div className="text-xs text-slate-400 truncate">/help/article/{article.slug}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-white">
                      <FileText className="w-4 h-4 text-blue-300" />
                      <h2 className="text-lg font-semibold">Article Editor</h2>
                    </div>
                    <div className="text-xs text-slate-400">
                      {selectedArticle ? `Updated ${formatUpdatedAt(selectedArticle.updated_at)}` : "Unsaved draft"}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm text-slate-300">Title</label>
                      <input
                        value={articleTitle}
                        onChange={(e) => {
                          const next = e.target.value;
                          setArticleTitle(next);
                          if (!selectedArticleId) setArticleSlug(slugify(next));
                        }}
                        className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100"
                        placeholder="How to onboard a new member"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-slate-300">Slug</label>
                      <input
                        value={articleSlug}
                        onChange={(e) => setArticleSlug(slugify(e.target.value))}
                        className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100"
                        placeholder="how-to-onboard-a-new-member"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm text-slate-300">Summary</label>
                      <input
                        value={articleSummary}
                        onChange={(e) => setArticleSummary(e.target.value)}
                        className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100"
                        placeholder="Quick summary shown in Help index"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-300">
                        <span className="inline-flex items-center gap-1">
                          Sort Order
                          <span className="group relative inline-flex items-center text-slate-400">
                            <HelpCircle className="w-4 h-4" />
                            <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                              Lower numbers show first.
                            </span>
                          </span>
                        </span>
                      </label>
                      <input
                        type="number"
                        value={articleSortOrder}
                        onChange={(e) => setArticleSortOrder(Number(e.target.value) || 0)}
                        className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100"
                      />
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={articlePublished}
                      onChange={(e) => setArticlePublished(e.target.checked)}
                    />
                    Published (visible at <code>/help</code>)
                  </label>

                  <div>
                    <label className="block text-sm text-slate-300">Content</label>
                    <textarea
                      rows={14}
                      value={articleContent}
                      onChange={(e) => setArticleContent(e.target.value)}
                      className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100"
                      placeholder="Use plain text for now."
                    />
                  </div>

                  <div className="rounded-lg bg-slate-950/60 border border-slate-700/70 px-3 py-2 text-xs text-slate-400">
                    Public URL: {articleSlug ? `/help/article/${articleSlug}` : "set a slug first"}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      onClick={() => {
                        setShowDeleteModal(true);
                        setDeleteNameInput("");
                        setDeleteAcknowledge(false);
                      }}
                      disabled={!selectedArticleId || articleDeleting}
                      className="inline-flex items-center gap-2 rounded-lg px-3 py-2 border border-red-500/30 bg-red-500/10 text-red-200 disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                      {articleDeleting ? "Deleting..." : "Delete"}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={createArticle}
                        disabled={articleCreating || !articleTitle.trim()}
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 border border-blue-500/30 bg-blue-500/10 text-blue-100 disabled:opacity-40"
                      >
                        <Plus className="w-4 h-4" />
                        {articleCreating ? "Creating..." : "Create New"}
                      </button>
                      <button
                        onClick={selectedArticleId ? saveArticle : createArticle}
                        disabled={(selectedArticleId ? articleSaving : articleCreating) || !articleTitle.trim()}
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 disabled:opacity-40"
                      >
                        <Save className="w-4 h-4" />
                        {selectedArticleId
                          ? (articleSaving ? "Saving..." : "Save Changes")
                          : (articleCreating ? "Creating..." : "Save Draft")}
                      </button>
                    </div>
                  </div>
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

        {showDeleteModal && selectedArticle && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
              <h3 className="text-lg font-semibold text-white">Delete Article</h3>
              <p className="text-sm text-slate-300">
                Type the article name to confirm deletion:
                {" "}
                <span className="text-white font-medium">{selectedArticle.title}</span>
              </p>

              <input
                type="text"
                value={deleteNameInput}
                onChange={(e) => setDeleteNameInput(e.target.value)}
                placeholder="Type article name"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100"
              />

              <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={deleteAcknowledge}
                  onChange={(e) => setDeleteAcknowledge(e.target.checked)}
                />
                I understand this action cant be undone.
              </label>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteNameInput("");
                    setDeleteAcknowledge(false);
                  }}
                  className="rounded-lg px-3 py-2 border border-slate-700 bg-slate-800 text-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteArticle}
                  disabled={
                    articleDeleting ||
                    deleteNameInput !== selectedArticle.title ||
                    !deleteAcknowledge
                  }
                  className="rounded-lg px-3 py-2 border border-red-500/30 bg-red-500/15 text-red-100 disabled:opacity-40"
                >
                  {articleDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
