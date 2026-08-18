// riskScorer.js — The Restore Engine
// Composite CVSS-style risk model for a completed scan. Blends exposure,
// credential severity, live-key proof, git-history poisoning and misconfigured
// builder infra into a single 0..100 score with a letter grade and the
// consequences a human actually cares about.

export function gradeFor(score) {
  if (score >= 80) return 'F'
  if (score >= 65) return 'D'
  if (score >= 50) return 'C'
  if (score >= 30) return 'B'
  return 'A'
}

export function verdictFor(score) {
  if (score >= 80) return 'CRITICAL'
  if (score >= 65) return 'HIGH'
  if (score >= 50) return 'MEDIUM'
  if (score >= 30) return 'LOW'
  return 'HEALTHY'
}

export function consequencesFor({ liveSecrets, exposedPaths, deletedSecretFiles, gitExposed, usesSupabase }) {
  const consequences = []
  if (liveSecrets >= 1) consequences.push('Attackers can spend your API credits / read your balance RIGHT NOW')
  if (liveSecrets >= 2) consequences.push('Paid-API harvesting: Stripe/Paystack/OpenAI accounts drained until revoked')
  if (deletedSecretFiles >= 1) consequences.push('Secrets were deleted from git but remain in history — full repo history is a credential mine')
  if (gitExposed) consequences.push('Live .git on the public site lets anyone download your full source history')
  if (exposedPaths >= 1) consequences.push('Internal files (.env, config) are publicly readable with a plain browser')
  if (usesSupabase) consequences.push('Supabase project footprint visible — targeted auth/schema attacks possible')
  return consequences
}

/**
 * Score a finished scan.
 * @param {object} parts
 * @param {Array} [parts.exposedPaths] exposed path findings
 * @param {Array} [parts.secrets] masked secret findings
 * @param {Array} [parts.liveSecrets] live-verified secrets
 * @param {Array} [parts.gitLeaks] local git leaks
 * @param {Array} [parts.commitMessages] commit messages containing secrets
 * @param {Array} [parts.deletedSecretFiles] credential files removed from history
 * @param {number} [parts.builderConfidence] 0..1
 * @param {boolean} [parts.usesSupabase]
 * @returns {{score:number, grade:string, verdict:string, subscores:object, consequences:string[]}}
 */
export function calculateRisk({
  exposedPaths = [],
  secrets = [],
  liveSecrets = [],
  gitLeaks = [],
  commitMessages = [],
  deletedSecretFiles = [],
  builderConfidence = 0,
  usesSupabase = false,
} = {}) {
  const exposedCount = Array.isArray(exposedPaths) ? exposedPaths.length : 0
  const secretCount = Array.isArray(secrets) ? secrets.length : 0
  const liveCount = Array.isArray(liveSecrets) ? liveSecrets.filter(s => s.isLive).length : 0

  const exposure = Math.min(40, exposedCount * 4 + (exposedCount > 0 ? 2 : 0))
  const credential = Math.min(30, liveCount * 12 + (secretCount - liveCount) * 2)
  const history = Math.min(20, deletedSecretFiles.length * 6 + commitMessages.length * 2 + gitLeaks.length * 3)
  const infra = Math.min(10, Math.round(builderConfidence * 6) + (usesSupabase ? 4 : 0))

  const score = Math.min(100, Math.round(exposure + credential + history + infra))

  return {
    score,
    grade: gradeFor(score),
    verdict: verdictFor(score),
    subscores: { exposure, credential, history, infra },
    consequences: consequencesFor({ liveSecrets: liveCount, exposedPaths: exposedCount, deletedSecretFiles: deletedSecretFiles.length, gitExposed: gitLeaks.length > 0, usesSupabase }),
  }
}

export default calculateRisk
