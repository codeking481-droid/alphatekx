import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AlphaTekX OS | Enterprise AI Operating System',
  description: 'AlphaTekX OS is the secure enterprise AI operating system for LinkedIn, Gmail, Discord, GitHub, Google Docs, and Google Sheets.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
