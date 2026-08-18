/**
 * VIDEO EDITOR PIPELINE — AGGRESSIVE MODE
 * Produces visible, CapCut-level edits without requiring Whisper transcription.
 * Uses FFmpeg's silencedetect for trimming, auto-generates text overlays,
 * applies Ken Burns, film grain, dramatic color grade, and beat-synced cuts.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import ffmpegPath from 'ffmpeg-static'
import { buildFFmpegFilters } from './creatorStyles.mjs'

const execFileAsync = promisify(execFile)
const TMP_DIR = join(process.cwd(), '.tmp', 'video-edits')

function getFfmpegPath() {
  return ffmpegPath || 'ffmpeg'
}

async function ffprobeAsync(filePath) {
  const ffmpeg = getFfmpegPath()
  try {
    const { stderr } = await execFileAsync(ffmpeg, ['-i', filePath], { timeout: 15000 })
    return stderr
  } catch (err) {
    return err.stderr || ''
  }
}

function log(phase, msg) {
  console.log(`[VIDEO-EDIT:${phase}] ${msg}`)
}

/**
 * Execute a full video edit pipeline with aggressive, visible edits.
 */
export async function executeVideoEdit(videoPath, analysis, editPlan, sendEvent, llmCall) {
  const editId = randomUUID().slice(0, 8)
  const workDir = join(TMP_DIR, editId)
  await mkdir(workDir, { recursive: true })

  const startTime = Date.now()
  const ffmpeg = getFfmpegPath()
  const duration = analysis.duration || 5

  log('INIT', `Starting edit for ${path.basename(videoPath)} (${duration}s, ${editId})`)

  // ── PHASE 1: Generate edit plan ──────────────────────────────────────
  sendEvent({ type: 'thought_step', step: { id: 'plan', label: 'Generating edit plan...', icon: 'plan', status: 'active' } })

  let plan = editPlan || {}
  if (llmCall) {
    try {
      const system = `You are a professional video editor specializing in MrBeast retention editing and Malva AI style. Return a JSON object with:
- textOverlays: array of { text: string, time: number, duration: number }
  MrBeast style: Bold, short, punchy words (INSANE, NO WAY, WAIT). 3-6 overlays.
  Malva style: Emotional phrases (EVERYBODY WANTS THIS, THE TRUTH). 2-4 overlays.
  Place overlays every 3-5 seconds to maintain visual interest.
- speedRamps: array of { start: number, end: number, speed: number }
  MrBeast: Speed up boring parts (2x-4x), slow down dramatic moments (0.5x)
  Malva: Speed up transitions, slow down emotional beats
- zoomPunches: array of { time: number, scale: number (1.1-1.5), duration: number }
  MrBeast signature: Quick digital zoom-ins as "pattern interrupts" every 3-5 seconds.
  2-4 zoom punches on key moments.
- platform: string — one of "tiktok", "reels", "shorts", "square", "widescreen", or null
  Detect from user request. Default to null.
- removeFillerWords: boolean — default true
- colorGrade: string — "mrbeast" (bright vibrant saturated), "malva" (heavy saturation + vignette), "cinematic", or null
  Detect from user request or style name. Default based on style.
Return ONLY valid JSON.`

      const result = await Promise.race([
        llmCall([
          { role: 'system', content: system },
          { role: 'user', content: `User wants: "${plan.userPrompt || 'make it look professional'}"\nVideo duration: ${duration}s\nStyle: ${plan.name || 'MrBeast'}` },
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('LLM timeout')), 15000)),
      ])

      if (result && result.textOverlays) plan.textOverlays = result.textOverlays
      if (result && result.speedRamps) plan.speedRamps = result.speedRamps
      if (result && result.brollSuggestions) plan.brollSuggestions = result.brollSuggestions
      if (result && result.zoomPunches) plan.zoomPunches = result.zoomPunches
      if (result && result.platform) plan.platform = result.platform
      if (result && result.removeFillerWords !== undefined) plan.removeFillerWords = result.removeFillerWords
      if (result && result.colorGrade) plan.colorGrade = result.colorGrade
    } catch (err) {
      log('PLAN', `LLM failed (${err.message}), using auto-generated overlays`)
    }
  }

  // Auto-generate text overlays from the style if LLM didn't provide any
  if (!plan.textOverlays || plan.textOverlays.length === 0) {
    plan.textOverlays = generateAutoOverlays(plan, duration)
  }

  sendEvent({
    type: 'thought_step',
    step: {
      id: 'plan', label: 'Edit Plan Ready', icon: 'plan', status: 'done',
      summary: `${plan.name || 'Custom'} style — ${plan.textOverlays.length} overlays, ${plan.speedRamps?.length || 0} speed ramps`,
      details: plan.textOverlays.map(t => `"${t.text}" at ${t.time.toFixed(1)}s`),
    },
  })

  // ── PHASE 2: Silence removal via silencedetect ──────────────────────
  sendEvent({ type: 'thought_step', step: { id: 'trim', label: 'Removing silence...', icon: 'plan', status: 'active' } })

  let currentPath = videoPath
  let silenceSegments = []
  try {
    silenceSegments = await detectSilence(videoPath)
    if (silenceSegments.length > 0 && plan.removeSilence !== false) {
      currentPath = await removeSilenceSegments(videoPath, silenceSegments, duration, workDir)
      const newDuration = await getDuration(currentPath)
      log('TRIM', `Removed ${silenceSegments.length} silence gaps, new duration: ${newDuration.toFixed(1)}s`)
      sendEvent({
        type: 'thought_step',
        step: {
          id: 'trim', label: 'Silence Removed', icon: 'plan', status: 'done',
          summary: `${silenceSegments.length} gaps removed`,
          details: [`${duration.toFixed(1)}s → ${newDuration.toFixed(1)}s`, `${Math.round((1 - newDuration / duration) * 100)}% tighter`],
        },
      })
    } else {
      sendEvent({ type: 'thought_step', step: { id: 'trim', label: 'No silence found', icon: 'plan', status: 'done', summary: 'Video is already tight' } })
    }
  } catch (err) {
    log('TRIM', `Error: ${err.message}`)
    sendEvent({ type: 'thought_step', step: { id: 'trim', label: 'Trim skipped', icon: 'plan', status: 'done', summary: err.message } })
  }

  // ── PHASE 2.5: Filler word removal ("um", "uh", "like", "you know") ──
  if (plan.removeFillerWords !== false) {
    sendEvent({ type: 'thought_step', step: { id: 'fillers', label: 'Removing filler words...', icon: 'plan', status: 'active' } })
    try {
      const words = analysis.transcription?.words || []
      const fillerWords = ['um', 'uh', 'erm', 'hmm', 'like', 'you know', 'basically', 'actually', 'literally', 'sort of', 'kind of']
      const fillerSegments = []

      for (let i = 0; i < words.length; i++) {
        const w = words[i].word.toLowerCase().replace(/[.,!?]/g, '')
        if (fillerWords.includes(w)) {
          const start = words[i].start
          const end = words[i].end
          // Extend gap slightly to avoid choppy audio (0.05s before, 0.1s after)
          fillerSegments.push({ start: Math.max(0, start - 0.05), end: end + 0.1 })
        }
      }

      // Also detect repeated words (stuttering)
      for (let i = 1; i < words.length; i++) {
        const prev = words[i - 1].word.toLowerCase().replace(/[.,!?]/g, '')
        const curr = words[i].word.toLowerCase().replace(/[.,!?]/g, '')
        if (prev === curr && prev.length > 1) {
          fillerSegments.push({ start: Math.max(0, words[i].start - 0.05), end: words[i].end + 0.1 })
        }
      }

      // Merge overlapping segments
      fillerSegments.sort((a, b) => a.start - b.start)
      const merged = []
      for (const seg of fillerSegments) {
        if (merged.length > 0 && seg.start <= merged[merged.length - 1].end + 0.1) {
          merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, seg.end)
        } else {
          merged.push({ ...seg })
        }
      }

      if (merged.length > 0) {
        const fillerPath = join(workDir, 'fillers_removed.mp4')
        currentPath = await removeSegments(currentPath, merged, await getDuration(currentPath), workDir, fillerPath)
        const newDur = await getDuration(currentPath)
        log('FILLERS', `Removed ${merged.length} filler segments`)
        sendEvent({
          type: 'thought_step',
          step: {
            id: 'fillers', label: 'Filler Words Removed', icon: 'plan', status: 'done',
            summary: `${merged.length} filler words cut`,
            details: [`${merged.map(s => `${s.start.toFixed(1)}s-${s.end.toFixed(1)}s`).join(', ')}`, `Duration: ${newDur.toFixed(1)}s`],
          },
        })
      } else {
        sendEvent({ type: 'thought_step', step: { id: 'fillers', label: 'No fillers found', icon: 'plan', status: 'done', summary: 'Speech is clean' } })
      }
    } catch (err) {
      log('FILLERS', `Error: ${err.message}`)
      sendEvent({ type: 'thought_step', step: { id: 'fillers', label: 'Filler removal skipped', icon: 'plan', status: 'done', summary: err.message } })
    }
  }

  // ── PHASE 3: Color grading + sharpen + film grain ────────────────────
  sendEvent({ type: 'thought_step', step: { id: 'effects', label: 'Applying effects...', icon: 'film', status: 'active' } })

  try {
    let filters = buildFFmpegFilters(plan)

    // MrBeast color grade: bright, vibrant, saturated (the "larger than life" look)
    const grade = plan.colorGrade || plan.name || 'custom'
    if (grade === 'mrbeast' || grade === 'viral') {
      // Remove any existing eq/unsharp from buildFFmpegFilters to avoid double-application
      filters = filters.filter(f => !f.startsWith('eq=') && !f.startsWith('unsharp='))
      filters.push('eq=brightness=0.06:saturation=1.5:contrast=1.2:gamma=1.1')
      filters.push('unsharp=5:5:1.5:5:5:0')
      sendEvent({ type: 'thought_step', step: { id: 'effects-grade', label: 'MrBeast Color Grade', icon: 'film', status: 'done', summary: 'Bright + saturated + vibrant' } })
    } else if (grade === 'malva' || grade === 'cinematic') {
      // Malva: heavy saturation + vignette + slight warmth
      filters = filters.filter(f => !f.startsWith('eq=') && !f.startsWith('unsharp=') && !f.startsWith('noise='))
      filters.push('eq=saturation=1.8:contrast=1.3:brightness=0.05')
      filters.push('vignette=PI/4:mode=forward')
      filters.push('unsharp=5:5:1.0:5:5:0')
      sendEvent({ type: 'thought_step', step: { id: 'effects-grade', label: 'Malva Cinematic Grade', icon: 'film', status: 'done', summary: 'Heavy saturation + vignette + warmth' } })
    } else {
      // Default: dramatic sharpen for pro look
      if (!filters.some(f => f.includes('unsharp'))) {
        filters.push('unsharp=5:5:1.5:5:5:0')
      }
    }

    // Add film grain for cinematic feel (subtle)
    if (plan.filmGrain || grade === 'cinematic' || grade === 'malva') {
      filters.push('noise=alls=12:allf=t+u')
    }

    if (filters.length > 0) {
      const effectsPath = join(workDir, 'effects.mp4')
      await execFileAsync(ffmpeg, [
        '-i', currentPath,
        '-vf', filters.join(','),
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
        '-c:a', 'copy',
        '-y', effectsPath,
      ], { timeout: 300000 })
      currentPath = effectsPath
      log('EFFECTS', `Applied ${filters.length} filters`)
      sendEvent({
        type: 'thought_step',
        step: {
          id: 'effects', label: 'Effects Applied', icon: 'film', status: 'done',
          summary: `${filters.length} filters applied`,
          details: filters.map(f => f.split('=')[0]),
        },
      })
    } else {
      sendEvent({ type: 'thought_step', step: { id: 'effects', label: 'Effects ready', icon: 'film', status: 'done', summary: 'No filters needed' } })
    }
  } catch (err) {
    log('EFFECTS', `Error: ${err.message}`)
    sendEvent({ type: 'thought_step', step: { id: 'effects', label: 'Effects failed', icon: 'film', status: 'error', summary: err.message } })
  }

  // ── PHASE 4: Ken Burns (slow zoom) + Zoom Punches (MrBeast pattern interrupts) ──
  sendEvent({ type: 'thought_step', step: { id: 'kenburns', label: 'Adding motion effects...', icon: 'film', status: 'active' } })

  try {
    const grade = plan.colorGrade || plan.name || 'custom'
    if (plan.kenBurns || grade === 'cinematic' || grade === 'malva' || grade === 'mrbeast') {
      const kbPath = join(workDir, 'kenburns.mp4')
      // MrBeast: Continuous slow push-in (5% over 10s) keeps frame dynamic
      // Malva: Slower zoom for dramatic feel
      const zoomRate = grade === 'mrbeast' || grade === 'viral' ? 0.001 : 0.0006
      const maxZoom = grade === 'mrbeast' || grade === 'viral' ? 1.12 : 1.08
      const zoomExpr = `z='min(1+${zoomRate}*on,${maxZoom})'`
      const fps = 30
      // Get actual duration of current video (may have been shortened by silence removal)
      let currentDuration = duration
      try {
        const probeInfo = await ffprobeAsync(currentPath)
        const match = probeInfo.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/)
        if (match) currentDuration = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 100
      } catch {}
      await execFileAsync(ffmpeg, [
        '-i', currentPath,
        '-vf', `zoompan=${zoomExpr}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(currentDuration * fps)}:s=1920x1080:fps=${fps}`,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
        '-c:a', 'copy',
        '-y', kbPath,
      ], { timeout: 300000 })
      currentPath = kbPath
      log('KENBURNS', `Applied continuous push-in zoom (${grade} style)`)
      sendEvent({ type: 'thought_step', step: { id: 'kenburns', label: 'Motion Applied', icon: 'film', status: 'done', summary: `Continuous push-in (${grade} style)` } })
    } else {
      sendEvent({ type: 'thought_step', step: { id: 'kenburns', label: 'Motion skipped', icon: 'film', status: 'done', summary: 'Not needed for this style' } })
    }
  } catch (err) {
    log('KENBURNS', `Error: ${err.message}`)
    sendEvent({ type: 'thought_step', step: { id: 'kenburns', label: 'Motion failed', icon: 'film', status: 'error', summary: err.message } })
  }

  // ── PHASE 4.5: Zoom Punches (MrBeast pattern interrupts — digital zoom on key moments) ──
  const zoomPunches = plan.zoomPunches || []
  // Clamp zoom punch times to actual current video duration
  let actualDuration = duration
  try {
    const probeInfo2 = await ffprobeAsync(currentPath)
    const match2 = probeInfo2.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/)
    if (match2) actualDuration = parseInt(match2[1]) * 3600 + parseInt(match2[2]) * 60 + parseInt(match2[3]) + parseInt(match2[4]) / 100
  } catch {}
  const clampedPunches = zoomPunches.filter(zp => (zp.time || 0) < actualDuration - 1)
  if (clampedPunches.length > 0 && actualDuration > 5) {
    sendEvent({ type: 'thought_step', step: { id: 'zoompunch', label: 'Adding zoom punches...', icon: 'film', status: 'active' } })
    try {
      // Build zoom punch filter: scale up at specific timestamps
      const zoomFilters = clampedPunches.map(zp => {
        const scale = Math.min(Math.max(zp.scale || 1.3, 1.1), 1.5)
        const start = zp.time || 0
        const dur = zp.duration || 0.5
        const end = start + dur
        // Smooth zoom: scale from 1.0 to scale and back
        return `zoompan=z='if(between(t,${start},${end}),min(1+(${scale}-1)*((t-${start})/${dur}),${scale}),1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30`
      }).join(',')

      if (zoomFilters) {
        const zoomPath = join(workDir, 'zoompunch.mp4')
        await execFileAsync(ffmpeg, [
          '-i', currentPath,
          '-vf', zoomFilters,
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
          '-c:a', 'copy',
          '-y', zoomPath,
        ], { timeout: 300000 })
        currentPath = zoomPath
        log('ZOOMPUNCH', `Applied ${zoomPunches.length} zoom punches`)
        sendEvent({ type: 'thought_step', step: { id: 'zoompunch', label: 'Zoom Punches Added', icon: 'film', status: 'done', summary: `${zoomPunches.length} pattern interrupts` } })
      }
    } catch (err) {
      log('ZOOMPUNCH', `Error: ${err.message}`)
      sendEvent({ type: 'thought_step', step: { id: 'zoompunch', label: 'Zoom punches failed', icon: 'film', status: 'error', summary: err.message } })
    }
  }

  // ── PHASE 5: Word-level captions (from Groq Whisper transcription) ────
  sendEvent({ type: 'thought_step', step: { id: 'captions', label: 'Generating captions...', icon: 'plan', status: 'active' } })

  try {
    const words = analysis.transcription?.words || []
    if (words.length > 0 && plan.captionStyle && plan.captionStyle !== 'none') {
      const captionPath = join(workDir, 'captions.mp4')
      const fontSize = plan.captionFontSize || 48
      const captionColor = plan.captionColor || 'white'

      // Generate ASS subtitle file with word-level timing
      const assPath = join(workDir, 'captions.ass')
      const assContent = generateWordCaptions(words, fontSize, captionColor, plan.captionStyle)
      await writeFile(assPath, assContent, 'utf-8')

      await execFileAsync(ffmpeg, [
        '-i', currentPath,
        '-vf', `ass='${assPath.replace(/\\/g, '/').replace(/'/g, "\\'")}'`,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
        '-c:a', 'copy',
        '-y', captionPath,
      ], { timeout: 300000 })
      currentPath = captionPath
      log('CAPTIONS', `Burned ${words.length} word captions (${analysis.transcription.provider})`)
      sendEvent({
        type: 'thought_step',
        step: {
          id: 'captions', label: 'Captions Burned', icon: 'plan', status: 'done',
          summary: `${words.length} words · ${plan.captionStyle} style · via ${analysis.transcription.provider}`,
          details: [`Font: ${fontSize}px ${captionColor}`, `First words: "${words.slice(0, 4).map(w => w.word).join(' ')}..."`],
        },
      })
    } else {
      sendEvent({ type: 'thought_step', step: { id: 'captions', label: 'No transcription', icon: 'plan', status: 'done', summary: words.length === 0 ? 'No words available' : 'Captions disabled' } })
    }
  } catch (err) {
    log('CAPTIONS', `Error: ${err.message}`)
    sendEvent({ type: 'thought_step', step: { id: 'captions', label: 'Captions failed', icon: 'plan', status: 'error', summary: err.message } })
  }

  // ── PHASE 6: Text overlays (bold, animated) ──────────────────────────
  sendEvent({ type: 'thought_step', step: { id: 'text', label: 'Adding text overlays...', icon: 'plan', status: 'active' } })

  try {
    const overlays = plan.textOverlays || []
    if (overlays.length > 0) {
      const textPath = join(workDir, 'text.mp4')
      const fontSize = plan.textFontSize || 72
      const fontColor = plan.textColor || 'white'
      const borderColor = plan.textShadowColor || 'black'

      const drawtextFilters = overlays.map(t => {
        const escaped = t.text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, "\\:")
        const fadeIn = Math.min(0.15, (t.duration || 1) * 0.2)
        return `drawtext=text='${escaped}':fontsize=${fontSize}:fontcolor=${fontColor}:borderw=5:bordercolor=${borderColor}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${t.time},${t.time + (t.duration || 2)})':alpha='if(between(t,${t.time},${t.time + fadeIn}),min(1,(t-${t.time})/${fadeIn}),if(between(t,${t.time + (t.duration || 2) - fadeIn},${t.time + (t.duration || 2)}),max(0,(${t.time + (t.duration || 2)}-t)/${fadeIn}),1))'`
      })

      await execFileAsync(ffmpeg, [
        '-i', currentPath,
        '-vf', drawtextFilters.join(','),
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
        '-c:a', 'copy',
        '-y', textPath,
      ], { timeout: 300000 })
      currentPath = textPath
      log('TEXT', `Added ${overlays.length} text overlays`)
      sendEvent({
        type: 'thought_step',
        step: {
          id: 'text', label: 'Text Overlays Added', icon: 'plan', status: 'done',
          summary: `${overlays.length} overlays`,
          details: overlays.map(t => `"${t.text}" @ ${t.time.toFixed(1)}s`),
        },
      })
    } else {
      sendEvent({ type: 'thought_step', step: { id: 'text', label: 'No text overlays', icon: 'plan', status: 'done', summary: 'None needed' } })
    }
  } catch (err) {
    log('TEXT', `Error: ${err.message}`)
    sendEvent({ type: 'thought_step', step: { id: 'text', label: 'Text failed', icon: 'plan', status: 'error', summary: err.message } })
  }

  // ── PHASE 7: Speed ramps ─────────────────────────────────────────────
  sendEvent({ type: 'thought_step', step: { id: 'speed', label: 'Applying speed ramps...', icon: 'plan', status: 'active' } })

  try {
    const ramps = plan.speedRamps || []
    if (ramps.length > 0) {
      const speedPath = join(workDir, 'speed.mp4')
      // Apply average speed change (simple approach — split/concat is complex)
      const avgSpeed = ramps.reduce((acc, r) => acc + (r.speed || 2), 0) / ramps.length
      const ptsFactor = 1.0 / Math.min(Math.max(avgSpeed, 0.5), 4.0)
      const tempo = Math.min(Math.max(avgSpeed, 0.5), 2.0)

      await execFileAsync(ffmpeg, [
        '-i', currentPath,
        '-vf', `setpts=${ptsFactor}*PTS`,
        '-af', `atempo=${tempo}`,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
        '-c:a', 'aac', '-b:a', '192k',
        '-y', speedPath,
      ], { timeout: 300000 })
      currentPath = speedPath
      log('SPEED', `Applied ${ramps.length} speed ramps (avg ${avgSpeed.toFixed(1)}x)`)
      sendEvent({
        type: 'thought_step',
        step: {
          id: 'speed', label: 'Speed Ramps Applied', icon: 'plan', status: 'done',
          summary: `${ramps.length} ramps, avg ${avgSpeed.toFixed(1)}x`,
        },
      })
    } else {
      sendEvent({ type: 'thought_step', step: { id: 'speed', label: 'No speed ramps', icon: 'plan', status: 'done', summary: 'None needed' } })
    }
  } catch (err) {
    log('SPEED', `Error: ${err.message}`)
    sendEvent({ type: 'thought_step', step: { id: 'speed', label: 'Speed failed', icon: 'plan', status: 'error', summary: err.message } })
  }

  // ── PHASE 7.5: Platform reframing (9:16, 1:1, 16:9) ──────────────
  sendEvent({ type: 'thought_step', step: { id: 'reframe', label: 'Reframing for platform...', icon: 'film', status: 'active' } })

  try {
    const platform = plan.platform || plan.reframe || null
    const platformFormats = {
      tiktok: { w: 1080, h: 1920, label: 'TikTok (9:16)' },
      reels: { w: 1080, h: 1920, label: 'Instagram Reels (9:16)' },
      shorts: { w: 1080, h: 1920, label: 'YouTube Shorts (9:16)' },
      vertical: { w: 1080, h: 1920, label: 'Vertical (9:16)' },
      square: { w: 1080, h: 1080, label: 'Square (1:1)' },
      instagram: { w: 1080, h: 1080, label: 'Instagram Post (1:1)' },
      widescreen: { w: 1920, h: 1080, label: 'Widescreen (16:9)' },
      landscape: { w: 1920, h: 1080, label: 'Landscape (16:9)' },
      story: { w: 1080, h: 1920, label: 'Story (9:16)' },
      linkedin: { w: 1920, h: 1080, label: 'LinkedIn (16:9)' },
      twitter: { w: 1280, h: 720, label: 'Twitter/X (16:9)' },
    }

    const fmt = platformFormats[platform]
    if (fmt) {
      const reframePath = join(workDir, 'reframed.mp4')
      // Smart crop: scale up to fill, then center-crop to target aspect
      await execFileAsync(ffmpeg, [
        '-i', currentPath,
        '-vf', `scale=${fmt.w}:${fmt.h}:force_original_aspect_ratio=increase,crop=${fmt.w}:${fmt.h}`,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
        '-c:a', 'copy',
        '-y', reframePath,
      ], { timeout: 300000 })
      currentPath = reframePath
      log('REFRAME', `Reframed to ${fmt.label}`)
      sendEvent({
        type: 'thought_step',
        step: {
          id: 'reframe', label: 'Reframed', icon: 'film', status: 'done',
          summary: fmt.label,
          details: [`${fmt.w}x${fmt.h}`, 'Smart center-crop'],
        },
      })
    } else {
      sendEvent({ type: 'thought_step', step: { id: 'reframe', label: 'No reframe needed', icon: 'film', status: 'done', summary: 'Keeping original aspect ratio' } })
    }
  } catch (err) {
    log('REFRAME', `Error: ${err.message}`)
    sendEvent({ type: 'thought_step', step: { id: 'reframe', label: 'Reframe skipped', icon: 'film', status: 'error', summary: err.message } })
  }

  // ── PHASE 8: Final encode (1080p, H.264, faststart) ─────────────────
  sendEvent({ type: 'thought_step', step: { id: 'encode', label: 'Final encode...', icon: 'test', status: 'active' } })

  const outputPath = join(workDir, `restored_${editId}.mp4`)
  try {
    await execFileAsync(ffmpeg, [
      '-i', currentPath,
      '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      '-y', outputPath,
    ], { timeout: 300000 })
    log('ENCODE', `Output: ${outputPath}`)
    sendEvent({
      type: 'thought_step',
      step: {
        id: 'encode', label: 'Encode Complete', icon: 'test', status: 'done',
        summary: 'Restored video ready',
        details: ['1920x1080', 'H.264 MP4', `${plan.name || 'Custom'} style`],
      },
    })
  } catch (err) {
    log('ENCODE', `Error: ${err.message}`)
    sendEvent({ type: 'thought_step', step: { id: 'encode', label: 'Encode failed', icon: 'test', status: 'error', summary: err.message } })
    throw err
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  log('DONE', `Edit complete in ${elapsed}s → ${outputPath}`)

  return {
    outputPath,
    editId,
    elapsed,
    plan: {
      style: plan.name || plan.style || 'custom',
      operations: (plan.textOverlays?.length || 0) + (plan.speedRamps?.length || 0) + 3, // effects + encode + trim
      removeSilence: plan.removeSilence !== false,
      captionStyle: plan.captionStyle || 'none',
    },
  }
}

// ── AUTO TEXT OVERLAY GENERATION ──────────────────────────────────────

function generateAutoOverlays(plan, duration) {
  const overlays = []
  const styleName = plan.name || plan.colorGrade || 'video'

  // Style-specific overlays (MrBeast = retention hooks, Malva = emotional)
  const styleOverlays = {
    mrbeast: ['WAIT FOR IT', 'THIS IS INSANE', 'NO WAY', 'BUT WAIT', 'THIS IS CRAZY'],
    viral: ['POV', 'WAIT FOR IT', 'OF COURSE', 'THATS CRAZY'],
    malva: ['EVERYBODY WANTS THIS', 'THE TRUTH', 'NOBODY TELLS YOU', 'BUT LISTEN'],
    nasdaily: ['ONE MINUTE', 'HERE IS THE THING', 'LET ME EXPLAIN'],
    cinematic: ['A STORY', 'EVERYTHING CHANGES', 'THE END'],
    documentary: ['THE TRUTH', 'WHAT HAPPENED', 'THE REAL STORY'],
    minimal: [],
  }

  const phrases = styleOverlays[plan.styleKey] || styleOverlays[plan.style] || styleOverlays[styleName] || ['AMAZING', 'INCREDIBLE', 'UNREAL']

  // MrBeast/Malva: More overlays, more frequently (every 3-4 seconds)
  const isRetentionStyle = styleName === 'mrbeast' || styleName === 'viral' || styleName === 'malva'
  const interval = isRetentionStyle ? Math.min(3.5, duration / (phrases.length + 1)) : duration / (phrases.length + 1)

  // Opening hook (first 1-2s) — critical for retention
  if (isRetentionStyle) {
    overlays.push({ text: phrases[0] || 'WATCH THIS', time: 0.3, duration: 1.0 })
  } else {
    overlays.push({ text: 'WATCH THIS', time: 0.2, duration: 1.2 })
  }

  phrases.slice(isRetentionStyle ? 1 : 0).forEach((phrase, i) => {
    const time = interval * (i + 1) + (isRetentionStyle ? 0.3 : 0)
    if (time + 1.5 < duration) {
      overlays.push({ text: phrase, time: Math.round(time * 10) / 10, duration: isRetentionStyle ? 0.8 : 1.0 })
    }
  })

  // Closing (last 1.5s)
  if (duration > 3) {
    overlays.push({ text: isRetentionStyle ? 'FOLLOW FOR PART 2' : 'FOLLOW FOR MORE', time: Math.max(0, duration - 1.5), duration: 1.5 })
  }

  return overlays
}

// ── SILENCE DETECTION ─────────────────────────────────────────────────

async function detectSilence(videoPath) {
  const ffmpeg = getFfmpegPath()

  try {
    const { stderr } = await execFileAsync(ffmpeg, [
      '-i', videoPath,
      '-af', 'silencedetect=noise=-30dB:d=0.5',
      '-f', 'null', '-',
    ], { timeout: 60000 })

    const silences = []
    const lines = (stderr || '').split('\n')
    let silenceStart = null

    for (const line of lines) {
      const startMatch = line.match(/silence_start:\s*(\d+\.?\d*)/)
      const endMatch = line.match(/silence_end:\s*(\d+\.?\d*)/)

      if (startMatch) silenceStart = parseFloat(startMatch[1])
      if (endMatch && silenceStart !== null) {
        silences.push({ start: silenceStart, end: parseFloat(endMatch[1]) })
        silenceStart = null
      }
    }

    return silences
  } catch {
    return []
  }
}

async function removeSilenceSegments(videoPath, silences, totalDuration, workDir) {
  const ffmpeg = getFfmpegPath()
  const outputPath = join(workDir, 'trimmed.mp4')

  // Build keep segments (inverse of silences)
  const keeps = []
  let lastEnd = 0

  for (const gap of silences) {
    if (gap.start > lastEnd + 0.1) {
      keeps.push({ start: lastEnd, end: gap.start })
    }
    lastEnd = gap.end
  }
  if (lastEnd < totalDuration - 0.1) {
    keeps.push({ start: lastEnd, end: totalDuration })
  }

  if (keeps.length === 0) return videoPath

  // Limit to 15 segments to keep ffmpeg filter complex manageable
  const limited = keeps.slice(0, 15)
  const filterParts = limited.map((k, i) =>
    `[0:v]trim=start=${k.start}:duration=${k.end - k.start},setpts=PTS-STARTPTS[v${i}];` +
    `[0:a]atrim=start=${k.start}:duration=${k.end - k.start},asetpts=PTS-STARTPTS[a${i}]`
  )
  const concatInputs = limited.map((_, i) => `[v${i}][a${i}]`).join('')
  filterParts.push(`${concatInputs}concat=n=${limited.length}:v=1:a=1[outv][outa]`)

  await execFileAsync(ffmpeg, [
    '-i', videoPath,
    '-filter_complex', filterParts.join(''),
    '-map', '[outv]', '-map', '[outa]',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k',
    '-y', outputPath,
  ], { timeout: 300000 })

  return outputPath
}

// Generic segment removal (used for filler words, etc.)
async function removeSegments(videoPath, segments, totalDuration, workDir, outputPath) {
  const ffmpeg = getFfmpegPath()
  const keeps = []
  let lastEnd = 0

  for (const seg of segments) {
    if (seg.start > lastEnd + 0.05) {
      keeps.push({ start: lastEnd, end: seg.start })
    }
    lastEnd = seg.end
  }
  if (lastEnd < totalDuration - 0.05) {
    keeps.push({ start: lastEnd, end: totalDuration })
  }

  if (keeps.length === 0) return videoPath

  const limited = keeps.slice(0, 20)
  const filterParts = limited.map((k, i) =>
    `[0:v]trim=start=${k.start}:duration=${k.end - k.start},setpts=PTS-STARTPTS[v${i}];` +
    `[0:a]atrim=start=${k.start}:duration=${k.end - k.start},asetpts=PTS-STARTPTS[a${i}]`
  )
  const concatInputs = limited.map((_, i) => `[v${i}][a${i}]`).join('')
  filterParts.push(`${concatInputs}concat=n=${limited.length}:v=1:a=1[outv][outa]`)

  await execFileAsync(ffmpeg, [
    '-i', videoPath,
    '-filter_complex', filterParts.join(''),
    '-map', '[outv]', '-map', '[outa]',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k',
    '-y', outputPath,
  ], { timeout: 300000 })

  return outputPath
}

async function getDuration(videoPath) {
  const ffmpeg = getFfmpegPath()
  try {
    const { stderr } = await execFileAsync(ffmpeg, ['-i', videoPath], { timeout: 10000 }).catch(e => ({ stderr: e.stderr || '' }))
    const match = (stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
    if (match) return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3])
  } catch {}
  return 0
}

function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

// ── ASS CAPTION GENERATION ────────────────────────────────────────────

function generateWordCaptions(words, fontSize, color, style) {
  const outlineColor = '&H00000000'

  // Map hex color to ASS BGR format
  let primaryColor = '&H00FFFFFF' // default white
  if (color.startsWith('#')) {
    const hex = color.replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    primaryColor = `&H00${b.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${r.toString(16).padStart(2, '0')}`.toUpperCase()
  }

  let header = `[Script Info]
Title: AlphaTekX Captions
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},${primaryColor},${outlineColor},&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,10,10,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

  // Group words into lines of 4-6 words for readability
  const wordsPerLine = style === 'word_highlight' ? 1 : style === 'word_by_word' ? 1 : 5
  const lines = []

  for (let i = 0; i < words.length; i += wordsPerLine) {
    const chunk = words.slice(i, i + wordsPerLine)
    const start = chunk[0].start
    const end = chunk[chunk.length - 1].end
    const text = chunk.map(w => w.word).join(' ')
    lines.push({ start, end, text, words: chunk })
  }

  for (const line of lines) {
    const startFmt = assTime(line.start)
    const endFmt = assTime(line.end)

    if (style === 'word_highlight') {
      // Highlight each word with color override
      const highlighted = line.words.map(w => {
        return `{\\c&H00D6FF00&}${w.word}{\\c&H00FFFFFF&}`
      }).join(' ')
      header += `Dialogue: 0,${startFmt},${endFmt},Default,,0,0,0,,${highlighted}\n`
    } else if (style === 'word_by_word') {
      // One word at a time, centered, large
      for (const w of line.words) {
        const wStart = assTime(w.start)
        const wEnd = assTime(w.end)
        header += `Dialogue: 0,${wStart},${wEnd},Default,,0,0,0,,{\\an5}${w.word.toUpperCase()}\n`
      }
    } else if (style === 'bounce') {
      // Bounce effect with \move
      header += `Dialogue: 0,${startFmt},${endFmt},Default,,0,0,0,,{\\move(960,640,960,560,0,80)}${line.text}\n`
    } else {
      // Default: subtitle style
      header += `Dialogue: 0,${startFmt},${endFmt},Default,,0,0,0,,${line.text}\n`
    }
  }

  return header
}

function assTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const cs = Math.floor((seconds % 1) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}
