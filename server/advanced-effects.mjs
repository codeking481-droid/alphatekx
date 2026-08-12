/**
 * Advanced Video Effects Engine
 * Professional transitions, color grading, and dynamic effects
 */

import { spawnSync } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import path from 'node:path'

/**=== TRANSITIONS ===*/

export const TRANSITIONS = {
  fade: {
    name: 'fade',
    duration: 0.5,
    description: 'Smooth fade between clips',
  },
  dissolve: {
    name: 'dissolve',
    duration: 0.8,
    description: 'Smooth dissolve/crossfade',
  },
  slide: {
    name: 'slide',
    duration: 0.6,
    description: 'Sliding transition',
  },
  zoomcut: {
    name: 'zoomcut',
    duration: 0.3,
    description: 'Quick zoom cut (MrBeast style)',
  },
  whip: {
    name: 'whip',
    duration: 0.2,
    description: 'Fast whip transition',
  },
}

/**=== COLOR GRADING ===*/

export const COLOR_GRADES = {
  cinematic: {
    brightness: '-5',
    contrast: '1.2',
    saturation: '1.1',
    hue: '0',
    description: 'Cinematic look',
  },
  vibrant: {
    brightness: '5',
    contrast: '1.3',
    saturation: '1.4',
    hue: '0',
    description: 'Vibrant, energetic',
  },
  cool: {
    brightness: '0',
    contrast: '1.1',
    saturation: '0.9',
    hue: '-10',
    description: 'Cool blue tones',
  },
  warm: {
    brightness: '5',
    contrast: '1.0',
    saturation: '1.2',
    hue: '15',
    description: 'Warm, golden tones',
  },
  dramatic: {
    brightness: '-10',
    contrast: '1.5',
    saturation: '0.8',
    hue: '0',
    description: 'High contrast, dramatic',
  },
}

/**=== BUILD ADVANCED FILTER CHAIN ===*/

export function buildAdvancedFilterChain(options = {}) {
  const {
    width = 1920,
    height = 1080,
    colorGrade = 'vibrant',
    enableZoom = true,
    enableSubtitles = false,
    subtitleText = '',
    duration = 10,
  } = options

  const filters = []

  // 1. Scale to resolution
  filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`)

  // 2. Apply color grading
  const grade = COLOR_GRADES[colorGrade] || COLOR_GRADES.vibrant
  const colorFilter = `eq=brightness=${grade.brightness}/100:contrast=${grade.contrast}:saturation=${grade.saturation}:hue=${grade.hue}`
  filters.push(colorFilter)

  // 3. Add zoom punch effect (MrBeast style)
  if (enableZoom) {
    const zoomFilter = `zoompan=z='min(1.0 + 0.15 * abs(sin(t / 3 * 3.14159)), 1.15)':d=1:x='(w/2-(w/zoom/2))':y='(h/2-(h/zoom/2))':fps=30`
    filters.push(zoomFilter)
  }

  // 4. Add subtle sharpening
  filters.push('unsharp=5:5:1.0:5:5:0.0')

  // 5. Add vignette effect (edges darkened)
  filters.push(`vignette=PI/4:PI/4`)

  return filters.join(',')
}

/**=== APPLY TRANSITION BETWEEN CLIPS ===*/

export function buildTransitionFilterComplex(transition = 'fade', duration = 0.5) {
  const t = transition.name || transition

  switch (t) {
    case 'fade':
      return `xfade=transition=fade:duration=${duration}:offset=0`

    case 'dissolve':
      return `xfade=transition=dissolve:duration=${duration}:offset=0`

    case 'slide':
      return `xfade=transition=slideleft:duration=${duration}:offset=0`

    case 'zoomcut':
      return `xfade=transition=zoomin:duration=${duration}:offset=0`

    case 'whip':
      return `xfade=transition=wipebottom:duration=${duration}:offset=0`

    default:
      return `xfade=transition=fade:duration=${duration}:offset=0`
  }
}

/**=== DYNAMIC SUBTITLES ===*/

export function buildSubtitleFilter(startTime, endTime, text, fontSize = 36, position = 'middle') {
  // Escape special characters for FFmpeg drawtext
  const escaped = text.replace(/'/g, "'\\''").replace(/:/g, '\\:')

  const positionMap = {
    top: `x=(w-text_w)/2:y=50`,
    middle: `x=(w-text_w)/2:y=(h-text_h)/2`,
    bottom: `x=(w-text_w)/2:y=h-text_h-50`,
  }

  const yPos = positionMap[position] || positionMap.middle

  return `drawtext=text='${escaped}':fontsize=${fontSize}:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=8:${yPos}:enable='between(t,${startTime},${endTime})'`
}

/**=== DYNAMIC TEXT WITH ENTRANCE/EXIT ===*/

export function buildAnimatedTextFilter(text, startTime, endTime, fontSize = 48) {
  const escaped = text.replace(/'/g, "'\\''").replace(/:/g, '\\:')
  const duration = endTime - startTime

  // Text grows in (entrance effect)
  const entranceFrames = Math.ceil(duration * 0.15) // 15% of duration is entrance
  const exitFrames = Math.ceil(duration * 0.15) // 15% of duration is exit

  // Create growing text effect: fontsize grows from 0 to target
  return `drawtext=text='${escaped}':fontsize='min(${fontSize},${fontSize}*(t-${startTime})/${entranceFrames}*30)':fontcolor=white:box=1:boxcolor=black@0.7:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${startTime},${endTime})'`
}

/**=== LUT (COLOR LOOK-UP TABLE) APPLICATION ===*/

export function applyLUT(inputPath, outputPath, lutPath, tempDir) {
  // For advanced color grading with LUT files
  const args = [
    '-y',
    '-i', inputPath,
    '-vf', `lut3d='${lutPath}'`,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '20',
    outputPath,
  ]

  const result = spawnSync(String(ffmpegPath), args, { cwd: tempDir, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`LUT application failed: ${result.stderr || result.stdout}`)
  }
  return result
}

/**=== MOTION BLUR FOR DYNAMIC EFFECT ===*/

export function buildMotionBlurFilter() {
  return `split[a][b];[b]gblur=sigma=2[blurred];[a][blurred]blend=all_mode=screen:all_opacity=0.3`
}

/**=== LIGHT LEAK EFFECT ===*/

export function buildLightLeakFilter(intensity = 0.15) {
  return `colorbalance=rs=0.3:bs=${intensity}:rm=0.2`
}

/**=== PROFESSIONAL AUDIO DUCKING ===*/

export function buildAudioDuckingFilter() {
  // Lower background music when voiceover is playing
  return `[1:a]volume=0.3[voiced];[0:a]volume=0.15[music];[voiced][music]amix=inputs=2:duration=longest[audio]`
}

/**=== EXPORT WITH ALL EFFECTS ===*/

export async function applyAdvancedEffects(inputPath, outputPath, effectsConfig = {}) {
  const {
    colorGrade = 'vibrant',
    transition = 'fade',
    enableZoom = true,
    enableSharpening = true,
    duration = 10,
    width = 1920,
    height = 1080,
  } = effectsConfig

  const filterChain = buildAdvancedFilterChain({
    colorGrade,
    enableZoom,
    duration,
    width,
    height,
  })

  const args = [
    '-y',
    '-i', inputPath,
    '-vf', filterChain,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    outputPath,
  ]

  const result = spawnSync(String(ffmpegPath), args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`Advanced effects failed: ${result.stderr || result.stdout}`)
  }
  return result
}

/**=== QUALITY METRICS ===*/

export function detectBlackFrames(videoPath) {
  // FFmpeg to detect too-dark frames
  const args = [
    '-i', videoPath,
    '-vf', `blackdetect=d=0.5:pic_th=0.98`,
    '-f', 'null',
    '-',
  ]

  const result = spawnSync(String(ffmpegPath), args, { encoding: 'utf8' })
  const blackFrames = (result.stderr || '').match(/black_start=[\d.]+/g) || []
  return blackFrames.length
}

export function detectSilentAudio(videoPath) {
  // Detect periods of silence in audio
  const args = [
    '-i', videoPath,
    '-vf', `silencedetect=n=-50dB:d=0.5`,
    '-f', 'null',
    '-',
  ]

  const result = spawnSync(String(ffmpegPath), args, { encoding: 'utf8' })
  const silentPeriods = (result.stderr || '').match(/silence_end=[\d.]+/g) || []
  return silentPeriods.length
}
