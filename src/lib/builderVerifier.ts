export type FeatureCheck = {
  id: string
  label: string
  markers: RegExp[]
}

const FEATURES: Record<string, FeatureCheck> = {
  hero: {
    id: 'hero',
    label: 'Hero section',
    markers: [
      /className=['"][^'"]*\bhero\b/i,
      /<(?:section|header|div)[^>]*className=['"][^'"]*hero/i,
      /<h1[^>]*>.*?(?:welcome|discover|shop|store|build|launch|meet|intro)/i,
    ],
  },
  navigation: {
    id: 'navigation',
    label: 'Navigation',
    markers: [
      /<nav\b/i,
      /className=['"][^'"]*navbar/i,
      /data-view=/i,
      /setView\(/i,
      /\btabs\b.*setTab/i,
      /<aside\b/i,
      /className=['"][^'"]*sidebar/i,
      /setSelected\(/i,
      /Workspace/i,
    ],
  },
  'product-catalog': {
    id: 'product-catalog',
    label: 'Product catalog',
    markers: [
      /\bproducts\b/i,
      /\bproduct\b/i,
      /\bprice\b/i,
      /\bcatalog\b/i,
      /add.*cart|buy.*now/i,
      /\bitems\.map\b|\bproducts\.map\b/i,
    ],
  },
  'shopping-cart': {
    id: 'shopping-cart',
    label: 'Shopping cart',
    markers: [
      /\bcart\b/i,
      /setCart\(/i,
      /addToCart/i,
      /cart\.length/i,
      /cartCount/i,
      /removeFromCart/i,
    ],
  },
  checkout: {
    id: 'checkout',
    label: 'Checkout',
    markers: [
      /checkout/i,
      /place.?order/i,
      /pay.?now/i,
      /complete.?purchase/i,
      /submit.*order/i,
      /order.*placed/i,
    ],
  },
  pricing: {
    id: 'pricing',
    label: 'Pricing section',
    markers: [
      /\bpricing\b/i,
      /className=['"][^'"]*pricing/i,
      /\$\d+/,
      /price/i,
    ],
  },
  testimonials: {
    id: 'testimonials',
    label: 'Testimonials section',
    markers: [
      /\btestimonials\b/i,
      /className=['"][^'"]*testimonials/i,
      /quote/i,
    ],
  },
  faq: {
    id: 'faq',
    label: 'FAQ section',
    markers: [
      /\bfaq\b/i,
      /frequently.?asked/i,
      /className=['"][^'"]*faq/i,
      /setOpenFaq|toggleFaq/i,
    ],
  },
  'dark-mode': {
    id: 'dark-mode',
    label: 'Dark mode toggle',
    markers: [
      /dark mode/i,
      /setDark\(/i,
      /dark.*mode/i,
    ],
  },
  'task-cards': {
    id: 'task-cards',
    label: 'Task cards',
    markers: [
      /task.*cards/i,
      /\btask-card/i,
      /className=['"][^'"]*task/i,
      /Kanban|kanban/i,
    ],
  },
  footer: {
    id: 'footer',
    label: 'Footer',
    markers: [
      /<footer\b/i,
      /className=['"][^'"]*footer/i,
      /&copy;|copyright/i,
    ],
  },
  responsive: {
    id: 'responsive',
    label: 'Responsive layout',
    markers: [
      /\bsm:/i,
      /\bmd:/i,
      /\blg:/i,
      /\bxl:/i,
      /max-w-7xl|max-w-6xl|max-w-5xl/i,
      /grid-cols-1/i,
    ],
  },
  courses: {
    id: 'courses',
    label: 'Course catalog',
    markers: [
      /\bcourses\b/i,
      /\blessons\b/i,
      /\bmodules\b/i,
      /\bsyllabus\b/i,
    ],
  },
  lessons: {
    id: 'lessons',
    label: 'Lesson player',
    markers: [
      /\blesson\b/i,
      /\bcompleteLesson/i,
      /mark.*complete/i,
      /currentLesson/i,
    ],
  },
  quiz: {
    id: 'quiz',
    label: 'Quiz / assessment',
    markers: [
      /\bquiz\b/i,
      /\bquestion\b/i,
      /\banswer\b/i,
      /\bscore\b/i,
      /multiple.?choice/i,
    ],
  },
  progress: {
    id: 'progress',
    label: 'Progress tracking',
    markers: [
      /\bprogress\b/i,
      /\bcompleted\b/i,
      /\bpercent/i,
      /style=\{\{[^}]*width/i,
    ],
  },
  projects: {
    id: 'projects',
    label: 'Projects / work samples',
    markers: [
      /\bprojects\b/i,
      /\bportfolio\b/i,
      /\bwork\b/i,
      /\bgallery\b/i,
    ],
  },
  contact: {
    id: 'contact',
    label: 'Contact form',
    markers: [
      /\bcontact\b/i,
      /type=['"]email['"]/i,
      /placeholder=['"][^'"]*email/i,
      /placeholder=['"][^'"]*message/i,
      /send.*message/i,
    ],
  },
  about: {
    id: 'about',
    label: 'About section',
    markers: [
      /\babout\b/i,
      /\bbio\b/i,
      /\bstory\b/i,
      /\bsummary\b/i,
    ],
  },
  posts: {
    id: 'posts',
    label: 'Blog post grid',
    markers: [
      /\bposts\b/i,
      /\barticles\b/i,
      /\bblog\b/i,
      /\bexcerpt\b/i,
    ],
  },
  article: {
    id: 'article',
    label: 'Article / post detail',
    markers: [
      /\barticle\b/i,
      /\bread.?more\b/i,
      /\bpost\.id/i,
      /\bselectedPost/i,
    ],
  },
  categories: {
    id: 'categories',
    label: 'Categories / filters',
    markers: [
      /\bcategories\b/i,
      /\bcategory\b/i,
      /\bfilter\b/i,
      /setFilter\(/i,
    ],
  },
  dashboard: {
    id: 'dashboard',
    label: 'Dashboard',
    markers: [
      /\bdashboard\b/i,
      /\bstats\b/i,
      /\bkpi\b/i,
      /\bmetrics\b/i,
    ],
  },
  charts: {
    id: 'charts',
    label: 'Charts / data visualisation',
    markers: [
      /\bchart\b/i,
      /\bgraph\b/i,
      /\brecharts\b/i,
      /AlphaUI\.Chart/i,
    ],
  },
  tables: {
    id: 'tables',
    label: 'Tables / data grids',
    markers: [
      /\btable\b/i,
      /AlphaUI\.Table/i,
      /<table\b/i,
    ],
  },
  menu: {
    id: 'menu',
    label: 'Menu / items',
    markers: [
      /\bmenu\b/i,
      /\bdish\b/i,
      /\bmeal\b/i,
      /\bfood\b/i,
    ],
  },
  reservation: {
    id: 'reservation',
    label: 'Reservation / booking',
    markers: [
      /\breservation\b/i,
      /\bbooking\b/i,
      /\breserve\b/i,
      /\bdate.*guests/i,
    ],
  },
  calculator: {
    id: 'calculator',
    label: 'Calculator UI',
    markers: [
      /\bcalculator\b/i,
      /\bcalc\b/i,
      /\bdisplay\b/i,
      /\bevaluate\b|=.*['"\d]/i,
    ],
  },
  content: {
    id: 'content',
    label: 'Content sections',
    markers: [
      /<h1\b/i,
      /<h2\b/i,
      /<p\b/i,
      /<section\b/i,
    ],
  },
  interactive: {
    id: 'interactive',
    label: 'Interactive elements',
    markers: [
      /onClick/i,
      /onSubmit/i,
      /onChange/i,
      /useState\(/i,
    ],
  },
}

const CATEGORIES: { pattern: RegExp; features: string[]; name: string }[] = [
  {
    name: 'e-commerce',
    pattern: /\b(e-?commerce|online\s+store|shop|store|marketplace|cart|checkout|buy|sell|products?)\b/i,
    features: ['hero', 'navigation', 'product-catalog', 'shopping-cart', 'checkout', 'footer', 'responsive'],
  },
  {
    name: 'portfolio',
    pattern: /\b(portfolio|cv|resume|showcase|personal\s+site|developer\s+site)\b/i,
    features: ['hero', 'navigation', 'about', 'projects', 'contact', 'footer', 'responsive'],
  },
  {
    name: 'blog',
    pattern: /\b(blog|news|articles?|magazine|content\s+site)\b/i,
    features: ['hero', 'navigation', 'posts', 'article', 'categories', 'footer', 'responsive'],
  },
  {
    name: 'learning',
    pattern: /\b(learn|course|lesson|quiz|school|academy|education|student|teach|study|curriculum)\b/i,
    features: ['navigation', 'courses', 'lessons', 'quiz', 'progress', 'footer', 'responsive'],
  },
  {
    name: 'saas-landing',
    pattern: /\b(saas\s+(landing|site|page|website)|landing\s+(page|site|website)|marketing\s+(site|page)|saas\b.*\b(landing|page|site))|\blanding\b.*\bpage\b/i,
    features: ['hero', 'navigation', 'pricing', 'testimonials', 'faq', 'footer', 'responsive'],
  },
  {
    name: 'task-dashboard',
    pattern: /\b(task\s+(management|dashboard|tracker|app)|dashboard.*task|task.*dashboard|kanban.*task)\b/i,
    features: ['navigation', 'dashboard', 'charts', 'tables', 'task-cards', 'dark-mode', 'responsive', 'footer'],
  },
  {
    name: 'dashboard / SaaS',
    pattern: /\b(dashboard|saas|admin|analytics|crm|erp|metrics|kpis|business\s+panel)\b/i,
    features: ['navigation', 'dashboard', 'charts', 'tables', 'responsive', 'footer'],
  },
  {
    name: 'restaurant',
    pattern: /\b(restaurant|menu|food|order|reservation|dining|cafe|kitchen)\b/i,
    features: ['hero', 'navigation', 'menu', 'shopping-cart', 'reservation', 'footer', 'responsive'],
  },
  {
    name: 'calculator',
    pattern: /\b(calculator|calculate|converter|compute|math)\b/i,
    features: ['calculator', 'interactive', 'responsive'],
  },
]

export function extractRequestedFeatures(prompt: string): string[] {
  const lower = String(prompt).toLowerCase()
  for (const category of CATEGORIES) {
    if (category.pattern.test(lower)) return category.features
  }
  return ['navigation', 'hero', 'content', 'footer', 'responsive']
}

export function detectFallbackTemplate(code: string): string | null {
  const match = code.match(/iframe[^>]+src=\{?['"`]?\/templates\/alpha-([a-z0-9-]+)\.html/)
  return match ? match[1] : null
}

export function validateGeneratedAppFeatures(code: string, prompt: string): { passed: string[]; missing: string[]; expected: string[] } {
  const expected = extractRequestedFeatures(prompt)
  const fallbackTemplate = detectFallbackTemplate(code)
  const passed: string[] = []
  const missing: string[] = []

  // Known fallback iframe templates (alpha-shop.html, alpha-learn.html, etc.) are
  // curated full experiences. The wrapper itself is tiny, so we trust the template.
  if (fallbackTemplate && /^(shop|learn|portfolio|platform)$/.test(fallbackTemplate)) {
    return { passed: expected.map((id) => FEATURES[id]?.label || id), missing: [], expected }
  }

  for (const featureId of expected) {
    const feature = FEATURES[featureId]
    if (!feature) {
      missing.push(featureId)
      continue
    }

    const found = feature.markers.some((marker) => marker.test(code))
    if (found) {
      passed.push(feature.label)
    } else {
      missing.push(feature.label)
    }
  }

  return { passed, missing, expected }
}

export const verifyFeatures = validateGeneratedAppFeatures

export function featureSummary(result: ReturnType<typeof validateGeneratedAppFeatures>): string {
  if (result.missing.length === 0) return `All requested features present (${result.passed.join(', ')})`
  return `missing requested features: ${result.missing.join(', ')}`
}
