// fileUtils.js — UTF-8 safe file operations for the Restore Engine
// Prevents encoding corruption (BOM, UTF-16, wrong charset) that breaks scans.

import fs from 'node:fs'
import path from 'node:path'

/**
 * Strip BOM (U+FEFF), null bytes (\u0000), and other encoding artifacts from a string.
 * This fixes UTF-16/UTF-8 misread issues that produce Chinese/Japanese gibberish.
 * @param {string} content
 * @returns {string} sanitized content
 */
export function sanitizeEncoding(content) {
  if (typeof content !== 'string') return content
  // Remove BOM (U+FEFF) — the #1 cause of encoding corruption
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1)
  }
  // Remove null bytes (\u0000) — artifact of UTF-16 being read as UTF-8
  if (content.includes('\u0000')) {
    content = content.replace(/\u0000/g, '')
  }
  // Remove replacement character (U+FFFD) — appears when encoding is mangled
  // Only strip if it's at the very start (encoding prefix corruption)
  if (content.charCodeAt(0) === 0xFFFD) {
    content = content.replace(/^\uFFFD+/, '')
  }
  return content
}

/**
 * Read a file safely with UTF-8 encoding, stripping BOM and null bytes.
 * @param {string} filePath
 * @returns {string} file content
 */
export function safeReadFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8')
  return sanitizeEncoding(content)
}

/**
 * Write a file safely with UTF-8 encoding, stripping any BOM first.
 * @param {string} filePath
 * @param {string} content
 */
export function safeWriteFile(filePath, content) {
  content = sanitizeEncoding(content)
  fs.writeFileSync(filePath, content, 'utf8')
}

/**
 * Validate that content is well-formed English HTML.
 * Rejects content with Chinese/Japanese/Korean characters (encoding corruption).
 * @param {string} content
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateHtml(content) {
  if (!content || typeof content !== 'string') {
    return { valid: false, reason: 'Empty or non-string content' }
  }
  const trimmed = sanitizeEncoding(content).trim()
  if (!trimmed) {
    return { valid: false, reason: 'Empty content after trimming' }
  }
  // Check for encoding corruption — Chinese/Japanese/Korean characters in HTML is WRONG
  const hasAsian = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(trimmed)
  if (hasAsian) {
    return { valid: false, reason: 'Content contains CJK characters — encoding is corrupted (expected English HTML)' }
  }
  // Check for null bytes — UTF-16 artifact
  if (trimmed.includes('\u0000')) {
    return { valid: false, reason: 'Content contains null bytes — encoding is corrupted' }
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
  let result = sanitizeEncoding(content)
  for (const { before, after } of replacements) {
    if (!before) continue
    const safeBefore = sanitizeEncoding(before)
    const safeAfter = sanitizeEncoding(after)
    if (result.includes(safeBefore)) {
      result = result.replace(safeBefore, safeAfter)
    }
  }
  return result
}

/**
 * FileHandler — the ONLY way the Restore Engine touches HTML/text files.
 * Guarantees every read and write is UTF-8, BOM-free, null-byte-free,
 * and that restored output is valid English HTML (never CJK mojibake).
 */
export class FileHandler {
  /** Read a file as UTF-8, stripping BOM + null bytes. */
  static readFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8')
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)
    content = content.replace(/\u0000/g, '')
    return sanitizeEncoding(content)
  }

  /** Sanitize then write a file strictly as UTF-8. */
  static writeFile(filePath, content) {
    const clean = sanitizeEncoding(String(content ?? ''))
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, clean, 'utf8')
    return clean
  }

  /** True when content looks like a real HTML document. */
  static validateHTML(content) {
    return validateHtml(content).valid
  }

  /** True when content has NO Chinese/Japanese/Korean corruption characters. */
  static isEnglish(content) {
    if (typeof content !== 'string' || !content) return false
    const hasAsian = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(content)
    return !hasAsian && !content.includes('\u0000')
  }

  /**
   * Read an existing restored file; if it is corrupt/mojibake, return the fallback.
   * Used when serving restored HTML so users NEVER see encoding garbage.
   */
  static readValidHtml(filePath, fallbackHtml) {
    try {
      const content = this.readFile(filePath)
      if (this.validateHTML(content) && this.isEnglish(content)) return content
    } catch {}
    return fallbackHtml
  }
}
