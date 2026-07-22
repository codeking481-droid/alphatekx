import type { Activity, Creation, CreationFile, MarketplaceItem, Mission, MissionMessage, TeamRole } from './types'
import { supabase } from './supabase'

const MISSIONS_KEY = 'alphatekx_missions'
const CREATIONS_KEY = 'alphatekx_creations'
const MARKETPLACE_KEY = 'alphatekx_marketplace'
const CHANGE_EVENT = 'alphatekx:store-change'

let missionMemory: Mission[] = []
let creationMemory: Creation[] = []
let marketplaceMemory: MarketplaceItem[] = []

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const value = window.localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T) {
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(key, JSON.stringify(value)) } catch {}
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key } }))
  }
}

const normalizeMission = (mission: Mission): Mission => ({ ...mission, messages: mission.messages ?? [] })

export function subscribeStore(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined
  const handler = () => listener()
  window.addEventListener(CHANGE_EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

export function getMissions(): Mission[] {
  const saved = read<Mission[]>(MISSIONS_KEY, missionMemory).map(normalizeMission)
  missionMemory = saved
  return [...saved].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function createMission(goal: string, title = goal.slice(0, 52)): Mission {
  if (!goal.trim()) throw new Error('Mission goal is required')
  const mission: Mission = {
    id: crypto.randomUUID(),
    title: title.trim() || 'Untitled mission',
    goal: goal.trim(),
    status: 'active',
    progress: 0,
    createdAt: new Date().toISOString(),
    messages: [],
  }
  missionMemory = [mission, ...getMissions()]
  write(MISSIONS_KEY, missionMemory)
  void cloudUpsertMission(mission)
  addActivity(mission.id, 'Mission created')
  return getMissionById(mission.id) ?? mission
}

export function getMissionById(id: string): Mission | null {
  return getMissions().find((mission) => mission.id === id) ?? null
}

export function updateMission(id: string, patch: Partial<Omit<Mission, 'id' | 'createdAt'>>) {
  missionMemory = getMissions().map((mission) => mission.id === id ? { ...mission, ...patch } : mission)
  write(MISSIONS_KEY, missionMemory)
  const updated = missionMemory.find((mission) => mission.id === id)
  if (updated) void cloudUpsertMission(updated)
  return updated ?? null
}

export function updateMissionProgress(id: string, progress: number) {
  return updateMission(id, { progress: Math.max(0, Math.min(100, progress)) })
}

export function updateMissionStatus(id: string, status: Mission['status'], progress?: number) {
  return updateMission(id, { status, ...(typeof progress === 'number' ? { progress: Math.max(0, Math.min(100, progress)) } : {}) })
}

export function completeMission(id: string) {
  return updateMission(id, { progress: 100, status: 'completed' })
}

export function addMessage(missionId: string, message: Omit<MissionMessage, 'id' | 'createdAt'>): MissionMessage {
  const next: MissionMessage = { ...message, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
  const mission = getMissionById(missionId)
  if (!mission) return next
  updateMission(missionId, { messages: [...mission.messages, next] })
  void cloudInsertMessage(missionId, next)
  return next
}

export function addActivity(missionId: string, text: string): Activity {
  const message = addMessage(missionId, { role: 'system', content: text, type: 'activity' })
  return { id: message.id, missionId, text, timestamp: message.createdAt }
}

export function getActivities(missionId: string): Activity[] {
  const mission = getMissionById(missionId)
  return (mission?.messages ?? []).filter((message) => message.type === 'activity').map((message) => ({
    id: message.id,
    missionId,
    text: message.content,
    timestamp: message.createdAt,
    role: (message.content.match(/^\[([^\]]+)\]/)?.[1] as TeamRole|undefined) ?? 'Alpha',
  }))
}

export function buildMemoryContext(currentMissionId?:string){
  const past=getMissions().filter(item=>item.id!==currentMissionId).slice(0,8)
  const goals=past.slice(0,3).map(item=>item.goal)
  const joined=past.map(item=>`${item.goal} ${item.messages.map(message=>message.content).join(' ')}`).join(' ').toLowerCase()
  const stacks=['React','Next.js','Vite','Supabase','Node.js','TypeScript','Tailwind','Python'].filter(stack=>joined.includes(stack.toLowerCase()))
  const decisions=past.flatMap(item=>item.messages.filter(message=>message.role==='user').map(message=>message.content)).filter(text=>/prefer|use |without|must|should/i.test(text)).slice(-3)
  return `Top goals: ${goals.join(' | ')||'No prior goals'}. Preferred stack: ${stacks.join(', ')||'Not detected'}. Past decisions: ${decisions.join(' | ')||'None recorded'}.`
}

export function getCreations(): Creation[] {
  creationMemory = read<Creation[]>(CREATIONS_KEY, creationMemory)
  return [...creationMemory].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getCreationById(id: string) {
  return getCreations().find((creation) => creation.id === id) ?? null
}

export function getCreationForMission(missionId: string) {
  return getCreations().find((creation) => creation.missionId === missionId) ?? null
}

export function saveCreation(input: { missionId: string; title: string; code: string; type?: string; files?: CreationFile[]; description?: string; dependencies?: string[]; previewUrl?: string; previewLogs?: string }): Creation {
  const current = getCreationForMission(input.missionId)
  const creation: Creation = {
    id: current?.id ?? crypto.randomUUID(),
    missionId: input.missionId,
    title: input.title,
    description: input.description ?? current?.description,
    code: input.code,
    type: input.type ?? 'web-app',
    status: 'ready',
    files: input.files ?? [{ path: 'src/App.tsx', code: input.code }],
    dependencies: input.dependencies ?? current?.dependencies,
    createdAt: current?.createdAt ?? new Date().toISOString(),
    published: current?.published ?? false,
    deploymentUrl: current?.deploymentUrl,
    slug: current?.slug,
    customDomain: current?.customDomain,
    previewUrl: input.previewUrl ?? current?.previewUrl,
    previewLogs: input.previewLogs ?? current?.previewLogs,
    versions: [...(current?.versions??[]),{id:crypto.randomUUID(),label:`Version ${(current?.versions?.length??0)+1}.0`,code:input.code,files:input.files??[{path:'src/App.tsx',code:input.code}],createdAt:new Date().toISOString(),status:'ready'}],
    versionIndex: (current?.versions?.length ?? 0),
  }
  creationMemory = [creation, ...getCreations().filter((item) => item.id !== creation.id)]
  write(CREATIONS_KEY, creationMemory)
  void cloudUpsertCreation(creation)
  return creation
}

function applyVersionIndex(creation: Creation | null): Creation | null {
  if (!creation || !creation.versions) return creation
  const idx = Math.max(0, Math.min(creation.versionIndex ?? creation.versions.length - 1, creation.versions.length - 1))
  const version = creation.versions[idx]
  if (!version) return creation
  return { ...creation, code: version.code, files: version.files, versionIndex: idx }
}

export function undoCreation(id: string): Creation | null {
  const creation = getCreationById(id)
  if (!creation?.versions?.length) return null
  const idx = Math.max(0, (creation.versionIndex ?? creation.versions.length - 1) - 1)
  if (idx === (creation.versionIndex ?? creation.versions.length - 1)) return null
  const version = creation.versions[idx]
  return updateCreation(id, { code: version.code, files: version.files, versionIndex: idx })
}

export function redoCreation(id: string): Creation | null {
  const creation = getCreationById(id)
  if (!creation?.versions?.length) return null
  const idx = Math.min(creation.versions.length - 1, (creation.versionIndex ?? creation.versions.length - 1) + 1)
  if (idx === (creation.versionIndex ?? creation.versions.length - 1)) return null
  const version = creation.versions[idx]
  return updateCreation(id, { code: version.code, files: version.files, versionIndex: idx })
}

export function revertCreation(id: string, versionId: string): Creation | null {
  const creation = getCreationById(id)
  if (!creation?.versions?.length) return null
  const idx = creation.versions.findIndex(v => v.id === versionId)
  if (idx === -1) return null
  const version = creation.versions[idx]
  const nextVersions = [...creation.versions, { ...version, id: crypto.randomUUID(), label: `Rollback to ${version.label}`, createdAt: new Date().toISOString() }]
  return updateCreation(id, { code: version.code, files: version.files, versionIndex: nextVersions.length - 1, versions: nextVersions })
}

export function updateCreation(id: string, patch: Partial<Creation>) {
  creationMemory = getCreations().map((creation) => creation.id === id ? { ...creation, ...patch } : creation)
  write(CREATIONS_KEY, creationMemory)
  const updated = creationMemory.find((creation) => creation.id === id)
  if (updated) void cloudUpsertCreation(updated)
  return updated ?? null
}

export function rollbackCreation(id:string,versionId:string){const creation=getCreationById(id);const version=creation?.versions?.find(item=>item.id===versionId);if(!creation||!version)return null;return updateCreation(id,{code:version.code,files:version.files,status:'ready',versions:[...(creation.versions??[]),{...version,id:crypto.randomUUID(),label:`Rollback ${(creation.versions?.length??0)+1}.0`,createdAt:new Date().toISOString()}]})}

export function getMarketplaceItems(): MarketplaceItem[] {
  marketplaceMemory = read<MarketplaceItem[]>(MARKETPLACE_KEY, marketplaceMemory)
  return [...marketplaceMemory].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function publishCreation(creationId: string, details: Pick<MarketplaceItem, 'title' | 'description' | 'category' | 'priceType' | 'price'>, creator='AlphaTekX Creator') {
  const creation = getCreationById(creationId)
  if (!creation) throw new Error('Creation not found')
  const existing = getMarketplaceItems().find((item) => item.creationId === creationId)
  const item: MarketplaceItem = {
    id: existing?.id ?? crypto.randomUUID(),
    creationId,
    ...details,
    creator,
    rating: existing?.rating ?? 5,
    downloads: existing?.downloads ?? 0,
    code: creation.code,
    files: creation.files,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  }
  marketplaceMemory = [item, ...getMarketplaceItems().filter((entry) => entry.id !== item.id)]
  write(MARKETPLACE_KEY, marketplaceMemory)
  void cloudUpsertMarketplace(item)
  updateCreation(creationId, { published: true })
  return item
}

export function cloneMarketplaceItem(itemId: string) {
  const item = getMarketplaceItems().find((entry) => entry.id === itemId)
  if (!item) return null
  marketplaceMemory = getMarketplaceItems().map((entry) => entry.id === itemId ? { ...entry, downloads: entry.downloads + 1 } : entry)
  write(MARKETPLACE_KEY, marketplaceMemory)
  const mission = createMission(`Remix ${item.title} from Alpha Marketplace`, `${item.title} Remix`)
  completeMission(mission.id)
  return saveCreation({ missionId: mission.id, title: item.title, code: item.code, type: item.category, files: item.files })
}

async function currentUserId() {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

async function cloudUpsertMission(mission: Mission) {
  const userId = await currentUserId()
  if (!supabase || !userId) return
  await supabase.from('missions').upsert({ id: mission.id, user_id: userId, title: mission.title, goal: mission.goal, status: mission.status, progress: mission.progress, created_at: mission.createdAt })
}

async function cloudInsertMessage(missionId: string, message: MissionMessage) {
  const userId = await currentUserId()
  if (!supabase || !userId) return
  const mission = getMissionById(missionId)
  if (mission) await cloudUpsertMission(mission)
  await supabase.from('messages').upsert({ id: message.id, mission_id: missionId, user_id: userId, role: message.role, content: message.content, type: message.type, worker_id: message.workerId ?? null, created_at: message.createdAt })
  if (message.type === 'activity') await supabase.from('activities').upsert({ id: message.id, mission_id: missionId, user_id: userId, text: message.content, created_at: message.createdAt })
}

async function cloudUpsertCreation(creation: Creation) {
  const userId = await currentUserId()
  if (!supabase || !userId) return
  await supabase.from('creations').upsert({ id: creation.id, mission_id: creation.missionId, user_id: userId, title: creation.title, code: creation.code, type: creation.type, status: creation.status, files: creation.files, versions:creation.versions??[], version_index: creation.versionIndex ?? (creation.versions ? creation.versions.length - 1 : 0), custom_domain:creation.customDomain??null, published: creation.published, deployment_url: creation.deploymentUrl ?? null, created_at: creation.createdAt })
}

async function cloudUpsertMarketplace(item: MarketplaceItem) {
  const userId = await currentUserId()
  if (!supabase || !userId) return
  await supabase.from('marketplace_items').upsert({ id: item.id, creation_id: item.creationId, owner_id: userId, creator_id:userId, title: item.title, description: item.description, creator: item.creator, category: item.category, price_type: item.priceType, price: item.price, rating: item.rating, downloads: item.downloads, code: item.code, files: item.files, created_at: item.createdAt })
}

export async function hydrateMissionStore() {
  const userId = await currentUserId()
  if (!supabase || !userId) return
  const [{ data: missions }, { data: messages }, { data: creations }] = await Promise.all([
    supabase.from('missions').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('messages').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('creations').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
  ])
  if (missions) {
    missionMemory = missions.map((row) => ({ id: row.id, title: row.title, goal: row.goal, status: row.status, progress: row.progress, createdAt: row.created_at, messages: (messages ?? []).filter((message) => message.mission_id === row.id).map((message) => ({ id: message.id, role: message.role, content: message.content, type: message.type, workerId: message.worker_id ?? undefined, createdAt: message.created_at })) })) as Mission[]
    write(MISSIONS_KEY, missionMemory)
  }
  if (creations) {
    creationMemory = creations.map((row) => ({ id: row.id, missionId: row.mission_id, title: row.title, code: row.code, type: row.type, status: row.status, files: row.files, versions:row.versions??[], versionIndex: row.version_index ?? (row.versions ? row.versions.length - 1 : 0), customDomain:row.custom_domain??undefined, createdAt: row.created_at, published: row.published, deploymentUrl: row.deployment_url ?? undefined, slug: row.slug ?? undefined })) as Creation[]
    write(CREATIONS_KEY, creationMemory)
  }
}

export async function hydrateMarketplaceStore() {
  if (!supabase) return
  const { data } = await supabase.from('marketplace_items').select('*').order('created_at', { ascending: false })
  if (!data) return
  marketplaceMemory = data.map((row) => ({ id: row.id, creationId: row.creation_id, title: row.title, description: row.description, creator: row.creator, category: row.category, priceType: row.price_type, price: Number(row.price), rating: Number(row.rating), downloads: row.downloads, code: row.code, files: row.files, createdAt: row.created_at, ownerId: row.owner_id })) as MarketplaceItem[]
  write(MARKETPLACE_KEY, marketplaceMemory)
}

export async function clearAllHistory() {
  missionMemory = []
  creationMemory = []
  marketplaceMemory = []
  if (typeof window !== 'undefined') {
    try { window.localStorage.removeItem(MISSIONS_KEY) } catch {}
    try { window.localStorage.removeItem(CREATIONS_KEY) } catch {}
    try { window.localStorage.removeItem(MARKETPLACE_KEY) } catch {}
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key: 'all' } }))
  }
  const userId = await currentUserId()
  if (supabase && userId) {
    await supabase.from('messages').delete().eq('user_id', userId)
    await supabase.from('activities').delete().eq('user_id', userId)
    await supabase.from('missions').delete().eq('user_id', userId)
    await supabase.from('creations').delete().eq('user_id', userId)
  }
}
