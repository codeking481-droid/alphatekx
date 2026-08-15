// Plain-English meaning and real-world consequence for each finding type.
// Shared by the live scan stream, the web report, and the PDF export.

const CATALOG = {
  EXPOSED_ENV_FILE: {
    meaning: 'Your .env file is downloadable by anyone. It holds the passwords your app uses to talk to your database, payment provider and AI provider.',
    consequence: 'Anyone who opens this URL can copy your keys and spend on your account. A leaked AI key is routinely drained for thousands of dollars of usage before the next invoice arrives.',
  },
  EXPOSED_CONFIG_FILE: {
    meaning: 'A configuration file that should stay on your server is being served to the public internet.',
    consequence: 'Attackers read it to learn where your database and admin endpoints live, then attack those directly instead of guessing.',
  },
  EXPOSED_GIT_DIRECTORY: {
    meaning: 'Your .git folder is public. That is your entire source-code history, not just the built site.',
    consequence: 'Your full source code can be reconstructed with one command, including any password ever committed and later "removed" — deleting it from the current code does not remove it from history.',
  },
  EXPOSED_BACKUP_FILE: {
    meaning: 'A database or site backup is publicly downloadable.',
    consequence: 'One download hands over every customer record you have. Under GDPR/NDPR that is a reportable breach with regulatory fines on top of the lost trust.',
  },
  EXPOSED_SOURCE_MAP: {
    meaning: 'Source maps are published next to your production JavaScript, so your original, unminified source code is readable in the browser.',
    consequence: 'Attackers read your business logic and internal API routes like an open book and go straight for the weak endpoint.',
  },
  SECRET_IN_CLIENT_BUNDLE: {
    meaning: 'A live secret key is embedded in JavaScript that every visitor downloads. Minification does not hide it.',
    consequence: 'Anyone can extract this key from your page and use your paid account. This is the single most common cause of surprise five-figure API bills.',
  },
  SECRET_IN_HTML: {
    meaning: 'A live secret key is printed directly into your page HTML.',
    consequence: 'The key is already indexed by crawlers and secret-scanning bots. Assume it is being used by someone else right now.',
  },
  SECRET_IN_API_RESPONSE: {
    meaning: 'One of your own API responses returns a secret credential to the browser.',
    consequence: 'Any logged-in user — or anyone who can call that endpoint — walks away with server-side credentials.',
  },
  CORS_WILDCARD_WITH_CREDENTIALS: {
    meaning: 'Your API accepts requests from any website and still attaches user credentials.',
    consequence: 'A malicious page can silently read your users\u2019 private data using their own logged-in session.',
  },
  CORS_WILDCARD: {
    meaning: 'Your API replies with Access-Control-Allow-Origin: *, so any site on the internet can call it from a browser.',
    consequence: 'Competitors and scrapers can build on top of your API for free, and abuse costs land on your bill.',
  },
  MISSING_HSTS: {
    meaning: 'Strict-Transport-Security is missing, so browsers may still try plain HTTP first.',
    consequence: 'On public Wi-Fi an attacker can downgrade that first request and capture the login that follows.',
  },
  MISSING_CSP: {
    meaning: 'You have no Content-Security-Policy, so the browser will run any script that ends up on your page.',
    consequence: 'One injected script is enough to skim card details or session tokens from every visitor.',
  },
  MISSING_X_FRAME_OPTIONS: {
    meaning: 'Your pages can be embedded in an invisible frame on someone else\u2019s site.',
    consequence: 'Clickjacking: users think they are clicking a game, and they are actually approving a transfer on your app.',
  },
  MISSING_X_CONTENT_TYPE_OPTIONS: {
    meaning: 'Browsers are allowed to guess the type of files you serve instead of trusting you.',
    consequence: 'An uploaded image can be re-interpreted as a script and executed on your domain.',
  },
  MISSING_REFERRER_POLICY: {
    meaning: 'Full URLs of your pages are sent to every third-party site your users click through to.',
    consequence: 'Password-reset and invite links leak to analytics and ad networks in the Referer header.',
  },
  DIRECTORY_LISTING: {
    meaning: 'A folder on your site lists its contents instead of serving a page.',
    consequence: 'Attackers browse your files like a shared drive and pick out the ones you forgot to protect.',
  },
}

const DEFAULT = {
  meaning: 'This issue weakens the security posture of your site.',
  consequence: 'Left unfixed it gives an attacker a foothold they should not have.',
}

export function interpret(type) {
  return CATALOG[type] || DEFAULT
}
