import type { NoteEntry, Notebook, ReviewLog } from '@/types'
import type {
  EntryRepository,
  NotebookRepository,
  ReviewLogRepository,
} from '@/services/repositories'
import { getAccessToken } from '@/services/auth'

const API_BASE = 'http://localhost:8000/api'
const HEALTH_URL = 'http://localhost:8000/health'
const PENDING_QUEUE_KEY = 'offline_pending_sync_queue_v1'
const REQUEST_TIMEOUT_MS = 5_000

interface SyncPayloadMap {
  put_notebook: Notebook
  delete_notebook: { notebookId: string }
  put_entry: { notebookId: string; entry: NoteEntry }
  delete_entry: { notebookId: string; entryId: string }
  add_review_log: { notebookId: string; log: ReviewLog }
}

type SyncAction = keyof SyncPayloadMap
type SyncItem = {
  [Action in SyncAction]: {
    id: string
    action: Action
    payload: SyncPayloadMap[Action]
    timestamp: number
  }
}[SyncAction]

interface ApiNotebook {
  id: string
  name: string
  description: string
  instructions: string
  sort_order?: number
  created_at: number
  updated_at: number
}

interface ApiEntry {
  id: string
  notebook_id: string
  title: string
  question: string
  wrong_answer: string
  correct_answer: string
  subject: string
  source: string
  tags?: string[]
  drawings?: Record<string, string>
  sort_order?: number
  created_at: number
  updated_at: number
  review_count?: number
  consecutive_passes?: number
  mastery_level?: number
  ease_factor?: number
  interval?: number
  last_review_date?: number
  next_review_date?: number
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

// ---------------------------------------------------------------------------
// 1. 本地待同步队列
// ---------------------------------------------------------------------------
function getPendingQueue(): SyncItem[] {
  if (typeof localStorage === 'undefined') return []

  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY)
    if (!raw) return []
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? (value as SyncItem[]) : []
  } catch {
    return []
  }
}

function savePendingQueue(queue: SyncItem[]): void {
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue))
  } catch (error) {
    console.error('保存离线同步队列失败', error)
  }
}

function syncItemId<Action extends SyncAction>(
  action: Action,
  payload: SyncPayloadMap[Action],
): string {
  if (action === 'put_notebook') return `notebook:${(payload as Notebook).id}`
  if (action === 'delete_notebook') {
    return `notebook:${(payload as SyncPayloadMap['delete_notebook']).notebookId}`
  }
  if (action === 'put_entry') {
    return `entry:${(payload as SyncPayloadMap['put_entry']).entry.id}`
  }
  if (action === 'delete_entry') {
    return `entry:${(payload as SyncPayloadMap['delete_entry']).entryId}`
  }
  return `review:${(payload as SyncPayloadMap['add_review_log']).log.id}`
}

function queuedNotebookId(item: SyncItem): string {
  return item.action === 'put_notebook' ? item.payload.id : item.payload.notebookId
}

function queuedEntryId(item: SyncItem): string | undefined {
  if (item.action === 'put_entry') return item.payload.entry.id
  if (item.action === 'delete_entry') return item.payload.entryId
  if (item.action === 'add_review_log') return item.payload.log.entryId
  return undefined
}

function enqueueSync<Action extends SyncAction>(
  action: Action,
  payload: SyncPayloadMap[Action],
): void {
  let queue = getPendingQueue()
  const id = syncItemId(action, payload)

  // 删除父级时，丢弃尚未发出的子级操作，避免重连后重新创建已删除的数据。
  if (action === 'delete_notebook') {
    queue = queue.filter(
      (item) =>
        item.id === id ||
        queuedNotebookId(item) !== (payload as SyncPayloadMap['delete_notebook']).notebookId,
    )
  } else if (action === 'delete_entry') {
    const entryId = (payload as SyncPayloadMap['delete_entry']).entryId
    queue = queue.filter((item) => item.id === id || queuedEntryId(item) !== entryId)
  }

  const newItem = {
    id,
    action,
    payload,
    timestamp: Date.now(),
  } as SyncItem
  const existingIndex = queue.findIndex((item) => item.id === id)

  if (existingIndex >= 0) queue[existingIndex] = newItem
  else queue.push(newItem)

  savePendingQueue(queue)
  console.warn(`[离线优先] 操作已进入同步队列（当前 ${queue.length} 条）:`, action)
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  acceptedStatuses: number[] = [],
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const token = getAccessToken()
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(url, { ...init, headers, signal: controller.signal })
    if (!response.ok && !acceptedStatuses.includes(response.status)) {
      throw new ApiError(`请求失败：HTTP ${response.status}`, response.status)
    }
    return response
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(error instanceof Error ? error.message : '网络请求失败')
  } finally {
    clearTimeout(timeoutId)
  }
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

// ---------------------------------------------------------------------------
// 2. 探针：检测 Python 后端与 MySQL 是否连通
// ---------------------------------------------------------------------------
export async function isServerOnline(): Promise<boolean> {
  try {
    await fetchWithTimeout(HEALTH_URL)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// 3. 基础远端操作
// ---------------------------------------------------------------------------
async function putNotebookRemote(notebook: Notebook): Promise<void> {
  const updateResponse = await fetchWithTimeout(
    `${API_BASE}/notebooks/${encodeURIComponent(notebook.id)}`,
    jsonRequest('PATCH', {
      name: notebook.name,
      description: notebook.description,
      instructions: notebook.instructions,
      sort_order: notebook.sortOrder,
    }),
    [404],
  )

  if (updateResponse.status === 404) {
    await fetchWithTimeout(
      `${API_BASE}/notebooks`,
      jsonRequest('POST', {
        id: notebook.id,
        name: notebook.name,
        description: notebook.description,
        instructions: notebook.instructions,
      }),
    )
  }
}

async function deleteNotebookRemote(notebookId: string): Promise<void> {
  await fetchWithTimeout(
    `${API_BASE}/notebooks/${encodeURIComponent(notebookId)}`,
    { method: 'DELETE' },
    [404],
  )
}

async function putEntryRemote(notebookId: string, entry: NoteEntry): Promise<void> {
  const updateResponse = await fetchWithTimeout(
    `${API_BASE}/entries/${encodeURIComponent(entry.id)}`,
    jsonRequest('PATCH', {
      title: entry.title,
      question: entry.question,
      wrong_answer: entry.wrongAnswer,
      correct_answer: entry.correctAnswer,
      subject: entry.subject,
      tags: entry.tags,
      mastery_level: entry.masteryLevel,
      next_review_date: entry.nextReviewDate,
    }),
    [404],
  )

  if (updateResponse.status === 404) {
    await fetchWithTimeout(
      `${API_BASE}/entries`,
      jsonRequest('POST', {
        id: entry.id,
        notebook_id: notebookId,
        title: entry.title,
        question: entry.question,
        correct_answer: entry.correctAnswer,
        wrong_answer: entry.wrongAnswer,
        subject: entry.subject,
        tags: entry.tags,
      }),
    )
  }
}

async function deleteEntryRemote(entryId: string): Promise<void> {
  await fetchWithTimeout(
    `${API_BASE}/entries/${encodeURIComponent(entryId)}`,
    { method: 'DELETE' },
    [404],
  )
}

async function addReviewLogRemote(log: ReviewLog): Promise<void> {
  await fetchWithTimeout(
    `${API_BASE}/entries/${encodeURIComponent(log.entryId)}/review`,
    jsonRequest('POST', {
      id: log.id,
      timestamp: log.timestamp,
      quality: log.quality,
      is_correct: log.isCorrect,
      elapsed_ms: log.elapsedMs,
    }),
  )
}

async function syncItem(item: SyncItem): Promise<void> {
  if (item.action === 'put_notebook') {
    await putNotebookRemote(item.payload)
  } else if (item.action === 'delete_notebook') {
    await deleteNotebookRemote(item.payload.notebookId)
  } else if (item.action === 'put_entry') {
    await putEntryRemote(item.payload.notebookId, item.payload.entry)
  } else if (item.action === 'delete_entry') {
    await deleteEntryRemote(item.payload.entryId)
  } else {
    await addReviewLogRemote(item.payload.log)
  }
}

// ---------------------------------------------------------------------------
// 4. 后台静默同步网络恢复队列
// ---------------------------------------------------------------------------
let isSyncing = false

export async function flushPendingQueue(): Promise<number> {
  if (isSyncing) return 0
  isSyncing = true

  try {
    if (!(await isServerOnline())) return 0

    const snapshot = getPendingQueue()
    if (snapshot.length === 0) return 0

    console.log(`[自动同步] 开始同步 ${snapshot.length} 条离线修改至 MySQL…`)
    const failed = new Set<string>()
    const processed = new Map(snapshot.map((item) => [item.id, item.timestamp]))
    let successCount = 0

    for (const item of snapshot) {
      try {
        await syncItem(item)
        successCount += 1
      } catch (error) {
        failed.add(item.id)
        console.error(`[自动同步] 补发操作 ${item.action} 失败:`, error)
      }
    }

    // 同步期间可能又有新操作入队。只移除时间戳仍与快照相同的成功项，
    // 避免最后一次 save 覆盖掉刚发生的用户修改。
    const latestQueue = getPendingQueue()
    const remainingQueue = latestQueue.filter((item) => {
      const processedTimestamp = processed.get(item.id)
      if (processedTimestamp === undefined) return true
      if (item.timestamp !== processedTimestamp) return true
      return failed.has(item.id)
    })
    savePendingQueue(remainingQueue)

    console.log(`[自动同步] 完成：成功 ${successCount} 条，待重试 ${remainingQueue.length} 条。`)
    return successCount
  } finally {
    isSyncing = false
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushPendingQueue())
  window.setInterval(() => void flushPendingQueue(), 10_000)
  void flushPendingQueue()
}

function mapNotebook(item: ApiNotebook): Notebook {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    instructions: item.instructions,
    sortOrder: item.sort_order,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }
}

function mapEntry(item: ApiEntry): NoteEntry {
  return {
    id: item.id,
    notebookId: item.notebook_id,
    title: item.title,
    question: item.question,
    wrongAnswer: item.wrong_answer,
    correctAnswer: item.correct_answer,
    subject: item.subject,
    source: item.source,
    tags: item.tags || [],
    drawings: item.drawings || {},
    sortOrder: item.sort_order,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    reviewCount: item.review_count,
    consecutivePasses: item.consecutive_passes,
    masteryLevel: item.mastery_level,
    easeFactor: item.ease_factor,
    interval: item.interval,
    lastReviewDate: item.last_review_date,
    nextReviewDate: item.next_review_date,
  }
}

// ---------------------------------------------------------------------------
// 5. 智能笔记本仓库适配器
// ---------------------------------------------------------------------------
export const smartNotebookRepository = (fallback: NotebookRepository): NotebookRepository => ({
  async getAll(): Promise<Notebook[]> {
    const localList = await fallback.getAll()

    try {
      await flushPendingQueue()
      if (getPendingQueue().length > 0) return fallback.getAll()

      const response = await fetchWithTimeout(`${API_BASE}/notebooks`)
      const data = (await response.json()) as { items?: ApiNotebook[] }
      const remoteList: Notebook[] = (data.items || []).map(mapNotebook)
      const remoteById = new Map(remoteList.map((notebook) => [notebook.id, notebook]))
      const mergedById = new Map(remoteById)

      for (const localNotebook of localList) {
        const remoteNotebook = remoteById.get(localNotebook.id)
        if (!remoteNotebook || localNotebook.updatedAt > remoteNotebook.updatedAt) {
          mergedById.set(localNotebook.id, localNotebook)
          enqueueSync('put_notebook', localNotebook)
        }
      }

      await Promise.all(
        remoteList
          .filter((remoteNotebook) => {
            const localNotebook = localList.find((candidate) => candidate.id === remoteNotebook.id)
            return !localNotebook || remoteNotebook.updatedAt > localNotebook.updatedAt
          })
          .map((notebook) => fallback.put(notebook)),
      )
      await flushPendingQueue()

      return [...mergedById.values()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    } catch {
      return localList
    }
  },

  async put(notebook: Notebook): Promise<void> {
    await fallback.put(notebook)
    enqueueSync('put_notebook', notebook)
    void flushPendingQueue()
  },

  async delete(notebookId: string): Promise<void> {
    await fallback.delete(notebookId)
    enqueueSync('delete_notebook', { notebookId })
    void flushPendingQueue()
  },
})

// ---------------------------------------------------------------------------
// 6. 智能错题条目仓库适配器
// ---------------------------------------------------------------------------
export const smartEntryRepository = (fallback: EntryRepository): EntryRepository => ({
  async getAll(notebookId: string): Promise<NoteEntry[]> {
    const localList = await fallback.getAll(notebookId)

    try {
      await flushPendingQueue()
      if (getPendingQueue().length > 0) return fallback.getAll(notebookId)

      const response = await fetchWithTimeout(
        `${API_BASE}/entries/search?notebook_id=${encodeURIComponent(notebookId)}`,
      )
      const data = (await response.json()) as { items?: ApiEntry[] }
      const remoteList: NoteEntry[] = (data.items || []).map(mapEntry)
      const remoteById = new Map(remoteList.map((entry) => [entry.id, entry]))
      const mergedById = new Map(remoteById)

      for (const localEntry of localList) {
        const remoteEntry = remoteById.get(localEntry.id)
        if (!remoteEntry || localEntry.updatedAt > remoteEntry.updatedAt) {
          mergedById.set(localEntry.id, localEntry)
          enqueueSync('put_entry', { notebookId, entry: localEntry })
        }
      }

      await Promise.all(
        remoteList
          .filter((remoteEntry) => {
            const localEntry = localList.find((candidate) => candidate.id === remoteEntry.id)
            return !localEntry || remoteEntry.updatedAt > localEntry.updatedAt
          })
          .map((entry) => fallback.put(notebookId, entry)),
      )
      await flushPendingQueue()

      return [...mergedById.values()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    } catch {
      return localList
    }
  },

  async get(notebookId: string, entryId: string): Promise<NoteEntry | undefined> {
    const list = await this.getAll(notebookId)
    return list.find((entry) => entry.id === entryId) ?? fallback.get(notebookId, entryId)
  },

  async put(notebookId: string, entry: NoteEntry): Promise<void> {
    await fallback.put(notebookId, entry)
    enqueueSync('put_entry', { notebookId, entry })
    void flushPendingQueue()
  },

  async delete(notebookId: string, entryId: string): Promise<void> {
    await fallback.delete(notebookId, entryId)
    enqueueSync('delete_entry', { notebookId, entryId })
    void flushPendingQueue()
  },

  putSnapshot: (notebookId, entryId, data) => fallback.putSnapshot(notebookId, entryId, data),
  getSnapshot: (notebookId, entryId) => fallback.getSnapshot(notebookId, entryId),
  getAllSnapshots: (notebookId) => fallback.getAllSnapshots(notebookId),
  deleteSnapshot: (notebookId, entryId) => fallback.deleteSnapshot(notebookId, entryId),
  deleteAllSnapshots: (notebookId) => fallback.deleteAllSnapshots(notebookId),
})

// ---------------------------------------------------------------------------
// 7. 智能复习日志仓库适配器
// ---------------------------------------------------------------------------
export const smartReviewLogRepository = (fallback: ReviewLogRepository): ReviewLogRepository => ({
  getAll: (notebookId) => fallback.getAll(notebookId),

  async add(notebookId: string, log: ReviewLog): Promise<void> {
    await fallback.add(notebookId, log)
    enqueueSync('add_review_log', { notebookId, log })
    void flushPendingQueue()
  },

  deleteByEntry: (notebookId, entryId) => fallback.deleteByEntry(notebookId, entryId),
})
