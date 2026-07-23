export type TriggerType = 'schedule' | 'webhook' | 'event' | 'monitor' | 'campaign'
export type AgentStatus =
  | 'draft'
  | 'awaiting_information'
  | 'awaiting_connection'
  | 'awaiting_approval'
  | 'active'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'error'
  | 'warning'
  | 'pending'
  | 'deleted'

export type AgentTrigger = {
  type: TriggerType
  cron?: string
  event?: string
  interval?: number
  url?: string
  nextRun?: string
  lastRun?: string
}

export type MissingField = { field: string; step: string; connector: string; reason: string; index?: number }

export type AgentAction = {
  connector: string
  action: string
  label?: string
  params: Record<string, unknown>
  generate?: boolean
  prompt?: string
  research?: boolean
  image?: boolean
  topic?: string
  requiresApproval?: boolean
  approvalStatus?: 'pending' | 'approved'
}

export type AgentExecution = {
  id: string
  agentId: string
  at: string
  status: 'success' | 'error' | 'pending' | 'skipped' | 'paused' | 'aborted' | 'in_progress'
  duration: number
  log: string
  output?: unknown
  error_code?: string | null
  credits_used?: number
  steps?: unknown[]
  retry_count?: number
}

export type AutomationSchedule = {
  frequency?: 'daily' | 'weekly' | 'monthly' | 'once'
  cron?: string
  time?: string
  timezone?: string
  startDate?: string
  endDate?: string
  durationDays?: number
}

export type Agent = {
  id: string
  title?: string
  name: string
  description: string
  originalRequest?: string
  interpretedGoal?: string
  userId?: string
  userEmail?: string
  missionId?: string
  trigger: AgentTrigger
  schedule?: AutomationSchedule
  timezone?: string
  startDate?: string
  endDate?: string
  duration?: string
  integrations?: string[]
  requiredPermissions?: string[]
  actions: AgentAction[]
  status: AgentStatus
  userInputs?: Record<string, string>
  executionPolicy?: 'run_once' | 'run_until_end' | 'run_forever'
  retryPolicy?: { maxRetries: number; backoffMinutes: number[] }
  approvalPolicy?: 'explicit' | 'implicit'
  notificationSettings?: { onSuccess: boolean; onFailure: boolean; onRetry: boolean; channels: string[] }
  estimatedCreditCost?: number
  createdAt: string
  updatedAt: string
  lastRunAt?: string
  nextRunAt?: string
  executionHistory: AgentExecution[]
  successRate: number
  permissions: string[]
  creditsNeeded?: number
  creditsPerRun?: number
  executionsDone?: number
  executionsTotal?: number | null
  missing?: MissingField[]
  creditsPerStep?: { step: string; cost: number; reason: string }[]
  approved?: boolean
  type?: 'automation' | 'campaign'
  campaign?: {
    name: string
    description: string
    brand: { business: string; audience: string; tone: string; website: string; dontPost: string[] }
    meta: { platforms: string[]; slots: { label: string; hour: number; minute: number }[]; durationDays: number; postsPerDay: number; totalPosts: number; startDate: string; includeImages: boolean; timezone: string; frequency?: string; frequencyText: string; postingOption?: 'now' | 'later' | 'recurring'; localDate?: string | null; localTime?: string | null }
    posts: { id: string; day: number; slot: string; scheduledAt: string; platforms: string[]; topic: string; postType: string; captions: Record<string, string>; status: string; result: Record<string, unknown>; credits: number; approved?: boolean; charged?: boolean; chargedAt?: string; edited?: boolean; reviewedAt?: string; postedAt?: string; providerPostId?: string; providerUrl?: string; executionKey?: string; publishStartedAt?: string; retryCount?: number; lastError?: string; chargeStatus?: string; timezone?: string; postingOption?: string; scheduledLocalDate?: string | null; scheduledLocalTime?: string | null }[]
    totalCredits: number
    status: string
    charged: boolean
    approved: boolean
    autoPublish: boolean
    missionReport?: unknown
    completedCount?: number
    failedCount?: number
    lastRun?: string
  }
}

export type ConnectorAuthType = 'oauth' | 'apiKey' | 'none'

export type ConnectorTrigger = { id: string; label: string; description: string }
export type ConnectorAction = { id: string; label: string; description: string; params?: string[] }

export type ConnectorCategory = 'Communication' | 'Productivity' | 'Development' | 'Social Media' | 'Storage' | 'AI Providers' | 'Automation' | 'Business'

export type Connector = {
  id: string
  name: string
  icon: string
  authType: ConnectorAuthType
  category: ConnectorCategory
  color: string
  description: string
  triggers: ConnectorTrigger[]
  actions: ConnectorAction[]
  permissions: string[]
}
