/**
 * ALPHATEKX RESILIENT VIDEO PIPELINE
 * Multi-phase, human-paced video generation with continuation support
 * 
 * PHASES:
 * 1. SCRIPT - Generate script with Groq (critical foundation)
 * 2. NARRATION - Create voice-overs one by one
 * 3. SEARCH - Download video clips from Pexels
 * 4. EDITING - Apply FFmpeg effects and zoompan
 * 5. CONCAT - Combine final video
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import ffmpegPath from 'ffmpeg-static'

/**=== STATE & CONFIGURATION ===*/

const PLAN_CONFIG = {
  free: { scenesMax: 6, duration: 120, resolution: '720p', watermark: true, effects: 'basic', name: 'Free' },
  starter: { scenesMax: 12, duration: 300, resolution: '1080p', watermark: false, effects: 'standard', name: 'Starter' },
  creator: { scenesMax: 20, duration: 480, resolution: '1080p', watermark: false, effects: 'mrbeast', name: 'Creator' },
  beast: { scenesMax: 32, duration: 780, resolution: '1080p', watermark: false, effects: 'mrbeast-long', name: 'Beast' },
}

export function getPlanConfig(plan = 'free') {
  return PLAN_CONFIG[plan?.toLowerCase()] || PLAN_CONFIG.free
}

/**=== UTILITIES ===*/

function log(phase, message) {
  console.log(`[${phase.toUpperCase()}] ${message}`)
}

function ffmpegBinary() {
  const binary = String(ffmpegPath || process.env.FFMPEG_PATH || '').trim()
  if (!binary) throw new Error('FFmpeg not found')
  return binary
}

function getFontPath() {
  const fontPaths = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/System/Library/Fonts/Arial.ttf',
    'C:\\Windows\\Fonts\\arial.ttf',
    path.resolve(process.cwd(), 'public/fonts/DejaVuSans-Bold.ttf'),
  ]
  for (const fpath of fontPaths) {
    try {
      if (fs.existsSync(fpath)) return fpath
    } catch {}
  }
  return fontPaths[0]
}

async function runFfmpeg(args, cwd = tmpdir()) {
  const binary = ffmpegBinary()
  const result = spawnSync(binary, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  })

  if (result.status === 0) return result

  const errorMsg = String(result.stderr || result.stdout || 'Unknown error')
  throw new Error(`FFmpeg error (exit ${result.status}): ${errorMsg.substring(0, 500)}`)
}

async function downloadFile(url, timeoutMs = 120000) {
  const response = await fetch(url, { 
    timeout: timeoutMs,
    headers: { 'User-Agent': 'AlphaTekX/1.0' }
  })
  if (!response.ok) throw new Error(`Download failed: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

function getPexelsKey(keyIndex = 0) {
  const keys = [
    process.env.PEXELS_API_KEY_1,
    process.env.PEXELS_API_KEY_2,
    process.env.PEXELS_API_KEY_3,
    process.env.PEXELS_API_KEY,
  ].filter(k => k?.trim())
  return keys[keyIndex % keys.length] || ''
}

function getGroqKey() {
  return process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1 || ''
}

function getElevenLabsKey() {
  return process.env.ELEVENLABS_API_KEY || ''
}

/**=== STATE MANAGEMENT ===*/

async function loadOrInitState(jobDir, script) {
  const stateFile = path.join(jobDir, 'state.json')
  try {
    if (fs.existsSync(stateFile)) {
      const content = await fs.promises.readFile(stateFile, 'utf8')
      return JSON.parse(content)
    }
  } catch (err) {
    log('RESUME', `Failed to load state: ${err instanceof Error ? err.message : err}`)
  }

  // Initialize fresh state
  const state = {
    phase: 'script',
    totalScenes: (script || []).length,
    completedScenes: {
      script: 0,
      narration: 0,
      search: 0,
      editing: 0,
      concat: 0,
    },
    failedRetries: {},
  }
  await saveState(jobDir, state)
  return state
}

async function saveState(jobDir, state) {
  const stateFile = path.join(jobDir, 'state.json')
  await fs.promises.mkdir(jobDir, { recursive: true })
  await fs.promises.writeFile(stateFile, JSON.stringify(state, null, 2), 'utf8')
}

/**=== PHASE 1: SCRIPT GENERATION ===*/

export async function generateVideoScript(prompt, durationSec = 120) {
  const groqKey = getGroqKey()
  if (!groqKey) throw new Error('Groq API key required')

  // Determine scene count based on duration
  let sceneCount = 6
  if (durationSec >= 780) sceneCount = 32
  else if (durationSec >= 480) sceneCount = 20
  else if (durationSec >= 300) sceneCount = 12

  const sceneDuration = Math.max(8, Math.floor(durationSec / sceneCount))

  let structure = ''
  if (sceneCount >= 20) {
    structure = `MrBeast style structure:
- Scene 1: HOOK (0-3s) - shocking statement
- Scenes 2-4: SETUP (3-8s) - build curiosity  
- Scenes 5-16: BUILDUP (8-25s) - rising tension, challenges
- Scenes 17-19: PAYOFF (25-28s) - climax, reward
- Scene 20+: CTA - call to action`
  } else {
    structure = 'Hook → Setup → Buildup → Payoff → CTA'
  }

  const groqPrompt = `You are a viral video scriptwriter. Create exactly ${sceneCount} scenes, each ${sceneDuration}s.
Topic: "${prompt}"

${structure}

Return ONLY a JSON array with exactly ${sceneCount} objects: [{narration: "...", pexelsKeywords: ["word1", "word2", "word3"], onScreenText: "short text", emotion: "name"}]
NO markdown, NO code blocks, NO comments. JUST the JSON array.`

  let data = null
  let attempts = 0
  while (attempts < 3) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: groqPrompt }],
          temperature: 0.6,
          max_tokens: 2500,
        }),
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(`Groq API error (${response.status}): ${err.substring(0, 150)}`)
      }

      data = await response.json()
      break
    } catch (err) {
      attempts++
      log('SCRIPT', `Attempt ${attempts}: ${err instanceof Error ? err.message : err}`)
      if (attempts < 3) await new Promise(r => setTimeout(r, 2000))
    }
  }

  if (!data) throw new Error('Groq API failed after 3 attempts')

  const content = data?.choices?.[0]?.message?.content || ''
  
  let parsed = null
  const patterns = [
    /\[\s*\{[\s\S]*?\}\s*\]/,
    /```json\s*(\[[\s\S]*?\])\s*```/,
    /```\s*(\[[\s\S]*?\])\s*```/,
  ]
  
  for (const pattern of patterns) {
    const match = content.match(pattern)
    if (match) {
      try {
        const jsonStr = match[1] || match[0]
        parsed = JSON.parse(jsonStr)
        break
      } catch {}
    }
  }
  
  if (!parsed) throw new Error(`Invalid Groq response: ${content.substring(0, 200)}`)
  if (!Array.isArray(parsed) || parsed.length !== sceneCount) {
    throw new Error(`Expected ${sceneCount} scenes, got ${Array.isArray(parsed) ? parsed.length : 'invalid'}`)
  }

  return parsed.map((scene, i) => ({
    sceneIndex: i,
    narration: String(scene.narration || '').slice(0, 200),
    pexelsKeywords: Array.isArray(scene.pexelsKeywords) ? scene.pexelsKeywords.slice(0, 3) : ['video', 'content'],
    onScreenText: String(scene.onScreenText || 'none').slice(0, 50),
    emotion: String(scene.emotion || 'neutral'),
    durationSec: sceneDuration,
  }))
}

/**=== PHASE 2: NARRATION GENERATION ===*/

async function generateVoiceoverMP3(text, sceneIndex) {
  const elevenKey = getElevenLabsKey()

  if (elevenKey) {
    try {
      log('NARRATION', `Scene ${sceneIndex}: Generating with ElevenLabs...`)
      const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
        method: 'POST',
        headers: {
          'xi-api-key': elevenKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text.slice(0, 1000),
          model_id: 'eleven_monolingual_v1',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(`ElevenLabs: ${err}`)
      }

      log('NARRATION', `Scene ${sceneIndex}: Voice ready (ElevenLabs)`)
      return Buffer.from(await response.arrayBuffer())
    } catch (err) {
      log('NARRATION', `Scene ${sceneIndex}: ElevenLabs failed, using fallback`)
    }
  }

  // Fallback: try gTTS
  try {
    log('NARRATION', `Scene ${sceneIndex}: Generating with gTTS fallback...`)
    const response = await fetch('https://api.gtts.dev/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 100), lang: 'en' }),
    })

    if (response.ok) {
      log('NARRATION', `Scene ${sceneIndex}: Voice ready (gTTS fallback)`)
      return Buffer.from(await response.arrayBuffer())
    }
  } catch (err) {
    log('NARRATION', `Scene ${sceneIndex}: gTTS also failed`)
  }

  // Final fallback: silent audio
  log('NARRATION', `Scene ${sceneIndex}: Using silent audio`)
  return Buffer.alloc(0)
}

async function phaseNarration(jobDir, script, state, onProgress) {
  const narrationsDir = path.join(jobDir, 'voices')
  await fs.promises.mkdir(narrationsDir, { recursive: true })

  const startIndex = state.completedScenes.narration
  const totalScenes = script.length

  for (let i = startIndex; i < totalScenes; i++) {
    const voiceFile = path.join(narrationsDir, `voice-${i}.mp3`)

    // Skip if already exists (continuation)
    if (fs.existsSync(voiceFile)) {
      state.completedScenes.narration = i + 1
      await saveState(jobDir, state)
      onProgress({
        phase: 'narration',
        clipIndex: i,
        message: `Voice ${i + 1}/${totalScenes} already ready`,
      })
      continue
    }

    // Generate voiceover with retries
    let retries = 0
    let voiceBuffer = null

    while (retries < 2) {
      try {
        voiceBuffer = await generateVoiceoverMP3(script[i].narration, i)
        break
      } catch (err) {
        retries++
        log('NARRATION', `Scene ${i}: Retry ${retries} after ${err instanceof Error ? err.message : err}`)
        if (retries < 2) await new Promise(r => setTimeout(r, 2000))
      }
    }

    // Save even if failed (will use silent)
    await fs.promises.writeFile(voiceFile, voiceBuffer || Buffer.alloc(0))

    state.completedScenes.narration = i + 1
    await saveState(jobDir, state)

    onProgress({
      phase: 'narration',
      clipIndex: i,
      message: `Voice ${i + 1}/${totalScenes} ready`,
    })

    // Calm pace
    await new Promise(r => setTimeout(r, 300))
  }

  log('NARRATION', `Phase complete: ${totalScenes}/${totalScenes} voices ready`)
  state.phase = 'search'
  await saveState(jobDir, state)
}

/**=== PHASE 3: PEXELS SEARCH & DOWNLOAD ===*/

async function searchPexelsVideos(query, keyIndex = 0) {
  const key = getPexelsKey(keyIndex)
  if (!key) return []

  try {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15`
    const response = await fetch(url, {
      headers: { 'Authorization': key },
      timeout: 10000,
    })

    if (response.status === 429) return null // Rate limited
    if (!response.ok) return []

    const data = await response.json()
    return (data?.videos || [])
      .filter(v => v.video_files && v.video_files.length > 0)
      .slice(0, 5)
  } catch (err) {
    console.warn(`[SEARCH] Pexels search failed for "${query}": ${err instanceof Error ? err.message : err}`)
    return []
  }
}

async function downloadPexelsClip(scene, clipsDir) {
  const keywords = scene.pexelsKeywords || ['video']
  const clipFile = path.join(clipsDir, `clip-${scene.sceneIndex}.mp4`)

  for (const keyword of keywords) {
    for (let keyIdx = 0; keyIdx < 4; keyIdx++) {
      try {
        const videos = await searchPexelsVideos(keyword, keyIdx)
        if (videos === null) {
          // Rate limited, wait and try next key
          await new Promise(r => setTimeout(r, 2000))
          continue
        }
        if (videos.length === 0) continue

        const video = videos[0]
        const file = video.video_files
          .filter(f => f.quality === 'hd' || f.quality === 'sd')
          .sort((a, b) => (b.width || 0) - (a.width || 0))[0]

        if (file?.link) {
          log('SEARCH', `Scene ${scene.sceneIndex}: Downloading clip for "${keyword}"`)
          const bytes = await downloadFile(file.link, 60000)
          await fs.promises.writeFile(clipFile, bytes)

          // Save thumbnail
          const thumbFile = path.join(clipsDir, `thumb-${scene.sceneIndex}.jpg`)
          try {
            const thumbUrl = video.image
            if (thumbUrl) {
              const thumbBytes = await downloadFile(thumbUrl, 30000)
              await fs.promises.writeFile(thumbFile, thumbBytes)
            }
          } catch (e) {
            log('SEARCH', `Scene ${scene.sceneIndex}: Thumbnail download failed`)
          }

          return clipFile
        }
      } catch (err) {
        log('SEARCH', `Scene ${scene.sceneIndex}: Download error: ${err instanceof Error ? err.message : err}`)
        continue
      }
    }
  }

  // Fallback: create blank clip (1 second)
  log('SEARCH', `Scene ${scene.sceneIndex}: No Pexels clip found, will use blank`)
  return null
}

async function phaseSearch(jobDir, script, state, onProgress) {
  const clipsDir = path.join(jobDir, 'clips')
  await fs.promises.mkdir(clipsDir, { recursive: true })

  const startIndex = state.completedScenes.search
  const totalScenes = script.length

  for (let i = startIndex; i < totalScenes; i++) {
    const clipFile = path.join(clipsDir, `clip-${i}.mp4`)

    // Skip if exists (continuation)
    if (fs.existsSync(clipFile)) {
      state.completedScenes.search = i + 1
      await saveState(jobDir, state)
      onProgress({
        phase: 'search',
        clipIndex: i,
        message: `Clip ${i + 1}/${totalScenes} already available`,
      })
      continue
    }

    // Download with retries
    let retries = 0
    while (retries < 3) {
      try {
        await downloadPexelsClip(script[i], clipsDir)
        break
      } catch (err) {
        retries++
        log('SEARCH', `Scene ${i}: Retry ${retries}`)
        if (retries < 3) await new Promise(r => setTimeout(r, 2000))
      }
    }

    state.completedScenes.search = i + 1
    await saveState(jobDir, state)

    onProgress({
      phase: 'search',
      clipIndex: i,
      message: `Clip ${i + 1}/${totalScenes} ready`,
    })

    // Calm download pace
    await new Promise(r => setTimeout(r, 500))
  }

  log('SEARCH', `Phase complete: ${totalScenes}/${totalScenes} clips ready`)
  state.phase = 'editing'
  await saveState(jobDir, state)
}

/**=== PHASE 4: FFMPEG EDITING ===*/

async function editSceneClip(inputPath, outputPath, scene, jobDir, resolution = '1080p') {
  const duration = scene.durationSec || 10
  const text = scene.onScreenText !== 'none' ? scene.onScreenText : ''

  // Check if input exists, if not create blank
  if (!fs.existsSync(inputPath)) {
    log('EDITING', `Scene ${scene.sceneIndex}: Input missing, creating blank clip`)
    // Create 1-second blank clip
    const blankArgs = [
      '-f', 'lavfi',
      '-i', `color=c=black:s=${resolution === '1080p' ? '1920x1080' : '1280x720'}:d=${duration}`,
      '-pix_fmt', 'yuv420p',
      '-y',
      outputPath,
    ]
    await runFfmpeg(blankArgs)
    return
  }

  const [width, height] = resolution === '1080p' ? ['1920', '1080'] : ['1280', '720']
  const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`

  // Build filter chain - MrBeast style
  let filters = [scaleFilter]

  // Improved zoom effect (1.0 → 1.2 over duration for dramatic effect)
  const zoomStart = 1.0
  const zoomEnd = 1.2
  const t_expr = `t`
  const zoomExpr = `${zoomStart}+(${'t'}/${duration})*(${zoomEnd}-${zoomStart})`
  filters.push(`zoompan=z='${zoomExpr}':d=${duration}:x='(w/2-(w/zoom/2))':y='(h/2-(h/zoom/2))':fps=30`)

  // Add text overlay if present
  if (text) {
    try {
      const fontPath = getFontPath()
      const textEscaped = text.replace(/'/g, "'\\''")
      // White bold text with black outline box
      const drawText = `drawtext=fontfile='${fontPath}':text='${textEscaped}':fontsize=72:fontcolor=white:borderw=3:bordercolor=black:box=1:boxcolor=black@0.7:boxborderw=8:x=(w-text_w)/2:y=(h-text_h)/2-80:enable='between(t,0.2,${Math.max(0.5, duration - 0.5)})'`
      filters.push(drawText)
    } catch (e) {
      log('EDITING', `Scene ${scene.sceneIndex}: Text filter skipped - ${e instanceof Error ? e.message : e}`)
    }
  }

  const args = [
    '-y',
    '-i', inputPath,
    '-t', String(duration),
    '-vf', filters.join(','),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    outputPath,
  ]

  // Try full edit, fallback to simpler versions
  try {
    await runFfmpeg(args)
  } catch (err) {
    log('EDITING', `Scene ${scene.sceneIndex}: Full edit failed, retrying with basic scale`)
    const simpleArgs = [
      '-y',
      '-i', inputPath,
      '-t', String(duration),
      '-vf', scaleFilter,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      outputPath,
    ]
    try {
      await runFfmpeg(simpleArgs)
    } catch (err2) {
      log('EDITING', `Scene ${scene.sceneIndex}: Even basic edit failed, copying input`)
      await fs.promises.copyFile(inputPath, outputPath)
    }
  }
}

async function phaseEditing(jobDir, script, state, onProgress, resolution = '1080p') {
  const clipsDir = path.join(jobDir, 'clips')
  const editedDir = path.join(jobDir, 'edited')
  await fs.promises.mkdir(editedDir, { recursive: true })

  const startIndex = state.completedScenes.editing
  const totalScenes = script.length

  for (let i = startIndex; i < totalScenes; i++) {
    const clipFile = path.join(clipsDir, `clip-${i}.mp4`)
    const editedFile = path.join(editedDir, `edited-${i}.mp4`)

    // Skip if exists (continuation)
    if (fs.existsSync(editedFile)) {
      state.completedScenes.editing = i + 1
      await saveState(jobDir, state)
      onProgress({
        phase: 'editing',
        clipIndex: i,
        message: `Scene ${i + 1}/${totalScenes} already edited`,
      })
      continue
    }

    // Edit with retries
    let retries = 0
    while (retries < 2) {
      try {
        await editSceneClip(clipFile, editedFile, script[i], jobDir, resolution)
        break
      } catch (err) {
        retries++
        log('EDITING', `Scene ${i}: Retry ${retries}`)
        if (retries < 2) await new Promise(r => setTimeout(r, 2000))
      }
    }

    state.completedScenes.editing = i + 1
    await saveState(jobDir, state)

    onProgress({
      phase: 'editing',
      clipIndex: i,
      message: `Scene ${i + 1}/${totalScenes} edited`,
    })

    // Calm editing pace
    await new Promise(r => setTimeout(r, 400))
  }

  log('EDITING', `Phase complete: ${totalScenes}/${totalScenes} scenes edited`)
  state.phase = 'concat'
  await saveState(jobDir, state)
}

/**=== PHASE 5: FINAL CONCATENATION ===*/

async function phaseConcat(jobDir, script, state, onProgress, duration, resolution = '1080p') {
  const editedDir = path.join(jobDir, 'edited')
  const narrationsDir = path.join(jobDir, 'voices')
  const finalPath = path.join(jobDir, `final-${duration}sec.mp4`)

  // Check we have at least 90% of scenes edited
  const editedCount = script.filter((_, i) => fs.existsSync(path.join(editedDir, `edited-${i}.mp4`))).length
  if (editedCount < Math.ceil(script.length * 0.9)) {
    throw new Error(`Not enough edited scenes ready: ${editedCount}/${script.length}`)
  }

  log('CONCAT', `Building final video with ${editedCount}/${script.length} scenes`)

  // Create concat demuxer file with audio tracks
  const concatFile = path.join(jobDir, 'concat.txt')
  const clipLines = []
  let audioInputIndex = 1
  const audioInputs = []
  
  for (let i = 0; i < script.length; i++) {
    const editedClip = path.join(editedDir, `edited-${i}.mp4`)
    const voiceFile = path.join(narrationsDir, `voice-${i}.mp3`)
    
    if (fs.existsSync(editedClip)) {
      clipLines.push(`file '${editedClip.replace(/'/g, "'\\''")}'`)
      
      // Track audio files for mixing if they exist
      if (fs.existsSync(voiceFile)) {
        audioInputs.push({ index: audioInputIndex++, file: voiceFile, sceneIndex: i })
      }
    }
  }
  await fs.promises.writeFile(concatFile, clipLines.join('\n'), 'utf8')

  // Concatenate video clips with audio mixing
  log('CONCAT', `Concatenating ${clipLines.length} video clips with ${audioInputs.length} audio tracks`)
  
  let concatArgs = [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
  ]
  
  // Add audio inputs for narration mixing
  for (const audio of audioInputs) {
    concatArgs.push('-i', audio.file)
  }
  
  // Video codec
  concatArgs.push('-c:v', 'libx264')
  concatArgs.push('-preset', 'veryfast')
  concatArgs.push('-crf', '23')
  concatArgs.push('-pix_fmt', 'yuv420p')
  
  // If we have audio to mix, create audio filter
  if (audioInputs.length > 0) {
    // Mix all audio inputs with video audio
    let filterStr = '[0:a:0]'
    for (let i = 0; i < audioInputs.length; i++) {
      filterStr += `[${i + 1}:a:0]`
    }
    filterStr += `concat=n=${audioInputs.length + 1}:v=0:a=1[aout]`
    
    concatArgs.push('-filter_complex', filterStr)
    concatArgs.push('-map', '0:v')
    concatArgs.push('-map', '[aout]')
    concatArgs.push('-c:a', 'aac')
    concatArgs.push('-b:a', '192k')
  } else {
    // Just copy audio from video
    concatArgs.push('-c:a', 'aac')
    concatArgs.push('-b:a', '192k')
  }
  
  concatArgs.push('-movflags', '+faststart')
  concatArgs.push(finalPath)

  await runFfmpeg(concatArgs)

  log('CONCAT', `Video concatenated: ${finalPath}`)

  state.completedScenes.concat = script.length
  await saveState(jobDir, state)

  onProgress({
    phase: 'final',
    step: 100,
    message: `Final ${duration}s video ready!`,
    finalVideoPath: finalPath,
  })

  log('FINAL', `Video complete: ${duration}s at ${resolution}`)
  return finalPath
}

/**=== PROGRESS STREAMING ===*/

export function streamProgress(callback, step, message, extra = {}) {
  if (typeof callback === 'function') {
    callback({
      step,
      message,
      totalSteps: extra.totalSteps || 6,
      clipIndex: extra.clipIndex,
      clipCount: extra.clipCount,
      phase: extra.phase,
      timestamp: new Date().toISOString(),
    })
  }
  log(step, message)
}

/**=== MAIN PIPELINE ===*/

export async function buildProductionVideo(prompt, { duration, plan = 'free', jobId, onProgress }) {
  const planConfig = getPlanConfig(plan)
  const jobDir = path.join(tmpdir(), `alpha-${jobId}`)

  try {
    // Create job directory and ensure tmp is writable on Render / serverless hosts
    fs.mkdirSync(jobDir, { recursive: true })
    console.log('[INIT] Job folder created', jobId, jobDir)
    
    // Verify tmp directory is writable by writing a test file
    const testFile = path.join(jobDir, '.write-test')
    fs.writeFileSync(testFile, 'tmp-writable-test')
    fs.unlinkSync(testFile)
    console.log('[INIT] Tmp directory is writable, proceeding with video generation')
    
    if (!fs.existsSync(jobDir)) {
      throw new Error(`Job directory not accessible: ${jobDir}`)
    }

    // PHASE 1: SCRIPT
    log('SCRIPT', `Starting script generation for: ${prompt}`)
    onProgress?.({ phase: 'script', message: 'Generating script with Groq...' })

    let script = null
    try {
      script = await generateVideoScript(prompt, planConfig.duration)
      log('SCRIPT', `Script ready: ${script.length} scenes`)
      onProgress?.({ phase: 'script', step: 10, message: `Script ready - ${script.length} scenes written` })
    } catch (err) {
      throw new Error(`[SCRIPT] Failed: ${err instanceof Error ? err.message : err}`)
    }

    // Load or init state
    let state = await loadOrInitState(jobDir, script)

    // PHASE 2: NARRATION
    if (state.phase === 'script' || state.phase === 'narration') {
      log('NARRATION', `Starting narration generation (scenes: ${state.completedScenes.narration}/${script.length})`)
      onProgress?.({ phase: 'narration', message: 'Generating voice-overs one by one...' })
      await phaseNarration(jobDir, script, state, onProgress || (() => {}))
      state = await loadOrInitState(jobDir, script)
    }

    // PHASE 3: SEARCH
    if (state.phase === 'search') {
      log('SEARCH', `Starting Pexels search (clips: ${state.completedScenes.search}/${script.length})`)
      onProgress?.({ phase: 'search', message: 'Searching and downloading from Pexels...' })
      await phaseSearch(jobDir, script, state, onProgress || (() => {}))
      state = await loadOrInitState(jobDir, script)
    }

    // PHASE 4: EDITING
    if (state.phase === 'editing') {
      log('EDITING', `Starting FFmpeg editing (scenes: ${state.completedScenes.editing}/${script.length})`)
      const resolution = planConfig.resolution
      onProgress?.({ phase: 'editing', message: `Editing scenes with ${resolution} resolution...` })
      await phaseEditing(jobDir, script, state, onProgress || (() => {}), resolution)
      state = await loadOrInitState(jobDir, script)
    }

    // PHASE 5: CONCAT
    if (state.phase === 'concat') {
      log('FINAL', `Starting final concatenation...`)
      onProgress?.({ phase: 'final', message: 'Concatenating final video...' })
      const finalPath = await phaseConcat(jobDir, script, state, onProgress || (() => {}), planConfig.duration, planConfig.resolution)

      return {
        success: true,
        videoPath: finalPath,
        duration: planConfig.duration,
        scenes: script.length,
        plan,
        jobId,
      }
    }

    throw new Error('Invalid pipeline state')
  } catch (err) {
    log('ERROR', `${err instanceof Error ? err.message : err}`)
    throw err
  }
}

export default { buildProductionVideo, getPlanConfig }
