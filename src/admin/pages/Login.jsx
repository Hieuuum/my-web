import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.login(password);
      navigate("/admin/posts", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Invalid password.");
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-xs">
        <h1 className="text-xl font-semibold text-slate-900 mb-6">Admin</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          required
          className="w-full border border-slate-200 rounded px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-slate-400 mb-3"
        />
        {error && (
          <p className="text-sm text-slate-500 mb-3">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 text-white text-sm py-2 rounded hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
