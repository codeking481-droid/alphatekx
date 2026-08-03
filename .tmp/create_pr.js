import { execSync } from 'node:child_process'
const remote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
const match = remote.match(/^https:\/\/([^@]+)@(.+)$/);
if (!match) throw new Error('origin remote is not authenticated https');
const token = match[1];
const repoUrl = match[2].replace(/\.git$/, '');
const parts = repoUrl.split('/');
if (parts.length !== 3) throw new Error('unexpected repo remote');
const [host, owner, repo] = parts;
const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
const api = `https://${host}/repos/${owner}/${repo}`;
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
