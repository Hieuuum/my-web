import { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link, useNavigate, useLocation } from "react-router-dom";
import { api } from "./api";
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
    <header className="border-b border-slate-100 px-6 py-3 flex items-center gap-6">
      <Link to="/" className="text-sm text-slate-400 hover:text-slate-900 transition-colors">
        mhieuuu
      </Link>
      <Link to="/admin/posts" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
        Posts
      </Link>
      <button
        onClick={handleLogout}
        className="text-sm text-slate-400 hover:text-slate-600 transition-colors ml-auto"
      >
        Log out
      </button>
    </header>
  );
}

function AuthGuard({ children }) {
  const [status, setStatus] = useState("loading"); // "loading" | "ok" | "unauth"
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    api.getMe().then(() => {
      setStatus("ok");
    }).catch(() => {
      setStatus("unauth");
      if (location.pathname !== "/admin/login") {
        navigate("/admin/login", { replace: true });
      }
    });
  }, [navigate, location.pathname]);

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
