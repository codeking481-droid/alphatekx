/**
 * PRODUCTION VIDEO PIPELINE
 * Full chain-of-thought video generation with Groq planning, Pexels multi-clip downloading,
 * voiceover generation, and comprehensive FFmpeg editing with text, music, and transitions
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import ffmpegPath from 'ffmpeg-static'

/**=== UTILITIES ===*/

function log(step, message) {
  console.log(`[VIDEO] Step ${step}: ${message}`)
}

function ffmpegBinary() {
  const binary = String(ffmpegPath || process.env.FFMPEG_PATH || '').trim()
  if (!binary) throw new Error('FFmpeg not found')
  return binary
}

function getFontPath() {
  // Try common font paths on different systems
  const fontPaths = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',  // Linux (Render)
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',  // Linux alt
    '/System/Library/Fonts/Arial.ttf',  // macOS
    'C:\\Windows\\Fonts\\arial.ttf',  // Windows
    '/tmp/DejaVuSans-Bold.ttf',  // Fallback to /tmp
  ]
  for (const fpath of fontPaths) {
    try {
      if (fs.existsSync(fpath)) {
        log('Font', `Using font: ${fpath}`)
        return fpath
      }
    } catch { }
  }
  // Last resort: return Linux path (will fallback in drawtext if missing)
  log('Font', 'Warning: No font found, will use system default')
  return fontPaths[0]
}

async function ensureFontExists() {
  const fontPath = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
  if (fs.existsSync(fontPath)) return fontPath
  
  // Try to create /tmp font if main font missing
  const tmpFont = '/tmp/DejaVuSans-Bold.ttf'
  if (fs.existsSync(tmpFont)) return tmpFont
  
  // If we can't find font, log warning but continue
  log('Font', 'DejaVuSans-Bold not found, will use FFmpeg fallback')
  return fontPath  // Return expected path, will fallback to no-text if missing
}

async function runFfmpeg(args, cwd) {
  const binary = ffmpegBinary()
  const result = spawnSync(binary, args, { 
    cwd, 
    encoding: 'utf8', 
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,  // 10MB buffer for large outputs
  })
  
  const stderr = String(result.stderr || '')
  const stdout = String(result.stdout || '')
  
  if (result.status === 0) return result
  
  // Log the error for debugging
  const errorMsg = stderr || stdout || 'FFmpeg failed with unknown error'
  
  // Check for specific filter errors that can be recovered from
  if (errorMsg.includes("No such filter") || errorMsg.includes("Unknown filter")) {
    throw new Error(`FFmpeg filter error: ${errorMsg.substring(0, 200)}`)
  }
  
  throw new Error(`FFmpeg error (exit ${result.status}): ${errorMsg.substring(0, 500)}`)
}

function ffmpegScaleFilter(aspectRatio) {
  if (aspectRatio === '9:16') {
    return 'scale=w=1080:h=1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black'
  }
  return 'scale=w=1920:h=1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black'
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

/**=== GROQ SCRIPT GENERATION ===*/

export async function generateVideoScript(prompt, durationSec = 120) {
  const groqKey = getGroqKey()
  if (!groqKey) throw new Error('Groq API key required for script generation')

  // Long-form requests use a deliberate 20-scene structure.  Short jobs keep the
  // quicker six-scene path so a normal request does not unexpectedly become huge.
  const sceneCount = durationSec >= 480 ? 20 : 6
  const sceneDuration = Math.max(8, Math.floor(durationSec / sceneCount))
  
  let structure = ''
  if (sceneCount === 20) {
    structure = `MrBeast style video structure:
- Scene 1: HOOK (0-30s) - shocking statement or question that makes people stop scrolling
- Scenes 2-4: SETUP (30s-2min) - explain the premise, build curiosity
- Scenes 5-16: BUILDUP/CHALLENGE (2-7min) - 12 scenes of rising tension, plot twists, challenges, surprises
- Scenes 17-19: PAYOFF (7-9min) - climax, resolution, reward reveal
- Scene 20: CTA (9-10min) - call to action, subscribe, like, share message`
  } else {
    structure = 'Start with a hook, then setup, buildup, payoff, and CTA.'
  }
  
  const groqPrompt = `You are creating a viral video script for YouTube. Break this topic into exactly ${sceneCount} scenes. Each scene is about ${sceneDuration} seconds.
Topic: "${prompt}"

${structure}

For each scene, provide JSON object with:
- narration: 20-40 word voiceover script for this scene (natural, conversational, engaging)
- pexelsKeywords: array of 3 search keywords for Pexels (e.g. ["keyword1", "keyword2", "keyword3"])
- onScreenText: short punchy text to display on screen (5-10 words, MrBeast style like "WAIT FOR IT" or "THIS IS CRAZY" or "none")
- emotion: "inspiring", "calm", "energetic", "sad", "peaceful", "shocking", "funny" etc

Return ONLY a JSON array of ${sceneCount} objects. No markdown, no explanation.`

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: groqPrompt }],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Groq failed: ${err}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content || ''
  
  // Parse JSON from response
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('No valid JSON in Groq response')
  
  const parsed = JSON.parse(jsonMatch[0])
  if (!Array.isArray(parsed) || parsed.length !== sceneCount) {
    throw new Error(`Script must have exactly ${sceneCount} scenes, got ${Array.isArray(parsed) ? parsed.length : 'unknown'}`)
  }

  return parsed.map((scene, i) => ({
    sceneIndex: i,
    narration: String(scene.narration || '').slice(0, 200),
    pexelsKeywords: Array.isArray(scene.pexelsKeywords) ? scene.pexelsKeywords.slice(0, 3) : ['scene', 'video', prompt.split(' ')[0]],
    onScreenText: String(scene.onScreenText || 'none').slice(0, 50),
    emotion: String(scene.emotion || 'neutral'),
    durationSec: sceneDuration,
  }))
}

/**=== PEXELS MULTI-CLIP DOWNLOAD ===*/

export async function searchPexelsVideos(query, keyIndex = 0) {
  const key = getPexelsKey(keyIndex)
  if (!key) return []

  try {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15`
    const response = await fetch(url, {
      headers: { 'Authorization': key },
      timeout: 10000,
    })

    if (response.status === 429) return null  // Rate limited - signal retry with next key
    if (!response.ok) return []

    const data = await response.json()
    return (data?.videos || [])
      .filter(v => v.video_files && v.video_files.length > 0)
      .slice(0, 5)
  } catch (err) {
    console.warn(`[VIDEO] Pexels search failed for "${query}": ${err instanceof Error ? err.message : err}`)
    return []
  }
}

export async function downloadPexelsClip(scene, aspectRatio = '16:9') {
  const keywords = scene.pexelsKeywords || ['video']
  
  // Try each keyword with key rotation
  for (const keyword of keywords) {
    for (let keyIdx = 0; keyIdx < 4; keyIdx++) {
      try {
        const videos = await searchPexelsVideos(keyword, keyIdx)
        if (videos === null) continue  // Rate limited, try next key
        if (videos.length === 0) continue  // No results, try next keyword
        
        const video = videos[0]
        const file = video.video_files
          .filter(f => f.quality === 'hd' || f.quality === 'sd')
          .sort((a, b) => (b.width || 0) - (a.width || 0))[0]
        
        if (file?.link) {
          log('Pexels', `Downloading clip for "${keyword}" (scene ${scene.sceneIndex})`)
          const bytes = await downloadFile(file.link, 60000)
          return { url: file.link, bytes, durationSec: scene.durationSec }
        }
      } catch (err) {
        console.warn(`[VIDEO] Download failed: ${err instanceof Error ? err.message : err}`)
        continue
      }
    }
  }

  log('Pexels', `No videos found for scene ${scene.sceneIndex}, will use fallback`)
  return null
}

/**=== VOICEOVER GENERATION ===*/

export async function generateVoiceoverMP3(text, sceneIndex) {
  const elevenKey = getElevenLabsKey()
  
  if (elevenKey) {
    try {
      return await generateElevenLabsVoiceover(text, elevenKey, sceneIndex)
    } catch (err) {
      console.warn(`[VIDEO] ElevenLabs failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  // Fallback: Create silent audio track (1 second)
  log('Voiceover', `Scene ${sceneIndex}: Using silent fallback`)
  return await createSilentAudioMP3(1)
}

async function generateElevenLabsVoiceover(text, apiKey, sceneIndex) {
  const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
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

  log('Voiceover', `Scene ${sceneIndex}: Generated with ElevenLabs`)
  return Buffer.from(await response.arrayBuffer())
}

async function createSilentAudioMP3(durationSec) {
  // Generate raw PCM silence, encode as MP3
  // For now, return empty buffer (will use FFmpeg to handle)
  return Buffer.alloc(0)
}

/**=== FFMPEG VIDEO EDITING ===*/

export async function editClipWithText(inputPath, outputPath, scene, tempDir, aspectRatio) {
  const duration = scene.durationSec || 10
  const text = scene.onScreenText !== 'none' ? scene.onScreenText : ''
  
  // Try editing with text first, fallback to without if drawtext fails
  try {
    await editClipWithTextInternal(inputPath, outputPath, scene, tempDir, aspectRatio, true)
  } catch (err) {
    const errMsg = String(err)
    if (errMsg.includes('drawtext') || errMsg.includes('No such filter') || errMsg.includes('Unknown filter')) {
      log('FFmpeg', `Text overlay failed (drawtext not available), retrying without text for scene ${scene.sceneIndex}`)
      try {
        await editClipWithTextInternal(inputPath, outputPath, scene, tempDir, aspectRatio, false)
      } catch (retryErr) {
        // Last resort: just scale and zoom without any effects
        log('FFmpeg', `All effects failed, using minimal filter chain for scene ${scene.sceneIndex}`)
        try {
          await editClipWithTextInternal(inputPath, outputPath, scene, tempDir, aspectRatio, false, true)
        } catch (minimalErr) {
          // Ultimate fallback: just copy and scale
          log('FFmpeg', `Minimal editing failed, copying clip as-is for scene ${scene.sceneIndex}`)
          const args = ['-y', '-i', inputPath, '-vf', ffmpegScaleFilter(aspectRatio), '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-t', String(duration), outputPath]
          await runFfmpeg(args, tempDir)
        }
      }
    } else {
      throw err
    }
  }
}

async function editClipWithTextInternal(inputPath, outputPath, scene, tempDir, aspectRatio, withText = true, minimal = false) {
  const duration = scene.durationSec || 10
  const text = withText && scene.onScreenText !== 'none' ? scene.onScreenText : ''
  
  // Build filter chain
  const filters = []
  
  // Scale to aspect ratio
  filters.push(ffmpegScaleFilter(aspectRatio))
  
  // Add text overlay with proper fontfile (if withText is true)
  if (text && !minimal) {
    try {
      const fontPath = await ensureFontExists()
      // Escape single quotes in text by replacing ' with '\''
      const textEscaped = text.replace(/'/g, "'\\''")
      // Use proper drawtext syntax with escaped font path
      // Note: FFmpeg drawtext expects font path without quotes in the filter string
      const drawTextFilter = `drawtext=fontfile=${fontPath}:text='${textEscaped}':fontsize=72:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=(h-text_h)/2-100:enable='between(t,0.1,${Math.max(0.5, duration-0.5)})'`
      filters.push(drawTextFilter)
    } catch (e) {
      // If text filter fails to build, skip it
      log('FFmpeg', `Text filter skipped: ${e instanceof Error ? e.message : e}`)
    }
  }
  
  // MrBeast-style zoom punch effect: zoom 100% -> 120% every 3 seconds
  if (!minimal) {
    // Create zoom pulses: Every 3 seconds, zoom from 1.0 to 1.15
    const zoomExpression = `min(1.0 + 0.15 * abs(sin(t / 3 * 3.14159)), 1.15)`
    filters.push(`zoompan=z='${zoomExpression}':d=1:x='(w/2-(w/zoom/2))':y='(h/2-(h/zoom/2))':fps=30`)
  }
  
  const filterString = filters.join(',')
  
  const args = [
    '-y',
    '-i', inputPath,
    '-t', String(duration),
    '-vf', filterString,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-an',  // No audio yet, will mix later
    outputPath,
  ]

  await runFfmpeg(args, tempDir)
}

export async function addVoiceoverAndMusic(videoPath, voiceoverPath, outputPath, tempDir, duration) {
  // If voiceover is empty, just add background music
  if (!voiceoverPath || (await fs.promises.stat(voiceoverPath).catch(() => null))?.size === 0) {
    return addBackgroundMusic(videoPath, outputPath, tempDir, duration)
  }

  const args = [
    '-y',
    '-i', videoPath,
    '-i', voiceoverPath,
    '-filter_complex', `[1:a]aformat=sample_rates=44100:channel_layouts=stereo[voice];[voice]volume=1.0[voiced];[voiced]apad=whole_dur=${duration}[voiced_padded];[voiced_padded]amix=inputs=1[audio]`,
    '-map', '0:v',
    '-map', '[audio]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    outputPath,
  ]

  await runFfmpeg(args, tempDir)
}

async function addBackgroundMusic(videoPath, outputPath, tempDir, duration) {
  // Use FFmpeg to add silence or background music if available
  const musicPath = path.join(process.cwd(), 'public', 'assets', 'music.mp3')
  const hasMusicFile = await fs.promises.access(musicPath).then(() => true).catch(() => false)

  if (hasMusicFile) {
    const args = [
      '-y',
      '-i', videoPath,
      '-i', musicPath,
      '-c:v', 'copy',
      '-filter_complex', `[1:a]volume=0.15,aformat=sample_rates=44100:channel_layouts=stereo[music];[music]apad=whole_dur=${duration}[music_padded];[music_padded]atrim=duration=${duration}[final_audio]`,
      '-map', '0:v',
      '-map', '[final_audio]',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      outputPath,
    ]
    await runFfmpeg(args, tempDir)
  } else {
    // No music file, just copy video without audio
    const args = ['-y', '-i', videoPath, '-c:v', 'copy', '-an', outputPath]
    await runFfmpeg(args, tempDir)
  }
}

export async function concatenateClips(clipPaths, outputPath, tempDir, duration) {
  const concatFile = path.join(tempDir, 'concat.txt')
  const content = clipPaths.map(clip => `file '${clip.replace(/'/g, "'\\''")}'`).join('\n')
  await fs.promises.writeFile(concatFile, content, 'utf8')

  const args = [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ]

  await runFfmpeg(args, tempDir)
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

export async function buildProductionVideo(prompt, durationSec = 120, progressCallback = null, aspectRatio = '16:9') {
  const tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), 'alpha-video-'))
  const outputPath = path.join(tempDir, 'final-video.mp4')

  try {
    // Step 1: Generate script with Groq
    streamProgress(progressCallback, 1, `Writing script with Groq...`, { phase: 'script' })
    const script = await generateVideoScript(prompt, durationSec)
    streamProgress(progressCallback, 1, `Script ready: ${script.length} scenes`)

    // Step 2: Download clips from Pexels
    streamProgress(progressCallback, 2, `Searching Pexels for ${script.length} video clips...`)
    const clips = []
    for (const scene of script) {
      const clip = await downloadPexelsClip(scene, aspectRatio)
      if (clip) {
        clips.push(clip)
        const clipPath = path.join(tempDir, `clip-${scene.sceneIndex}.mp4`)
        await fs.promises.writeFile(clipPath, clip.bytes)
        streamProgress(progressCallback, 2, `Downloaded clip ${scene.sceneIndex + 1}/${script.length}`, { phase: 'download', clipIndex: scene.sceneIndex, clipCount: script.length })
      }
    }
    streamProgress(progressCallback, 2, `Found ${clips.length}/${script.length} clips`)

    // Step 3: Generate voiceovers
    streamProgress(progressCallback, 3, `Generating voiceovers for ${script.length} scenes...`)
    const voiceovers = []
    for (const scene of script) {
      const voiceBytes = await generateVoiceoverMP3(scene.narration, scene.sceneIndex)
      const voicePath = path.join(tempDir, `voice-${scene.sceneIndex}.mp3`)
      if (voiceBytes && voiceBytes.length > 0) {
        await fs.promises.writeFile(voicePath, voiceBytes)
        voiceovers.push(voicePath)
      }
      streamProgress(progressCallback, 3, `Voiceover ${scene.sceneIndex + 1}/${script.length} done`, { phase: 'voiceover', clipIndex: scene.sceneIndex, clipCount: script.length })
    }

    // Step 4: Edit each clip with text, effects, voiceover
    streamProgress(progressCallback, 4, `Editing clips with text, effects, audio...`)
    const editedClips = []
    for (let i = 0; i < script.length; i++) {
      const scene = script[i]
      const clipPath = path.join(tempDir, `clip-${i}.mp4`)
      
      if (!await fs.promises.access(clipPath).then(() => true).catch(() => false)) {
        streamProgress(progressCallback, 4, `Clip ${i + 1} missing, skipping`, { phase: 'edit', clipIndex: i, clipCount: script.length })
        continue
      }

      const editedPath = path.join(tempDir, `edited-${i}.mp4`)
      await editClipWithText(clipPath, editedPath, scene, tempDir, aspectRatio)
      
      // Add voiceover
      const withAudioPath = path.join(tempDir, `audio-${i}.mp4`)
      const voicePath = voiceovers[i]
      if (voicePath) {
        await addVoiceoverAndMusic(editedPath, voicePath, withAudioPath, tempDir, scene.durationSec)
      } else {
        await addVoiceoverAndMusic(editedPath, null, withAudioPath, tempDir, scene.durationSec)
      }
      
      editedClips.push(withAudioPath)
      streamProgress(progressCallback, 4, `Edited clip ${i + 1}/${script.length}`, { phase: 'edit', clipIndex: i, clipCount: script.length })
    }

    if (editedClips.length === 0) {
      throw new Error('No clips were successfully edited')
    }

    // Step 5: Concatenate all clips
    streamProgress(progressCallback, 5, `Merging ${editedClips.length} clips into final video...`)
    await concatenateClips(editedClips, outputPath, tempDir, durationSec)
    streamProgress(progressCallback, 5, `Final video concatenated`)

    // Step 6: Verify and return
    const stats = await fs.promises.stat(outputPath)
    if (stats.size === 0) throw new Error('Output video is empty')

    streamProgress(progressCallback, 6, `Done! Video size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`)
    const bytes = await fs.promises.readFile(outputPath)
    
    return {
      bytes,
      mime: 'video/mp4',
      script,
      clipsUsed: editedClips.length,
      durationSec,
    }
  } finally {
    // Cleanup
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}
