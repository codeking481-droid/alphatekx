import {
  Mail,
  FileSpreadsheet,
  Github,
  Linkedin,
  MessageCircle,
  CreditCard,
  Database,
  FileText,
  Slack,
  MessageSquare,
  Send,
  Calendar,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import {
  siDiscord,
  siGithub,
  siGmail,
  siGoogledocs,
  siGooglesheets,
} from 'simple-icons'
import type { Connector } from '../../lib/agents/types'

type BrandMark = { path: string; title: string }

const brandMarks: Record<string, BrandMark> = {
  discord: siDiscord,
  github: siGithub,
  gmail: siGmail,
  google_docs: siGoogledocs,
  googledocs: siGoogledocs,
  google_sheets: siGooglesheets,
  googlesheets: siGooglesheets,
}

const icons: Record<string, LucideIcon> = {
  mail: Mail,
  sheet: FileSpreadsheet,
  github: Github,
  linkedin: Linkedin,
  'message-circle': MessageCircle,
  'credit-card': CreditCard,
  database: Database,
  'file-text': FileText,
  slack: Slack,
  'message-square': MessageSquare,
  send: Send,
  calendar: Calendar,
  zap: Zap,
}

export function ConnectorIcon({ connector, className = '' }: { connector: Connector; className?: string }) {
  const brand = brandMarks[connector.id] || brandMarks[connector.icon]
  if (brand) {
    return <svg
      aria-hidden="true"
      className={className}
      style={className ? undefined : { color: connector.color }}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      role="img"
    >
      <path fill="currentColor" d={brand.path}/>
    </svg>
  }
  const Icon = icons[connector.icon] || Zap
  return <Icon className={className} style={className ? undefined : { color: connector.color }} size={20} />
}
