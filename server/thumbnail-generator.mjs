/**
 * AI Thumbnail Generator for YouTube
 * Creates engaging, high-converting thumbnails with text overlays
 */

import sharp from 'sharp'
import { createCanvas } from 'canvas'
import path from 'node:path'
import fs from 'node:fs'
import { tmpdir } from 'node:os'

/**=== THUMBNAIL TEMPLATES ===*/

const THUMBNAIL_SIZES = {
  width: 1280,
  height: 720,
}

// YouTube recommended: 1280x720 (16:9)

/**=== GENERATE THUMBNAIL ===*/

export async function generateThumbnail(topic, scene, clipThumbnailPath = null) {
  try {
    // Create base canvas
    const canvas = createCanvas(THUMBNAIL_SIZES.width, THUMBNAIL_SIZES.height)
    const ctx = canvas.getContext('2d')
    
    // Fill background with vibrant gradient
    const gradient = ctx.createLinearGradient(0, 0, THUMBNAIL_SIZES.width, THUMBNAIL_SIZES.height)
    gradient.addColorStop(0, '#FF0000')  // Red
    gradient.addColorStop(1, '#FF6600')  // Orange
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, THUMBNAIL_SIZES.width, THUMBNAIL_SIZES.height)
    
    // Add clip image if available (bottom half)
    if (clipThumbnailPath && fs.existsSync(clipThumbnailPath)) {
      try {
        const clipBuffer = fs.readFileSync(clipThumbnailPath)
        const clipImage = await sharp(clipBuffer)
          .resize(THUMBNAIL_SIZES.width, Math.floor(THUMBNAIL_SIZES.height * 0.5), { fit: 'cover' })
          .raw()
          .toBuffer({ resolveWithObject: true })
        
        const imageData = ctx.createImageData(clipImage.info.width, clipImage.info.height)
        imageData.data.set(clipImage.data)
        ctx.putImageData(imageData, 0, THUMBNAIL_SIZES.height * 0.5)
      } catch (err) {
        console.warn('[Thumbnail] Failed to add clip image:', err instanceof Error ? err.message : err)
      }
    }
    
    // Add semi-transparent overlay for text readability
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.fillRect(0, 0, THUMBNAIL_SIZES.width, THUMBNAIL_SIZES.height * 0.6)
    
    // Add main headline text
    const headline = generateHeadline(topic)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 80px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
    ctx.shadowBlur = 15
    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 2
    
    // Wrap text if needed
    wrapText(ctx, headline, THUMBNAIL_SIZES.width / 2, THUMBNAIL_SIZES.height / 4, THUMBNAIL_SIZES.width - 40, 80)
    
    // Add secondary text (curiosity hook)
    const hook = generateHook(scene?.emotion || 'shocking')
    ctx.fillStyle = '#FFFF00'
    ctx.font = 'bold 60px Arial'
    ctx.fillText(hook, THUMBNAIL_SIZES.width / 2, THUMBNAIL_SIZES.height * 0.65)
    
    // Add arrow/attention grabber
    drawAttentionElements(ctx)
    
    // Save to temp file
    const thumbnailPath = path.join(tmpdir(), `thumbnail-${Date.now()}.png`)
    const buffer = canvas.toBuffer('image/png')
    fs.writeFileSync(thumbnailPath, buffer)
    
    console.log('[Thumbnail] Generated:', thumbnailPath)
    return { buffer, path: thumbnailPath, width: THUMBNAIL_SIZES.width, height: THUMBNAIL_SIZES.height }
  } catch (error) {
    console.error('[Thumbnail] Generation failed:', error instanceof Error ? error.message : error)
    throw new Error(`Failed to generate thumbnail: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

function generateHeadline(topic) {
  const headlines = [
    `${topic}?`,
    `YOU NEED TO SEE THIS`,
    `SHOCKING: ${topic.toUpperCase()}`,
    `WOW! ${topic}`,
    `THIS IS INSANE`,
  ]
  return headlines[Math.floor(Math.random() * headlines.length)]
}

function generateHook(emotion = 'shocking') {
  const hooks = {
    shocking: ['WAIT...', 'NO WAY!', 'WHAT?!'],
    energetic: ['INSANE!', 'EPIC!', 'WOW!'],
    sad: ['HEARTBREAKING', 'EMOTIONAL', 'SAD'],
    inspiring: ['AMAZING!', 'INCREDIBLE', 'YES!'],
  }
  const emotionHooks = hooks[emotion] || hooks.shocking
  return emotionHooks[Math.floor(Math.random() * emotionHooks.length)]
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ')
  let line = ''
  
  for (let i = 0; i < words.length; i++) {
    const testLine = line + (line ? ' ' : '') + words[i]
    const metrics = ctx.measureText(testLine)
    
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, y)
      line = words[i]
      y += lineHeight
    } else {
      line = testLine
    }
  }
  ctx.fillText(line, x, y)
}

function drawAttentionElements(ctx) {
  // Draw red circles at top corners
  ctx.fillStyle = '#FF0000'
  ctx.beginPath()
  ctx.arc(100, 80, 60, 0, Math.PI * 2)
  ctx.fill()
  ctx.closePath()
  
  ctx.beginPath()
  ctx.arc(THUMBNAIL_SIZES.width - 100, 80, 60, 0, Math.PI * 2)
  ctx.fill()
  ctx.closePath()
  
  // Draw arrows pointing to center
  drawArrow(ctx, 50, 100, 150, 150)
  drawArrow(ctx, THUMBNAIL_SIZES.width - 50, 100, THUMBNAIL_SIZES.width - 150, 150)
}

function drawArrow(ctx, fromX, fromY, toX, toY) {
  const headlen = 20
  const angle = Math.atan2(toY - fromY, toX - fromX)
  
  ctx.strokeStyle = '#FFFFFF'
  ctx.fillStyle = '#FFFFFF'
  ctx.lineWidth = 3
  
  // Draw line
  ctx.beginPath()
  ctx.moveTo(fromX, fromY)
  ctx.lineTo(toX, toY)
  ctx.stroke()
  
  // Draw arrowhead
  ctx.beginPath()
  ctx.moveTo(toX, toY)
  ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
}

/**=== BATCH THUMBNAIL GENERATION ===*/

export async function generateThumbnailsForVideo(script, clipThumbnails = []) {
  const thumbnails = []
  
  // Generate 3 variations for A/B testing
  for (let i = 0; i < 3; i++) {
    const scene = script[Math.floor(Math.random() * script.length)]
    const clipThumb = clipThumbnails[Math.floor(Math.random() * clipThumbnails.length)]
    
    try {
      const thumbnail = await generateThumbnail(
        script[0]?.narration?.substring(0, 30) || 'Video',
        scene,
        clipThumb
      )
      thumbnails.push({ variation: i + 1, ...thumbnail })
    } catch (err) {
      console.warn(`[Thumbnail] Failed to generate variation ${i + 1}:`, err instanceof Error ? err.message : err)
    }
  }
  
  return thumbnails
}

/**=== OPTIMIZE FOR UPLOAD ===*/

export async function optimizeThumbnailForYouTube(thumbnailBuffer) {
  try {
    const optimized = await sharp(thumbnailBuffer)
      .resize(1280, 720, { fit: 'fill' })
      .png({ quality: 90 })
      .toBuffer()
    
    return optimized
  } catch (error) {
    console.error('[Thumbnail] Optimization failed:', error instanceof Error ? error.message : error)
    throw new Error(`Failed to optimize thumbnail: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
