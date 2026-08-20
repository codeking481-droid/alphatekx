// fileUtils.js — UTF-8 safe file operations for the Restore Engine
// Prevents encoding corruption (BOM, wrong charset) that was breaking scans.

import fs from 'node:fs'

/**
 * Read a file safely with UTF-8 encoding, stripping any BOM.
 * @param {string} filePath
 * @returns {string} file content
 */
export function safeReadFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8')
  // Remove BOM if present (U+FEFF)
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1)
  }
  return content
}

/**
 * Write a file safely with UTF-8 encoding, stripping any BOM.
 * @param {string} filePath
 * @param {string} content
 */
export function safeWriteFile(filePath, content) {
  // Remove any BOM before writing
  if (typeof content === 'string' && content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1)
  }
  fs.writeFileSync(filePath, content, 'utf8')
}

/**
 * Validate that content is well-formed HTML (basic structural check).
 * @param {string} content
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateHtml(content) {
  if (!content || typeof content !== 'string') {
    return { valid: false, reason: 'Empty or non-string content' }
  }
  const trimmed = content.trim()
  if (!trimmed) {
    return { valid: false, reason: 'Empty content after trimming' }
  }
  // Check for common HTML structure markers
  const hasDoctype = /<!DOCTYPE/i.test(trimmed) || /<html/i.test(trimmed)
  const hasClosingTags = /<\/html>/i.test(trimmed) || /<\/body>/i.test(trimmed)
  if (!hasDoctype && !hasClosingTags) {
    return { valid: false, reason: 'Missing DOCTYPE, <html>, or </html> tags' }
  }
  return { valid: true }
}

/**
 * Apply a list of text replacements to content, with UTF-8 safety.
 * @param {string} content original content
 * @param {Array<{ before: string, after: string }>} replacements
 * @returns {string} modified content
 */
export function applyReplacements(content, replacements) {
  let result = content
  for (const { before, after } of replacements) {
    if (!before) continue
    // Strip BOM from replacement values
    const safeBefore = before.charCodeAt(0) === 0xFEFF ? before.slice(1) : before
    const safeAfter = after.charCodeAt(0) === 0xFEFF ? after.slice(1) : after
    if (result.includes(safeBefore)) {
      result = result.replace(safeBefore, safeAfter)
    }
  }
  return result
}
