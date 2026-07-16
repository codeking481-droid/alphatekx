export type MissionStatus = 'active' | 'completed'
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

export type Mission = {
  id: string
  title: string
  goal: string
  status: MissionStatus
  progress: number
  createdAt: string
  messages: MissionMessage[]
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
  code: string
  type: string
  status: CreationStatus
  files: CreationFile[]
  createdAt: string
  published: boolean
  deploymentUrl?: string
  slug?: string
  versions?: CreationVersion[]
  customDomain?: string
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
export type MentorQuiz={question:string;options:string[];answer:number}
export type MentorLesson={id:string;title:string;objective:string;explanation:string;codeExample:string;quiz:MentorQuiz}
export type MentorProgress={missionId:string;subject:string;lessons:MentorLesson[];lessonsCompleted:string[];quizScores:Record<string,number>}
