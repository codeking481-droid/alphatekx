import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const jobsFile = path.resolve(root, '..', '..', 'data', 'alpha-jobs.json')

function readJsonFile(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJsonFile(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
  } catch {
    // ignore write failures; job persistence is best-effort
  }
}

export function readAlphaJobs() {
  return readJsonFile(jobsFile, [])
}

export function saveAlphaJob(job) {
  const jobs = readAlphaJobs()
  const index = jobs.findIndex(item => String(item.jobId || item.id) === String(job.jobId || job.id))
  if (index >= 0) jobs[index] = { ...jobs[index], ...job }
  else jobs.unshift({ ...job })
  writeJsonFile(jobsFile, jobs.slice(0, 500))
  return job
}

export function getAlphaJob(jobId) {
  return readAlphaJobs().find(item => String(item.jobId || item.id) === String(jobId)) || null
}

export function getAlphaJobForConversation(conversationId) {
  return readAlphaJobs().find(item => item.conversationId === conversationId) || null
}

export function listAlphaJobsForUser(userId) {
  return readAlphaJobs()
    .filter(item => item.userId === userId)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
}
