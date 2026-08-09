export function translateError(error: any, provider = ''): { plainEnglish: string; action: string; shouldRetry: boolean; category: string } {
  const msg = String((error && (error.message || error.error || error)).toString?.() || error)
  const lower = msg.toLowerCase()
  // Auth errors
  if (/unauthorized|invalid_grant|invalid_token|token expired|401|403/.test(lower)) {
    return {
      plainEnglish: `Your ${provider || 'connection'} connection expired or is unauthorized. I paused it. Click 1-button Reconnect to fix.`,
      action: 'needs_reconnect',
      shouldRetry: false,
      category: 'auth',
    }
  }
  // Rate limit
  if (/rate limit|429|too many requests/.test(lower)) {
    return {
      plainEnglish: `${provider || 'The provider'} is busy. I'm waiting and will retry shortly.`,
      action: 'retry_with_backoff',
      shouldRetry: true,
      category: 'rate_limit',
    }
  }
  // Server errors
  if (/5\d{2}|server error|gateway timeout|502|503|504/.test(lower)) {
    return {
      plainEnglish: `${provider || 'The provider'} is currently experiencing issues. I'll retry automatically.`,
      action: 'retry_with_backoff',
      shouldRetry: true,
      category: 'api_down',
    }
  }
  // Schema / sheet errors
  if (/column not found|column.*not found|unable to parse|column/.test(lower)) {
    return {
      plainEnglish: `I can't find an expected column or field in ${provider || 'the destination'}. Did you rename a column? I tried to map but failed.`,
      action: 'schema_change',
      shouldRetry: false,
      category: 'schema_change',
    }
  }
  // Generic fallback
  return {
    plainEnglish: `Something broke for ${provider || 'a provider'}: ${msg}. I'll retry up to 3 times, then pause if still failing.`,
    action: 'generic_retry',
    shouldRetry: true,
    category: 'generic',
  }
}
