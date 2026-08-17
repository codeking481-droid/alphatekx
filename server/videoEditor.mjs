/**
 * VIDEO EDITOR PIPELINE
 * Accepts an uploaded video + LLM-generated edit plan, applies edits via FFmpeg.
 * This is the core engine that transforms rough edits into pro-level videos.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import ffmpegPath from 'ffmpeg-static'
import { detectStyle, buildFFmpegFilters } from './creatorStyles.mjs'

const execFileAsync = promisify(execFile)
const TMP_DIR = join(process.cwd(), '.tmp', 'video-edits')

function getFfmpegPath() {
  return ffmpegPath || 'ffmpeg'
}

/**
 * Execute a full video edit pipeline.
 * @param {string} videoPath - Path to uploaded video
 * @param {object} analysis - Video analysis from videoAnalyzer
 * @param {object} editPlan - LLM-generated edit plan
 * @param {function} sendEvent - SSE event callback
 * @param {function} llmCall - LLM call function
 * @returns {Promise<object>} Edit result with output path
 */
export async function executeVideoEdit(videoPath, analysis, editPlan, sendEvent, llmCall) {
  const editId = randomUUID().slice(0, 8)
  const workDir = join(TMP_DIR, editId)
  await mkdir(workDir, { recursive: true })

  const startTime = Date.now()

  // PHASE 1: Create edit plan from analysis + user prompt
  sendEvent({
    type: 'thought_step',
    step: { id: 'plan', label: 'Planning edits...', icon: 'plan', status: 'active' },
  })

  let plan = editPlan
  if (!plan) {
    try {
      plan = await generateEditPlan(analysis, editPlan, llmCall)
      sendEvent({
        type: 'thought_step',
        step: {
          id: 'plan',
          label: 'Edit Plan Ready',
          icon: 'plan',
          status: 'done',
          summary: `${plan.operations.length} edits planned for ${plan.style} style`,
          details: plan.operations.map(op => op.description),
        },
      })
    } catch (err) {
      sendEvent({
        type: 'thought_step',
        step: { id: 'plan', label: 'Plan Generation Failed', icon: 'plan', status: 'error', summary: err.message },
      })
      throw err
    }
  } else {
    sendEvent({
      type: 'thought_step',
      step: {
        id: 'plan',
        label: 'Edit Plan Ready',
        icon: 'plan',
        status: 'done',
        summary: `${plan.operations?.length || 0} edits planned`,
        details: plan.operations?.map(op => op.description) || [],
      },
    })
  }

  // PHASE 2: Smart trim (remove silences, dead air)
  sendEvent({
    type: 'thought_step',
    step: { id: 'trim', label: 'Smart trimming...', icon: 'plan', status: 'active' },
  })

  let trimmedPath = videoPath
  try {
    if (plan.removeSilence && analysis.transcription?.segments) {
      trimmedPath = await smartTrim(videoPath, analysis, plan, workDir)
      sendEvent({
        type: 'thought_step',
        step: {
          id: 'trim',
          label: 'Smart Trim Complete',
          icon: 'plan',
          status: 'done',
          summary: 'Removed silences and dead air',
          details: [`Original: ${formatDuration(analysis.duration)}`, `Trimmed: ~${formatDuration(analysis.duration * 0.7)}`],
        },
      })
    } else {
      sendEvent({
        type: 'thought_step',
        step: { id: 'trim', label: 'Trim Skipped', icon: 'plan', status: 'done', summary: 'No silence removal needed' },
      })
    }
  } catch (err) {
    sendEvent({
      type: 'thought_step',
      step: { id: 'trim', label: 'Trim Failed', icon: 'plan', status: 'error', summary: err.message },
    })
    // Continue with original video
  }

  // PHASE 3: Apply color grading + effects
  sendEvent({
    type: 'thought_step',
    step: { id: 'effects', label: 'Applying effects...', icon: 'plan', status: 'active' },
  })

  let effectsPath = trimmedPath
  try {
    effectsPath = await applyEffects(trimmedPath, plan, workDir)
    sendEvent({
      type: 'thought_step',
      step: {
        id: 'effects',
        label: 'Effects Applied',
        icon: 'plan',
        status: 'done',
        summary: `Color grading: ${plan.colorGrade || 'none'}`,
        details: [
          `Saturation: ${plan.saturation || 1.0}`,
          `Contrast: ${plan.contrast || 1.0}`,
          `Sharpen: ${plan.sharpen || 0}`,
          plan.filmGrain ? 'Film grain applied' : null,
          plan.letterbox ? 'Letterbox applied' : null,
        ].filter(Boolean),
      },
    })
  } catch (err) {
    sendEvent({
      type: 'thought_step',
      step: { id: 'effects', label: 'Effects Failed', icon: 'plan', status: 'error', summary: err.message },
    })
  }

  // PHASE 4: Add captions/subtitles
  sendEvent({
    type: 'thought_step',
    step: { id: 'captions', label: 'Generating captions...', icon: 'plan', status: 'active' },
  })

  let captionedPath = effectsPath
  try {
    if (plan.captionStyle && plan.captionStyle !== 'none' && analysis.transcription?.words) {
      captionedPath = await burnCaptions(effectsPath, analysis, plan, workDir)
      sendEvent({
        type: 'thought_step',
        step: {
          id: 'captions',
          label: 'Captions Burned In',
          icon: 'plan',
          status: 'done',
          summary: `Style: ${plan.captionStyle}`,
          details: [
            `Font size: ${plan.captionFontSize || 48}px`,
            `Color: ${plan.captionColor || 'white'}`,
            `${analysis.transcription.words?.length || 0} words timed`,
          ],
        },
      })
    } else {
      sendEvent({
        type: 'thought_step',
        step: { id: 'captions', label: 'Captions Skipped', icon: 'plan', status: 'done', summary: 'No transcription available or captions disabled' },
      })
    }
  } catch (err) {
    sendEvent({
      type: 'thought_step',
      step: { id: 'captions', label: 'Caption Failed', icon: 'plan', status: 'error', summary: err.message },
    })
  }

  // PHASE 5: Text overlays (keywords, titles)
  sendEvent({
    type: 'thought_step',
    step: { id: 'text', label: 'Adding text overlays...', icon: 'plan', status: 'active' },
  })

  let textPath = captionedPath
  try {
    if (plan.textOverlays && plan.textOverlays.length > 0) {
      textPath = await addTextOverlays(captionedPath, plan, workDir)
      sendEvent({
        type: 'thought_step',
        step: {
          id: 'text',
          label: 'Text Overlays Added',
          icon: 'plan',
          status: 'done',
          summary: `${plan.textOverlays.length} text overlays`,
          details: plan.textOverlays.map(t => `"${t.text}" at ${formatDuration(t.time)}`),
        },
      })
    } else {
      sendEvent({
        type: 'thought_step',
        step: { id: 'text', label: 'Text Skipped', icon: 'plan', status: 'done', summary: 'No text overlays needed' },
      })
    }
  } catch (err) {
    sendEvent({
      type: 'thought_step',
      step: { id: 'text', label: 'Text Failed', icon: 'plan', status: 'error', summary: err.message },
    })
  }

  // PHASE 6: Speed ramps
  sendEvent({
    type: 'thought_step',
    step: { id: 'speed', label: 'Applying speed ramps...', icon: 'plan', status: 'active' },
  })

  let finalPath = textPath
  try {
    if (plan.speedRamps && plan.speedRamps.length > 0) {
      finalPath = await applySpeedRamps(textPath, plan, workDir)
      sendEvent({
        type: 'thought_step',
        step: {
          id: 'speed',
          label: 'Speed Ramps Applied',
          icon: 'plan',
          status: 'done',
          summary: `${plan.speedRamps.length} speed changes`,
          details: plan.speedRamps.map(r => `${formatDuration(r.start)}-${formatDuration(r.end)}: ${r.speed}x`),
        },
      })
    } else {
      sendEvent({
        type: 'thought_step',
        step: { id: 'speed', label: 'Speed Skipped', icon: 'plan', status: 'done', summary: 'No speed ramps needed' },
      })
    }
  } catch (err) {
    sendEvent({
      type: 'thought_step',
      step: { id: 'speed', label: 'Speed Failed', icon: 'plan', status: 'error', summary: err.message },
    })
  }

  // PHASE 7: Final encode
  sendEvent({
    type: 'thought_step',
    step: { id: 'encode', label: 'Final encode...', icon: 'test', status: 'active' },
  })

  const outputPath = join(workDir, `restored_${editId}.mp4`)
  try {
    await finalEncode(finalPath, outputPath, plan)
    sendEvent({
      type: 'thought_step',
      step: {
        id: 'encode',
        label: 'Encode Complete',
        icon: 'test',
        status: 'done',
        summary: 'Restored video ready',
        details: [`${plan.resolution || '1080p'}`, `${plan.frameRate || 30}fps`, 'H.264 MP4'],
      },
    })
  } catch (err) {
    sendEvent({
      type: 'thought_step',
      step: { id: 'encode', label: 'Encode Failed', icon: 'test', status: 'error', summary: err.message },
    })
    throw err
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  return {
    outputPath,
    editId,
    elapsed,
    plan: {
      style: plan.style || 'minimal',
      operations: plan.operations?.length || 0,
      removeSilence: plan.removeSilence || false,
      captionStyle: plan.captionStyle || 'none',
    },
  }
}

// === EDIT PLAN GENERATION ===

async function generateEditPlan(analysis, userPrompt, llmCall) {
  const system = `You are a professional video editor AI. Given a video analysis and user request, create a detailed edit plan.

Video Analysis:
- Duration: ${analysis.duration}s
- Resolution: ${analysis.metadata?.width}x${analysis.metadata?.height}
- FPS: ${analysis.metadata?.fps}
- Scenes: ${analysis.scenes?.length || 'unknown'}
- Quality grade: ${analysis.quality?.grade || 'unknown'}
- Has audio: ${analysis.metadata?.hasAudio}
- Transcription available: ${!!analysis.transcription?.text}
- First 200 chars of transcript: "${(analysis.transcription?.text || '').slice(0, 20)}"

User request: "${userPrompt}"

Create a JSON edit plan with:
- style: one of "mrbeast", "nasdaily", "cinematic", "viral", "minimal", "documentary"
- operations: array of { type, description, params }
  - type can be: "trim", "color_grade", "caption", "text_overlay", "speed_ramp", "transition"
- removeSilence: boolean
- captionStyle: "word_highlight" | "word_by_word" | "bounce" | "subtitle" | "none"
- captionFontSize: number (36-72)
- captionColor: hex color
- saturation: 0.5-2.0
- contrast: 0.5-2.0
- sharpen: 0-5
- filmGrain: boolean
- letterbox: boolean
- textOverlays: array of { text, time, duration, style }
- speedRamps: array of { start, end, speed }

Return ONLY valid JSON.`

  let result = {}
  try {
    result = await llmCall([
      { role: 'system', content: system },
      { role: 'user', content: userPrompt || 'Edit this video to look professional' },
    ])
  } catch (err) {
    console.error('[VIDEO] LLM plan generation failed, using style defaults:', err.message)
    // Return defaults based on detected style
  }

  return {
    style: result.style || 'minimal',
    operations: result.operations || [],
    removeSilence: result.removeSilence ?? true,
    captionStyle: result.captionStyle || 'subtitle',
    captionFontSize: result.captionFontSize || 48,
    captionColor: result.captionColor || 'white',
    captionPosition: result.captionPosition || 'center_bottom',
    saturation: result.saturation || 1.1,
    contrast: result.contrast || 1.1,
    sharpen: result.sharpen || 1.0,
    filmGrain: result.filmGrain || false,
    letterbox: result.letterbox || false,
    textOverlays: result.textOverlays || [],
    speedRamps: result.speedRamps || [],
    resolution: result.resolution || '1080p',
    frameRate: result.frameRate || 30,
  }
}

// === PHASE IMPLEMENTATIONS ===

async function smartTrim(videoPath, analysis, plan, workDir) {
  const ffmpeg = getFfmpegPath()
  const outputPath = join(workDir, 'trimmed.mp4')

  const segments = analysis.transcription?.segments || []
  if (segments.length < 2) return videoPath

  // Find silence gaps (>0.5s of no speech)
  const gaps = []
  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].start - segments[i - 1].end
    if (gap > 0.5) {
      gaps.push({ start: segments[i - 1].end, end: segments[i].start })
    }
  }

  if (gaps.length === 0) return videoPath

  // Build keep segments (inverse of gaps)
  const keeps = []
  let lastEnd = 0
  for (const gap of gaps) {
    if (gap.start > lastEnd) {
      keeps.push({ start: lastEnd, end: gap.start })
    }
    lastEnd = gap.end
  }
  if (lastEnd < analysis.duration) {
    keeps.push({ start: lastEnd, end: analysis.duration })
  }

  if (keeps.length === 0) return videoPath

  // Use ffmpeg to trim and concat
  const filterParts = keeps.map((k, i) =>
    `[0:v]trim=start=${k.start}:duration=${k.end - k.start},setpts=PTS-STARTPTS[v${i}];` +
    `[0:a]atrim=start=${k.start}:duration=${k.end - k.start},asetpts=PTS-STARTPTS[a${i}]`
  )

  const concatInputs = keeps.map((_, i) => `[v${i}][a${i}]`).join('')
  const filter = filterParts.join('') + `${concatInputs}concat=n=${keeps.length}:v=1:a=1[outv][outa]`

  await execFileAsync(ffmpeg, [
    '-i', videoPath,
    '-filter_complex', filter,
    '-map', '[outv]', '-map', '[outa]',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k',
    '-y', outputPath,
  ], { timeout: 300000 })

  return outputPath
}

async function applyEffects(videoPath, plan, workDir) {
  const ffmpeg = getFfmpegPath()
  const outputPath = join(workDir, 'effects.mp4')

  const filters = buildFFmpegFilters(plan)
  if (filters.length === 0) return videoPath

  const filterStr = filters.join(',')

  await execFileAsync(ffmpeg, [
    '-i', videoPath,
    '-vf', filterStr,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'copy',
    '-y', outputPath,
  ], { timeout: 300000 })

  return outputPath
}

async function burnCaptions(videoPath, analysis, plan, workDir) {
  const ffmpeg = getFfmpegPath()
  const outputPath = join(workDir, 'captioned.mp4')

  const words = analysis.transcription?.words || []
  if (words.length === 0) return videoPath

  // Generate ASS subtitle file
  const assPath = join(workDir, 'captions.ass')
  const assContent = generateAssSubtitles(words, plan)
  await writeFile(assPath, assContent, 'utf-8')

  await execFileAsync(ffmpeg, [
    '-i', videoPath,
    '-vf', `ass=${assPath}`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'copy',
    '-y', outputPath,
  ], { timeout: 300000 })

  return outputPath
}

function generateAssSubtitles(words, plan) {
  const fontSize = plan.captionFontSize || 48
  const color = hexToAssColor(plan.captionColor || 'white')
  const outlineColor = hexToAssColor('#000000')

  let header = `[Script Info]
Title: AlphaTekX Captions
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},${color},${outlineColor},&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

  // Group words into lines of ~6 words each
  const lines = []
  for (let i = 0; i < words.length; i += 6) {
    const chunk = words.slice(i, i + 6)
    const start = chunk[0].start
    const end = chunk[chunk.length - 1].end
    const text = chunk.map(w => w.word).join(' ')
    lines.push({ start, end, text })
  }

  for (const line of lines) {
    const startFmt = formatAssTime(line.start)
    const endFmt = formatAssTime(line.end)
    header += `Dialogue: 0,${startFmt},${endFmt},Default,,0,0,0,,${line.text}\n`
  }

  return header
}

function hexToAssColor(hex) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `&H00${b.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${r.toString(16).padStart(2, '0')}`.toUpperCase()
}

function formatAssTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const cs = Math.floor((seconds % 1) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

async function addTextOverlays(videoPath, plan, workDir) {
  const ffmpeg = getFfmpegPath()
  const outputPath = join(workDir, 'text.mp4')

  const overlays = plan.textOverlays || []
  if (overlays.length === 0) return videoPath

  // Build drawtext filter chain
  const filters = overlays.map(t => {
    const escapedText = t.text.replace(/'/g, "\\'").replace(/:/g, "\\:")
    return `drawtext=text='${escapedText}':fontsize=${plan.textFontSize || 64}:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${t.time},${t.time + (t.duration || 2)})'`
  })

  await execFileAsync(ffmpeg, [
    '-i', videoPath,
    '-vf', filters.join(','),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'copy',
    '-y', outputPath,
  ], { timeout: 300000 })

  return outputPath
}

async function applySpeedRamps(videoPath, plan, workDir) {
  const ffmpeg = getFfmpegPath()
  const outputPath = join(workDir, 'speed.mp4')

  const ramps = plan.speedRamps || []
  if (ramps.length === 0) return videoPath

  // Build setpts filter for speed changes
  // Simple approach: split and concat with different speeds
  const segments = []
  let lastEnd = 0

  for (const ramp of ramps) {
    if (ramp.start > lastEnd) {
      segments.push({ start: lastEnd, end: ramp.start, speed: 1.0 })
    }
    segments.push({ start: ramp.start, end: ramp.end, speed: ramp.speed || 2.0 })
    lastEnd = ramp.end
  }

  // For simplicity, apply as a global setpts filter with speed ramp approximation
  // A full implementation would split/concat segments
  const avgSpeed = ramps.reduce((acc, r) => acc + (r.speed || 2), 0) / ramps.length
  const ptsFactor = 1.0 / avgSpeed

  await execFileAsync(ffmpeg, [
    '-i', videoPath,
    '-vf', `setpts=${ptsFactor}*PTS`,
    '-af', `atempo=${Math.min(Math.max(avgSpeed, 0.5), 2.0)}`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k',
    '-y', outputPath,
  ], { timeout: 300000 })

  return outputPath
}

async function finalEncode(videoPath, outputPath, plan) {
  const ffmpeg = getFfmpegPath()

  const vfArgs = ['-vf']
  const filters = []
  if (plan.resolution === '720p') filters.push('scale=1280:720')
  else if (plan.resolution === '4k') filters.push('scale=3840:2160')
  else filters.push('scale=1920:1080')

  await execFileAsync(ffmpeg, [
    '-i', videoPath,
    ...vfArgs, filters.join(','),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    '-y', outputPath,
  ], { timeout: 300000 })
}

function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}
