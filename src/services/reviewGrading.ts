import { getAccessToken } from './auth'

export interface ReviewAttempt {
  attempt_id: string
  entry_id: string
  revision: number
  status: 'ready' | 'grading' | 'retryable' | 'awaiting_explanation' | 'needs_review' | 'final'
  is_correct: boolean | null
  answer_verdict: 'correct' | 'incorrect' | 'uncertain'
  explanation_verdict: 'missing' | 'valid' | 'invalid' | 'uncertain'
  answer_text: string
  explanation_text: string
  comment: string
  followup_question: string
  grading_version: string
  review_log: null | {
    id: string
    entry_id: string
    timestamp: number
    quality: string
    is_correct: boolean
    elapsed_ms: number
    answer_text: string
    review_note: string
  }
  entry_review: null | {
    review_count: number
    wrong_count: number
    last_review_date: number
    updated_at: number
  }
}

const API_BASE = 'http://localhost:8000/api/entries'

export class ReviewGradingError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

async function request(entryId: string, suffix: string, body: unknown, signal: AbortSignal): Promise<ReviewAttempt> {
  const token = getAccessToken()
  if (!token) throw new Error('请登录后使用智能判卷')
  const response = await fetch(`${API_BASE}/${encodeURIComponent(entryId)}/${suffix}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ReviewGradingError(typeof data?.detail === 'string' ? data.detail : '判卷失败，作答已保留，请重试', response.status)
  if (!data || data.entry_id !== entryId || typeof data.attempt_id !== 'string' ||
      !['ready', 'grading', 'retryable', 'awaiting_explanation', 'needs_review', 'final'].includes(data.status) ||
      (data.status === 'final' && (typeof data.is_correct !== 'boolean' || !data.review_log || !data.entry_review)))
    throw new Error('判卷结果格式无效，请重试')
  return data as ReviewAttempt
}

export function submitReviewAnswer(entryId: string, attemptId: string, answerText: string,
                                   elapsedMs: number, signal: AbortSignal) {
  return request(entryId, 'review-attempts', { attempt_id: attemptId, answer_text: answerText,
                                            elapsed_ms: elapsedMs }, signal)
}

export function submitReviewExplanation(entryId: string, attempt: ReviewAttempt, explanationText: string,
                                        signal: AbortSignal) {
  return request(entryId, `review-attempts/${encodeURIComponent(attempt.attempt_id)}/explanation`,
                 { explanation_text: explanationText, expected_revision: attempt.revision }, signal)
}

export async function readReviewAttempt(entryId: string, attemptId: string, signal: AbortSignal): Promise<ReviewAttempt> {
  const token = getAccessToken()
  if (!token) throw new Error('请登录后查看判卷状态')
  const response = await fetch(`${API_BASE}/${encodeURIComponent(entryId)}/review-attempts/${encodeURIComponent(attemptId)}`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.entry_id !== entryId || data?.attempt_id !== attemptId)
    throw new Error('暂时无法读取判卷状态，请重试')
  return data as ReviewAttempt
}
