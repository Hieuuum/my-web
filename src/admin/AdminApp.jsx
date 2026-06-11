import { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "./api";
import Login from "./pages/Login";
import PostList from "./pages/PostList";
import Editor from "./pages/Editor";

function AdminHeader() {
  const navigate = useNavigate();

  async function handleLogout() {
    await api.logout().catch(() => {});
    navigate("/admin/login", { replace: true });
  }

  return (
    <header className="border-b border-slate-100 dark:border-zinc-800 px-6 py-3 flex items-center gap-6">
      <Link to="/" className="text-sm text-slate-400 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors">
        mhieuuu
      </Link>
      <Link to="/admin/posts" className="text-sm text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors">
        Posts
      </Link>
      <button
        onClick={handleLogout}
        className="text-sm text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-400 transition-colors ml-auto"
      >
        Log out
      </button>
    </header>
  );
}

function AuthGuard({ children }) {
  const [status, setStatus] = useState("loading"); // "loading" | "ok" | "unauth"
  const navigate = useNavigate();

  useEffect(() => {
    api.getMe().then(() => {
      setStatus("ok");
    }).catch((err) => {
      if (err instanceof ApiError && err.status === 401) {
        setStatus("unauth");
        navigate("/admin/login", { replace: true });
      }
      // Network errors / 5xx: leave the user where they are
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") return null;
  return children;
}

export default function AdminApp() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route
        path="*"
        element={
          <AuthGuard>
            <div className="min-h-screen flex flex-col">
              <AdminHeader />
              <main className="flex-1">
                <Routes>
                  <Route index element={<Navigate to="posts" replace />} />
                  <Route path="posts" element={<PostList />} />
                  <Route path="posts/new" element={<Editor />} />
                  <Route path="posts/:slug" element={<Editor />} />
                </Routes>
              </main>
            </div>
          </AuthGuard>
        }
      />
    </Routes>
  );
}
