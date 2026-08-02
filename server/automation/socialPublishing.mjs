const X_MAX_LENGTH = 280

export function normalizeSocialPlatform(value) {
  return String(value || '').trim().toLowerCase()
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
