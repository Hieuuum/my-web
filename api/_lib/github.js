const BASE = "https://api.github.com";

function getConfig() {
  return {
    repo: process.env.GITHUB_REPO || "Hieuuum/my-web",
    branch: process.env.GITHUB_BRANCH || "main",
    token: process.env.GITHUB_TOKEN || "",
  };
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "blog-admin",
    "Content-Type": "application/json",
  };
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConflictError";
  }
}

export { ConflictError };

export async function listDir(path) {
  const { repo, branch, token } = getConfig();
  const url = `${BASE}/repos/${repo}/contents/${path}?ref=${branch}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`GitHub listDir failed: ${res.status}`);
  }
  const data = await res.json();
  if (data.length === 1000) {
    console.warn(`listDir: result for "${path}" may be truncated at 1000 entries`);
  }
  return data;
}

export async function getFile(path) {
  const { repo, branch, token } = getConfig();
  const url = `${BASE}/repos/${repo}/contents/${path}?ref=${branch}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`GitHub getFile failed: ${res.status}`);
  }
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf8");
  return { content, sha: data.sha };
}

export async function putFile(path, base64Content, message, sha) {
  const { repo, branch, token } = getConfig();
  const url = `${BASE}/repos/${repo}/contents/${path}`;
  const body = { message, content: base64Content, branch };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (res.status === 409 || res.status === 422) {
    const text = await res.text();
    throw new ConflictError(`GitHub conflict: ${res.status} ${text}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub putFile failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return { sha: data.content.sha };
}

export async function deleteFile(path, message, sha) {
  const { repo, branch, token } = getConfig();
  const url = `${BASE}/repos/${repo}/contents/${path}`;
  const body = { message, sha, branch };
  const res = await fetch(url, {
    method: "DELETE",
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (res.status === 409 || res.status === 422) {
    const text = await res.text();
    throw new ConflictError(`GitHub conflict: ${res.status} ${text}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub deleteFile failed: ${res.status} ${text}`);
  }
}
