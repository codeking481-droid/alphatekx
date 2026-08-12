/**
 * YouTube Integration for Glass Studio
 * Handles uploading, scheduling, and managing video posts
 */

import { google } from 'googleapis'
import fs from 'node:fs'
import path from 'node:path'

const youtube = google.youtube('v3')

/**=== AUTHENTICATION ===*/

export async function getYouTubeAuth() {
  const credentialsPath = process.env.YOUTUBE_CREDENTIALS_PATH || path.join(process.cwd(), 'youtube-credentials.json')
  
  if (!fs.existsSync(credentialsPath)) {
    throw new Error('YouTube credentials not found. Set YOUTUBE_CREDENTIALS_PATH or place youtube-credentials.json in project root')
  }
  
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
  
  const auth = new google.auth.OAuth2(
    credentials.installed.client_id,
    credentials.installed.client_secret,
    credentials.installed.redirect_uris[0]
  )
  
  // If we have a stored token, use it
  const tokenPath = process.env.YOUTUBE_TOKEN_PATH || path.join(process.cwd(), 'youtube-token.json')
  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
    auth.setCredentials(token)
  }
  
  return auth
}

/**=== VIDEO METADATA GENERATION ===*/

export function generateVideoMetadata(topic, script) {
  // Generate compelling title from topic
  const title = generateTitle(topic)
  
  // Generate description from script and topic
  const description = generateDescription(topic, script)
  
  // Generate tags for SEO
  const tags = generateTags(topic, script)
  
  return { title, description, tags }
}

function generateTitle(topic) {
  // Create engaging YouTube titles
  const hooks = [
    `YOU WON'T BELIEVE THIS: ${topic}`,
    `THE ULTIMATE GUIDE TO ${topic.toUpperCase()}`,
    `${topic} - SHOCKING TRUTH REVEALED`,
    `BEST ${topic.toUpperCase()} EVER`,
    `${topic} - INCREDIBLE TRANSFORMATION`,
  ]
  return hooks[Math.floor(Math.random() * hooks.length)]
}

function generateDescription(topic, script) {
  const narrations = script.map(s => s.narration).join(' ')
  return `Watch this incredible video about ${topic}.\n\nIn this video, we explore the amazing world of ${topic}.\n\n${narrations.substring(0, 500)}...\n\n⏱️ Timestamps:\n00:00 - Intro\n02:00 - Main content\n07:00 - Conclusion\n\nDon't forget to LIKE and SUBSCRIBE for more amazing content! 🔥`
}

function generateTags(topic, script) {
  const baseWords = topic.split(' ').slice(0, 3)
  const emotionalTags = ['viral', 'trending', 'amazing', 'shocking', 'must watch']
  const categoryTags = ['video', 'content', 'tutorial', 'guide', 'news']
  
  return [
    ...baseWords,
    ...emotionalTags.slice(0, 2),
    ...categoryTags.slice(0, 2),
  ].slice(0, 10)
}

/**=== VIDEO UPLOAD ===*/

export async function uploadVideoToYouTube(videoBytes, metadata, channelId = null) {
  try {
    const auth = await getYouTubeAuth()
    
    const response = await youtube.videos.insert(
      {
        auth,
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title: metadata.title,
            description: metadata.description,
            tags: metadata.tags,
            categoryId: '24', // Entertainment category
          },
          status: {
            privacyStatus: 'unlisted', // Unlisted first for quality check
          },
        },
        media: {
          body: videoBytes,
        },
      },
      {
        onUploadProgress: (evt) => {
          const progress = Math.round((evt.bytesProcessed / evt.totalBytes) * 100)
          console.log(`[YouTube] Upload progress: ${progress}%`)
        },
      }
    )
    
    return {
      videoId: response.data.id,
      url: `https://www.youtube.com/watch?v=${response.data.id}`,
      status: response.data.status.privacyStatus,
    }
  } catch (error) {
    console.error('[YouTube] Upload failed:', error instanceof Error ? error.message : error)
    throw new Error(`Failed to upload video to YouTube: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**=== SCHEDULING ===*/

export async function scheduleVideoRelease(videoId, scheduleConfig) {
  /**
   * scheduleConfig: {
   *   startDate: Date,
   *   postsPerDay: 1,
   *   durationDays: 7,
   *   publishTimes: ['14:00', '20:00'] // Optional specific times
   * }
   */
  try {
    const auth = await getYouTubeAuth()
    const schedule = []
    const startDate = new Date(scheduleConfig.startDate)
    
    for (let dayOffset = 0; dayOffset < scheduleConfig.durationDays; dayOffset++) {
      const releaseDate = new Date(startDate)
      releaseDate.setDate(releaseDate.getDate() + dayOffset)
      
      for (let postIdx = 0; postIdx < scheduleConfig.postsPerDay; postIdx++) {
        const releaseTime = scheduleConfig.publishTimes?.[postIdx % scheduleConfig.publishTimes.length] || '14:00'
        const [hours, minutes] = releaseTime.split(':').map(Number)
        
        releaseDate.setHours(hours, minutes, 0, 0)
        
        // Schedule video (update status to public at this time)
        schedule.push({
          videoId,
          publishAt: releaseDate.toISOString(),
          sequenceNumber: dayOffset * scheduleConfig.postsPerDay + postIdx,
        })
      }
    }
    
    return schedule
  } catch (error) {
    console.error('[YouTube] Scheduling failed:', error instanceof Error ? error.message : error)
    throw new Error(`Failed to schedule video: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**=== PUBLISH VIDEO ===*/

export async function publishVideo(videoId, status = 'public') {
  try {
    const auth = await getYouTubeAuth()
    
    const response = await youtube.videos.update(
      {
        auth,
        part: 'status',
        requestBody: {
          id: videoId,
          status: {
            privacyStatus: status, // 'public', 'unlisted', 'private'
          },
        },
      }
    )
    
    return { videoId, status: response.data.status.privacyStatus }
  } catch (error) {
    console.error('[YouTube] Publish failed:', error instanceof Error ? error.message : error)
    throw new Error(`Failed to publish video: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**=== PLAYLIST MANAGEMENT ===*/

export async function createPlaylistForSeries(title, description) {
  try {
    const auth = await getYouTubeAuth()
    
    const response = await youtube.playlists.insert(
      {
        auth,
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title,
            description,
          },
          status: {
            privacyStatus: 'public',
          },
        },
      }
    )
    
    return { playlistId: response.data.id, url: `https://www.youtube.com/playlist?list=${response.data.id}` }
  } catch (error) {
    console.error('[YouTube] Playlist creation failed:', error instanceof Error ? error.message : error)
    throw new Error(`Failed to create playlist: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function addVideoToPlaylist(playlistId, videoId) {
  try {
    const auth = await getYouTubeAuth()
    
    await youtube.playlistItems.insert(
      {
        auth,
        part: 'snippet',
        requestBody: {
          snippet: {
            playlistId,
            resourceId: {
              kind: 'youtube#video',
              videoId,
            },
          },
        },
      }
    )
    
    return { success: true, playlistId, videoId }
  } catch (error) {
    console.error('[YouTube] Add to playlist failed:', error instanceof Error ? error.message : error)
    throw new Error(`Failed to add video to playlist: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**=== ANALYTICS ===*/

export async function getVideoAnalytics(videoId) {
  try {
    const auth = await getYouTubeAuth()
    
    const response = await youtube.videos.list(
      {
        auth,
        part: 'statistics,snippet',
        id: videoId,
      }
    )
    
    const video = response.data.items[0]
    return {
      videoId,
      title: video.snippet.title,
      views: Number(video.statistics.viewCount || 0),
      likes: Number(video.statistics.likeCount || 0),
      comments: Number(video.statistics.commentCount || 0),
      shares: Number(video.statistics.shareCount || 0),
    }
  } catch (error) {
    console.error('[YouTube] Analytics fetch failed:', error instanceof Error ? error.message : error)
    throw new Error(`Failed to fetch analytics: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
