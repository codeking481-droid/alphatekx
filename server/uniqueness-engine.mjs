/**
 * Uniqueness Engine - Randomizes effects, music, clip arrangements
 * Ensures every video is unique even for the same prompt
 */

/**
 * Color grade randomization
 * Returns random but harmonious color grades
 */
export function randomizeColorGrade() {
  const colorGrades = [
    { name: 'vibrant', brightness: 0, contrast: 1.1, saturation: 1.3, hue: 0 },
    { name: 'cinematic', brightness: -0.1, contrast: 1.2, saturation: 0.9, hue: 0.02 },
    { name: 'cool', brightness: 0, contrast: 1.0, saturation: 1.0, hue: -0.05 },
    { name: 'warm', brightness: 0.05, contrast: 0.95, saturation: 1.1, hue: 0.08 },
    { name: 'dramatic', brightness: -0.15, contrast: 1.3, saturation: 0.8, hue: 0 },
    { name: 'neon', brightness: 0.1, contrast: 1.4, saturation: 1.5, hue: 0.1 },
    { name: 'moody', brightness: -0.2, contrast: 1.1, saturation: 0.7, hue: -0.03 },
  ]

  return colorGrades[Math.floor(Math.random() * colorGrades.length)]
}

/**
 * Transition type randomization
 */
export function randomizeTransition() {
  const transitions = ['fade', 'dissolve', 'slide', 'zoomcut', 'whip', 'blur']
  return transitions[Math.floor(Math.random() * transitions.length)]
}

/**
 * Text effect randomization (position, size, animation style)
 */
export function randomizeTextEffect() {
  const positions = ['top', 'center', 'bottom']
  const styles = ['fade_in', 'zoom_in', 'slide_left', 'slide_right', 'bounce']
  const sizes = [32, 40, 48, 56]

  return {
    position: positions[Math.floor(Math.random() * positions.length)],
    animation: styles[Math.floor(Math.random() * styles.length)],
    fontSize: sizes[Math.floor(Math.random() * sizes.length)],
    opacity: 0.8 + Math.random() * 0.2,
  }
}

/**
 * Randomize clip arrangement (shuffle order within constraints)
 */
export function randomizeClipArrangement(clips, constraints = {}) {
  const { minClipLength = 3, maxPermutations = 10 } = constraints

  // If not enough clips for meaningful shuffling, return as-is
  if (clips.length < minClipLength) return clips

  // Create a shuffled copy (Fisher-Yates shuffle)
  const shuffled = [...clips]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled
}

/**
 * Zoom effect randomization (punch, smooth, subtle)
 */
export function randomizeZoomEffect() {
  const zoomStyles = [
    { name: 'punch', startZoom: 1.0, endZoom: 1.15, duration: 3 }, // Aggressive
    { name: 'smooth', startZoom: 1.0, endZoom: 1.08, duration: 5 }, // Smooth
    { name: 'subtle', startZoom: 1.0, endZoom: 1.02, duration: 4 }, // Subtle
    { name: 'reverse', startZoom: 1.1, endZoom: 1.0, duration: 4 }, // Zoom out
  ]

  return zoomStyles[Math.floor(Math.random() * zoomStyles.length)]
}

/**
 * Audio mix randomization (music volume, SFX intensity)
 */
export function randomizeAudioMix() {
  return {
    musicVolume: 0.08 + Math.random() * 0.08, // 8-16%
    sfxVolume: 0.05 + Math.random() * 0.1, // 5-15%
    voiceVolume: 1.0, // Always full
    fadeInDuration: 0.5 + Math.random() * 0.5, // 0.5-1s
    fadeOutDuration: 0.3 + Math.random() * 0.7, // 0.3-1s
  }
}

/**
 * Caption/text overlay randomization
 */
export function randomizeTextOverlay() {
  const overlayStyles = [
    { frequency: 1, opacity: 0.7, bgcolor: 'rgba(0,0,0,0.3)' }, // Show on every scene
    { frequency: 0.5, opacity: 0.8, bgcolor: 'rgba(0,0,0,0.5)' }, // Every other scene
    { frequency: 0.33, opacity: 0.9, bgcolor: 'rgba(0,0,0,0.7)' }, // Every 3rd scene
  ]

  return overlayStyles[Math.floor(Math.random() * overlayStyles.length)]
}

/**
 * Generate unique random seed for reproducible randomization
 */
export function generateUniqueSeed() {
  return {
    timestamp: Date.now(),
    random: Math.random().toString(36).substring(2, 11),
    id: `unique_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
  }
}

/**
 * Create a unique variation config for a video
 */
export function createUniqueVariation(baseConfig = {}) {
  const seed = generateUniqueSeed()

  return {
    seed: seed.id,
    colorGrade: randomizeColorGrade(),
    transition: randomizeTransition(),
    textEffect: randomizeTextEffect(),
    zoomStyle: randomizeZoomEffect(),
    audioMix: randomizeAudioMix(),
    textOverlay: randomizeTextOverlay(),
    clipArrangement: 'randomized', // Marker for pipeline to apply shuffling
    timestamp: seed.timestamp,
    ...baseConfig,
  }
}

/**
 * Create multiple unique variations for A/B testing
 */
export function createVariations(count = 3, baseConfig = {}) {
  return Array.from({ length: count }, () => createUniqueVariation(baseConfig))
}

/**
 * Randomize scene voiceover (slight variations in pitch/speed)
 */
export function randomizeVoiceoverParams() {
  return {
    speed: 0.95 + Math.random() * 0.1, // 95-105% speed
    pitch: -2 + Math.random() * 4, // -2 to +2 semitones
    emphasis: Math.random() > 0.5, // Randomly emphasize certain words
  }
}

/**
 * Generate a variation descriptor for logging/tracking
 */
export function describeVariation(variation) {
  return `🎨 Variation: ${variation.seed.substring(0, 8)}... | Color: ${variation.colorGrade.name} | Transition: ${variation.transition} | Text: ${variation.textEffect.animation}`
}

/**
 * Randomize effect intensity (subtle to aggressive)
 */
export function randomizeEffectIntensity(baseIntensity = 1.0) {
  const intensityModifiers = [0.5, 0.75, 1.0, 1.25, 1.5]
  const modifier = intensityModifiers[Math.floor(Math.random() * intensityModifiers.length)]
  return baseIntensity * modifier
}

/**
 * Create variation metadata for tracking
 */
export function createVariationMetadata() {
  return {
    renderedAt: new Date().toISOString(),
    variations: {
      colorGrade: randomizeColorGrade().name,
      transition: randomizeTransition(),
      textAnimation: randomizeTextEffect().animation,
      zoomStyle: randomizeZoomEffect().name,
    },
    uniqueness: {
      seed: generateUniqueSeed().id,
      randomnessLevel: Math.random(), // 0-1 scale of how different this is
    },
  }
}
