/**
 * Security Skills — Index
 * Lightweight scans for Render free tier (512MB RAM)
 */

export { secretScan } from './skills/secret-scan.mjs'
export { cveScan } from './skills/cve-scan.mjs'
export { xssScan } from './skills/xss-scan.mjs'
export { backdoorScan } from './skills/backdoor-scan.mjs'

import { secretScan } from './skills/secret-scan.mjs'
import { cveScan } from './skills/cve-scan.mjs'
import { xssScan } from './skills/xss-scan.mjs'
import { backdoorScan } from './skills/backdoor-scan.mjs'

/**
 * Run all security scans on a repo path.
 * Light — reads files from disk, no browser needed.
 */
export function runFullSecurityScan(repoPath) {
  const secrets = secretScan(repoPath)
  const cves = cveScan(repoPath)
  const xss = xssScan(repoPath)
  const backdoors = backdoorScan(repoPath)

  const allFindings = [...secrets, ...cves, ...xss, ...backdoors]
  const highRisk = allFindings.filter(f => f.risk === 'high').length
  const uniqueFiles = new Set(allFindings.map(f => f.file))

  return {
    passed: secrets.length === 0 && backdoors.length === 0,
    findings: allFindings,
    summary: {
      secrets: secrets.length,
      cves: cves.length,
      xss: xss.length,
      backdoors: backdoors.length,
      highRisk,
      filesScanned: uniqueFiles.size,
    },
  }
}
