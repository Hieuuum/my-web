// Typed error for API failures
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  const opts = {
    method,
    credentials: "same-origin",
  };

  if (body !== undefined) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(path, opts);

  if (res.status === 401 && path !== "/api/login") {
    // Throw and let each call site handle navigation.
    // A hard window.location.href redirect bypasses React Router state and
    // the beforeunload protection, so we rely on AuthGuard and per-call
    // catch blocks to redirect via navigate().
    throw new ApiError(401, "Unauthorized");
  }

  if (res.status === 204) return null;

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : null;

  if (!res.ok) {
    const msg = data?.error || res.statusText;
    throw new ApiError(res.status, msg);
  }

  return data;
}

export const api = {
  getMe: () => request("GET", "/api/me"),
  login: (password) => request("POST", "/api/login", { password }),
  logout: () => request("POST", "/api/logout"),

  getPosts: () => request("GET", "/api/posts"),
  getPost: (slug) => request("GET", `/api/posts/${slug}`),
  savePost: (slug, body) => request("PUT", `/api/posts/${slug}`, body),
  deletePost: (slug, sha) => request("DELETE", `/api/posts/${slug}`, { sha }),

  upload: (filename, dataBase64) =>
    request("POST", "/api/upload", { filename, dataBase64 }),
};
