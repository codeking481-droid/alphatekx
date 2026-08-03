const { execSync } = require('node:child_process');
const { writeFileSync, unlinkSync } = require('node:fs');
const url = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
const match = url.match(/^https:\/\/(?:(?<token>[^@]+)@)?github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)(?:\.git)?$/);
if (!match) {
  console.error('UNSUPPORTED_REMOTE_URL', url);
  process.exit(1);
}
const { token, owner, repo } = match.groups;
if (!token) {
  console.error('NO_TOKEN_IN_REMOTE_URL');
  process.exit(1);
}
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'git-pr-creator',
};
const base = `https://api.github.com/repos/${owner}/${repo}`;
const fetch = global.fetch || require('node-fetch');
(async () => {
  const repoRes = await fetch(base, { headers });
  if (!repoRes.ok) {
    console.error('REPO_INFO_FAILED', await repoRes.text());
    process.exit(1);
  }
  const repoInfo = await repoRes.json();
  const defaultBranch = repoInfo.default_branch;
  const branch = 'feature/settings-billing-fix';
  const existingRes = await fetch(`${base}/pulls?head=${owner}:${branch}&state=open`, { headers });
  if (!existingRes.ok) {
    console.error('PR_LIST_FAILED', await existingRes.text());
    process.exit(1);
  }
  const prs = await existingRes.json();
  if (prs.length > 0) {
    console.log('EXISTING_PR', prs[0].html_url);
    return;
  }
  const body = {
    title: 'Fix Paystack test purchase to ₦100 and enable Opay channels',
    head: branch,
    base: defaultBranch,
    body: 'Update the Paystack test purchase amount to ₦100, ensure NGN checkout minimums are enforced, and add Opay payment channel support.',
  };
  const createRes = await fetch(`${base}/pulls`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await createRes.json();
  if (!createRes.ok) {
    console.error('PR_CREATE_FAILED', JSON.stringify(result));
    process.exit(1);
  }
  console.log('PR_CREATED', result.html_url);
})();
