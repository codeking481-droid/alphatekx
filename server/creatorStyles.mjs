/**
 * CREATOR STYLE ENGINE
 * Predefined editing style profiles that map natural language requests
 * to specific FFmpeg parameters. This is how Alpha edits like MrBeast,
 * Nas Daily, and other pro creators.
 */

export const CREATOR_STYLES = {
  mrbeast: {
    name: 'MrBeast',
    description: 'Ultra-fast pacing, zoom punch-ins, bold text, high energy, zero dead air',
    cutsPerMinute: 30,
    avgCutDuration: 1.5,
    transitions: ['zoomcut', 'hard'],
    transitionDuration: 0.1,
    colorGrade: 'highContrast',
    saturation: 1.3,
    contrast: 1.25,
    brightness: 0.05,
    sharpen: 2.0,
    speedRamps: true,
    speedProfile: 'aggressive',
    textOverlays: true,
    textStyle: 'bold_centered',
    textFontSize: 64,
    textColor: 'white',
    textShadowColor: 'black',
    textShadowBlur: 8,
    captionStyle: 'word_highlight',
    captionFontSize: 48,
    captionColor: '#D6FF00',
    captionPosition: 'center',
    kenBurns: false,
    letterbox: false,
    filmGrain: false,
    audioDucking: true,
    audioNormalize: true,
    removeSilence: true,
    silenceThreshold: -35,
    minSilenceDuration: 0.3,
    addSfx: true,
    sfxOnCut: 'whoosh',
    frameRate: 60,
    resolution: '1080p',
  },

  nasdaily: {
    name: 'Nas Daily',
    description: '60s format, color-coded keywords, subtitle-first, direct-to-camera energy',
    cutsPerMinute: 20,
    avgCutDuration: 2.5,
    transitions: ['hard', 'fade'],
    transitionDuration: 0.15,
    colorGrade: 'warmVibrant',
    saturation: 1.2,
    contrast: 1.15,
    brightness: 0.08,
    sharpen: 1.5,
    speedRamps: false,
    textOverlays: true,
    textStyle: 'keyword_highlight',
    textFontSize: 56,
    textColor: '#FFD700',
    textShadowColor: 'black',
    textShadowBlur: 6,
    captionStyle: 'word_by_word',
    captionFontSize: 52,
    captionColor: 'white',
    captionPosition: 'center_bottom',
    kenBurns: false,
    letterbox: false,
    filmGrain: false,
    audioDucking: true,
    audioNormalize: true,
    removeSilence: true,
    silenceThreshold: -30,
    minSilenceDuration: 0.4,
    addSfx: false,
    frameRate: 30,
    resolution: '1080p',
  },

  cinematic: {
    name: 'Cinematic',
    description: 'Slow pacing, letterbox bars, film grain, warm color grade, smooth transitions',
    cutsPerMinute: 8,
    avgCutDuration: 5,
    transitions: ['crossfade', 'dissolve'],
    transitionDuration: 0.8,
    colorGrade: 'cinematicWarm',
    saturation: 0.9,
    contrast: 1.1,
    brightness: -0.02,
    sharpen: 1.0,
    speedRamps: false,
    textOverlays: false,
    textStyle: 'minimal',
    captionStyle: 'subtitle',
    captionFontSize: 36,
    captionColor: 'white',
    captionPosition: 'bottom',
    kenBurns: true,
    letterbox: true,
    letterboxRatio: 2.39,
    filmGrain: true,
    grainOpacity: 0.04,
    audioDucking: true,
    audioNormalize: true,
    removeSilence: false,
    addSfx: false,
    frameRate: 24,
    resolution: '1080p',
  },

  viral: {
    name: 'Viral / Shorts',
    description: 'Hook in first 0.5s, loop-friendly, fast cuts, trending energy',
    cutsPerMinute: 35,
    avgCutDuration: 1.2,
    transitions: ['hard', 'zoomcut', 'glitch'],
    transitionDuration: 0.08,
    colorGrade: 'highSaturation',
    saturation: 1.4,
    contrast: 1.3,
    brightness: 0.1,
    sharpen: 2.5,
    speedRamps: true,
    speedProfile: 'extreme',
    textOverlays: true,
    textStyle: 'bold_animated',
    textFontSize: 72,
    textColor: 'white',
    textShadowColor: '#D6FF00',
    textShadowBlur: 10,
    captionStyle: 'bounce',
    captionFontSize: 56,
    captionColor: '#D6FF00',
    captionPosition: 'center',
    kenBurns: false,
    letterbox: false,
    filmGrain: false,
    audioDucking: true,
    audioNormalize: true,
    removeSilence: true,
    silenceThreshold: -40,
    minSilenceDuration: 0.2,
    addSfx: true,
    sfxOnCut: 'impact',
    frameRate: 60,
    resolution: '1080p',
    verticalCrop: true,
    targetAspectRatio: '9:16',
  },

  minimal: {
    name: 'Minimalist',
    description: 'Clean cuts, no text, smooth transitions, neutral color grade',
    cutsPerMinute: 12,
    avgCutDuration: 4,
    transitions: ['crossfade'],
    transitionDuration: 0.5,
    colorGrade: 'neutral',
    saturation: 1.0,
    contrast: 1.0,
    brightness: 0,
    sharpen: 0.5,
    speedRamps: false,
    textOverlays: false,
    captionStyle: 'none',
    kenBurns: false,
    letterbox: false,
    filmGrain: false,
    audioDucking: true,
    audioNormalize: true,
    removeSilence: false,
    addSfx: false,
    frameRate: 30,
    resolution: '1080p',
  },

  documentary: {
    name: 'Documentary',
    description: 'Story-driven pacing, lower thirds, interview cuts, B-roll inserts',
    cutsPerMinute: 15,
    avgCutDuration: 3,
    transitions: ['crossfade', 'fade'],
    transitionDuration: 0.6,
    colorGrade: 'natural',
    saturation: 1.05,
    contrast: 1.1,
    brightness: 0,
    sharpen: 1.2,
    speedRamps: false,
    textOverlays: true,
    textStyle: 'lower_third',
    textFontSize: 40,
    textColor: 'white',
    textShadowColor: 'black',
    textShadowBlur: 4,
    captionStyle: 'subtitle',
    captionFontSize: 38,
    captionColor: 'white',
    captionPosition: 'bottom',
    kenBurns: true,
    letterbox: false,
    filmGrain: false,
    audioDucking: true,
    audioNormalize: true,
    removeSilence: true,
    silenceThreshold: -32,
    minSilenceDuration: 0.5,
    addSfx: false,
    frameRate: 30,
    resolution: '1080p',
  },
}

const STYLE_KEYWORDS = {
  mrbeast: ['mrbeast', 'mr beast', 'fast paced', 'high energy', 'hype', 'viral youtube', 'beast style', 'jimmy'],
  nasdaily: ['nas daily', '1 minute', 'one minute', 'subtitle style', 'keyword highlight', 'yellow text'],
  cinematic: ['cinematic', 'film', 'movie', 'dramatic', 'slow', 'letterbox', 'film grain', 'hollywood'],
  viral: ['viral', 'tiktok', 'reels', 'shorts', 'trending', 'loop', 'hook', 'snappy', 'fastest'],
  minimal: ['minimal', 'minimalist', 'clean', 'simple', 'subtle', 'quiet'],
  documentary: ['documentary', 'doc', 'interview', 'story', 'narrative', 'lower third'],
}

/**
 * Detect the best style from a user's natural language prompt.
 */
export function detectStyle(prompt) {
  const lower = prompt.toLowerCase()
  let bestMatch = null
  let bestScore = 0

  for (const [key, keywords] of Object.entries(STYLE_KEYWORDS)) {
    let score = 0
    for (const kw of keywords) {
      if (lower.includes(kw)) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestMatch = key
    }
  }

  return bestMatch ? CREATOR_STYLES[bestMatch] : CREATOR_STYLES.minimal
}

/**
 * Get a style by key name.
 */
export function getStyle(key) {
  return CREATOR_STYLES[key] || CREATOR_STYLES.minimal
}

/**
 * List all available styles with descriptions.
 */
export function listStyles() {
  return Object.entries(CREATOR_STYLES).map(([key, style]) => ({
    key,
    name: style.name,
    description: style.description,
  }))
}

/**
 * Build FFmpeg filter arguments from a style profile.
 * Returns an array of ffmpeg args for the video filter chain.
 */
export function buildFFmpegFilters(style) {
  const filters = []

  // Color grading
  const saturation = style.saturation || 1.0
  const contrast = style.contrast || 1.0
  const brightness = style.brightness || 0
  if (saturation !== 1.0 || contrast !== 1.0 || brightness !== 0) {
    filters.push(`eq=saturation=${saturation}:contrast=${contrast}:brightness=${brightness}`)
  }

  // Sharpen
  if (style.sharpen && style.sharpen > 0) {
    filters.push(`unsharp=5:5:${style.sharpen}:5:5:0`)
  }

  // Film grain
  if (style.filmGrain) {
    const opacity = style.grainOpacity || 0.03
    filters.push(`noise=alls=${opacity * 500}:allf=t+u`)
  }

  // Letterbox
  if (style.letterbox) {
    const ratio = style.letterboxRatio || 2.39
    const targetH = 1080
    const targetW = Math.round(targetH * ratio)
    filters.push(`pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:black`)
  }

  // Vertical crop for shorts/reels
  if (style.verticalCrop) {
    filters.push('crop=ih*9/16:ih:(iw-ih*9/16)/2:0')
    filters.push('scale=1080:1920')
  }

  return filters
}
