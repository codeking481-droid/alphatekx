export type MissionStatus = 'queued' | 'building' | 'review' | 'deployed' | 'active' | 'completed'
export type MessageRole = 'user' | 'assistant' | 'system'
export type MessageType = 'chat' | 'activity'

export type MissionMessage = {
  id: string
  role: MessageRole
  content: string
  type: MessageType
  createdAt: string
  workerId?: string
}

export type PlanModule = {
  id: string
  name: string
  purpose: string
  files?: string[]
}

export type Plan = {
  title: string
  description: string
  modules: PlanModule[]
}

export type Mission = {
  id: string
  title: string
  goal: string
  status: MissionStatus
  progress: number
  currentStage?: string
  createdAt: string
  messages: MissionMessage[]
  plan?: Plan
  planStatus?: 'draft' | 'approved'
}

export type Activity = {
  id: string
  missionId: string
  text: string
  timestamp: string
  role?: TeamRole
}
export type TeamRole = 'Product Manager'|'UI Designer'|'Backend Engineer'|'Database Engineer'|'QA Tester'|'Deployment Engineer'|'Alpha'

export type CreationStatus = 'draft' | 'testing' | 'ready' | 'deployed' | 'live'

export type CreationFile = { path: string; code: string }

export type Creation = {
  id: string
  missionId: string
  title: string
  description?: string
  code: string
  type: string
  status: CreationStatus
  files: CreationFile[]
  dependencies?: string[]
  createdAt: string
  published: boolean
  deploymentUrl?: string
  pathUrl?: string
  slug?: string
  versions?: CreationVersion[]
  versionIndex?: number
  customDomain?: string
  previewUrl?: string
  previewLogs?: string
  previewSteps?: { stage: string; ok: boolean; ms: number; summary?: string }[]
}
export type CreationVersion={id:string;label:string;code:string;files:CreationFile[];createdAt:string;status:CreationStatus}

export type WorkerRole = 'marketing' | 'coding' | 'support' | 'sales' | 'research' | 'business'

export type Worker = {
  id: string
  name: string
  role: WorkerRole
  purpose: string
  instructions: string
  provider?: 'openai' | 'groq' | 'anthropic' | 'gemini'
  model?: string
  memory: string[]
  createdAt: string
}

export type MarketplaceItem = {
  id: string
  creationId: string
  title: string
  description: string
  creator: string
  category: string
  priceType: 'free' | 'paid'
  price: number
  rating: number
  downloads: number
  code: string
  files: CreationFile[]
  createdAt: string
  ownerId?: string
}

export type MarketplaceSale = { id: string; itemId: string; title: string; amount: number; creatorShare: number; platformShare: number; createdAt: string }
export type MarketplaceReview={id:string;itemId:string;userId:string;rating:number;comment:string;createdAt:string;email?:string}

export type MarketplaceProduct = {
  id: string
  userId: string
  sellerEmail?: string
  projectId?: string
  title: string
  priceUSD: number
  priceNGN: number
  description: string
  thumbnail: string
  previewUrl: string
  demoUrl?: string
  category: string
  sales: number
  revenue: number
  status: 'draft' | 'live'
  createdAt: string
  hasAccess?: boolean
  rating?: number
  reviews?: MarketplaceReview[]
}

export type MarketplaceOrder = {
  id: string
  productId: string
  buyerId: string
  sellerId: string
  amount: number
  paystackRef: string
  status: 'pending' | 'paid' | 'failed'
  createdAt: string
}

export type SellerWallet = {
  userId: string
  balance: number
  pendingBalance: number
  totalEarnings: number
  totalWithdrawn: number
  sales?: number
  createdAt: string
}

export type Withdrawal = {
  id: string
  userId: string
  sellerEmail?: string
  amount: number
  bankName: string
  accountNumber: string
  accountName: string
  bankCode: string
  status: 'pending' | 'paid' | 'failed'
  paystackTransferCode?: string
  proof?: string
  createdAt: string
  paidAt?: string
}

export type StoreItem = {
  id: string
  userId: string
  title: string
  type: 'snippet' | 'prompt' | 'image' | 'link' | 'idea' | 'file'
  content: string
  tags: string[]
  projectId?: string
  isFavorite: boolean
  usageCount: number
  createdAt: string
  updatedAt: string
}
export type MentorQuiz={question:string;options:string[];answer:number}
export type MentorLesson={id:string;title:string;objective:string;explanation:string;codeExample:string;quiz:MentorQuiz}
export type MentorProgress={missionId:string;subject:string;lessons:MentorLesson[];lessonsCompleted:string[];quizScores:Record<string,number>}
