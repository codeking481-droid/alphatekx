import * as cheerio from 'cheerio';
import tls from 'node:tls';
import crypto from 'node:crypto';
import { detectMalware } from './malwareDetector.mjs';

let findingCounter = 0;
function makeFinding(category, severity, title, description, fixable = false, fix = null) {
  findingCounter += 1;
  const finding = {
    id: `RFS-${String(findingCounter).padStart(4, '0')}`,
    category,
    severity,
    title,
    description,
    fixable,
  };
  if (fix) {
    finding.fix = fix;
  }
  return finding;
}

function resetCounter() {
  findingCounter = 0;
}

export async function checkSSL(hostname, port = 443) {
  const findings = [];
  try {
    const cert = await new Promise((resolve, reject) => {
      const socket = tls.connect(
        {
          host: hostname,
          port,
          servername: hostname,
          rejectUnauthorized: false,
          timeout: 10000,
        },
        () => {
          try {
            const peerCert = socket.getPeerCertificate(true);
            if (!peerCert || !peerCert.subject) {
              reject(new Error('No certificate returned'));
              socket.destroy();
              return;
            }
            resolve(peerCert);
            socket.destroy();
          } catch (err) {
            reject(err);
            socket.destroy();
          }
        }
      );
      socket.on('error', (err) => {
        reject(err);
      });
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('SSL connection timed out'));
      });
    });

    // Validity / Expiry
    const now = new Date();
    const validFrom = new Date(cert.valid_from);
    const validTo = new Date(cert.valid_to);

    if (now < validFrom) {
      findings.push(
        makeFinding(
          'ssl',
          'critical',
          'SSL Certificate Not Yet Valid',
          `The certificate for ${hostname} is not valid until ${cert.valid_from}.`,
          true
        )
      );
    }

    if (now > validTo) {
      findings.push(
        makeFinding(
          'ssl',
          'critical',
          'SSL Certificate Expired',
          `The certificate for ${hostname} expired on ${cert.valid_to}. Renew it immediately.`,
          true
        )
      );
    } else {
      const daysRemaining = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));
      if (daysRemaining <= 30) {
        findings.push(
          makeFinding(
            'ssl',
            'high',
            'SSL Certificate Expiring Soon',
            `The certificate for ${hostname} expires in ${daysRemaining} days (${cert.valid_to}).`,
            true,
            { step: 'Renew the certificate before expiration.' }
          )
        );
      } else if (daysRemaining <= 90) {
        findings.push(
          makeFinding(
            'ssl',
            'medium',
            'SSL Certificate Expiring Within 90 Days',
            `The certificate for ${hostname} expires in ${daysRemaining} days (${cert.valid_to}).`,
            true,
            { step: 'Plan certificate renewal.' }
          )
        );
      }
    }

    // Hostname match
    const certSubject = cert.subject?.CN || '';
    const certAltNames = cert.subjectaltname
      ? cert.subjectaltname.split(',').map((s) => s.trim().replace(/^DNS:/, ''))
      : [];

    let hostnameMatch = false;
    if (certSubject === hostname) {
      hostnameMatch = true;
    }
    for (const altName of certAltNames) {
      if (altName.startsWith('*.')) {
        const wildcardDomain = altName.slice(2);
        const parts = hostname.split('.');
        if (parts.length > 1 && parts.slice(1).join('.') === wildcardDomain) {
          hostnameMatch = true;
          break;
        }
      } else if (altName === hostname) {
        hostnameMatch = true;
        break;
      }
    }

    if (!hostnameMatch) {
      findings.push(
        makeFinding(
          'ssl',
          'critical',
          'SSL Certificate Hostname Mismatch',
          `The certificate CN="${certSubject}" with SANs [${certAltNames.join(', ')}] does not match the requested hostname "${hostname}".`,
          true
        )
      );
    }

    // Key strength
    const keyBits = cert.bits || 0;
    if (keyBits > 0 && keyBits < 2048) {
      findings.push(
        makeFinding(
          'ssl',
          'high',
          'Weak SSL Key Strength',
          `The certificate uses a ${keyBits}-bit key. A minimum of 2048 bits is recommended.`,
          true,
          { step: 'Generate a new key pair with at least 2048 bits (4096 recommended).' }
        )
      );
    } else if (keyBits >= 4096) {
      findings.push(
        makeFinding(
          'ssl',
          'info',
          'Strong SSL Key Strength',
          `The certificate uses a ${keyBits}-bit key.`,
          false
        )
      );
    }

    // Protocol version via reconnection with specific protocol check
    let protocolVersion = 'unknown';
    try {
      const protoResult = await new Promise((resolve, reject) => {
        const s = tls.connect(
          {
            host: hostname,
            port,
            servername: hostname,
            rejectUnauthorized: false,
            timeout: 10000,
          },
          () => {
            resolve(s.getProtocol());
            s.destroy();
          }
        );
        s.on('error', (err) => reject(err));
        s.on('timeout', () => {
          s.destroy();
          reject(new Error('timeout'));
        });
      });
      protocolVersion = protoResult;
    } catch (_) {
      // ignore — we'll report unknown
    }

    if (protocolVersion === 'TLSv1' || protocolVersion === 'TLSv1.1') {
      findings.push(
        makeFinding(
          'ssl',
          'critical',
          'Outdated TLS Protocol',
          `The server is using ${protocolVersion}. TLS 1.2 or higher is required.`,
          true,
          { step: 'Disable TLS 1.0 and 1.1 on the server. Enable TLS 1.2 and 1.3.' }
        )
      );
    } else if (protocolVersion === 'TLSv1.3') {
      findings.push(
        makeFinding(
          'ssl',
          'info',
          'TLS 1.3 Supported',
          'The server supports TLS 1.3, the latest protocol version.',
          false
        )
      );
    } else if (protocolVersion === 'TLSv1.2') {
      findings.push(
        makeFinding(
          'ssl',
          'info',
          'TLS 1.2 Supported',
          'The server supports TLS 1.2.',
          false
        )
      );
    } else if (protocolVersion === 'unknown') {
      findings.push(
        makeFinding(
          'ssl',
          'low',
          'Could Not Determine TLS Protocol Version',
          'Unable to determine the TLS protocol version used by the server.',
          false
        )
      );
    }

    // Trusted CA (basic check: is it self-signed?)
    if (cert.issuer && cert.subject) {
      const issuerCN = cert.issuer.CN || '';
      const subjectCN = cert.subject.CN || '';
      if (
        issuerCN === subjectCN &&
        !cert.issuer.O &&
        !cert.subject.O
      ) {
        findings.push(
          makeFinding(
            'ssl',
            'high',
            'Self-Signed SSL Certificate',
            `The certificate is self-signed (Issuer CN="${issuerCN}" matches Subject CN="${subjectCN}" with no organization). Browsers will not trust this.`,
            true,
            { step: 'Obtain a certificate from a trusted Certificate Authority.' }
          )
        );
      }
    }

    // Signature algorithm
    const sigAlg = cert.sigalg || cert.SignatureAlgorithm || '';
    if (sigAlg) {
      const sigLower = sigAlg.toLowerCase();
      if (
        sigLower.includes('md5') ||
        sigLower.includes('sha1')
      ) {
        findings.push(
          makeFinding(
            'ssl',
            'high',
            'Weak Signature Algorithm',
            `The certificate uses signature algorithm "${sigAlg}". SHA-256 or stronger is recommended.`,
            true,
            { step: 'Reissue the certificate using SHA-256 or stronger.' }
          )
        );
      } else if (
        sigLower.includes('sha256') ||
        sigLower.includes('sha384') ||
        sigLower.includes('sha512') ||
        sigLower.includes('ecdsa')
      ) {
        findings.push(
          makeFinding(
            'ssl',
            'info',
            'Strong Signature Algorithm',
            `The certificate uses signature algorithm "${sigAlg}".`,
            false
          )
        );
      }
    }

    // Chain info
    if (cert.valid_from && cert.valid_to) {
      findings.push(
        makeFinding(
          'ssl',
          'info',
          'SSL Certificate Details',
          `Subject: ${certSubject} | Issuer: ${cert.issuer?.CN || 'N/A'} | Valid: ${cert.valid_from} to ${cert.valid_to} | Bits: ${keyBits || 'N/A'} | Protocol: ${protocolVersion}`,
          false
        )
      );
    }
  } catch (err) {
    findings.push(
      makeFinding(
        'ssl',
        'critical',
        'SSL Connection Failed',
        `Could not establish SSL/TLS connection to ${hostname}:${port}. Error: ${err.message}`,
        false
      )
    );
  }
  return findings;
}

export function checkSecurityHeaders(headers) {
  const findings = [];
  const h = {};
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      h[key.toLowerCase()] = value;
    }
  }

  // --- Security headers ---

  // HSTS
  if (h['strict-transport-security']) {
    const val = h['strict-transport-security'];
    const maxAgeMatch = val.match(/max-age=(\d+)/i);
    if (maxAgeMatch) {
      const maxAge = parseInt(maxAgeMatch[1], 10);
      if (maxAge < 31536000) {
        findings.push(
          makeFinding(
            'headers',
            'medium',
            'HSTS Max-Age Too Short',
            `Strict-Transport-Security max-age is ${maxAge}. It should be at least 31536000 (1 year).`,
            true,
            { header: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }
          )
        );
      }
      if (!val.toLowerCase().includes('includesubdomains')) {
        findings.push(
          makeFinding(
            'headers',
            'low',
            'HSTS Missing includeSubDomains',
            'Strict-Transport-Security does not include the includeSubDomains directive.',
            true,
            { header: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }
          )
        );
      }
      if (!val.toLowerCase().includes('preload')) {
        findings.push(
          makeFinding(
            'headers',
            'info',
            'HSTS Missing preload Directive',
            'Strict-Transport-Security does not include the preload directive. Consider adding it for HSTS preload list inclusion.',
            true,
            { header: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }
          )
        );
      }
    }
  } else {
    findings.push(
      makeFinding(
        'headers',
        'high',
        'Missing Strict-Transport-Security (HSTS)',
        'The HSTS header is not set. This allows downgrade attacks to HTTP.',
        true,
        { header: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }
      )
    );
  }

  // CSP
  if (h['content-security-policy']) {
    const val = h['content-security-policy'];
    if (val.includes("'unsafe-inline'") || val.includes("'unsafe-eval'")) {
      findings.push(
        makeFinding(
          'headers',
          'medium',
          'CSP Allows unsafe-inline or unsafe-eval',
          'Content-Security-Policy contains unsafe-inline or unsafe-eval, reducing its protective value.',
          true,
          { header: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" }
        )
      );
    }
  } else {
    findings.push(
      makeFinding(
        'headers',
        'high',
        'Missing Content-Security-Policy',
        'No Content-Security-Policy header is set. This increases exposure to XSS and data injection attacks.',
        true,
        { header: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'" }
      )
    );
  }

  // X-Frame-Options
  if (h['x-frame-options']) {
    const val = h['x-frame-options'].toLowerCase();
    if (val !== 'deny' && val !== 'sameorigin') {
      findings.push(
        makeFinding(
          'headers',
          'medium',
          'Invalid X-Frame-Options Value',
          `X-Frame-Options value "${h['x-frame-options']}" is not valid. Use DENY or SAMEORIGIN.`,
          true,
          { header: 'X-Frame-Options', value: 'DENY' }
        )
      );
    }
  } else {
    findings.push(
      makeFinding(
        'headers',
        'medium',
        'Missing X-Frame-Options',
        'The X-Frame-Options header is not set. Pages could be embedded in frames on other sites (clickjacking).',
        true,
        { header: 'X-Frame-Options', value: 'DENY' }
      )
    );
  }

  // X-Content-Type-Options
  if (h['x-content-type-options']) {
    if (h['x-content-type-options'].toLowerCase() !== 'nosniff') {
      findings.push(
        makeFinding(
          'headers',
          'medium',
          'Invalid X-Content-Type-Options Value',
          'X-Content-Type-Options should be set to "nosniff".',
          true,
          { header: 'X-Content-Type-Options', value: 'nosniff' }
        )
      );
    }
  } else {
    findings.push(
      makeFinding(
        'headers',
        'medium',
        'Missing X-Content-Type-Options',
        'The X-Content-Type-Options header is not set. Browsers may MIME-sniff responses.',
        true,
        { header: 'X-Content-Type-Options', value: 'nosniff' }
      )
    );
  }

  // Referrer-Policy
  if (h['referrer-policy']) {
    const val = h['referrer-policy'].toLowerCase();
    if (val === 'unsafe-url' || val === 'no-referrer-when-downgrade') {
      findings.push(
        makeFinding(
          'headers',
          'medium',
          'Weak Referrer-Policy',
          `Referrer-Policy is "${h['referrer-policy']}". This may leak sensitive URL information.`,
          true,
          { header: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
        )
      );
    }
  } else {
    findings.push(
      makeFinding(
        'headers',
        'low',
        'Missing Referrer-Policy',
        'The Referrer-Policy header is not set. Browsers may leak full URLs to third parties.',
        true,
        { header: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
      )
    );
  }

  // Permissions-Policy
  if (!h['permissions-policy'] && !h['feature-policy']) {
    findings.push(
      makeFinding(
        'headers',
        'low',
        'Missing Permissions-Policy',
        'No Permissions-Policy (or Feature-Policy) header is set. Default browser permissions apply.',
        true,
        { header: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
      )
    );
  }

  // Cross-Origin-Opener-Policy
  if (!h['cross-origin-opener-policy']) {
    findings.push(
      makeFinding(
        'headers',
        'low',
        'Missing Cross-Origin-Opener-Policy (COOP)',
        'No COOP header is set. The page can be referenced by cross-origin popups, enabling Spectre-type attacks.',
        true,
        { header: 'Cross-Origin-Opener-Policy', value: 'same-origin' }
      )
    );
  }

  // Cross-Origin-Embedder-Policy
  if (!h['cross-origin-embedder-policy']) {
    findings.push(
      makeFinding(
        'headers',
        'info',
        'Missing Cross-Origin-Embedder-Policy (COEP)',
        'No COEP header is set. This may prevent the page from using cross-origin resources with high-precision timing.',
        true,
        { header: 'Cross-Origin-Embedder-Policy', value: 'require-corp' }
      )
    );
  }

  // Cross-Origin-Resource-Policy
  if (!h['cross-origin-resource-policy']) {
    findings.push(
      makeFinding(
        'headers',
        'info',
        'Missing Cross-Origin-Resource-Policy (CORP)',
        'No CORP header is set. Resources may be loaded by any origin.',
        true,
        { header: 'Cross-Origin-Resource-Policy', value: 'same-origin' }
      )
    );
  }

  // X-XSS-Protection
  if (h['x-xss-protection']) {
    const val = h['x-xss-protection'];
    if (val === '1') {
      findings.push(
        makeFinding(
          'headers',
          'low',
          'X-XSS-Protection Enabled (Legacy)',
          'X-XSS-Protection is set to 1 (enabled). The legacy XSS auditor can introduce vulnerabilities. It is recommended to set it to 0 and rely on CSP.',
          true,
          { header: 'X-XSS-Protection', value: '0' }
        )
      );
    } else if (val !== '0' && val.toLowerCase() !== '0; mode=block') {
      findings.push(
        makeFinding(
          'headers',
          'low',
          'Unusual X-XSS-Protection Value',
          `X-XSS-Protection is set to "${val}". Modern best practice is to set it to 0.`,
          true,
          { header: 'X-XSS-Protection', value: '0' }
        )
      );
    }
  } else {
    findings.push(
      makeFinding(
        'headers',
        'info',
        'Missing X-XSS-Protection',
        'X-XSS-Protection header is not set. If CSP is in place this is acceptable.',
        false
      )
    );
  }

  // --- Information disclosure headers ---

  // Server
  if (h['server']) {
    findings.push(
      makeFinding(
        'headers',
        'low',
        'Server Header Discloses Information',
        `The Server header reveals: "${h['server']}". Remove or obfuscate this value.`,
        true,
        { header: 'Server', value: '' }
      )
    );
  }

  // X-Powered-By
  if (h['x-powered-by']) {
    findings.push(
      makeFinding(
        'headers',
        'low',
        'X-Powered-By Header Discloses Technology',
        `The X-Powered-By header reveals: "${h['x-powered-by']}". Remove this header.`,
        true,
        { header: 'X-Powered-By', value: '' }
      )
    );
  }

  // X-AspNet-Version
  if (h['x-aspnet-version']) {
    findings.push(
      makeFinding(
        'headers',
        'low',
        'X-AspNet-Version Discloses Framework Version',
        `The X-AspNet-Version header reveals: "${h['x-aspnet-version']}". Remove this header.`,
        true,
        { header: 'X-AspNet-Version', value: '' }
      )
    );
  }

  // X-AspNetMvc-Version
  if (h['x-aspnetmvc-version']) {
    findings.push(
      makeFinding(
        'headers',
        'low',
        'X-AspNetMvc-Version Discloses MVC Version',
        `The X-AspNetMvc-Version header reveals: "${h['x-aspnetmvc-version']}". Remove this header.`,
        true,
        { header: 'X-AspNetMvc-Version', value: '' }
      )
    );
  }

  return findings;
}

export function checkMixedContent(html, isHttps) {
  const findings = [];
  if (!isHttps || !html) {
    return findings;
  }

  const $ = cheerio.load(html);

  const activeSelectors = [
    { selector: 'script[src]', type: 'script', label: 'Script' },
    { selector: 'link[rel="stylesheet"][href]', type: 'stylesheet', label: 'Stylesheet' },
    { selector: 'iframe[src]', type: 'iframe', label: 'Iframe' },
    { selector: 'form[action]', type: 'form', label: 'Form Action' },
    { selector: 'object[data]', type: 'object', label: 'Object' },
    { selector: 'embed[src]', type: 'embed', label: 'Embed' },
  ];

  const passiveSelectors = [
    { selector: 'img[src]', type: 'image', label: 'Image' },
    { selector: 'img[srcset]', type: 'imagesrcset', label: 'Image Srcset' },
    { selector: 'source[src]', type: 'source', label: 'Audio/Video Source' },
    { selector: 'audio[src]', type: 'audio', label: 'Audio' },
    { selector: 'video[src]', type: 'video', label: 'Video' },
    { selector: 'link[rel="icon"][href]', type: 'favicon', label: 'Favicon' },
    { selector: 'link[rel="shortcut icon"][href]', type: 'favicon', label: 'Favicon' },
    { selector: 'meta[property="og:image"][content]', type: 'og-image', label: 'Open Graph Image' },
  ];

  const activeFindings = [];
  const passiveFindings = [];

  for (const { selector, type, label } of activeSelectors) {
    $(selector).each((_, el) => {
      let url = '';
      if (type === 'imagesrcset') {
        url = $(el).attr('srcset') || '';
      } else if (type === 'form') {
        url = $(el).attr('action') || '';
      } else if (type === 'object') {
        url = $(el).attr('data') || '';
      } else {
        url = $(el).attr('src') || $(el).attr('href') || '';
      }
      const trimmed = url.trim();
      if (trimmed && trimmed.startsWith('http://')) {
        const snippet = $(el).toString().substring(0, 200);
        activeFindings.push({ label, url: trimmed, snippet });
      }
    });
  }

  for (const { selector, type, label } of passiveSelectors) {
    $(selector).each((_, el) => {
      let url = '';
      if (type === 'imagesrcset') {
        url = $(el).attr('srcset') || '';
      } else {
        url = $(el).attr('src') || $(el).attr('href') || $(el).attr('content') || '';
      }
      const trimmed = url.trim();
      if (trimmed && trimmed.startsWith('http://')) {
        passiveFindings.push({ label, url: trimmed });
      }
    });
  }

  if (activeFindings.length > 0) {
    findings.push(
      makeFinding(
        'mixed-content',
        'critical',
        `Active Mixed Content Detected (${activeFindings.length} resource${activeFindings.length > 1 ? 's' : ''})`,
        `Found ${activeFindings.length} HTTP resource(s) loaded on an HTTPS page that can be blocked or exploited: ${activeFindings.map((f) => `${f.label}: ${f.url}`).join('; ')}`,
        true,
        {
          step: 'Change all resource URLs to use HTTPS protocol.',
          urls: activeFindings.map((f) => ({ label: f.label, http: f.url, https: f.url.replace('http://', 'https://') })),
        }
      )
    );
  }

  if (passiveFindings.length > 0) {
    findings.push(
      makeFinding(
        'mixed-content',
        'medium',
        `Passive Mixed Content Detected (${passiveFindings.length} resource${passiveFindings.length > 1 ? 's' : ''})`,
        `Found ${passiveFindings.length} HTTP resource(s) on an HTTPS page: ${passiveFindings.map((f) => `${f.label}: ${f.url}`).join('; ')}`,
        true,
        {
          step: 'Change all resource URLs to use HTTPS protocol.',
          urls: passiveFindings.map((f) => ({ label: f.label, http: f.url, https: f.url.replace('http://', 'https://') })),
        }
      )
    );
  }

  return findings;
}

export async function checkBrokenLinks(html, baseUrl, maxLinks = 30) {
  const findings = [];
  if (!html) {
    return findings;
  }

  const $ = cheerio.load(html);
  const seen = new Set();
  const links = [];

  $('a[href]').each((_, el) => {
    if (links.length >= maxLinks) {
      return false;
    }
    let href = $(el).attr('href');
    if (!href) {
      return;
    }
    href = href.trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return;
    }
    let absoluteUrl;
    try {
      absoluteUrl = new URL(href, baseUrl).href;
    } catch (_) {
      return;
    }
    if (seen.has(absoluteUrl)) {
      return;
    }
    seen.add(absoluteUrl);
    const displayText = $(el).text().trim().substring(0, 100);
    links.push({ href: absoluteUrl, displayText });
  });

  if (links.length === 0) {
    return findings;
  }

  const results = await Promise.allSettled(
    links.map(async (link) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(link.href, {
          method: 'HEAD',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent': 'AlphaTekX-RestorationScanner/1.0',
          },
        });
        clearTimeout(timeoutId);
        return { ...link, status: response.status, ok: response.ok };
      } catch (err) {
        return { ...link, status: 0, ok: false, error: err.message };
      }
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const link = result.value;
      if (!link.ok) {
        let severity = 'medium';
        if (link.status === 0) {
          severity = 'high';
        } else if (link.status >= 500) {
          severity = 'high';
        } else if (link.status === 404) {
          severity = 'medium';
        } else if (link.status === 403 || link.status === 401) {
          severity = 'low';
        }

        const statusDesc = link.error
          ? `Error: ${link.error}`
          : `HTTP ${link.status}`;

        findings.push(
          makeFinding(
            'links',
            severity,
            `Broken Link: ${link.displayText || link.href}`,
            `The link "${link.href}" ${link.displayText ? `(text: "${link.displayText}") ` : ''}returned ${statusDesc}.`,
            false
          )
        );
      }
    }
  }

  return findings;
}

export async function queryOSV(packages) {
  const findings = [];
  if (!packages || packages.length === 0) {
    return findings;
  }

  let results;
  try {
    const response = await fetch('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        queries: packages.map((pkg) => ({
          package: {
            name: pkg.name,
            ecosystem: pkg.ecosystem || 'npm',
          },
          version: pkg.version,
        })),
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      findings.push(
        makeFinding(
          'cve',
          'info',
          'OSV API Request Failed',
          `The OSV API returned HTTP ${response.status}. Vulnerability check was skipped.`,
          false
        )
      );
      return findings;
    }

    results = await response.json();
  } catch (err) {
    findings.push(
      makeFinding(
        'cve',
        'info',
        'OSV API Unreachable',
        `Could not query the OSV vulnerability database: ${err.message}. This check was skipped.`,
        false
      )
    );
    return findings;
  }

  if (!results || !results.results) {
    return findings;
  }

  for (let i = 0; i < results.results.length; i++) {
    const result = results.results[i];
    const pkg = packages[i];
    if (!result || !result.vulns || result.vulns.length === 0) {
      continue;
    }

    for (const vuln of result.vulns) {
      const vulnId = vuln.id || 'UNKNOWN';
      const summary = vuln.summary || vuln.details || 'No description available.';

      let severity = 'medium';
      let cvssScore = null;

      if (vuln.severity && vuln.severity.length > 0) {
        const sev = vuln.severity[0];
        if (sev.score) {
          try {
            const cvss = typeof sev.score === 'string' ? JSON.parse(sev.score) : sev.score;
            cvssScore = cvss.baseScore || cvss.metrics?.baseScore || null;
          } catch (_) {
            // ignore parse errors
          }
        }
      }

      // Also check database_specific or ecosystem_specific
      if (vuln.database_specific?.severity) {
        const dbSev = vuln.database_specific.severity.toLowerCase();
        if (dbSev === 'critical') severity = 'critical';
        else if (dbSev === 'high') severity = 'high';
        else if (dbSev === 'moderate' || dbSev === 'medium') severity = 'medium';
        else if (dbSev === 'low') severity = 'low';
      } else if (cvssScore !== null) {
        if (cvssScore >= 9.0) severity = 'critical';
        else if (cvssScore >= 7.0) severity = 'high';
        else if (cvssScore >= 4.0) severity = 'medium';
        else severity = 'low';
      }

      const aliases = vuln.aliases && vuln.aliases.length > 0 ? vuln.aliases.join(', ') : '';

      findings.push(
        makeFinding(
          'cve',
          severity,
          `Vulnerability ${vulnId} in ${pkg.name}@${pkg.version}`,
          `Package "${pkg.name}" version "${pkg.version}" is affected by ${vulnId}${aliases ? ` (${aliases})` : ''}: ${summary}`,
          true,
          {
            step: `Update ${pkg.name} to a patched version. Check ${vulnId} advisory for details.`,
            reference: vuln.references?.[0]?.url || `https://osv.dev/vulnerability/${vulnId}`,
          }
        )
      );
    }
  }

  return findings;
}

export function checkSEO(html) {
  const findings = [];
  if (!html) {
    return findings;
  }

  const $ = cheerio.load(html);

  // OG Title
  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (!ogTitle || ogTitle.trim() === '') {
    findings.push(
      makeFinding(
        'seo',
        'medium',
        'Missing og:title',
        'No Open Graph title tag found. Social media shares will not display a proper title.',
        true,
        { step: 'Add <meta property="og:title" content="Your Page Title"> to the <head>.' }
      )
    );
  }

  // OG Description
  const ogDescription = $('meta[property="og:description"]').attr('content');
  if (!ogDescription || ogDescription.trim() === '') {
    findings.push(
      makeFinding(
        'seo',
        'medium',
        'Missing og:description',
        'No Open Graph description tag found. Social media shares will not display a description.',
        true,
        { step: 'Add <meta property="og:description" content="Your page description"> to the <head>.' }
      )
    );
  }

  // OG Image
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (!ogImage || ogImage.trim() === '') {
    findings.push(
      makeFinding(
        'seo',
        'low',
        'Missing og:image',
        'No Open Graph image tag found. Social media shares will not display a preview image.',
        true,
        { step: 'Add <meta property="og:image" content="https://example.com/image.jpg"> to the <head>.' }
      )
    );
  }

  // Canonical
  const canonical = $('link[rel="canonical"]').attr('href');
  if (!canonical || canonical.trim() === '') {
    findings.push(
      makeFinding(
        'seo',
        'medium',
        'Missing Canonical Tag',
        'No canonical link tag found. This may lead to duplicate content issues.',
        true,
        { step: 'Add <link rel="canonical" href="https://example.com/page"> to the <head>.' }
      )
    );
  }

  // H1 count
  const h1Elements = $('h1');
  const h1Count = h1Elements.length;
  if (h1Count === 0) {
    findings.push(
      makeFinding(
        'seo',
        'high',
        'Missing H1 Tag',
        'No <h1> tag found on the page. Every page should have exactly one H1.',
        true,
        { step: 'Add exactly one <h1> tag containing the main heading of the page.' }
      )
    );
  } else if (h1Count > 1) {
    findings.push(
      makeFinding(
        'seo',
        'medium',
        `Multiple H1 Tags (${h1Count} found)`,
        `Found ${h1Count} <h1> tags. A page should have exactly one H1 tag.`,
        true,
        { step: 'Keep only one <h1> tag. Convert additional H1s to H2 or lower.' }
      )
    );
  }

  // Heading hierarchy
  const headings = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const level = parseInt(el.tagName.replace('h', ''), 10);
    headings.push(level);
  });

  let hierarchyBroken = false;
  let prevLevel = 0;
  for (const level of headings) {
    if (prevLevel > 0 && level > prevLevel + 1) {
      hierarchyBroken = true;
      break;
    }
    prevLevel = level;
  }

  if (headings.length > 0 && hierarchyBroken) {
    findings.push(
      makeFinding(
        'seo',
        'low',
        'Heading Hierarchy Broken',
        'Heading levels are not in proper sequential order (e.g., H1 -> H3 skipping H2).',
        true,
        { step: 'Ensure heading levels increase sequentially without skipping levels.' }
      )
    );
  }

  // Twitter Card
  const twitterCard = $('meta[name="twitter:card"]').attr('content');
  if (!twitterCard || twitterCard.trim() === '') {
    findings.push(
      makeFinding(
        'seo',
        'low',
        'Missing twitter:card',
        'No Twitter card meta tag found. Tweets linking to this page may not display a card preview.',
        true,
        { step: 'Add <meta name="twitter:card" content="summary_large_image"> to the <head>.' }
      )
    );
  }

  return findings;
}

export function checkAccessibility(html) {
  const findings = [];
  if (!html) {
    return findings;
  }

  const $ = cheerio.load(html);

  // Images without alt text
  let missingAltCount = 0;
  $('img').each((_, el) => {
    const alt = $(el).attr('alt');
    if (alt === undefined || alt === null) {
      missingAltCount += 1;
    }
  });

  if (missingAltCount > 0) {
    findings.push(
      makeFinding(
        'accessibility',
        'high',
        `Images Missing alt Attribute (${missingAltCount} found)`,
        `${missingAltCount} <img> tag(s) are missing the alt attribute. Screen readers cannot describe these images.`,
        true,
        { step: 'Add descriptive alt attributes to all <img> tags. Use alt="" for decorative images.' }
      )
    );
  }

  // Forms without labels
  const inputs = $('input[type="text"], input[type="email"], input[type="password"], input[type="number"], input[type="tel"], input[type="url"], input[type="search"], textarea, select');
  let unlabeledCount = 0;

  inputs.each((_, el) => {
    const id = $(el).attr('id');
    const ariaLabel = $(el).attr('aria-label');
    const ariaLabelledBy = $(el).attr('aria-labelledby');
    const title = $(el).attr('title');
    const placeholder = $(el).attr('placeholder');

    let hasLabel = false;

    if (id) {
      const labelForId = $(`label[for="${id}"]`);
      if (labelForId.length > 0) {
        hasLabel = true;
      }
    }

    // Check if input is wrapped in a label
    if (!hasLabel && $(el).closest('label').length > 0) {
      hasLabel = true;
    }

    if (ariaLabel || ariaLabelledBy || title) {
      hasLabel = true;
    }

    // Placeholder is not an accessible label, but we won't flag it as severely
    if (!hasLabel && !placeholder) {
      unlabeledCount += 1;
    }
  });

  if (unlabeledCount > 0) {
    findings.push(
      makeFinding(
        'accessibility',
        'high',
        `Form Inputs Missing Labels (${unlabeledCount} found)`,
        `${unlabeledCount} form input(s) have no associated <label>, aria-label, or aria-labelledby.`,
        true,
        { step: 'Associate each input with a <label> element using for/id attributes, or add aria-label.' }
      )
    );
  }

  // ARIA roles - check for invalid/missing landmark roles
  const mainContent = $('main, [role="main"]');
  if (mainContent.length === 0 && $('body').children().length > 0) {
    findings.push(
      makeFinding(
        'accessibility',
        'medium',
        'No Main Landmark Found',
        'No <main> element or role="main" landmark found. Screen readers use landmarks for navigation.',
        true,
        { step: 'Wrap the primary content in a <main> element.' }
      )
    );
  }

  // Navigation landmark
  const navLandmarks = $('nav, [role="navigation"]');
  if (navLandmarks.length === 0) {
    findings.push(
      makeFinding(
        'accessibility',
        'low',
        'No Navigation Landmark Found',
        'No <nav> element or role="navigation" landmark found.',
        true,
        { step: 'Wrap navigation menus in a <nav> element.' }
      )
    );
  }

  // Heading hierarchy for accessibility
  const headings = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    headings.push($(el).text().trim());
  });
  if (headings.length === 0) {
    findings.push(
      makeFinding(
        'accessibility',
        'medium',
        'No Headings Found',
        'No heading elements (<h1>-<h6>) found on the page. Headings help screen reader users navigate content.',
        true,
        { step: 'Add heading elements to structure the content hierarchy.' }
      )
    );
  }

  // tabindex issues
  const positiveTabindex = $('[tabindex]');
  let badTabindexCount = 0;
  positiveTabindex.each((_, el) => {
    const val = parseInt($(el).attr('tabindex'), 10);
    if (val > 0) {
      badTabindexCount += 1;
    }
  });

  if (badTabindexCount > 0) {
    findings.push(
      makeFinding(
        'accessibility',
        'medium',
        `Positive tabindex Values Found (${badTabindexCount})`,
        `${badTabindexCount} element(s) have positive tabindex values, which disrupts natural tab order.`,
        true,
        { step: 'Use tabindex="0" to add elements to the natural tab order, or tabindex="-1" for programmatic focus only.' }
      )
    );
  }

  // Lang attribute
  const htmlTag = $('html');
  const lang = htmlTag.attr('lang');
  if (!lang || lang.trim() === '') {
    findings.push(
      makeFinding(
        'accessibility',
        'high',
        'Missing lang Attribute on <html>',
        'The <html> element does not have a lang attribute. Screen readers cannot determine the page language.',
        true,
        { step: 'Add lang="en" (or appropriate language code) to the <html> element.' }
      )
    );
  }

  // Skip links (basic check)
  const skipLink = $('a[href="#main"], a[href="#content"], a[href="#maincontent"], a.skip-link, a.skip-nav');
  if (skipLink.length === 0) {
    findings.push(
      makeFinding(
        'accessibility',
        'info',
        'No Skip Navigation Link Found',
        'No skip navigation link detected. Keyboard users may have to tab through all navigation links to reach main content.',
        true,
        { step: 'Add a skip navigation link as the first focusable element: <a href="#main" class="skip-link">Skip to main content</a>' }
      )
    );
  }

  return findings;
}

export function detectSecrets(html) {
  const findings = [];
  if (!html) {
    return findings;
  }

  const patterns = [
    // OpenAI
    {
      regex: /sk-[A-Za-z0-9]{20,}[A-Za-z0-9]{20,}/g,
      name: 'OpenAI API Key',
      severity: 'critical',
    },
    {
      regex: /sk-proj-[A-Za-z0-9_-]{40,}/g,
      name: 'OpenAI Project API Key',
      severity: 'critical',
    },
    // Anthropic
    {
      regex: /sk-ant-[A-Za-z0-9_-]{30,}/g,
      name: 'Anthropic API Key',
      severity: 'critical',
    },
    // Stripe
    {
      regex: /sk_live_[A-Za-z0-9]{20,}/g,
      name: 'Stripe Live Secret Key',
      severity: 'critical',
    },
    {
      regex: /pk_live_[A-Za-z0-9]{20,}/g,
      name: 'Stripe Live Publishable Key',
      severity: 'medium',
    },
    {
      regex: /sk_test_[A-Za-z0-9]{20,}/g,
      name: 'Stripe Test Secret Key',
      severity: 'high',
    },
    // AWS
    {
      regex: /(?:^|[^A-Za-z0-9/+=])(AKIA[A-Z0-9]{16})(?:[^A-Za-z0-9/+=]|$)/g,
      name: 'AWS Access Key ID',
      severity: 'critical',
    },
    {
      regex: /(?:^|[^A-Za-z0-9/+=])([A-Za-z0-9/+=]{40})(?:[^A-Za-z0-9/+=]|$)/g,
      name: 'AWS Secret Access Key (potential)',
      severity: 'high',
      contextCheck: true,
    },
    // GitHub
    {
      regex: /ghp_[A-Za-z0-9]{36}/g,
      name: 'GitHub Personal Access Token',
      severity: 'critical',
    },
    {
      regex: /gho_[A-Za-z0-9]{36}/g,
      name: 'GitHub OAuth Access Token',
      severity: 'critical',
    },
    {
      regex: /github_pat_[A-Za-z0-9_]{22,}/g,
      name: 'GitHub Fine-Grained Personal Access Token',
      severity: 'critical',
    },
    {
      regex: /ghr_[A-Za-z0-9]{36}/g,
      name: 'GitHub Refresh Token',
      severity: 'critical',
    },
    // Google
    {
      regex: /AIza[A-Za-z0-9_-]{35}/g,
      name: 'Google API Key',
      severity: 'high',
    },
    {
      regex: /ya29\.[A-Za-z0-9_-]+/g,
      name: 'Google OAuth Access Token',
      severity: 'critical',
    },
    // Azure
    {
      regex: /AccountKey=[A-Za-z0-9+/=]{88}/g,
      name: 'Azure Storage Account Key',
      severity: 'critical',
    },
    {
      regex: /Endpoint=sb:\/\/[^\s]+;SharedAccessKey=[A-Za-z0-9+/=]{44}/g,
      name: 'Azure Service Bus Connection String',
      severity: 'critical',
    },
    {
      regex: /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]{88}/g,
      name: 'Azure Storage Connection String',
      severity: 'critical',
    },
    // GCP
    {
      regex: /"type"\s*:\s*"service_account"/g,
      name: 'GCP Service Account Key (JSON)',
      severity: 'critical',
    },
    // Docker
    {
      regex: /docker(?:_hub)?_pat_[A-Za-z0-9_-]{20,}/g,
      name: 'Docker Personal Access Token',
      severity: 'critical',
    },
    // Elasticsearch
    {
      regex: /[A-Za-z0-9]{64}:[A-Za-z0-9]{16}/g,
      name: 'Elasticsearch API Key (potential)',
      severity: 'high',
      contextCheck: true,
    },
    // Twilio
    {
      regex: /SK[A-Za-z0-9]{32}/g,
      name: 'Twilio API Key',
      severity: 'critical',
    },
    {
      regex: /AC[a-f0-9]{32}/g,
      name: 'Twilio Account SID',
      severity: 'high',
      contextCheck: true,
    },
    // SendGrid
    {
      regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g,
      name: 'SendGrid API Key',
      severity: 'critical',
    },
    // Slack
    {
      regex: /xox[bpsr]-[A-Za-z0-9-]+/g,
      name: 'Slack Bot/User/Webhook Token',
      severity: 'critical',
    },
    {
      regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{8,}\/B[A-Z0-9]{8,}\/[A-Za-z0-9]{24}/g,
      name: 'Slack Incoming Webhook URL',
      severity: 'critical',
    },
    // Discord
    {
      regex: /discord(?:app\.com\/api\/webhooks\/|\.gg\/)[A-Za-z0-9_-]+/g,
      name: 'Discord Webhook URL',
      severity: 'critical',
    },
    {
      regex: /[MN][A-Za-z0-9_-]{23,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{27,}/g,
      name: 'Discord Bot Token (potential)',
      severity: 'critical',
      contextCheck: true,
    },
    // Database connection strings
    {
      regex: /postgres(?:ql)?:\/\/[^\s"'<>]+/gi,
      name: 'PostgreSQL Connection String',
      severity: 'critical',
    },
    {
      regex: /mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi,
      name: 'MongoDB Connection String',
      severity: 'critical',
    },
    {
      regex: /mysql:\/\/[^\s"'<>]+/gi,
      name: 'MySQL Connection String',
      severity: 'critical',
    },
    {
      regex: /redis:\/\/[^\s"'<>]+/gi,
      name: 'Redis Connection String',
      severity: 'high',
    },
    {
      regex: /amqp:\/\/[^\s"'<>]+/gi,
      name: 'AMQP/RabbitMQ Connection String',
      severity: 'high',
    },
    {
      regex: /smtp:\/\/[^\s"'<>]+/gi,
      name: 'SMTP Connection String',
      severity: 'high',
    },
    // JWT tokens
    {
      regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      name: 'JWT Token',
      severity: 'high',
    },
    // Private keys
    {
      regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
      name: 'Private Key',
      severity: 'critical',
    },
    {
      regex: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g,
      name: 'PGP Private Key Block',
      severity: 'critical',
    },
    // Generic high-entropy tokens (API keys, secrets)
    {
      regex: /(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token|credentials?)\s*[:=]\s*["']([A-Za-z0-9_/+=-]{32,})["']/gi,
      name: 'Generic High-Entropy Token',
      severity: 'high',
    },
    // Generic hex secrets
    {
      regex: /(?:secret|token|password|key)\s*[:=]\s*["']([a-f0-9]{40,})["']/gi,
      name: 'Generic Hex Secret',
      severity: 'high',
    },
    // Bearer tokens
    {
      regex: /Bearer\s+[A-Za-z0-9_\-._~+/]+=*/gi,
      name: 'Bearer Token',
      severity: 'high',
    },
    // Basic auth
    {
      regex: /Basic\s+[A-Za-z0-9+/]+=*/gi,
      name: 'Basic Auth Credentials',
      severity: 'high',
    },
    // Base64 encoded potential secrets
    {
      regex: /(?:key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9+/]{40,}={0,2}["']/gi,
      name: 'Potential Base64 Encoded Secret',
      severity: 'medium',
    },
    // npm tokens
    {
      regex: /npm_[A-Za-z0-9]{36}/g,
      name: 'npm Access Token',
      severity: 'critical',
    },
    // PyPI tokens
    {
      regex: /pypi-[A-Za-z0-9_-]{50,}/g,
      name: 'PyPI API Token',
      severity: 'critical',
    },
    // Heroku
    {
      regex: /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
      name: 'Potential UUID/GUID (low context)',
      severity: 'info',
      contextCheck: true,
    },
    // Datadog
    {
      regex: /DD_API_KEY=[A-Za-z0-9]{32}/g,
      name: 'Datadog API Key',
      severity: 'critical',
    },
    // HashiCorp Vault
    {
      regex: /hvs\.[A-Za-z0-9]{24,}/g,
      name: 'HashiCorp Vault Service Token',
      severity: 'critical',
    },
    // Algolia
    {
      regex: /(?:ALGOLIA_APP_ID|algoliaAppId)\s*[:=]\s*["']?([A-Z0-9]{10})["']?/gi,
      name: 'Algolia App ID',
      severity: 'medium',
    },
    // Asymmetric patterns: password = "..." or secret = "..."
    {
      regex: /(?:password|passwd|pwd)\s*[:=]\s*["']([^\s"']{8,})["']/gi,
      name: 'Hardcoded Password',
      severity: 'critical',
    },
    // Postmark / Mailgun
    {
      regex: /key-[0-9a-z]{32}/g,
      name: 'Mailgun API Key (potential)',
      severity: 'high',
    },
    // Telegram Bot Token
    {
      regex: /\d{9,10}:[A-Za-z0-9_-]{35}/g,
      name: 'Telegram Bot Token (potential)',
      severity: 'critical',
      contextCheck: true,
    },
    // Square
    {
      regex: /sq0atp-[A-Za-z0-9_-]{22}/g,
      name: 'Square Access Token',
      severity: 'critical',
    },
    {
      regex: /sq0csp-[A-Za-z0-9_-]{43}/g,
      name: 'Square OAuth Secret',
      severity: 'critical',
    },
    // Coinbase
    {
      regex: /(?:coinbase|COINBASE)[_ -]?(?:api[_ -]?key|secret|passphrase)\s*[:=]\s*["']([^\s"']+)["']/gi,
      name: 'Coinbase API Credentials',
      severity: 'critical',
    },
    // Generic high entropy strings after common key names
    {
      regex: /(?:CLIENT_SECRET|client_secret)\s*[:=]\s*["']([A-Za-z0-9_\-]{20,})["']/g,
      name: 'Client Secret',
      severity: 'critical',
    },
  ];

  const seenMatches = new Set();

  for (const { regex, name, severity, contextCheck } of patterns) {
    const re = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = re.exec(html)) !== null) {
      const fullMatch = match[0];
      const capturedGroup = match[1] || fullMatch;
      const dedupeKey = `${name}:${capturedGroup.substring(0, 20)}`;

      if (seenMatches.has(dedupeKey)) {
        continue;
      }
      seenMatches.add(dedupeKey);

      // For context-sensitive patterns, do additional heuristics
      if (contextCheck) {
        // Skip AWS secret key matches that aren't near AWS-related context
        if (name === 'AWS Secret Access Key (potential)') {
          const idx = match.index;
          const contextStr = html.substring(Math.max(0, idx - 100), Math.min(html.length, idx + 100));
          if (!/aws|secret|access.?key|credentials?|AKIA/i.test(contextStr)) {
            continue;
          }
        }
        // Skip generic UUID matches
        if (name === 'Potential UUID/GUID (low context)') {
          const idx = match.index;
          const contextStr = html.substring(Math.max(0, idx - 100), Math.min(html.length, idx + 100));
          if (!/token|secret|key|password|auth/i.test(contextStr)) {
            continue;
          }
        }
        // Skip Elasticsearch potential matches unless near ES context
        if (name === 'Elasticsearch API Key (potential)') {
          const idx = match.index;
          const contextStr = html.substring(Math.max(0, idx - 100), Math.min(html.length, idx + 100));
          if (!/elastic|kibana|apm/i.test(contextStr)) {
            continue;
          }
        }
        // Skip Discord bot token unless near discord context
        if (name === 'Discord Bot Token (potential)') {
          const idx = match.index;
          const contextStr = html.substring(Math.max(0, idx - 100), Math.min(html.length, idx + 100));
          if (!/discord/i.test(contextStr)) {
            continue;
          }
        }
        // Skip Twilio Account SID unless near twilio context
        if (name === 'Twilio Account SID') {
          const idx = match.index;
          const contextStr = html.substring(Math.max(0, idx - 100), Math.min(html.length, idx + 100));
          if (!/twilio|twillio|TWILIO/i.test(contextStr)) {
            continue;
          }
        }
        // Skip Telegram token unless near telegram context
        if (name === 'Telegram Bot Token (potential)') {
          const idx = match.index;
          const contextStr = html.substring(Math.max(0, idx - 100), Math.min(html.length, idx + 100));
          if (!/telegram|bot.?token|TELEGRAM/i.test(contextStr)) {
            continue;
          }
        }
      }

      // Truncate the leaked value for display
      const displayValue =
        capturedGroup.length > 40
          ? capturedGroup.substring(0, 8) + '...' + capturedGroup.substring(capturedGroup.length - 4)
          : capturedGroup;

      findings.push(
        makeFinding(
          'secrets',
          severity,
          `${name} Detected`,
          `Found a potential ${name} in page source: "${displayValue}". Secrets in client-facing HTML are exposed to all visitors.`,
          true,
          {
            step: `Remove the ${name} from client-facing code. Store secrets in environment variables or a secrets manager, and access them server-side only.`,
          }
        )
      );
    }
  }

  return findings;
}

export async function runFullRestorationScan(targetUrl, options = {}) {
  const { skipLinks = false, skipOSV = false, packages = [], htmlOverride = null, headersOverride = null } = options;
  resetCounter();

  const allFindings = [];
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (_) {
    allFindings.push(
      makeFinding(
        'info',
        'critical',
        'Invalid Target URL',
        `Could not parse the target URL: "${targetUrl}". Please provide a valid URL.`,
        false
      )
    );
    return {
      findings: allFindings,
      score: 0,
      severity: 'critical',
      categories: {},
    };
  }

  const isHttps = parsedUrl.protocol === 'https:';
  const hostname = parsedUrl.hostname;
  const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : (isHttps ? 443 : 80);

  let html = '';
  let responseHeaders = {};
  let responseStatus = 0;

  if (htmlOverride) {
    html = htmlOverride;
    responseHeaders = headersOverride || {};
  } else {
    // Fetch the page
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(targetUrl, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'AlphaTekX-RestorationScanner/1.0',
        },
      });
      clearTimeout(timeoutId);
      responseStatus = response.status;

      const responseHeadersRaw = {};
      response.headers.forEach((value, key) => {
        responseHeadersRaw[key.toLowerCase()] = value;
      });
      responseHeaders = responseHeadersRaw;

      const contentType = responseHeadersRaw['content-type'] || '';
      if (contentType.includes('text/html') || contentType.includes('text/plain') || contentType === '') {
        html = await response.text();
      }
    } catch (err) {
      allFindings.push(
        makeFinding(
          'links',
          'critical',
          'Failed to Fetch Target URL',
          `Could not retrieve the page at ${targetUrl}. Error: ${err.message}`,
          false
        )
      );
      return {
        findings: allFindings,
        score: 0,
        severity: 'critical',
        categories: {},
      };
    }
  }

  // HTTP status check
  if (responseStatus >= 400) {
    allFindings.push(
      makeFinding(
        'links',
        responseStatus >= 500 ? 'high' : 'medium',
        `Target Returned HTTP ${responseStatus}`,
        `The target URL returned HTTP status ${responseStatus}. Some checks may be incomplete.`,
        false
      )
    );
  }

  // Redirect check
  if (!isHttps) {
    allFindings.push(
      makeFinding(
        'ssl',
        'high',
        'Site Not Using HTTPS',
        'The target URL uses HTTP instead of HTTPS. All traffic is unencrypted.',
        true,
        { step: 'Configure TLS/SSL on the server and redirect all HTTP traffic to HTTPS.' }
      )
    );
  }

  // 1. SSL Check (only for HTTPS)
  if (isHttps) {
    try {
      const sslFindings = await checkSSL(hostname, port);
      allFindings.push(...sslFindings);
    } catch (err) {
      allFindings.push(
        makeFinding(
          'ssl',
          'low',
          'SSL Check Error',
          `An error occurred during SSL check: ${err.message}`,
          false
        )
      );
    }
  }

  // 2. Security Headers
  try {
    const headerFindings = checkSecurityHeaders(responseHeaders);
    allFindings.push(...headerFindings);
  } catch (err) {
    allFindings.push(
      makeFinding(
        'headers',
        'low',
        'Security Headers Check Error',
        `An error occurred during security headers check: ${err.message}`,
        false
      )
    );
  }

  // 3. Mixed Content
  try {
    const mixedContentFindings = checkMixedContent(html, isHttps);
    allFindings.push(...mixedContentFindings);
  } catch (err) {
    allFindings.push(
      makeFinding(
        'mixed-content',
        'low',
        'Mixed Content Check Error',
        `An error occurred during mixed content check: ${err.message}`,
        false
      )
    );
  }

  // 4. Broken Links
  if (!skipLinks && html) {
    try {
      const linkFindings = await checkBrokenLinks(html, targetUrl);
      allFindings.push(...linkFindings);
    } catch (err) {
      allFindings.push(
        makeFinding(
          'links',
          'low',
          'Broken Links Check Error',
          `An error occurred during broken links check: ${err.message}`,
          false
        )
      );
    }
  }

  // 5. OSV Vulnerability Check
  if (!skipOSV && packages.length > 0) {
    try {
      const cveFindings = await queryOSV(packages);
      allFindings.push(...cveFindings);
    } catch (err) {
      allFindings.push(
        makeFinding(
          'cve',
          'low',
          'OSV Check Error',
          `An error occurred during OSV vulnerability check: ${err.message}`,
          false
        )
      );
    }
  }

  // 6. SEO
  if (html) {
    try {
      const seoFindings = checkSEO(html);
      allFindings.push(...seoFindings);
    } catch (err) {
      allFindings.push(
        makeFinding(
          'seo',
          'low',
          'SEO Check Error',
          `An error occurred during SEO check: ${err.message}`,
          false
        )
      );
    }
  }

  // 7. Accessibility
  if (html) {
    try {
      const accessibilityFindings = checkAccessibility(html);
      allFindings.push(...accessibilityFindings);
    } catch (err) {
      allFindings.push(
        makeFinding(
          'accessibility',
          'low',
          'Accessibility Check Error',
          `An error occurred during accessibility check: ${err.message}`,
          false
        )
      );
    }
  }

  // 8. Secrets Detection
  if (html) {
    try {
      const secretFindings = detectSecrets(html);
      allFindings.push(...secretFindings);
    } catch (err) {
      allFindings.push(
        makeFinding(
          'secrets',
          'low',
          'Secrets Detection Error',
          `An error occurred during secrets detection: ${err.message}`,
          false
        )
      );
    }
  }

  // 9. Malware / Obfuscated Code Detection
  if (html) {
    try {
      const malwareFindings = detectMalware(html);
      allFindings.push(...malwareFindings);
    } catch (err) {
      allFindings.push(
        makeFinding(
          'malware',
          'low',
          'Malware Detection Error',
          `An error occurred during malware detection: ${err.message}`,
          false
        )
      );
    }
  }

  // Calculate score and aggregate by category
  const severityWeights = {
    critical: 25,
    high: 15,
    medium: 8,
    low: 3,
    info: 0,
  };

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

  let totalPenalty = 0;
  let worstSeverity = 'info';
  const categories = {};

  for (const finding of allFindings) {
    const cat = finding.category;
    if (!categories[cat]) {
      categories[cat] = [];
    }
    categories[cat].push(finding);

    if (severityOrder[finding.severity] < severityOrder[worstSeverity]) {
      worstSeverity = finding.severity;
    }

    totalPenalty += severityWeights[finding.severity] || 0;
  }

  const score = Math.max(0, Math.min(100, 100 - totalPenalty));

  // Adjust worst severity based on score
  if (score === 100) {
    worstSeverity = 'info';
  } else if (score >= 80 && worstSeverity !== 'critical') {
    worstSeverity = 'low';
  } else if (score >= 60 && (worstSeverity === 'critical' || worstSeverity === 'high')) {
    worstSeverity = 'high';
  } else if (score >= 40 && worstSeverity === 'critical') {
    worstSeverity = 'critical';
  }

  // Final score-based severity override
  let overallSeverity;
  if (score >= 90) {
    overallSeverity = 'info';
  } else if (score >= 75) {
    overallSeverity = 'low';
  } else if (score >= 55) {
    overallSeverity = 'medium';
  } else if (score >= 30) {
    overallSeverity = 'high';
  } else {
    overallSeverity = 'critical';
  }

  // Use the worse of computed vs actual
  if (severityOrder[worstSeverity] < severityOrder[overallSeverity]) {
    overallSeverity = worstSeverity;
  }

  return {
    findings: allFindings,
    score,
    severity: overallSeverity,
    categories,
  };
}
