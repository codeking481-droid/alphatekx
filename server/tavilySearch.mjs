/**
 * TAVILY SEARCH MODULE
 * AI-optimized web search for the AlphaTekX Digital Restoration Engine.
 * Uses Tavily API for clean, structured search results.
 */

const TAVILY_API_URL = 'https://api.tavily.com/search'

function getTavilyKey() {
  return process.env.TAVILY_API_KEY || ''
}

/**
 * Search the web via Tavily API.
 * @param {string} query - Search query
 * @param {object} opts - Options
 * @param {number} opts.maxResults - Max results (default 5)
 * @param {string} opts.searchDepth - 'basic' | 'advanced' (default 'basic')
 * @param {string} opts.topic - 'general' | 'news' | 'finance' (default 'general')
 * @param {string[]} opts.includeDomains - Domains to include
 * @param {string[]} opts.excludeDomains - Domains to exclude
 * @returns {Promise<{results: Array<{title: string, url: string, score: number, content: string}>, answer: string}>}
 */
export async function tavilySearch(query, opts = {}) {
  const apiKey = getTavilyKey()
  if (!apiKey) {
    return { results: [], answer: '', error: 'TAVILY_API_KEY not configured' }
  }

  try {
    const body = {
      api_key: apiKey,
      query,
      search_depth: opts.searchDepth || 'basic',
      max_results: opts.maxResults || 5,
      include_answer: true,
      topic: opts.topic || 'general',
    }
    if (opts.includeDomains?.length) body.include_domains = opts.includeDomains
    if (opts.excludeDomains?.length) body.exclude_domains = opts.excludeDomains

    const res = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { results: [], answer: '', error: `Tavily API error ${res.status}: ${text.slice(0, 200)}` }
    }

    const data = await res.json()
    return {
      results: (data.results || []).map(r => ({
        title: r.title || '',
        url: r.url || '',
        score: r.score || 0,
        content: r.content || r.raw_content || '',
      })),
      answer: data.answer || '',
    }
  } catch (err) {
    return { results: [], answer: '', error: `Tavily search failed: ${err.message}` }
  }
}

/**
 * Search for solutions to a specific technical problem.
 */
export async function searchForFixes(problem, technology) {
  const query = `fix ${problem} ${technology || ''} solution 2026`
  return tavilySearch(query, { searchDepth: 'advanced', maxResults: 5 })
}
