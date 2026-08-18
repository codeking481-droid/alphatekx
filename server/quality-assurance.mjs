import { spawnSync } from 'node:child_process'
import { execSync } from 'node:child_process'
import fs from 'node:fs'

/**
 * Quality Assurance module for video validation and regeneration
 * Ensures every video meets professional standards
 */

/**
 * Check if video file exists and is valid
 */
export function validateVideoFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { valid: false, error: 'File does not exist' }
    const stat = fs.statSync(filePath)
    if (stat.size < 1000000) return { valid: false, error: 'File too small (< 1MB)', size: stat.size }
    return { valid: true, size: stat.size }
  } catch (e) {
    return { valid: false, error: String(e) }
  }
}

/**
 * Check video duration using ffprobe
 */
export function getVideoDuration(filePath) {
  try {
    const cmd = `ffprobe -v error -show_entries format=duration -of "default=noprint_wrappers=1:nokey=1:noprint_wrappers=1" "${filePath}"`
    const result = execSync(cmd, { encoding: 'utf8' }).trim()
    return parseFloat(result) || null
  } catch {
    return null
  }
}

/**
 * Detect black frames (quality issue)
 * Returns count of black frames
 */
export function detectBlackFrames(filePath) {
  try {
    // Use blackdetect filter to find frames with > 90% black
    const cmd = `ffmpeg -i "${filePath}" -f null -vf "blackdetect=d=0.1:pix_th=0.1" -y /dev/null 2>&1`
    const result = execSync(cmd, { encoding: 'utf8' })
    const matches = result.match(/black_start/g)
    return matches ? matches.length : 0
  } catch {
    return 0
  }
}

/**
 * Detect silent audio segments
 */
export function detectSilentAudio(filePath) {
  try {
    const cmd = `ffmpeg -i "${filePath}" -af "silencedetect=n=-40dB:d=1" -f null - 2>&1`
    const result = execSync(cmd, { encoding: 'utf8' })
    const matches = result.match(/silence_start/g)
    return matches ? matches.length : 0
  } catch {
    return 0
  }
}

/**
 * Detailed video analysis for quality metrics
 */
export function analyzeVideoQuality(filePath) {
  const fileCheck = validateVideoFile(filePath)
  if (!fileCheck.valid) {
    return { valid: false, error: fileCheck.error, metrics: {} }
  }

  const duration = getVideoDuration(filePath)
  const blackFrames = detectBlackFrames(filePath)
  const silentSegments = detectSilentAudio(filePath)

  return {
    valid: true,
    metrics: {
      fileSize: fileCheck.size,
      duration: duration || 0,
      blackFrames: blackFrames,
      silentSegments: silentSegments,
      qualityScore: calculateQualityScore(fileCheck.size, duration, blackFrames, silentSegments),
      issues: [
        blackFrames > 3 ? `⚠️ High black frame count: ${blackFrames}` : null,
        silentSegments > 2 ? `⚠️ Multiple silent segments: ${silentSegments}` : null,
        !duration || duration < 60 ? `⚠️ Video too short: ${duration}s (target: 60-120s)` : null,
        !duration || duration > 600 ? `⚠️ Video too long: ${duration}s (target: 60-600s)` : null,
      ].filter(Boolean),
    },
  }
}

/**
 * Calculate overall quality score (0-100)
 */
function calculateQualityScore(fileSize, duration, blackFrames, silentSegments) {
  let score = 100

  // Deduct for file size issues
  if (fileSize < 1000000) score -= 20 // Penalize small files
  if (fileSize < 500000) score -= 30 // Heavily penalize tiny files

  // Deduct for duration issues
  if (!duration || duration < 30) score -= 30
  if (duration > 600) score -= 10

  // Deduct for black frames
  score -= Math.min(blackFrames * 5, 30)

  // Deduct for silent segments
  score -= Math.min(silentSegments * 8, 25)

  return Math.max(0, Math.min(100, score))
}

/**
 * Check if video meets professional standards
 */
export function isProfessionalQuality(metrics) {
  const { qualityScore, issues } = metrics
  return qualityScore >= 75 && issues.length === 0
}

/**
 * Generate quality report
 */
export function generateQualityReport(metrics) {
  const { qualityScore, duration, blackFrames, silentSegments, issues } = metrics

  return {
    score: qualityScore,
    status: qualityScore >= 75 ? '✅ Professional' : qualityScore >= 50 ? '⚠️ Acceptable' : '❌ Needs Rework',
    duration: duration ? `${Math.round(duration)}s` : 'Unknown',
    blackFrames: blackFrames,
    silentSegments: silentSegments,
    issues: issues,
    recommendation: qualityScore >= 75 ? 'Ready to publish' : 'Regenerate problem clips',
  }
}

/**
 * Validate video pacing for YouTube algorithm optimization
 * Returns pacing analysis
 */
export function validatePacing(videoScript) {
  const targetPacePerScene = 3 // seconds per scene for engagement
  const minScenes = 10
  const maxScenes = 30

  if (!Array.isArray(videoScript)) {
    return {
      valid: false,
      error: 'Invalid script format',
      recommendation: 'Check script structure',
    }
  }

  const sceneCount = videoScript.length
  const pacingScore = Math.min(100, (sceneCount / maxScenes) * 100)

  return {
    valid: sceneCount >= minScenes && sceneCount <= maxScenes,
    sceneCount: sceneCount,
    pacingScore: pacingScore,
    recommendation:
      sceneCount < minScenes
        ? `Add ${minScenes - sceneCount} more scenes for better pacing`
        : sceneCount > maxScenes
          ? `Reduce to ${maxScenes} scenes for optimal engagement`
          : 'Pacing is optimal for YouTube algorithm',
  }
}

/**
 * Generate engagement hooks based on script
 * Finds high-impact moments for special effects/captions
 */
export function findEngagementHooks(videoScript) {
  const hooks = []

  if (!Array.isArray(videoScript)) return hooks

  for (const [index, scene] of videoScript.entries()) {
    const text = (scene.voiceoverText || '').toLowerCase()
    const keywords = ['amazing', 'shocking', 'wait', 'unbelievable', 'wow', 'epic', 'insane', 'crazy', 'incredible']

    const hasHook = keywords.some(kw => text.includes(kw))
    if (hasHook) {
      hooks.push({
        sceneIndex: index,
        text: scene.voiceoverText,
        suggestedEffect: 'zoom_punch', // Aggressive zoom effect
        suggestedCaption: text.substring(0, 50).toUpperCase() + '...',
      })
    }
  }

  return hooks
}

/**
 * Comprehensive quality check pipeline
 */
export async function runQualityCheckPipeline(videoPath, videoScript) {
  const fileValidation = validateVideoFile(videoPath)
  const analysis = analyzeVideoQuality(videoPath)
  const pacing = validatePacing(videoScript)
  const hooks = findEngagementHooks(videoScript)

  return {
    fileValidation: fileValidation,
    qualityAnalysis: analysis,
    pacingAnalysis: pacing,
    engagementHooks: hooks,
    overallQuality: isProfessionalQuality(analysis.metrics),
    report: generateQualityReport(analysis.metrics),
    readyToPublish: fileValidation.valid && analysis.metrics.qualityScore >= 75 && pacing.valid,
  }
}
