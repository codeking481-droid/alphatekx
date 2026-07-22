export function normalizeLinkedInScopes(value) {
  const entries = Array.isArray(value) ? value : [value]
  return Array.from(new Set(entries.flatMap(entry => String(entry || '').split(/[\s,]+/)).filter(Boolean)))
}

export function validateLinkedInCredentials(creds, now = Date.now()) {
  const token = creds?.accessToken || creds?.access_token || ''
  const author = creds?.authorUrn || creds?.author_urn || creds?.identifier || ''
  const scopes = normalizeLinkedInScopes(creds?.scopes)
  const expiresAt = Number(creds?.expiry || creds?.expires_at || creds?.expiry_date || 0)
  if (!token || !author) throw new Error('LinkedIn token or author URN missing. Connect LinkedIn in Connected Apps.')
  if (!String(author).startsWith('urn:li:person:')) throw new Error('Only LinkedIn personal profile publishing is supported in this release.')
  if (expiresAt > 0 && expiresAt <= now) throw new Error('LinkedIn access token has expired. Reconnect LinkedIn in Connected Apps.')
  if (!scopes.includes('w_member_social')) throw new Error('LinkedIn connection is missing w_member_social permission. Reconnect LinkedIn and approve Share on LinkedIn.')
  return { token, author }
}

export async function publishLinkedInTextPost(creds, params, options = {}) {
  const text = String(params?.text || params?.message || '').trim()
  if (!text) throw new Error('LinkedIn text post content is required')
  if (params?.imageUrl) throw new Error('Images are not supported in the first LinkedIn release')
  const { token, author } = validateLinkedInCredentials(creds, options.now)
  const fetchImpl = options.fetchImpl || fetch
  const apiBaseUrl = String(options.apiBaseUrl || process.env.LINKEDIN_API_BASE_URL || 'https://api.linkedin.com').replace(/\/$/, '')
  const body = {
    author,
    commentary: text,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  }
  const response = await fetchImpl(`${apiBaseUrl}/rest/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0', 'LinkedIn-Version': options.apiVersion || process.env.LINKEDIN_API_VERSION || '202604' },
    body: JSON.stringify(body),
  })
  const postId = response.headers.get('x-restli-id') || response.headers.get('X-Restli-Id')
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.message || data.error || data.error_description || `LinkedIn post failed (${response.status})`)
  }
  if (!postId) throw new Error('LinkedIn did not return a confirmed post identifier')
  return { id: postId, ok: true, status: response.status, link: `https://www.linkedin.com/feed/update/${postId}` }
}
