import crypto from 'node:crypto';

const monitors = new Map();

let globalMonitorCounter = 0;

function generateMonitorId() {
  globalMonitorCounter += 1;
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString('hex');
  return `UMON-${ts}-${rand}-${globalMonitorCounter}`;
}

function determineStatus(httpStatus, responseTime, error) {
  if (error) {
    if (error.toLowerCase().includes('timeout') || error.toLowerCase().includes('aborted')) {
      return 'down';
    }
    if (error.toLowerCase().includes('ssl') || error.toLowerCase().includes('certificate') || error.toLowerCase().includes('cert')) {
      return 'down';
    }
    if (error.toLowerCase().includes('enotfound') || error.toLowerCase().includes('dns')) {
      return 'down';
    }
    if (error.toLowerCase().includes('econnrefused') || error.toLowerCase().includes('econnreset')) {
      return 'down';
    }
    return 'down';
  }

  if (httpStatus === null || httpStatus === undefined) {
    return 'unknown';
  }

  if (httpStatus >= 500) {
    return 'down';
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    if (responseTime > 5000) {
      return 'degraded';
    }
    return 'up';
  }

  if (httpStatus >= 300 && httpStatus < 400) {
    return 'degraded';
  }

  if (httpStatus >= 400 && httpStatus < 500) {
    return 'degraded';
  }

  return 'unknown';
}

function classifyIssue(httpStatus, responseTime, error) {
  if (error) {
    const errLower = error.toLowerCase();
    if (errLower.includes('ssl') || errLower.includes('certificate') || errLower.includes('cert')) {
      return 'ssl_expired';
    }
    if (errLower.includes('enotfound') || errLower.includes('dns')) {
      return 'dns_failure';
    }
    if (errLower.includes('timeout') || errLower.includes('aborted')) {
      return 'slow_response';
    }
    return 'server_error';
  }

  if (httpStatus >= 500) {
    return 'server_error';
  }

  if (responseTime > 5000) {
    return 'slow_response';
  }

  return 'server_error';
}

function appendHistory(entry, history) {
  history.push(entry);
  if (history.length > 20) {
    history.shift();
  }
}

function computeUptime(history) {
  if (history.length === 0) {
    return 100;
  }
  const successful = history.filter((h) => h.status === 'up').length;
  return Math.round((successful / history.length) * 10000) / 100;
}

async function performHealthCheck(url, timeoutMs = 10000) {
  const startTime = Date.now();
  let httpStatus = null;
  let error = null;
  let responseTime = 0;
  let sslValid = undefined;
  let headers = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'AlphaTekX-UptimeMonitor/1.0',
      },
    });

    clearTimeout(timeoutId);
    responseTime = Date.now() - startTime;
    httpStatus = response.status;

    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });
    headers = responseHeaders;

    if (url.startsWith('https:')) {
      sslValid = true;
    }

    const status = determineStatus(httpStatus, responseTime, null);

    return {
      status,
      httpStatus,
      responseTime,
      sslValid,
      headers,
    };
  } catch (err) {
    responseTime = Date.now() - startTime;
    error = err.message || String(err);

    if (url.startsWith('https:')) {
      if (error.toLowerCase().includes('ssl') || error.toLowerCase().includes('certificate') || error.toLowerCase().includes('cert')) {
        sslValid = false;
      } else {
        sslValid = undefined;
      }
    }

    const status = determineStatus(null, responseTime, error);

    return {
      status,
      httpStatus: null,
      responseTime,
      error,
      sslValid,
      headers: null,
    };
  }
}

async function runCheck(monitorId) {
  const monitor = monitors.get(monitorId);
  if (!monitor) {
    return;
  }

  const result = await performHealthCheck(monitor.url);

  const historyEntry = {
    timestamp: new Date().toISOString(),
    status: result.status,
    responseTime: result.responseTime,
    httpStatus: result.httpStatus,
  };
  if (result.error) {
    historyEntry.error = result.error;
  }

  appendHistory(historyEntry, monitor.history);

  const previousStatus = monitor.status;
  monitor.status = result.status;
  monitor.lastCheck = new Date().toISOString();
  monitor.lastResponseTime = result.responseTime;

  if (result.status === 'up' || result.status === 'degraded') {
    if (previousStatus === 'down' && monitor.consecutiveFailures > 0) {
      monitor.consecutiveFailures = 0;
      if (typeof monitor.onUp === 'function') {
        try {
          monitor.onUp({
            monitorId,
            url: monitor.url,
            recoveredAfter: monitor.history.length,
            previousStatus,
          });
        } catch (cbErr) {
          console.error(`[UptimeMonitor] onUp callback error for ${monitorId}:`, cbErr.message);
        }
      }
    } else {
      monitor.consecutiveFailures = 0;
    }
  } else if (result.status === 'down') {
    monitor.consecutiveFailures += 1;

    if (monitor.consecutiveFailures >= 3) {
      if (typeof monitor.onDown === 'function') {
        try {
          monitor.onDown({
            monitorId,
            url: monitor.url,
            consecutiveFailures: monitor.consecutiveFailures,
            lastError: result.error || `HTTP ${result.httpStatus}`,
          });
        } catch (cbErr) {
          console.error(`[UptimeMonitor] onDown callback error for ${monitorId}:`, cbErr.message);
        }
      }

      const issue = classifyIssue(result.httpStatus, result.responseTime, result.error);
      if (typeof monitor.onRemediate === 'function') {
        try {
          const remediation = await autoRemediate(monitor.url, issue);
          monitor.onRemediate({
            monitorId,
            url: monitor.url,
            issue,
            remediation,
          });
        } catch (cbErr) {
          console.error(`[UptimeMonitor] onRemediate callback error for ${monitorId}:`, cbErr.message);
        }
      }
    }
  }
}

export function registerMonitor(url, opts = {}) {
  if (!url || typeof url !== 'string') {
    throw new Error('url is required and must be a string');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (_) {
    throw new Error(`Invalid URL: "${url}"`);
  }

  const intervalMs = opts.intervalMs || 60000;
  if (typeof intervalMs !== 'number' || intervalMs < 5000) {
    throw new Error('intervalMs must be a number >= 5000 (minimum 5 seconds)');
  }

  const userId = opts.userId || 'anonymous';

  const monitorId = generateMonitorId();

  const monitor = {
    url: parsedUrl.href,
    intervalMs,
    userId,
    timer: null,
    history: [],
    consecutiveFailures: 0,
    lastCheck: null,
    lastResponseTime: null,
    status: 'unknown',
    registeredAt: new Date().toISOString(),
    onDown: typeof opts.onDown === 'function' ? opts.onDown : null,
    onUp: typeof opts.onUp === 'function' ? opts.onUp : null,
    onRemediate: typeof opts.onRemediate === 'function' ? opts.onRemediate : null,
  };

  monitor.timer = setInterval(() => {
    performHealthCheck(monitor.url).then((result) => {
      const historyEntry = {
        timestamp: new Date().toISOString(),
        status: result.status,
        responseTime: result.responseTime,
        httpStatus: result.httpStatus,
      };
      if (result.error) {
        historyEntry.error = result.error;
      }

      appendHistory(historyEntry, monitor.history);

      const previousStatus = monitor.status;
      monitor.status = result.status;
      monitor.lastCheck = new Date().toISOString();
      monitor.lastResponseTime = result.responseTime;

      if (result.status === 'up' || result.status === 'degraded') {
        if (previousStatus === 'down' && monitor.consecutiveFailures > 0) {
          monitor.consecutiveFailures = 0;
          if (monitor.onUp) {
            try {
              monitor.onUp({
                monitorId,
                url: monitor.url,
                recoveredAfter: monitor.history.length,
                previousStatus,
              });
            } catch (cbErr) {
              console.error(`[UptimeMonitor] onUp callback error for ${monitorId}:`, cbErr.message);
            }
          }
        } else {
          monitor.consecutiveFailures = 0;
        }
      } else if (result.status === 'down') {
        monitor.consecutiveFailures += 1;

        if (monitor.consecutiveFailures >= 3) {
          if (monitor.onDown) {
            try {
              monitor.onDown({
                monitorId,
                url: monitor.url,
                consecutiveFailures: monitor.consecutiveFailures,
                lastError: result.error || `HTTP ${result.httpStatus}`,
              });
            } catch (cbErr) {
              console.error(`[UptimeMonitor] onDown callback error for ${monitorId}:`, cbErr.message);
            }
          }

          const issue = classifyIssue(result.httpStatus, result.responseTime, result.error);
          if (monitor.onRemediate) {
            autoRemediate(monitor.url, issue).then((remediation) => {
              if (monitor.onRemediate) {
                try {
                  monitor.onRemediate({
                    monitorId,
                    url: monitor.url,
                    issue,
                    remediation,
                  });
                } catch (cbErr) {
                  console.error(`[UptimeMonitor] onRemediate callback error for ${monitorId}:`, cbErr.message);
                }
              }
            }).catch((cbErr) => {
              console.error(`[UptimeMonitor] autoRemediate error for ${monitorId}:`, cbErr.message);
            });
          }
        }
      }
    }).catch((err) => {
      console.error(`[UptimeMonitor] Unexpected error during check for ${monitorId} (${monitor.url}):`, err.message);
    });
  }, intervalMs);

  monitors.set(monitorId, monitor);

  performHealthCheck(monitor.url).then((result) => {
    const historyEntry = {
      timestamp: new Date().toISOString(),
      status: result.status,
      responseTime: result.responseTime,
      httpStatus: result.httpStatus,
    };
    if (result.error) {
      historyEntry.error = result.error;
    }
    appendHistory(historyEntry, monitor.history);
    monitor.status = result.status;
    monitor.lastCheck = new Date().toISOString();
    monitor.lastResponseTime = result.responseTime;

    if (result.status === 'down') {
      monitor.consecutiveFailures += 1;
    }
  }).catch((err) => {
    console.error(`[UptimeMonitor] Initial check error for ${monitorId} (${monitor.url}):`, err.message);
  });

  return {
    monitorId,
    url: monitor.url,
    intervalMs: monitor.intervalMs,
    status: monitor.status,
    registeredAt: monitor.registeredAt,
  };
}

export function unregisterMonitor(monitorId) {
  if (!monitorId || typeof monitorId !== 'string') {
    return { success: false };
  }

  const monitor = monitors.get(monitorId);
  if (!monitor) {
    return { success: false };
  }

  if (monitor.timer) {
    clearInterval(monitor.timer);
    monitor.timer = null;
  }

  monitors.delete(monitorId);

  return { success: true };
}

export function getMonitorStatus(monitorId) {
  if (!monitorId || typeof monitorId !== 'string') {
    return null;
  }

  const monitor = monitors.get(monitorId);
  if (!monitor) {
    return null;
  }

  const uptime = computeUptime(monitor.history);

  return {
    monitorId,
    url: monitor.url,
    status: monitor.status,
    lastCheck: monitor.lastCheck,
    lastResponseTime: monitor.lastResponseTime,
    uptime,
    consecutiveFailures: monitor.consecutiveFailures,
    history: [...monitor.history],
  };
}

export function getAllMonitors() {
  const results = [];

  for (const [monitorId, monitor] of monitors) {
    const uptime = computeUptime(monitor.history);

    results.push({
      monitorId,
      url: monitor.url,
      status: monitor.status,
      lastCheck: monitor.lastCheck,
      lastResponseTime: monitor.lastResponseTime,
      uptime,
      consecutiveFailures: monitor.consecutiveFailures,
      history: [...monitor.history],
    });
  }

  return results;
}

export async function checkHealth(url, timeoutMs = 10000) {
  if (!url || typeof url !== 'string') {
    throw new Error('url is required and must be a string');
  }

  try {
    new URL(url);
  } catch (_) {
    throw new Error(`Invalid URL: "${url}"`);
  }

  if (typeof timeoutMs !== 'number' || timeoutMs < 1000) {
    throw new Error('timeoutMs must be a number >= 1000');
  }

  return performHealthCheck(url, timeoutMs);
}

export async function autoRemediate(url, issue) {
  const validIssues = [
    'ssl_expired',
    'dns_failure',
    'server_error',
    'slow_response',
    'malware_detected',
  ];

  if (!issue || !validIssues.includes(issue)) {
    return {
      action: 'logged',
      message: `Unknown issue type "${issue}". Valid types: ${validIssues.join(', ')}`,
    };
  }

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    url,
    issue,
    action: 'logged',
    message: '',
    details: {},
  };

  switch (issue) {
    case 'ssl_expired':
      logEntry.message = `SSL certificate issue detected for ${url}. Remediation: Renew or reissue the SSL certificate. Ensure auto-renewal is configured.`;
      logEntry.details = {
        severity: 'critical',
        suggestedActions: [
          'Check certificate expiration date',
          'Renew certificate via provider (Let\'s Encrypt, etc.)',
          'Verify certificate chain is complete',
          'Update certificate on server/load balancer',
          'Enable auto-renewal to prevent future expiry',
        ],
      };
      break;

    case 'dns_failure':
      logEntry.message = `DNS resolution failure detected for ${url}. Remediation: Verify DNS records and DNS server health.`;
      logEntry.details = {
        severity: 'critical',
        suggestedActions: [
          'Check DNS A/AAAA records are correct',
          'Verify DNS server is reachable',
          'Check for DNS propagation issues',
          'Consider failover DNS provider',
          'Validate domain registration is active',
        ],
      };
      break;

    case 'server_error':
      logEntry.message = `Server error (5xx) detected for ${url}. Remediation: Check server health, application logs, and resource utilization.`;
      logEntry.details = {
        severity: 'high',
        suggestedActions: [
          'Check application server logs for errors',
          'Verify database connectivity',
          'Check disk space and memory utilization',
          'Restart application server if needed',
          'Check for recent deployments that may have introduced bugs',
        ],
      };
      break;

    case 'slow_response':
      logEntry.message = `Slow response time detected for ${url}. Remediation: Investigate performance bottlenecks.`;
      logEntry.details = {
        severity: 'medium',
        suggestedActions: [
          'Check server CPU and memory usage',
          'Review database query performance',
          'Check for network latency issues',
          'Review CDN/cache configuration',
          'Consider horizontal scaling or optimization',
        ],
      };
      break;

    case 'malware_detected':
      logEntry.message = `Potential malware detected on ${url}. Remediation: Immediately investigate and isolate the affected resource.`;
      logEntry.details = {
        severity: 'critical',
        suggestedActions: [
          'Isolate the affected server/resource',
          'Scan for malware with security tools',
          'Check for unauthorized file changes',
          'Review access logs for suspicious activity',
          'Restore from known-good backup if compromised',
          'Notify security team immediately',
        ],
      };
      break;

    default:
      logEntry.message = `Issue "${issue}" detected for ${url}. No specific remediation available.`;
      break;
  }

  console.log(`[UptimeMonitor][AutoRemediate] ${timestamp} | ${issue} | ${url}`);
  console.log(`[UptimeMonitor][AutoRemediate] ${logEntry.message}`);

  return {
    action: 'logged',
    message: logEntry.message,
    details: logEntry.details,
  };
}

export function startAllMonitors() {
  let startedCount = 0;

  for (const [monitorId, monitor] of monitors) {
    if (monitor.timer) {
      continue;
    }

    monitor.timer = setInterval(() => {
      performHealthCheck(monitor.url).then((result) => {
        const historyEntry = {
          timestamp: new Date().toISOString(),
          status: result.status,
          responseTime: result.responseTime,
          httpStatus: result.httpStatus,
        };
        if (result.error) {
          historyEntry.error = result.error;
        }

        appendHistory(historyEntry, monitor.history);

        const previousStatus = monitor.status;
        monitor.status = result.status;
        monitor.lastCheck = new Date().toISOString();
        monitor.lastResponseTime = result.responseTime;

        if (result.status === 'up' || result.status === 'degraded') {
          if (previousStatus === 'down' && monitor.consecutiveFailures > 0) {
            monitor.consecutiveFailures = 0;
            if (monitor.onUp) {
              try {
                monitor.onUp({
                  monitorId,
                  url: monitor.url,
                  recoveredAfter: monitor.history.length,
                  previousStatus,
                });
              } catch (cbErr) {
                console.error(`[UptimeMonitor] onUp callback error for ${monitorId}:`, cbErr.message);
              }
            }
          } else {
            monitor.consecutiveFailures = 0;
          }
        } else if (result.status === 'down') {
          monitor.consecutiveFailures += 1;

          if (monitor.consecutiveFailures >= 3) {
            if (monitor.onDown) {
              try {
                monitor.onDown({
                  monitorId,
                  url: monitor.url,
                  consecutiveFailures: monitor.consecutiveFailures,
                  lastError: result.error || `HTTP ${result.httpStatus}`,
                });
              } catch (cbErr) {
                console.error(`[UptimeMonitor] onDown callback error for ${monitorId}:`, cbErr.message);
              }
            }

            const issue = classifyIssue(result.httpStatus, result.responseTime, result.error);
            if (monitor.onRemediate) {
              autoRemediate(monitor.url, issue).then((remediation) => {
                if (monitor.onRemediate) {
                  try {
                    monitor.onRemediate({
                      monitorId,
                      url: monitor.url,
                      issue,
                      remediation,
                    });
                  } catch (cbErr) {
                    console.error(`[UptimeMonitor] onRemediate callback error for ${monitorId}:`, cbErr.message);
                  }
                }
              }).catch((cbErr) => {
                console.error(`[UptimeMonitor] autoRemediate error for ${monitorId}:`, cbErr.message);
              });
            }
          }
        }
      }).catch((err) => {
        console.error(`[UptimeMonitor] Unexpected error during check for ${monitorId} (${monitor.url}):`, err.message);
      });
    }, monitor.intervalMs);

    startedCount += 1;
  }

  console.log(`[UptimeMonitor] Started ${startedCount} monitor(s). Total active: ${monitors.size}`);
  return { started: startedCount, total: monitors.size };
}

export function stopAllMonitors() {
  let stoppedCount = 0;

  for (const [monitorId, monitor] of monitors) {
    if (monitor.timer) {
      clearInterval(monitor.timer);
      monitor.timer = null;
      stoppedCount += 1;
    }
  }

  console.log(`[UptimeMonitor] Stopped ${stoppedCount} monitor(s). Total registered: ${monitors.size}`);
  return { stopped: stoppedCount, total: monitors.size };
}
