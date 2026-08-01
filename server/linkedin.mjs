export function normalizeLinkedInScopes(value) {
  const entries = Array.isArray(value) ? value : [value]
  return Array.from(new Set(entries.flatMap(entry => String(entry || '').split(/[\s,]+/)).filter(Boolean)))
}

export function hasUsableLinkedInStorage(tokens) {
  const accessToken = tokens?.access_token || tokens?.accessToken || ''
  const author = tokens?.author_urn || tokens?.authorUrn || ''
  return Boolean(accessToken && String(author).startsWith('urn:li:person:'))
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
  const { token, author } = validateLinkedInCredentials(creds, options.now)
  const fetchImpl = options.fetchImpl || fetch
  const apiBaseUrl = String(options.apiBaseUrl || process.env.LINKEDIN_API_BASE_URL || 'https://api.linkedin.com').replace(/\/$/, '')
  const apiVersion = options.apiVersion || process.env.LINKEDIN_API_VERSION || '202604'
  const imageUrl = String(params?.imageUrl || params?.image_url || '').trim()
  let imageId = ''

  if (imageUrl) {
    let parsedImageUrl
    try { parsedImageUrl = new URL(imageUrl) } catch { throw new Error('LinkedIn image URL is invalid') }
    if (!['http:', 'https:'].includes(parsedImageUrl.protocol)) throw new Error('LinkedIn image URL must use HTTP or HTTPS')

    const imageResponse = await fetchImpl(parsedImageUrl, { signal: AbortSignal.timeout(Number(options.imageTimeoutMs || 30_000)) })
    if (!imageResponse.ok) throw new Error(`LinkedIn image download failed (${imageResponse.status})`)
    const contentType = String(imageResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!contentType.startsWith('image/')) throw new Error('LinkedIn image source did not return an image')
    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer())
    if (!imageBytes.byteLength) throw new Error('LinkedIn image source returned an empty image')
    if (imageBytes.byteLength > Number(options.maxImageBytes || 20 * 1024 * 1024)) throw new Error('LinkedIn image is too large to upload')

    const initializeResponse = await fetchImpl(`${apiBaseUrl}/rest/images?action=initializeUpload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0', 'LinkedIn-Version': apiVersion },
      body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
    })
    const initializeData = await initializeResponse.json().catch(() => ({}))
    if (!initializeResponse.ok) throw new Error(initializeData.message || initializeData.error || `LinkedIn image initialization failed (${initializeResponse.status})`)
    const uploadUrl = String(initializeData?.value?.uploadUrl || '')
    imageId = String(initializeData?.value?.image || '')
    if (!uploadUrl || !imageId.startsWith('urn:li:image:')) throw new Error('LinkedIn did not return a confirmed image upload asset')

    const uploadResponse = await fetchImpl(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body: imageBytes })
    if (!uploadResponse.ok) throw new Error(`LinkedIn image upload failed (${uploadResponse.status})`)
  }

  const body = {
    author,
    commentary: text,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  }
  if (imageId) body.content = { media: { id: imageId, altText: String(params?.imageAlt || params?.topic || 'Post image').slice(0, 120) } }
  const response = await fetchImpl(`${apiBaseUrl}/rest/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0', 'LinkedIn-Version': apiVersion },
    body: JSON.stringify(body),
  })
  const postId = response.headers.get('x-restli-id') || response.headers.get('X-Restli-Id')
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.message || data.error || data.error_description || `LinkedIn post failed (${response.status})`)
  }
  if (!postId) throw new Error('LinkedIn did not return a confirmed post identifier')
  return { id: postId, imageId: imageId || undefined, ok: true, status: response.status, link: `https://www.linkedin.com/feed/update/${postId}` }
}
