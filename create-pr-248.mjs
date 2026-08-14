#!/usr/bin/env node
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!token) {
  console.error('Error: No GitHub token found in GITHUB_TOKEN or GH_TOKEN environment variables');
  console.error('Please set your GitHub personal access token before running this script');
  process.exit(1);
}

const payload = {
  title: 'feat: Update Groq model to openai/gpt-oss-120b',
  body: `## Changes
- Update all Groq model references from llama-3.x to openai/gpt-oss-120b
- Align codebase with production Render environment configuration
- 17 total instances updated across 7 files

## Files Modified
- server.mjs
- api/ai/generate-post.mjs
- server/mediaLibraryService.mjs
- server/videoPipeline.mjs
- server/alpha/providerHealth.mjs
- src/lib/ai/groq.ts
- src/pages/Workers.tsx

## Testing
- TypeScript compilation passes
- No breaking changes to API signatures
- All Groq API calls use the new model endpoint

## Related
This is a follow-up to PR #247 (merged) which contains the scanner implementation.
Resolves the model configuration to match production Render deployment.`,
  head: 'feature/pr-248-groq-model-120b',
  base: 'main'
};

fetch('https://api.github.com/repos/codeking481-droid/alphatekx/pulls', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
})
  .then(async (response) => {
    const data = await response.json();
    if (response.ok) {
      console.log('\n✅ PR Created Successfully!\n');
      console.log(`PR Number:  #${data.number}`);
      console.log(`Title:      ${data.title}`);
      console.log(`URL:        ${data.html_url}`);
      console.log(`State:      ${data.state}`);
      console.log(`Branch:     ${data.head.ref} -> ${data.base.ref}\n`);
    } else {
      console.error('❌ Error creating PR:');
      console.error(`Status: ${response.status}`);
      console.error(`Message: ${data.message || JSON.stringify(data, null, 2)}`);
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('❌ Network error:', error.message);
    process.exit(1);
  });
