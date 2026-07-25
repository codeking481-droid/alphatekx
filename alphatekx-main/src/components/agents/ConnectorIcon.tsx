import {
  Mail,
  FileSpreadsheet,
  Github,
  Linkedin,
  Twitter,
  Facebook,
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
import type { Connector } from '../../lib/agents/types'

const icons: Record<string, LucideIcon> = {
  mail: Mail,
  sheet: FileSpreadsheet,
  github: Github,
  linkedin: Linkedin,
  twitter: Twitter,
  facebook: Facebook,
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
  const Icon = icons[connector.icon] || Zap
  return <Icon className={className} style={{ color: connector.color }} size={20} />
}
