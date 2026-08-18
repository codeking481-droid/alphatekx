/**
 * Pexels Video API Service
 * Handles video search, filtering, and download from Pexels
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'demo-key'
const PEXELS_BASE_URL = 'https://api.pexels.com/videos'

export async function searchPexelsVideos(query, options = {}) {
  const { perPage = 5, page = 1 } = options
  
  try {
    console.log(`[PEXELS] Searching for: "${query}"`)
    const url = new URL(`${PEXELS_BASE_URL}/search`)
    url.searchParams.set('query', query)
    url.searchParams.set('per_page', perPage)
    url.searchParams.set('page', page)

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': PEXELS_API_KEY,
        'User-Agent': 'Alphatekx-Video-Generator/1.0'
      }
    })

    if (!response.ok) {
      if (response.status === 401) throw new Error('Invalid Pexels API key')
      if (response.status === 429) throw new Error('Pexels rate limit exceeded')
      throw new Error(`Pexels search failed: ${response.status}`)
    }

    const data = await response.json()
    return data.videos || []
  } catch (error) {
    console.error('[PEXELS] Search error:', error.message)
    // Return fallback videos if search fails
    return getFallbackVideos(query)
  }
}

export async function downloadVideo(videoUrl, outputPath) {
  try {
    console.log(`[PEXELS] Downloading video to ${outputPath}`)
    const response = await fetch(videoUrl)
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`)
    }

    const buffer = await response.arrayBuffer()
    const fs = await import('node:fs').then(m => m.promises)
    await fs.writeFile(outputPath, Buffer.from(buffer))
    
    console.log(`[PEXELS] Video downloaded successfully: ${outputPath}`)
    return outputPath
  } catch (error) {
    console.error('[PEXELS] Download error:', error.message)
    throw error
  }
}

export function getVideoQualityUrl(video, quality = 'hd') {
  // Get best quality video file from Pexels response
  if (!video.video_files || video.video_files.length === 0) {
    return null
  }

  // Sort by quality preference: hd > sd
  const files = video.video_files.sort((a, b) => {
    const qualityOrder = { hd: 0, sd: 1, mobile: 2 }
    return (qualityOrder[a.quality] ?? 99) - (qualityOrder[b.quality] ?? 99)
  })

  return files[0]?.link || null
}

function getFallbackVideos(query) {
  // Fallback videos if Pexels fails
  const fallbacks = {
    'cityscape': 'https://videos.pexels.com/video-files/7191360/7191360-sd_640_360_25fps.mp4',
    'nature': 'https://videos.pexels.com/video-files/6439128/6439128-sd_640_360_30fps.mp4',
    'beach': 'https://videos.pexels.com/video-files/4633661/4633661-sd_640_360_25fps.mp4',
    'mountain': 'https://videos.pexels.com/video-files/3397976/3397976-sd_640_360_30fps.mp4',
    'forest': 'https://videos.pexels.com/video-files/4611256/4611256-sd_640_360_30fps.mp4',
    'ocean': 'https://videos.pexels.com/video-files/5388878/5388878-sd_640_360_25fps.mp4',
  }

  const lowerQuery = query.toLowerCase()
  for (const [key, url] of Object.entries(fallbacks)) {
    if (lowerQuery.includes(key)) {
      console.log(`[PEXELS] Using fallback video for "${key}"`)
      return [{ video_files: [{ link: url, quality: 'sd' }] }]
    }
  }

  // Return a generic fallback
  return [{ video_files: [{ link: fallbacks.cityscape, quality: 'sd' }] }]
}

export default { searchPexelsVideos, downloadVideo, getVideoQualityUrl }
