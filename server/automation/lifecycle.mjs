function normalizePostLifecycle(post) {
  if (!post) return post
  const nextStatus = post.status === 'pending_approval' || post.status === 'draft' || post.status === 'awaiting_approval'
    ? 'scheduled'
    : post.status

  return {
    ...post,
    status: nextStatus,
    approved: post.approved === true || nextStatus === 'scheduled',
    charged: post.charged === true,
    providerPostId: post.providerPostId || undefined,
    providerUrl: post.providerUrl || undefined,
    executionKey: post.executionKey || undefined,
  }
}

export function normalizeAutomationLifecycle(agent) {
  const shouldRun = Boolean(
    agent?.approved === true ||
    agent?.status === 'running' ||
    agent?.status === 'active' ||
    agent?.status === 'pending' ||
    agent?.campaign?.approved === true ||
    agent?.campaign?.status === 'running' ||
    agent?.campaign?.status === 'active' ||
    agent?.campaign?.status === 'approved'
  )

  const normalized = {
    ...agent,
    status: shouldRun ? 'running' : (agent?.status === 'awaiting_information' ? 'awaiting_information' : agent?.status),
    approved: shouldRun,
  }

  if (normalized.campaign) {
    normalized.campaign = {
      ...normalized.campaign,
      approved: shouldRun || normalized.campaign.approved === true,
      status: shouldRun || normalized.campaign.status === 'running' || normalized.campaign.status === 'active' || normalized.campaign.status === 'approved'
        ? 'running'
        : normalized.campaign.status,
      charged: normalized.campaign.charged === true,
      posts: (normalized.campaign.posts || []).map(post => normalizePostLifecycle(post)),
    }
  }

  if (normalized.status === 'running' || normalized.status === 'active') {
    normalized.status = 'running'
    normalized.approved = true
    if (normalized.campaign) {
      normalized.campaign.status = 'running'
      normalized.campaign.approved = true
    }
  }

  return normalized
}
