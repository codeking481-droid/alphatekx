import { Queue, Worker, QueueScheduler } from 'bullmq'
import { randomUUID } from 'node:crypto'
import { saveAlphaJob, getAlphaJob, listAlphaJobsForUser } from './alphaJobStorage.mjs'
import { getConversationEngine } from './alphaEngineSingleton.mjs'

const QUEUE_NAME = 'alpha-jobs'
let queue = null
let scheduler = null
let worker = null
let fallbackQueue = []
let fallbackProcessing = false
let useFallback = false
let processJobFn = null

function getRedisConnection() {
  const redisUrl = String(process.env.REDIS_URL || process.env.REDIS_URI || process.env.BULLMQ_REDIS_URL || '')
  return redisUrl ? { connection: redisUrl } : { connection: { host: '127.0.0.1', port: 6379 } }
}

function startFallbackProcessing() {
  if (fallbackProcessing || !processJobFn) return
  fallbackProcessing = true
  ;(async () => {
    while (fallbackQueue.length > 0) {
      const job = fallbackQueue.shift()
      if (!job) continue
      const payload = job.data
      const jobRecord = getAlphaJob(job.id)
      try {
        saveAlphaJob({ ...jobRecord, status: 'running', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        const result = await processJobFn(payload)
        const completed = {
          ...jobRecord,
          status: 'completed',
          result,
          conversationId: result?.conversation?.id || jobRecord?.conversationId,
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        }
        saveAlphaJob(completed)
      } catch (error) {
        const failed = {
          ...jobRecord,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          updatedAt: new Date().toISOString(),
          failedAt: new Date().toISOString(),
        }
        saveAlphaJob(failed)
      }
    }
    fallbackProcessing = false
  })()
}

function ensureQueue(processJob) {
  processJobFn = processJob
  if (queue && worker && scheduler) return
  const connection = getRedisConnection()
  try {
    queue = new Queue(QUEUE_NAME, connection)
    scheduler = new QueueScheduler(QUEUE_NAME, connection)
    worker = new Worker(QUEUE_NAME, async (job) => {
      const payload = job.data
      const jobRecord = getAlphaJob(job.id)
      try {
        saveAlphaJob({ ...jobRecord, status: 'running', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        const engine = getConversationEngine()
        const user = { id: payload.userId, email: payload.userEmail }
        let result
        try {
          if (payload.action === 'continue') {
            if (!payload.conversationId) throw new Error('Conversation id is required for continue jobs')
            const conversation = await engine.continue(payload.conversationId, user, String(payload.message || ''))
            result = { conversation, agent: conversation.automationDraft }
          } else {
            const conversation = await engine.start(user, String(payload.prompt || ''))
            result = { conversation, agent: conversation.automationDraft }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          const failed = {
            ...jobRecord,
            status: 'failed',
            error: errorMessage,
            updatedAt: new Date().toISOString(),
            failedAt: new Date().toISOString(),
          }
          saveAlphaJob(failed)
          throw error
        }
        const completed = {
          ...jobRecord,
          status: 'completed',
          result,
          conversationId: result?.conversation?.id || jobRecord?.conversationId,
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        }
        saveAlphaJob(completed)
        return result
      } catch (error) {
        if (jobRecord?.status !== 'failed') {
          const failed = {
            ...jobRecord,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            updatedAt: new Date().toISOString(),
            failedAt: new Date().toISOString(),
          }
          saveAlphaJob(failed)
        }
        throw error
      }
    }, { connection, concurrency: 1 })
    worker.on('error', err => console.error('[alphaJobQueue] worker error:', err instanceof Error ? err.message : err))
  } catch (error) {
    console.error('[alphaJobQueue] could not initialize BullMQ, falling back to in-process queue:', error instanceof Error ? error.message : error)
    useFallback = true
  }
}

export function createAlphaJobQueue({ processJob }) {
  ensureQueue(processJob)
  return { queue, worker, scheduler }
}

export async function enqueueAlphaJob(payload) {
  ensureQueue(() => {})
  const jobId = String(payload.jobId || randomUUID())
  const record = {
    ...payload,
    jobId,
    status: 'queued',
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: payload.updatedAt || new Date().toISOString(),
    attempts: 0,
    result: null,
    error: null,
  }
  saveAlphaJob(record)
  if (useFallback || !queue) {
    const job = { id: jobId, data: payload }
    fallbackQueue.push(job)
    startFallbackProcessing()
  } else {
    await queue.add('alpha-job', payload, { jobId, removeOnComplete: true, removeOnFail: false })
  }
  return record
}

export { getAlphaJob, listAlphaJobsForUser }
