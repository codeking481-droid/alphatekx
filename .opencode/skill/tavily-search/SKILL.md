---
name: tavily-search
description: Web search using Tavily API for AI-optimized search results with citations and content extraction.
---

# Tavily Web Search Skill

## Overview

This skill provides web search capabilities using the Tavily API, which is specifically designed for AI agents and LLM applications. Unlike traditional search APIs, Tavily returns structured, clean content optimized for AI consumption.

## Key Features

- **AI-Optimized Search**: Returns clean, structured content instead of HTML snippets
- **Search Depths**: Basic (fast, cheap) and Advanced (comprehensive) modes
- **Content Extraction**: Automatically extracts and cleans main content from web pages
- **Relevance Scoring**: Each result includes a relevance score for filtering
- **Token Optimization**: Designed to minimize token usage for cost-efficient AI processing

## Usage

### Basic Search

```
Search for [query] using Tavily
```

### Advanced Search

```
Search for [query] with advanced depth and maximum results
```

### Search with Domain Filtering

```
Search for [query] including only specific domains
```

## Search Parameters

### Search Depth
- **basic**: Fast, cheap, good for quick lookups
- **advanced**: Comprehensive, better for research and comparisons
- **fast**: Low latency, trades some relevance for speed
- **ultra-fast**: Minimum latency, lowest relevance

### Maximum Results
- **5**: Focused answers (default)
- **10**: Broader research
- **1-4**: Very focused queries
- **11-20**: Comprehensive research

### Topic Filtering
- **general**: General web search (default)
- **news**: News articles only
- **finance**: Financial information
- **academic**: Academic sources

### Domain Filtering
- **include_domains**: Only search these domains
- **exclude_domains**: Exclude these domains

## Best Practices

1. **Use advanced search** for source discovery, comparisons, and high-confidence answers
2. **Use basic search** for quick lookups and time-sensitive queries
3. **Add chunks_per_source=3** for stronger evidence per source
4. **Use max_results=5** for focused answers, **10** for broader research
5. **Use include_domains** when source trust matters
6. **Prefer Search → Extract** for grounded answers

## Example Prompts

### Research
- "Search for the latest news on AI regulations"
- "Search for Python async patterns"
- "Search for SEC filings on Tesla"

### Technical Research
- "Search for React best practices 2026"
- "Search for production AI agent architecture"
- "Search for Tavily API integration guide"

### News and Current Events
- "Search for recent developments in quantum computing"
- "Search for AI industry news this week"
- "Search for startup funding announcements"

### Domain-Specific
- "Search for medical research on gene therapy"
- "Search for legal precedents on AI copyright"
- "Search for financial reports on tech companies"

## Error Handling

### Common Errors
- **Rate Limiting**: Exceeded API quota
- **Invalid API Key**: Authentication failed
- **Network Timeout**: API unreachable
- **Invalid Query**: Query format error

### Recovery Strategies
1. **Retry with backoff** for rate limiting
2. **Check API key** for authentication errors
3. **Simplify query** for invalid query errors
4. **Use fallback search** for network issues

## Integration with AlphaTekx Pro

This skill integrates seamlessly with AlphaTekx Pro's advanced reasoning framework:

1. **Research Phase**: Use Tavily for comprehensive web research
2. **Analysis Phase**: Process search results with extended thinking
3. **Decision Phase**: Apply ReAct pattern to select best sources
4. **Verification Phase**: Extract and verify content from top sources
5. **Reporting Phase**: Provide cited, accurate information

## API Reference

### Search Endpoint
```
POST /search
```

**Parameters**:
- `query` (required): Search query string
- `search_depth` (optional): "basic", "advanced", "fast", "ultra-fast"
- `max_results` (optional): Number of results (1-20)
- `topic` (optional): "general", "news", "finance", "academic"
- `include_domains` (optional): Array of domains to include
- `exclude_domains` (optional): Array of domains to exclude
- `include_raw_content` (optional): Include full page content
- `include_answer` (optional): Include AI-generated answer

**Response**:
```json
{
  "query": "search query",
  "answer": "AI-generated answer (if requested)",
  "results": [
    {
      "title": "Page Title",
      "url": "https://example.com",
      "content": "Cleaned content",
      "score": 0.95,
      "raw_content": "Full page content (if requested)"
    }
  ]
}
```

## Pricing

- **Free**: 1,000 API calls/month
- **Developer**: $25/month for 10,000 calls
- **Pro**: $100/month for 50,000 calls
- **Enterprise**: Custom pricing

## Notes

- Tavily is designed specifically for AI agents and LLM applications
- Returns clean, structured content optimized for AI consumption
- Native integration with LangChain, CrewAI, and other agent frameworks
- Provides relevance scoring for programmatic filtering
- Supports both snippet and full-page content extraction