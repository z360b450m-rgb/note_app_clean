const API_BASE = 'http://localhost:8000/api'
const TOKEN_KEY = 'notes_app_access_token'
const USER_KEY = 'notes_app_current_user'

export interface AuthUser {
  id: string
  email: string
  full_name: string | null
  is_active: boolean
  created_at: number
}

type TokenResponse = { access_token: string; token_type: string }

function readError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}

export function getAccessToken(): string | null { return localStorage.getItem(TOKEN_KEY) }

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch { return null }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

function saveSession(token: string, user: AuthUser): AuthUser {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  return user
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const body = new URLSearchParams({ username: email.trim(), password })
  const response = await fetch(`${API_BASE}/login/access-token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  const payload = (await response.json()) as TokenResponse | { detail?: string }
  if (!response.ok || !('access_token' in payload)) throw new Error(readError(payload, '登录失败，请稍后重试'))
  const user = await fetchCurrentUser(payload.access_token)
  return saveSession(payload.access_token, user)
}

export async function signup(email: string, password: string, fullName: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/users/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password, full_name: fullName.trim() || null }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(readError(payload, '注册失败，请稍后重试'))
  return login(email, password)
}

export async function fetchCurrentUser(token = getAccessToken()): Promise<AuthUser> {
  if (!token) throw new Error('尚未登录')
  const response = await fetch(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${token}` } })
  const payload = await response.json()
  if (!response.ok) throw new Error(readError(payload, '登录状态已过期'))
  return payload as AuthUser
}
