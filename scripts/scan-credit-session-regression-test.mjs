import fs from 'node:fs'
import path from 'node:path'

const filePath = path.join(process.cwd(), 'src/pages/ScanPage.tsx')
const source = fs.readFileSync(filePath, 'utf8')

const hasStaleLocalStorageEmail = source.includes("localStorage.getItem('user_email')")
const hasAuthContextUsage = source.includes('useAuth()') || source.includes('useAuth')

if (hasStaleLocalStorageEmail) {
  console.error('❌ Regression: ScanPage still reads the stale user_email localStorage key.')
  process.exit(1)
}

if (!hasAuthContextUsage) {
  console.error('❌ Regression: ScanPage does not consume the authenticated user session.')
  process.exit(1)
}

console.log('✅ Scan credit/session regression guard passed.')
