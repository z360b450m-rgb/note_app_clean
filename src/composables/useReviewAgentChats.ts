import { computed, ref, watch } from 'vue'
import { getStoredUser } from '@/services/auth'

interface Message {
  role: 'user' | 'assistant'
  text: string
  knowledgeBases?: { id: string; name: string }[]
}
interface Chat {
  id: string
  title: string
  updatedAt: number
  messages: Message[]
}

export function useReviewAgentChats() {
  const key = `review-agent-chats-v1:${getStoredUser()?.id ?? 'local'}`
  const chats = ref<Chat[]>([])
  const activeId = ref<string | null>(null)
  const storageError = ref('')
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const saved = JSON.parse(raw)
      if (
        !Array.isArray(saved.chats) ||
        !saved.chats.every(
          (chat: Chat) =>
            typeof chat.id === 'string' &&
            typeof chat.title === 'string' &&
            Number.isFinite(chat.updatedAt) &&
            Array.isArray(chat.messages) &&
            chat.messages.every(
              (m) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string',
            ),
        )
      )
        throw new Error('Invalid history')
      chats.value = saved.chats
      activeId.value = chats.value.some((c) => c.id === saved.activeId) ? saved.activeId : null
    }
  } catch {
    storageError.value = '聊天记录暂时无法读取，新对话仍可使用。'
  }
  const active = computed(() => chats.value.find((c) => c.id === activeId.value))
  const messages = computed(() => active.value?.messages ?? [])
  const history = computed(() => [...chats.value].sort((a, b) => b.updatedAt - a.updatedAt))
  watch(
    [chats, activeId],
    () => {
      try {
        localStorage.setItem(key, JSON.stringify({ chats: chats.value, activeId: activeId.value }))
        storageError.value = ''
      } catch {
        storageError.value = '聊天记录未能保存到此浏览器，请勿关闭页面。'
      }
    },
    { deep: true, flush: 'sync' },
  )
  function append(text: string, knowledgeBases: { id: string; name: string }[] = []) {
    let chat = active.value
    if (!chat) {
      const id = crypto.randomUUID()
      chats.value.push({ id, title: text.slice(0, 32), updatedAt: Date.now(), messages: [] })
      activeId.value = id
      chat = active.value!
    }
    chat.messages.push(
      { role: 'user', text, knowledgeBases },
      {
        role: 'assistant',
        text: '已收到你的复习目标。这里是对话预览，暂未连接 AI 或学习数据。你可以继续补充时间、科目和练习方式。',
      },
    )
    chat.updatedAt = Date.now()
  }
  return { messages, history, activeId, storageError, append }
}
