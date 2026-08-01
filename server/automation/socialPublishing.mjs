const X_MAX_LENGTH = 280

export function normalizeSocialPlatform(value) {
  const platform = String(value || '').trim().toLowerCase()
  return platform === 'twitter' ? 'x' : platform
}

export function xPostText(value) {
  const text = String(value || '').trim()
  if (text.length <= X_MAX_LENGTH) return text
  return `${text.slice(0, X_MAX_LENGTH - 3).trimEnd()}...`
}

export function buildSocialPublishingAction(platformValue, post = {}, captionValue = '', campaign = {}) {
  const platform = normalizeSocialPlatform(platformValue)
  const caption = String(captionValue || '').trim()
  const imageUrl = String(post.imageUrl || post.image_url || '').trim()
  if (!caption) throw new Error(`Missing caption for ${platform || 'platform'}`)

  if (platform === 'instagram') {
    if (!imageUrl) throw new Error('Instagram requires a confirmed image. Regenerate this post before publishing.')
    // Current Composio/Instagram publishing is a two-step container + publish
    // operation. The connector service performs both under one durable claim.
    const igUserId = String(post.instagramUserId || post.ig_user_id || campaign.meta?.instagramUserId || campaign.meta?.ig_user_id || '').trim()
    return { action: 'publish_post', params: { image_url: imageUrl, caption, ...(igUserId ? { ig_user_id: igUserId } : {}) } }
  }
  if (platform === 'facebook') {
    if (!imageUrl) throw new Error('Facebook requires a confirmed matched image. Regenerate this post before publishing.')
    const pageId = String(post.pageId || post.page_id || campaign.meta?.pageId || campaign.meta?.page_id || '').trim()
    return { action: 'create_page_post', params: { message: caption, ...(pageId ? { page_id: pageId } : {}), image_url: imageUrl } }
  }
  if (platform === 'x') {
    if (!imageUrl) throw new Error('X requires a confirmed matched image. Regenerate this post before publishing.')
    // X rejects text over 280 characters. Captions should already be adapted by
    // the planner, but this final boundary prevents a provider-side rejection.
    return {
      action: 'create_media_tweet',
      params: { text: xPostText(caption), image_url: imageUrl },
    }
  }
  if (platform === 'whatsapp') {
    const to = String(post.to || campaign.meta?.to || campaign.meta?.recipient || '').trim()
    if (!to) throw new Error('WhatsApp needs the recipient phone number with country code before publishing.')
    return { action: 'send_message', params: { to, message: caption } }
  }
  if (platform === 'youtube') {
    const videoUrl = String(post.videoUrl || post.video_url || '').trim()
    if (!videoUrl) throw new Error('YouTube needs a video selected from Media Library before publishing.')
    return { action: 'upload_video', params: { title: String(post.title || post.topic || 'AlphaTekx video').slice(0, 100), description: caption, tags: post.tags || [], privacyStatus: post.privacyStatus || 'public', video_url: videoUrl } }
  }
  throw new Error(`No Composio publishing action exists for ${platformValue}.`)
}

export function providerPostIds(results = {}) {
  return Object.fromEntries(Object.entries(results)
    .filter(([, result]) => result?.status === 'success' && result?.id)
    .map(([platform, result]) => [normalizeSocialPlatform(platform), String(result.id)]))
}
