const { execSync } = require('node:child_process');
const url = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
const match = url.match(/^https:\/\/(?:(?<token>[^@]+)@)?github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/);
if (!match) {
  console.error('UNSUPPORTED_REMOTE_URL', url);
  process.exit(1);
}
const { token, owner, repo } = match.groups;
console.log('owner=', owner);
console.log('repo=', repo);
console.log('tokenExists=', Boolean(token));
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
(async () => {
  const repoRes = await fetch(base, { headers });
  console.log('repoStatus', repoRes.status);
  const repoText = await repoRes.text();
  console.log('repoBody', repoText);
  if (!repoRes.ok) {
    process.exit(1);
  }
  const branch = 'feature/settings-billing-fix';
  const existingRes = await fetch(`${base}/pulls?head=${owner}:${branch}&state=open`, { headers });
  console.log('existingStatus', existingRes.status);
  const existingBody = await existingRes.text();
  console.log('existingBody', existingBody);
  if (!existingRes.ok) {
    process.exit(1);
  }
  const prs = JSON.parse(existingBody);
  if (prs.length > 0) {
    console.log('EXISTING_PR', prs[0].html_url);
    return;
  }
  const body = {
    title: 'Fix Paystack test purchase to ₦100 and enable Opay channels',
    head: branch,
    base: 'main',
    body: 'Update the Paystack test purchase amount to ₦100, ensure NGN checkout minimums are enforced, and add Opay payment channel support.',
  };
  const createRes = await fetch(`${base}/pulls`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const createBody = await createRes.text();
  console.log('createStatus', createRes.status);
  console.log('createBody', createBody);
  if (!createRes.ok) {
    process.exit(1);
  }
})();
