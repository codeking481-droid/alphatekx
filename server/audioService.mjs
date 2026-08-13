/**
 * Audio Service
 * Handles text-to-speech and audio file generation
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'

/**
 * Generate voiceover audio using ElevenLabs or fallback to system TTS
 */
export async function generateVoiceover(text, outputPath) {
  try {
    console.log(`[AUDIO] Generating voiceover: "${text.substring(0, 50)}..."`)

    if (ELEVENLABS_API_KEY) {
      return await generateWithElevenLabs(text, outputPath)
    } else {
      return await generateWithGTTS(text, outputPath)
    }
  } catch (error) {
    console.error('[AUDIO] Voiceover generation error:', error.message)
    // Create silent audio as fallback
    return await createSilentAudio(10, outputPath) // 10 seconds of silence
  }
}

async function generateWithElevenLabs(text, outputPath) {
  try {
    console.log('[AUDIO] Using ElevenLabs TTS...')
    
    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + ELEVENLABS_VOICE_ID, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`)
    }

    const buffer = await response.arrayBuffer()
    await fs.promises.writeFile(outputPath, Buffer.from(buffer))
    
    console.log(`[AUDIO] Voiceover saved: ${outputPath}`)
    return outputPath
  } catch (error) {
    console.error('[AUDIO] ElevenLabs error:', error.message)
    throw error
  }
}

async function generateWithGTTS(text, outputPath) {
  try {
    console.log('[AUDIO] Using Google TTS (gTTS)...')
    
    // Use a simple HTTP request to Google Translate TTS
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    })

    if (!response.ok) {
      throw new Error(`Google TTS failed: ${response.status}`)
    }

    const buffer = await response.arrayBuffer()
    await fs.promises.writeFile(outputPath, Buffer.from(buffer))
    
    console.log(`[AUDIO] Voiceover saved: ${outputPath}`)
    return outputPath
  } catch (error) {
    console.error('[AUDIO] gTTS error:', error.message)
    throw error
  }
}

/**
 * Create silent audio for specified duration
 */
export async function createSilentAudio(durationSeconds, outputPath) {
  try {
    console.log(`[AUDIO] Creating ${durationSeconds}s silent audio...`)
    
    const args = [
      '-f', 'lavfi',
      '-i', `anullsrc=r=44100:cl=mono`,
      '-t', durationSeconds.toString(),
      '-q:a', '9',
      '-acodec', 'libmp3lame',
      outputPath,
    ]

    const result = spawnSync('ffmpeg', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    })

    if (result.error || result.status !== 0) {
      throw new Error(`FFmpeg silent audio failed: ${result.stderr}`)
    }

    console.log(`[AUDIO] Silent audio created: ${outputPath}`)
    return outputPath
  } catch (error) {
    console.error('[AUDIO] Silent audio error:', error.message)
    throw error
  }
}

/**
 * Mix audio tracks together
 */
export async function mixAudio(tracks, outputPath, totalDuration) {
  try {
    console.log(`[AUDIO] Mixing ${tracks.length} audio tracks...`)

    // Build FFmpeg filter complex for mixing
    const filterParts = []
    const inputArgs = []
    
    for (let i = 0; i < tracks.length; i++) {
      inputArgs.push('-i', tracks[i].path)
      const inputLabel = `[${i}:a]`
      if (tracks[i].volume !== undefined) {
        filterParts.push(`${inputLabel}volume=${tracks[i].volume}[a${i}]`)
      } else {
        filterParts.push(`${inputLabel}[a${i}]`)
      }
    }

    const mixLabels = tracks.map((_, i) => `[a${i}]`).join('')
    const filterComplex = filterParts.join(';') + `;${mixLabels}amix=inputs=${tracks.length}:duration=longest[out]`

    const args = [
      ...inputArgs,
      '-filter_complex', filterComplex,
      '-map', '[out]',
      '-acodec', 'aac',
      '-b:a', '192k',
      '-t', totalDuration.toString(),
      outputPath,
    ]

    const result = spawnSync('ffmpeg', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    })

    if (result.error || result.status !== 0) {
      throw new Error(`FFmpeg audio mixing failed: ${result.stderr}`)
    }

    console.log(`[AUDIO] Mixed audio saved: ${outputPath}`)
    return outputPath
  } catch (error) {
    console.error('[AUDIO] Mixing error:', error.message)
    throw error
  }
}

export default { generateVoiceover, createSilentAudio, mixAudio }
