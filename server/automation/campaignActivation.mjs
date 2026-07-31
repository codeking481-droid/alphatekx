function normalizePostStatus(post) {
  if (post?.status === 'pending_approval' || post?.status === 'draft' || post?.status === 'awaiting_approval') return 'scheduled'
  return post?.status || 'scheduled'
}

export function prepareCampaignPostsForActivation({ posts = [], postingOption = 'later', startAt }) {
  const normalizedPosts = Array.isArray(posts) ? posts.map(post => ({ ...post })) : []
  if (!normalizedPosts.length) return { posts: normalizedPosts, immediatePostCount: 0 }

  const effectiveStart = startAt ? new Date(startAt) : new Date()
  const isImmediate = String(postingOption).toLowerCase() === 'now'

  if (!isImmediate) {
    const firstScheduled = normalizedPosts[0]?.scheduledAt ? new Date(normalizedPosts[0].scheduledAt) : null
    if (firstScheduled && !Number.isNaN(firstScheduled.getTime())) {
      const offsetMs = effectiveStart.getTime() - firstScheduled.getTime()
      if (offsetMs !== 0) {
        return {
          posts: normalizedPosts.map(post => ({
            ...post,
            scheduledAt: post?.scheduledAt ? new Date(new Date(post.scheduledAt).getTime() + offsetMs).toISOString() : undefined,
            status: normalizePostStatus(post),
            approved: post?.approved !== false,
          })),
          immediatePostCount: 0,
        }
      }
    }
    return {
      posts: normalizedPosts.map(post => ({
        ...post,
        status: normalizePostStatus(post),
        approved: post?.approved !== false,
      })),
      immediatePostCount: 0,
    }
  }

  const immediateTimestamp = Number.isNaN(effectiveStart.getTime()) ? new Date().toISOString() : effectiveStart.toISOString()
  return {
    posts: normalizedPosts.map((post, index) => ({
      ...post,
      scheduledAt: index === 0 ? immediateTimestamp : post?.scheduledAt || immediateTimestamp,
      status: index === 0 ? 'scheduled' : normalizePostStatus(post),
      approved: true,
    })),
    immediatePostCount: 1,
  }
}
