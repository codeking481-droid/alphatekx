export type ProjectMemory = {
  id: string
  title: string
  goal: string
  category: string
  systems: string[]
  installedLibraries?: string[]
  previousPrompts?: string[]
  previousFixes?: string[]
  goals?: string[]
  createdAt: string
}

export type BrandMemory = {
  primary: string
  accent: string
  surface: string
  text: string
}

export type CompanyMemory = {
  projects: ProjectMemory[]
  architecture: string[]
  brand: BrandMemory
  lastUpdated: string
}

const MEMORY_KEY = 'alphatekx:company-memory'

const defaultBrand: BrandMemory = {
  primary: '#0a0a0a',
  accent: '#E56B2D',
  surface: 'rgba(255,255,255,0.07)',
  text: '#ffffff',
}

export function readMemory(): CompanyMemory {
  try {
    const raw = localStorage.getItem(MEMORY_KEY)
    if (raw) return { ...JSON.parse(raw), brand: defaultBrand }
  } catch {}
  return { projects: [], architecture: [], brand: defaultBrand, lastUpdated: new Date().toISOString() }
}

export function writeMemory(memory: CompanyMemory) {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify({ ...memory, lastUpdated: new Date().toISOString() }))
  } catch {}
}

export function addProjectMemory(project: ProjectMemory) {
  const memory = readMemory()
  const existing = memory.projects.find(p => p.id === project.id)
  if (existing) {
    existing.title = project.title || existing.title
    existing.goal = project.goal || existing.goal
    existing.category = project.category || existing.category
    existing.systems = [...new Set([...(existing.systems || []), ...(project.systems || [])])].slice(0, 20)
    existing.installedLibraries = [...new Set([...(existing.installedLibraries || []), ...(project.installedLibraries || [])])].slice(0, 30)
    existing.previousPrompts = [project.goal, ...(existing.previousPrompts || [])].slice(0, 30)
    existing.previousFixes = [...(existing.previousFixes || []), ...(project.previousFixes || [])].slice(0, 30)
    existing.goals = [project.goal, ...(existing.goals || [])].slice(0, 30)
  } else {
    memory.projects = [project, ...memory.projects].slice(0, 50)
  }
  writeMemory(memory)
}

export function addArchitectureMemory(items: string[]) {
  const memory = readMemory()
  const next = [...new Set([...memory.architecture, ...items])].slice(0, 30)
  memory.architecture = next
  writeMemory(memory)
}

export function updateBrandMemory(patch: Partial<BrandMemory>) {
  const memory = readMemory()
  memory.brand = { ...memory.brand, ...patch }
  writeMemory(memory)
}

export function subscribeMemory(listener: () => void) {
  const handler = () => listener()
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}
