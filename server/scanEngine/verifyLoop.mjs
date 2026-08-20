import { runFullRestorationScan } from './restorationScanner.mjs';
import {
  emitTestStarted,
  emitTestFinished,
  emitVerificationPassed,
  emitReasoningTrace,
} from '../../alpha-core/event-bus.ts';

/**
 * Group findings by severity.
 * Returns { critical, high, medium, low, info } counts.
 */
function countBySeverity(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    if (counts[f.severity] !== undefined) {
      counts[f.severity] += 1;
    }
  }
  return counts;
}

/**
 * Build a human-readable summary string comparing two scan results.
 */
function buildSummary(beforeScore, afterScore) {
  const improvement = afterScore - beforeScore;
  if (improvement > 0) {
    return `Score improved from ${beforeScore} to ${afterScore} (+${improvement} points)`;
  }
  if (improvement === 0) {
    return `Score unchanged at ${afterScore} (no improvement)`;
  }
  return `Score decreased from ${beforeScore} to ${afterScore} (${improvement} points)`;
}

/**
 * Build a detailed findings-change summary.
 */
function buildFindingsChangeSummary(beforeFindings, afterFindings) {
  const beforeCounts = countBySeverity(beforeFindings);
  const afterCounts = countBySeverity(afterFindings);
  const parts = [];
  for (const sev of ['critical', 'high', 'medium', 'low', 'info']) {
    const diff = beforeCounts[sev] - afterCounts[sev];
    if (diff > 0) {
      parts.push(`${diff} fewer ${sev}`);
    } else if (diff < 0) {
      parts.push(`${Math.abs(diff)} more ${sev}`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : 'No change in findings by severity';
}

/**
 * verifyAfterFix — Re-run the restoration scanner on both original and fixed HTML,
 * then compare scores and findings.
 *
 * @param {string} scanId       - Unique ID for this scan session.
 * @param {string} originalHtml - The original HTML before fixes.
 * @param {string} fixedHtml    - The HTML after fixes have been applied.
 * @param {string} targetUrl    - The URL the HTML was fetched from (needed by the scanner).
 * @param {Function} sseWriter  - Optional SSE writer: (data: string) => void
 * @returns {Promise<{beforeScore, afterScore, improvement, beforeFindings, afterFindings, fixed, summary}>}
 */
export async function verifyAfterFix(scanId, originalHtml, fixedHtml, targetUrl, sseWriter) {
  emitTestStarted(scanId, 2, sseWriter);

  emitReasoningTrace(
    scanId,
    {
      assessment: 'Starting post-fix verification scan',
      hypotheses: [
        { cause: 'Applied fixes should improve the restoration score', confidence: 0.8 },
      ],
      evidence: `Target: ${targetUrl}, Original HTML length: ${originalHtml?.length || 0}, Fixed HTML length: ${fixedHtml?.length || 0}`,
      decision: 'Running restoration scanner on both original and fixed HTML for comparison',
    },
    sseWriter,
  );

  let beforeResult;
  let afterResult;

  try {
    beforeResult = await runFullRestorationScan(targetUrl, {
      skipLinks: true,
      skipOSV: true,
      htmlOverride: originalHtml,
    });
  } catch (err) {
    beforeResult = {
      findings: [],
      score: 0,
      severity: 'critical',
      categories: {},
      error: err.message,
    };
  }

  try {
    afterResult = await runFullRestorationScan(targetUrl, {
      skipLinks: true,
      skipOSV: true,
      htmlOverride: fixedHtml,
    });
  } catch (err) {
    afterResult = {
      findings: [],
      score: 0,
      severity: 'critical',
      categories: {},
      error: err.message,
    };
  }

  const beforeScore = beforeResult.score ?? 0;
  const afterScore = afterResult.score ?? 0;
  const improvement = afterScore - beforeScore;
  const fixed = improvement > 0;
  const summary = buildSummary(beforeScore, afterScore);
  const findingsChange = buildFindingsChangeSummary(
    beforeResult.findings || [],
    afterResult.findings || [],
  );

  emitTestFinished(scanId, 2, fixed ? 0 : 2, sseWriter);

  if (fixed) {
    emitVerificationPassed(scanId, sseWriter);
  }

  emitReasoningTrace(
    scanId,
    {
      assessment: fixed ? 'Fixes verified — score improved' : 'Fixes did not improve score',
      hypotheses: [
        {
          cause: fixed
            ? 'Applied fixes resolved detected issues'
            : 'Fixes were ineffective or introduced no measurable improvement',
          confidence: fixed ? 0.9 : 0.7,
        },
      ],
      evidence: summary + ' | ' + findingsChange,
      decision: fixed ? 'Verification passed' : 'Verification failed — further fixes may be needed',
    },
    sseWriter,
  );

  return {
    beforeScore,
    afterScore,
    improvement,
    beforeFindings: beforeResult.findings || [],
    afterFindings: afterResult.findings || [],
    fixed,
    summary,
    findingsChange,
    beforeSeverity: beforeResult.severity,
    afterSeverity: afterResult.severity,
  };
}

/**
 * verifyUrlAfterFix — Fetch a live URL and re-scan it, comparing against
 * a previously recorded original score.
 *
 * @param {string} scanId        - Unique ID for this scan session.
 * @param {string} fixedHtmlUrl  - The URL to fetch and scan (post-deployment).
 * @param {number} originalScore - The score that was recorded before fixes.
 * @param {Function} sseWriter   - Optional SSE writer: (data: string) => void
 * @returns {Promise<{beforeScore, afterScore, improvement, beforeFindings, afterFindings, fixed, summary}>}
 */
export async function verifyUrlAfterFix(scanId, fixedHtmlUrl, originalScore, sseWriter) {
  emitTestStarted(scanId, 1, sseWriter);

  emitReasoningTrace(
    scanId,
    {
      assessment: 'Starting live URL verification scan',
      hypotheses: [
        { cause: 'Deployed fixes should improve the live site score', confidence: 0.8 },
      ],
      evidence: `URL: ${fixedHtmlUrl}, Original score: ${originalScore}`,
      decision: 'Fetching live URL and running restoration scanner',
    },
    sseWriter,
  );

  let afterResult;

  try {
    afterResult = await runFullRestorationScan(fixedHtmlUrl, {
      skipLinks: true,
      skipOSV: true,
    });
  } catch (err) {
    afterResult = {
      findings: [],
      score: 0,
      severity: 'critical',
      categories: {},
      error: err.message,
    };
  }

  const beforeScore = typeof originalScore === 'number' ? originalScore : 0;
  const afterScore = afterResult.score ?? 0;
  const improvement = afterScore - beforeScore;
  const fixed = improvement > 0;
  const summary = buildSummary(beforeScore, afterScore);

  emitTestFinished(scanId, 1, fixed ? 0 : 1, sseWriter);

  if (fixed) {
    emitVerificationPassed(scanId, sseWriter);
  }

  emitReasoningTrace(
    scanId,
    {
      assessment: fixed ? 'Live verification passed — score improved' : 'Live verification failed — score did not improve',
      hypotheses: [
        {
          cause: fixed
            ? 'Deployed fixes are effective on the live site'
            : 'Live site still has issues or fixes were not deployed correctly',
          confidence: fixed ? 0.9 : 0.7,
        },
      ],
      evidence: summary,
      decision: fixed ? 'Verification passed' : 'Verification failed — deployment may need review',
    },
    sseWriter,
  );

  return {
    beforeScore,
    afterScore,
    improvement,
    beforeFindings: [],
    afterFindings: afterResult.findings || [],
    fixed,
    summary,
    beforeSeverity: null,
    afterSeverity: afterResult.severity,
  };
}
