// Reusable hook patterns, not fixed claims. Alpha adapts them to verified user
// context and never invents results, revenue, customers, or timelines.
const PATTERNS = {
  mistake: [
    'Most {niche} businesses lose attention because they overlook one simple detail.',
    'The biggest {niche} mistake is not what most people think.',
    'If your {niche} content feels invisible, check this before posting again.',
    'Three avoidable mistakes quietly weaken otherwise strong {niche} work.',
  ],
  secret: [
    'What experienced {niche} operators notice before everyone else.',
    'The overlooked {niche} principle that makes the rest easier.',
    'Nobody explains this part of {niche} clearly enough.',
    'A behind-the-scenes look at how thoughtful {niche} work gets done.',
  ],
  question: [
    'What would change if your {niche} process took half the effort?',
    'Are you solving the visible {niche} problem or the real one underneath it?',
    'Which part of {niche} takes more time than it should?',
    'What is one {niche} lesson you learned later than you wanted?',
  ],
  contrast: [
    'Busy {niche} work creates activity. Intentional {niche} work creates progress.',
    'More {niche} content is not always better. More useful content is.',
    'The old {niche} approach starts with output. The stronger approach starts with outcome.',
    'Good {niche} advice sounds impressive. Useful advice changes the next action.',
  ],
  story: [
    'Every strong {niche} system begins with one frustrating manual task.',
    'The most useful {niche} lesson often arrives after something fails.',
    'A simple {niche} decision can change the entire customer experience.',
    'Behind every consistent {niche} result is a process nobody sees.',
  ],
}

function cleanNiche(value) {
  return String(value || 'business').replace(/\s+/g, ' ').trim().slice(0, 80) || 'business'
}

function seedFor(value) {
  let seed = 0
  for (const character of String(value)) seed = ((seed * 31) + character.charCodeAt(0)) >>> 0
  return seed
}

export function selectHookExamples(objective, count = 3) {
  const niche = cleanNiche(objective)
  const entries = Object.entries(PATTERNS).flatMap(([type, patterns]) => patterns.map(pattern => ({ type, pattern })))
  const seed = seedFor(niche)
  return Array.from({ length: Math.min(Math.max(1, count), entries.length) }, (_, index) => {
    const entry = entries[(seed + index * 7) % entries.length]
    return { type: entry.type, text: entry.pattern.replaceAll('{niche}', niche) }
  })
}

export function hookPatternCount() {
  return Object.values(PATTERNS).reduce((total, patterns) => total + patterns.length, 0)
}
