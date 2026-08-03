import { execSync } from "node:child_process";
const remote = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
const m = remote.match(/^https:\/\/([^@]+)@(.+)$/);
if (!m) throw new Error("origin remote is not authenticated https");
const token = m[1];
const repoUrl = m[2].replace(/\.git$/, "");
const [host, owner, repo] = repoUrl.split("/");
if (!host || !owner || !repo) throw new Error("unexpected repo remote");
const api = `https://api.github.com/repos/${owner}/${repo}`;
const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
const head = `${owner}:${branch}`;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'copilot-pr-creator'
};
const existingRes = await fetch(`${api}/pulls?head=${encodeURIComponent(head)}&base=main&state=open`, { headers });
const existing = await existingRes.json();
if (!Array.isArray(existing)) throw new Error(JSON.stringify(existing));
if (existing.length) {
  console.log(existing[0].html_url);
  process.exit(0);
}
const body = {
  title: 'Upgrade Pollinations premium images and billing fix',
  head: branch,
  base: 'main',
  body: 'This PR updates Paystack billing fixes and upgrades Pollinations image generation to premium 1200x628 Flux imagery with enhanced prompts, random seeds, and no-logo output.'
};
const createRes = await fetch(`${api}/pulls`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});
const result = await createRes.json();
if (!createRes.ok) throw new Error(JSON.stringify(result));
console.log(result.html_url);
