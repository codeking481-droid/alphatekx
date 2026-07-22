import type { Plan, PlanModule } from './types'

const MODULE_LIBRARY: Record<string, PlanModule[]> = {
  'saas-landing': [
    { id: 'hero', name: 'Hero section', purpose: 'Grab attention with a value proposition and CTA.', files: ['src/sections/Hero.tsx'] },
    { id: 'features', name: 'Features', purpose: 'Explain the product capabilities.', files: ['src/sections/Features.tsx'] },
    { id: 'pricing', name: 'Pricing', purpose: 'Show pricing tiers and CTAs.', files: ['src/sections/Pricing.tsx'] },
    { id: 'testimonials', name: 'Testimonials', purpose: 'Social proof from customers.', files: ['src/sections/Testimonials.tsx'] },
    { id: 'faq', name: 'FAQ', purpose: 'Answer common questions.', files: ['src/sections/FAQ.tsx'] },
    { id: 'footer', name: 'Footer', purpose: 'Links and copyright.', files: ['src/sections/Footer.tsx'] },
  ],
  'task-dashboard': [
    { id: 'sidebar', name: 'Sidebar navigation', purpose: 'Switch between dashboard views.', files: ['src/components/Sidebar.tsx'] },
    { id: 'task-list', name: 'Task cards', purpose: 'Display and manage tasks.', files: ['src/components/TaskList.tsx', 'src/components/TaskCard.tsx'] },
    { id: 'filters', name: 'Filters', purpose: 'Filter tasks by status, priority, or assignee.', files: ['src/components/Filters.tsx'] },
    { id: 'analytics', name: 'Analytics', purpose: 'Show task completion charts.', files: ['src/components/Analytics.tsx'] },
    { id: 'settings', name: 'Settings', purpose: 'Dark mode and preferences.', files: ['src/components/Settings.tsx'] },
  ],
  'learning-platform': [
    { id: 'dashboard', name: 'Student dashboard', purpose: 'Overview of progress and upcoming lessons.', files: ['src/views/Dashboard.tsx'] },
    { id: 'courses', name: 'Course catalog', purpose: 'Browse and search courses.', files: ['src/views/Courses.tsx', 'src/components/CourseCard.tsx'] },
    { id: 'lesson', name: 'Lesson player', purpose: 'Read lessons and mark complete.', files: ['src/views/Lesson.tsx'] },
    { id: 'quiz', name: 'Quiz center', purpose: 'Multiple choice quizzes with scoring.', files: ['src/views/Quiz.tsx'] },
    { id: 'progress', name: 'Progress tracking', purpose: 'Visual progress and weekly goals.', files: ['src/views/Progress.tsx'] },
    { id: 'profile', name: 'Profile', purpose: 'Student profile and theme settings.', files: ['src/views/Profile.tsx'] },
  ],
  'ecommerce': [
    { id: 'hero', name: 'Hero section', purpose: 'Brand intro and featured products.', files: ['src/sections/Hero.tsx'] },
    { id: 'catalog', name: 'Product catalog', purpose: 'Filterable product grid.', files: ['src/sections/Catalog.tsx', 'src/components/ProductCard.tsx'] },
    { id: 'cart', name: 'Shopping cart', purpose: 'Add/remove items and quantities.', files: ['src/components/Cart.tsx'] },
    { id: 'checkout', name: 'Checkout', purpose: 'Shipping and payment form.', files: ['src/sections/Checkout.tsx'] },
    { id: 'footer', name: 'Footer', purpose: 'Links and newsletter.', files: ['src/sections/Footer.tsx'] },
  ],
  'generic': [
    { id: 'home', name: 'Home', purpose: 'Main landing view.', files: ['src/views/Home.tsx'] },
    { id: 'features', name: 'Features', purpose: 'Key capabilities.', files: ['src/views/Features.tsx'] },
    { id: 'about', name: 'About', purpose: 'About the project.', files: ['src/views/About.tsx'] },
    { id: 'contact', name: 'Contact', purpose: 'Contact form and details.', files: ['src/views/Contact.tsx'] },
    { id: 'footer', name: 'Footer', purpose: 'Footer links.', files: ['src/components/Footer.tsx'] },
  ],
}

const CATEGORY_PATTERNS: [RegExp, keyof typeof MODULE_LIBRARY][] = [
  [/\b(saas|landing|marketing|pricing|testimonials|faq)\b/i, 'saas-landing'],
  [/\b(task|kanban|dashboard|project management|todo|project manager)\b/i, 'task-dashboard'],
  [/\b(course|learn|student|lesson|quiz|education|school|university)\b/i, 'learning-platform'],
  [/\b(ecommerce|e-commerce|shop|store|cart|checkout|product catalog)\b/i, 'ecommerce'],
]

const FEATURE_PATTERNS: Record<string, RegExp> = {
  hero: /\bhero\b/i,
  pricing: /\bpricing\b/i,
  testimonials: /\btestimonials?\b/i,
  faq: /\bfaq\b/i,
  footer: /\bfooter\b/i,
  sidebar: /\bsidebar\b/i,
  'task-list': /\btask\s+(cards?|list|board)\b/i,
  filters: /\bfilters?\b/i,
  analytics: /\b(charts?|analytics|graphs?)\b/i,
  dashboard: /\bdashboard\b/i,
  courses: /\bcourses?\b/i,
  lesson: /\blesson|lessons\b/i,
  quiz: /\bquiz|quizzes\b/i,
  progress: /\bprogress\b/i,
  profile: /\bprofile\b/i,
  catalog: /\b(catalog|products?|product list)\b/i,
  cart: /\bcart|shopping\b/i,
  checkout: /\bcheckout\b/i,
  contact: /\bcontact\s+form\b/i,
  dark: /\bdark\s+(mode|theme)|theme\s+toggle\b/i,
  auth: /\b(auth|login|signin|sign\s+in|authentication)\b/i,
  database: /\b(supabase|database|db|postgres)\b/i,
  payment: /\b(stripe|payment|paystack|checkout)\b/i,
}

function detectCategory(prompt: string): keyof typeof MODULE_LIBRARY {
  for (const [pattern, key] of CATEGORY_PATTERNS) {
    if (pattern.test(prompt)) return key
  }
  return 'generic'
}

function titleFromPrompt(prompt: string): string {
  const m = prompt.match(/^\s*["']?Build\s+(?:a|an)?\s+(.+?)(?:\.|with|that|and|for)?(?:\s|$)/i)
  return m?.[1]?.replace(/\s+/g, ' ').trim() || 'Generated Application'
}

export function generatePlan(prompt: string): Plan {
  const category = detectCategory(prompt)
  const baseModules = MODULE_LIBRARY[category] || MODULE_LIBRARY.generic
  const detectedFeatures = new Set<string>()

  for (const [feature, pattern] of Object.entries(FEATURE_PATTERNS)) {
    if (pattern.test(prompt)) detectedFeatures.add(feature)
  }

  const modules = baseModules.filter((m) => {
    if (category !== 'generic') return true
    if (detectedFeatures.has(m.id)) return true
    return false
  })

  if (modules.length === 0) {
    modules.push(...baseModules.slice(0, 4))
  }

  if (detectedFeatures.has('dark') && !modules.find((m) => m.id === 'settings')) {
    modules.push({ id: 'settings', name: 'Settings / theme', purpose: 'Theme toggle and preferences.', files: ['src/components/Settings.tsx'] })
  }

  if (detectedFeatures.has('auth') && !modules.find((m) => m.id === 'auth')) {
    modules.push({ id: 'auth', name: 'Authentication', purpose: 'Login and signup flows.', files: ['src/components/Auth.tsx'] })
  }

  if (detectedFeatures.has('payment') && !modules.find((m) => m.id === 'payment')) {
    modules.push({ id: 'payment', name: 'Payment', purpose: 'Payment page and integration.', files: ['src/views/Payment.tsx'] })
  }

  const title = titleFromPrompt(prompt)
  return {
    title,
    description: `A ${category.replace(/-/g, ' ')} generated from: ${prompt.slice(0, 120)}...`,
    modules,
  }
}
