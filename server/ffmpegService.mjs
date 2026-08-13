/**
 * FFmpeg Video Processing Service
 * Handles video trimming, transitions, rendering, and final composition
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

export function trimVideo(inputPath, outputPath, startTime, duration) {
  try {
    console.log(`[FFMPEG] Trimming ${inputPath}: ${startTime}s for ${duration}s`)

    const args = [
      '-i', inputPath,
      '-ss', startTime.toString(),
      '-t', duration.toString(),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-c:a', 'aac',
      outputPath,
    ]

    const result = spawnSync('ffmpeg', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
    })

    if (result.error || result.status !== 0) {
      throw new Error(`Trim failed: ${result.stderr}`)
    }

    console.log(`[FFMPEG] Trimmed video: ${outputPath}`)
    return outputPath
  } catch (error) {
    console.error('[FFMPEG] Trim error:', error.message)
    throw error
  }
}

export function addTransition(inputPath, outputPath, transitionType = 'fade', duration = 0.5) {
  try {
    console.log(`[FFMPEG] Adding ${transitionType} transition to ${inputPath}`)

    let filterComplex = '[0:v]'
    
    switch (transitionType) {
      case 'crossfade':
        filterComplex += 'format=yuv420p[v]'
        break
      case 'zoom':
        // Slow zoom effect
        filterComplex += `scale=iw*1.1:ih*1.1[scaled];[scaled]crop=iw:ih[v]`
        break
      case 'slide':
        filterComplex += `scale=iw:ih[v]`
        break
      default:
        filterComplex += `format=yuv420p[v]`
    }

    const args = [
      '-i', inputPath,
      '-filter:v', filterComplex,
      '-map', '[v]',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-c:a', 'copy',
      outputPath,
    ]

    const result = spawnSync('ffmpeg', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
    })

    if (result.error || result.status !== 0) {
      throw new Error(`Transition failed: ${result.stderr}`)
    }

    console.log(`[FFMPEG] Transition added: ${outputPath}`)
    return outputPath
  } catch (error) {
    console.error('[FFMPEG] Transition error:', error.message)
    throw error
  }
}

export function addTextOverlay(inputPath, outputPath, text, duration) {
  try {
    console.log(`[FFMPEG] Adding text overlay: "${text}"`)

    const filterComplex = `drawtext=text='${text}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:borderw=2:bordercolor=black`

    const args = [
      '-i', inputPath,
      '-vf', filterComplex,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-c:a', 'copy',
      outputPath,
    ]

    const result = spawnSync('ffmpeg', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
    })

    if (result.error || result.status !== 0) {
      throw new Error(`Text overlay failed: ${result.stderr}`)
    }

    console.log(`[FFMPEG] Text overlay added: ${outputPath}`)
    return outputPath
  } catch (error) {
    console.error('[FFMPEG] Overlay error:', error.message)
    throw error
  }
}

export function concatenateVideos(videoPaths, outputPath) {
  try {
    console.log(`[FFMPEG] Concatenating ${videoPaths.length} videos...`)

    // Create concat demuxer file
    const concatFile = path.join(path.dirname(outputPath), 'concat.txt')
    const concatContent = videoPaths.map(p => `file '${p}'`).join('\n')
    fs.writeFileSync(concatFile, concatContent)

    const args = [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-c:v', 'copy',
      '-c:a', 'copy',
      outputPath,
    ]

    const result = spawnSync('ffmpeg', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300000,
    })

    // Cleanup concat file
    fs.unlinkSync(concatFile)

    if (result.error || result.status !== 0) {
      throw new Error(`Concatenation failed: ${result.stderr}`)
    }

    console.log(`[FFMPEG] Videos concatenated: ${outputPath}`)
    return outputPath
  } catch (error) {
    console.error('[FFMPEG] Concat error:', error.message)
    throw error
  }
}

export function mergeAudioVideo(videoPath, audioPath, outputPath) {
  try {
    console.log(`[FFMPEG] Merging video and audio...`)

    const args = [
      '-i', videoPath,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-shortest',
      outputPath,
    ]

    const result = spawnSync('ffmpeg', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
    })

    if (result.error || result.status !== 0) {
      throw new Error(`Merge failed: ${result.stderr}`)
    }

    console.log(`[FFMPEG] Audio/video merged: ${outputPath}`)
    return outputPath
  } catch (error) {
    console.error('[FFMPEG] Merge error:', error.message)
    throw error
  }
}

export function scaleVideo(inputPath, outputPath, width = 1920, height = 1080) {
  try {
    console.log(`[FFMPEG] Scaling video to ${width}x${height}`)

    const args = [
      '-i', inputPath,
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      outputPath,
    ]

    const result = spawnSync('ffmpeg', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 180000,
    })

    if (result.error || result.status !== 0) {
      throw new Error(`Scale failed: ${result.stderr}`)
    }

    console.log(`[FFMPEG] Video scaled: ${outputPath}`)
    return outputPath
  } catch (error) {
    console.error('[FFMPEG] Scale error:', error.message)
    throw error
  }
}

export default {
  trimVideo,
  addTransition,
  addTextOverlay,
  concatenateVideos,
  mergeAudioVideo,
  scaleVideo,
}
