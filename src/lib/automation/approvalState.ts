export type ApprovalBadgeState = {
  label: string
  tone: 'pending' | 'running' | 'paused' | 'completed'
  variant: 'pending' | 'running' | 'paused' | 'completed'
}

export function getApprovalBadgeState(agent: { status?: string; approved?: boolean; campaign?: { status?: string; approved?: boolean } } | null | undefined): ApprovalBadgeState {
  const status = String(agent?.status || '').toLowerCase()
  const campaignStatus = String(agent?.campaign?.status || '').toLowerCase()
  const approved = agent?.approved === true || agent?.campaign?.approved === true

  if (approved && (status === 'running' || campaignStatus === 'running' || status === 'active' || campaignStatus === 'active')) {
    return { label: 'Live', tone: 'running', variant: 'running' }
  }

  if (status === 'paused' || campaignStatus === 'paused' || status === 'cancelled' || campaignStatus === 'cancelled') {
    return { label: 'Paused', tone: 'paused', variant: 'paused' }
  }

  if (status === 'completed' || campaignStatus === 'completed') {
    return { label: 'Completed', tone: 'completed', variant: 'completed' }
  }

  if (status === 'pending_approval' || campaignStatus === 'pending_approval' || status === 'awaiting_approval' || campaignStatus === 'awaiting_approval' || status === 'draft' || campaignStatus === 'draft') {
    return { label: 'Needs approval', tone: 'pending', variant: 'pending' }
  }

  if (approved) {
    return { label: 'Live', tone: 'running', variant: 'running' }
  }

  return { label: 'Needs approval', tone: 'pending', variant: 'pending' }
}
