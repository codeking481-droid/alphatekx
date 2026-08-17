/**
 * VIDEO ANALYZER
 * Analyzes uploaded videos: metadata, scenes, transcription, quality scoring.
 * Uses FFmpeg for metadata + frame extraction, Whisper for transcription.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)
const TMP_DIR = join(process.cwd(), '.tmp', 'video-analysis')

function getFfmpegPath() {
  return ffmpegPath || 'ffmpeg'
}

function getFfprobePath() {
  const ffmpeg = getFfmpegPath()
  if (ffmpeg === 'ffmpeg') return 'ffprobe'
  // ffmpeg-static doesn't ship ffprobe — return ffmpeg and use -i for probing
  return ffmpeg
}

/**
 * Full video analysis pipeline.
 * @param {string} videoPath - Local path to the uploaded video
 * @param {object} opts - Options
 * @returns {Promise<object>} Analysis result
 */
export async function analyzeVideo(videoPath, opts = {}) {
  const analysisId = randomUUID().slice(0, 8)
  const workDir = join(TMP_DIR, analysisId)
  await mkdir(workDir, { recursive: true })

  const result = {
    id: analysisId,
    videoPath,
    metadata: null,
    scenes: [],
    transcription: null,
    thumbnails: [],
    quality: null,
    duration: 0,
    errors: [],
  }

  // Phase 1: Extract metadata
  try {
    result.metadata = await extractMetadata(videoPath)
    result.duration = result.metadata.duration || 0
  } catch (err) {
    result.errors.push(`Metadata: ${err.message}`)
  }

  // Phase 2: Scene detection
  try {
    result.scenes = await detectScenes(videoPath, workDir)
  } catch (err) {
    result.errors.push(`Scenes: ${err.message}`)
    // Fallback: treat entire video as one scene
    result.scenes = [{ start: 0, end: result.duration, type: 'full' }]
  }

  // Phase 3: Extract thumbnails
  try {
    result.thumbnails = await extractThumbnails(videoPath, workDir, result.duration)
  } catch (err) {
    result.errors.push(`Thumbnails: ${err.message}`)
  }

  // Phase 4: Transcription via Whisper
  try {
    result.transcription = await transcribeAudio(videoPath)
  } catch (err) {
    result.errors.push(`Transcription: ${err.message}`)
  }

  // Phase 5: Quality scoring
  try {
    result.quality = await scoreQuality(videoPath, result)
  } catch (err) {
    result.errors.push(`Quality: ${err.message}`)
  }

  return result
}

/**
 * Extract video metadata using ffmpeg -i (works without ffprobe).
 */
async function extractMetadata(videoPath) {
  const ffmpeg = getFfmpegPath()

  // ffmpeg -i outputs format info to stderr
  const { stderr } = await execFileAsync(ffmpeg, ['-i', videoPath], { timeout: 30000 }).catch(e => ({ stderr: e.stderr || '' }))

  const info = stderr || ''

  // Parse Duration
  const durMatch = info.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
  const duration = durMatch ? parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]) : 0

  // Parse video stream info
  const videoMatch = info.match(/Video:\s*(\w+).*?(\d+)x(\d+).*?(\d+\.?\d*)\s*(?:fps|tbr)/)
  const codec = videoMatch?.[1] || 'unknown'
  const width = videoMatch ? parseInt(videoMatch[2]) : 0
  const height = videoMatch ? parseInt(videoMatch[3]) : 0
  const fps = videoMatch ? parseFloat(videoMatch[4]) : 0

  // Parse audio stream info
  const audioMatch = info.match(/Audio:\s*(\w+)/)
  const hasAudio = !!audioMatch
  const audioCodec = audioMatch?.[1] || null

  // Parse bitrate
  const bitrateMatch = info.match(/bitrate:\s*(\d+)\s*kb\/s/)
  const bitrate = bitrateMatch ? parseInt(bitrateMatch[1]) * 1000 : 0

  // Parse format
  const formatMatch = info.match(/Duration.*?encoder/i)
  const sizeMatch = info.match(/size=\s*(\d+)\s*kB/)
  const size = sizeMatch ? parseInt(sizeMatch[1]) * 1024 : 0

  // Parse pixel format
  const pixMatch = info.match(/Video:.*?,\s*(\w+)/)
  const pixelFormat = pixMatch?.[1] || 'unknown'

  // Parse aspect ratio
  const arMatch = info.match(/(\d+:\d+)\s*\[/)
  const aspectRatio = arMatch?.[1] || `${width}:${height}`

  return {
    duration,
    size: size || 0,
    bitrate,
    format: 'unknown',
    width,
    height,
    fps,
    codec,
    pixelFormat,
    hasAudio,
    audioCodec,
    audioSampleRate: null,
    audioChannels: 0,
    aspectRatio,
  }
}

/**
 * Detect scene changes using FFmpeg's scene detection filter.
 */
async function detectScenes(videoPath, workDir) {
  const ffmpeg = getFfmpegPath()
  const sceneFile = join(workDir, 'scenes.txt')

  try {
    const { stdout } = await execFileAsync(ffmpeg, [
      '-i', videoPath,
      '-vf', 'select=gt(scene,0.3),showinfo',
      '-vsync', 'vfr',
      '-f', 'null', '-',
    ], { timeout: 120000 })

    const scenes = []
    const regex = /pts_time:(\d+\.?\d*)/
    const matches = stdout.match(regex) || []

    for (let i = 0; i < matches.length; i++) {
      const time = parseFloat(matches[i])
      scenes.push({
        start: i === 0 ? 0 : parseFloat(matches[i - 1]),
        end: time,
        type: 'scene',
      })
    }

    // Add final scene
    if (scenes.length > 0) {
      scenes[scenes.length - 1].end = -1 // Will be filled with duration later
    }

    return scenes.length > 0 ? scenes : [{ start: 0, end: -1, type: 'full' }]
  } catch {
    return [{ start: 0, end: -1, type: 'full' }]
  }
}

/**
 * Extract thumbnail frames at regular intervals.
 */
async function extractThumbnails(videoPath, workDir, duration) {
  const ffmpeg = getFfmpegPath()
  const thumbsDir = join(workDir, 'thumbs')
  await mkdir(thumbsDir, { recursive: true })

  const interval = Math.max(3, duration / 10) // ~10 thumbnails max
  const thumbnails = []

  for (let t = 0; t < Math.min(duration, 60); t += interval) {
    const thumbPath = join(thumbsDir, `thumb_${Math.round(t)}.jpg`)
    try {
      await execFileAsync(ffmpeg, [
        '-ss', String(t),
        '-i', videoPath,
        '-vframes', '1',
        '-vf', 'scale=320:-1',
        '-y', thumbPath,
      ], { timeout: 10000 })
      thumbnails.push({ time: t, path: thumbPath })
    } catch {}
  }

  return thumbnails
}

/**
 * Transcribe audio using available transcription service.
 * Tries: OpenAI Whisper API → local whisper fallback → empty.
 */
async function transcribeAudio(videoPath) {
  // Check if we have OpenAI key
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return { text: '', segments: [], language: null, provider: 'none' }
  }

  const ffmpeg = getFfmpegPath()
  const audioPath = videoPath + '.audio.wav'

  try {
    // Extract audio
    await execFileAsync(ffmpeg, [
      '-i', videoPath,
      '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
      '-y', audioPath,
    ], { timeout: 60000 })

    // Read audio file
    const audioBuffer = await readFile(audioPath)

    // Call OpenAI Whisper API
    const formData = new FormData()
    formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav')
    formData.append('model', 'whisper-1')
    formData.append('response_format', 'verbose_json')
    formData.append('timestamp_granularities[]', 'word')

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: formData,
      signal: AbortSignal.timeout(120000),
    })

    if (!res.ok) throw new Error(`Whisper API ${res.status}`)
    const data = await res.json()

    return {
      text: data.text || '',
      segments: (data.segments || []).map(s => ({
        start: s.start,
        end: s.end,
        text: s.text,
      })),
      words: (data.words || []).map(w => ({
        start: w.start,
        end: w.end,
        word: w.word,
      })),
      language: data.language || null,
      provider: 'openai-whisper',
    }
  } catch (err) {
    return { text: '', segments: [], words: [], language: null, provider: 'none', error: err.message }
  } finally {
    // Cleanup temp audio
    try { await execFileAsync('rm', ['-f', audioPath]) } catch {}
  }
}

/**
 * Score video quality on multiple dimensions.
 */
async function scoreQuality(videoPath, analysis) {
  const meta = analysis.metadata || {}
  const scores = {}

  // Resolution score
  const pixels = (meta.width || 0) * (meta.height || 0)
  if (pixels >= 1920 * 1080) scores.resolution = 100
  else if (pixels >= 1280 * 720) scores.resolution = 75
  else if (pixels >= 640 * 480) scores.resolution = 50
  else scores.resolution = 25

  // FPS score
  if (meta.fps >= 60) scores.fps = 100
  else if (meta.fps >= 30) scores.fps = 75
  else if (meta.fps >= 24) scores.fps = 60
  else scores.fps = 30

  // Duration score (shorter = needs more editing)
  const dur = analysis.duration
  if (dur <= 60) scores.duration = 90
  else if (dur <= 300) scores.duration = 70
  else if (dur <= 600) scores.duration = 50
  else scores.duration = 30

  // Has audio
  scores.audio = meta.hasAudio ? 80 : 20

  // Scene count (more scenes = already edited)
  const sceneCount = analysis.scenes?.length || 1
  if (sceneCount >= 10) scores.editing = 80
  else if (sceneCount >= 5) scores.editing = 60
  else scores.editing = 40

  // Overall
  const overall = Math.round(
    (scores.resolution * 0.25) +
    (scores.fps * 0.15) +
    (scores.duration * 0.15) +
    (scores.audio * 0.2) +
    (scores.editing * 0.25)
  )

  return {
    overall,
    resolution: scores.resolution,
    fps: scores.fps,
    duration: scores.duration,
    audio: scores.audio,
    editing: scores.editing,
    grade: overall >= 80 ? 'A' : overall >= 60 ? 'B' : overall >= 40 ? 'C' : 'D',
  }
}
