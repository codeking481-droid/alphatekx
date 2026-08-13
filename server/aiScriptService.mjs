/**
 * AI Script Generation Service
 * Uses Groq LLM to generate video scripts and scene descriptions
 */

import { Groq } from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

export async function generateVideoScript(prompt, durationSeconds) {
  try {
    console.log(`[SCRIPT] Generating script for: "${prompt}" (${durationSeconds}s)`)
    
    const numberOfScenes = Math.max(3, Math.min(6, Math.ceil(durationSeconds / 20)))
    const secondsPerScene = Math.round(durationSeconds / numberOfScenes)

    const message = await groq.messages.create({
      model: 'mixtral-8x7b-32768',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `You are a professional video scriptwriter. Create a detailed video script for:
          
Prompt: "${prompt}"
Duration: ${durationSeconds} seconds (${numberOfScenes} scenes, ~${secondsPerScene}s each)

Return ONLY a JSON object (no markdown, no explanation) with this exact structure:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "description": "Visual description for this scene",
      "searchKeywords": "comma-separated search terms for finding video footage",
      "voiceoverText": "Narration to be spoken during this scene",
      "duration": ${secondsPerScene}
    },
    ...more scenes...
  ]
}

Make it cinematic and engaging. Each scene should be distinct and visually interesting.`
        }
      ]
    })

    const responseText = message.content[0]?.text || ''
    console.log('[SCRIPT] Raw response:', responseText.substring(0, 200))
    
    // Extract JSON from response (try multiple patterns)
    let script = null
    const patterns = [
      /\{[\s\S]*"scenes"[\s\S]*\}/,
      /\[\s*\{[\s\S]*\}\s*\]/,
    ]

    for (const pattern of patterns) {
      const match = responseText.match(pattern)
      if (match) {
        try {
          script = JSON.parse(match[0])
          break
        } catch {
          // Continue to next pattern
        }
      }
    }

    if (!script || !script.scenes || script.scenes.length === 0) {
      // Fallback to default script if parsing fails
      console.warn('[SCRIPT] Failed to parse response, using fallback')
      script = generateFallbackScript(prompt, numberOfScenes, secondsPerScene)
    }

    console.log(`[SCRIPT] Generated ${script.scenes.length} scenes`)
    return script.scenes
  } catch (error) {
    console.error('[SCRIPT] Generation error:', error.message)
    throw new Error(`Script generation failed: ${error.message}`)
  }
}

function generateFallbackScript(prompt, numberOfScenes, secondsPerScene) {
  const scenes = []
  const keywords = extractKeywords(prompt)

  for (let i = 0; i < numberOfScenes; i++) {
    const keyword = keywords[i % keywords.length]
    scenes.push({
      sceneNumber: i + 1,
      description: `Scene ${i + 1}: ${keyword} footage for the video`,
      searchKeywords: keyword,
      voiceoverText: `This is scene ${i + 1} of our video. ${keyword} creates an engaging visual.`,
      duration: secondsPerScene,
    })
  }

  return { scenes }
}

function extractKeywords(prompt) {
  // Extract key topics from prompt
  const words = prompt.toLowerCase().split(/\s+/)
  return words.filter(w => w.length > 3).slice(0, 6)
}

export default { generateVideoScript }
