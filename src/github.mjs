function required(value, name) { if (!String(value || "").trim()) throw Object.assign(new Error(`${name} is required`), { status: 400 }); }

export async function publishProject({ owner, repo, branch, token, files, message, baseBranch, pullRequest }, fetcher = fetch) {
  required(owner, "owner"); required(repo, "repo"); required(branch, "branch"); required(token, "githubToken");
  if (!files.length) throw Object.assign(new Error("Apply at least one task before publishing"), { status: 409 });
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json", "user-agent": "silo-workspace" };
  const request = async (path, options = {}) => { const response = await fetcher(base + path, { ...options, headers }); const data = await response.json().catch(() => ({})); if (!response.ok) throw Object.assign(new Error(data.message || `GitHub returned ${response.status}`), { status: response.status === 401 ? 401 : 502, code: "GITHUB_ERROR" }); return data; };
  let reference;
  if(baseBranch&&baseBranch!==branch){const baseReference=await request(`/git/ref/heads/${encodeURIComponent(baseBranch)}`);await request("/git/refs",{method:"POST",body:JSON.stringify({ref:`refs/heads/${branch}`,sha:baseReference.object.sha})});reference={object:{sha:baseReference.object.sha}};}else reference=await request(`/git/ref/heads/${encodeURIComponent(branch)}`);
  const parent = reference.object.sha;
  const commit = await request(`/git/commits/${parent}`);
  const treeEntries = [];
  for (const file of files) {
    const blob = await request("/git/blobs", { method: "POST", body: JSON.stringify({ content: file.content, encoding: "utf-8" }) });
    treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const tree = await request("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: commit.tree.sha, tree: treeEntries }) });
  const next = await request("/git/commits", { method: "POST", body: JSON.stringify({ message, tree: tree.sha, parents: [parent] }) });
  await request(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", body: JSON.stringify({ sha: next.sha, force: false }) });
  let pr=null;if(pullRequest){pr=await request("/pulls",{method:"POST",body:JSON.stringify({title:pullRequest.title||message,body:pullRequest.body||"Created by SILO",head:branch,base:baseBranch||"main",draft:Boolean(pullRequest.draft)})});}
  return { published: true, commit: next.sha, url: `https://github.com/${owner}/${repo}/commit/${next.sha}`, files: files.length,pullRequest:pr&&{number:pr.number,url:pr.html_url} };
}
