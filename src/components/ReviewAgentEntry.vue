<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useReviewAgentChats } from '@/composables/useReviewAgentChats'
import { useKnowledgeLibraries } from '@/composables/useKnowledgeLibraries'
import KnowledgeLibraryDialog from './KnowledgeLibraryDialog.vue'

const {
  libraries,
  available,
  error: libraryError,
  save: saveLibrary,
  archive: archiveLibrary,
  importing,
  importProgress,
  importResults,
  importFiles,
} = useKnowledgeLibraries()
const libraryMode = ref<'insert' | 'manage' | null>(null)
const selectedLibraries = ref<string[]>([])
const attachedLibraries = computed(() =>
  available.value.filter((x) => selectedLibraries.value.includes(x.id)),
)

// Interface prototype: chat history is local and never accesses study data.
const prompt = ref('')
const { messages, history, activeId, storageError, append } = useReviewAgentChats()
selectedLibraries.value =
  messages.value
    .filter((m) => m.role === 'user')
    .at(-1)
    ?.knowledgeBases?.map((x) => x.id) ?? []
function selectChat(id: string | null) {
  activeId.value = id
  prompt.value = ''
  selectedLibraries.value =
    messages.value
      .filter((m) => m.role === 'user')
      .at(-1)
      ?.knowledgeBases?.map((x) => x.id) ?? []
  nextTick(() => conversation.value?.scrollTo({ top: conversation.value.scrollHeight }))
}
function chatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Shanghai',
  }).format(timestamp)
}
const conversation = ref<HTMLElement | null>(null)
const lightAngle = ref(0)
let glowAnimation: Animation | undefined
let edgeAnimation: Animation | undefined

function animateComposer(event: MouseEvent) {
  const composer = event.currentTarget as HTMLElement
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  lightAngle.value += 90
  glowAnimation?.cancel()
  edgeAnimation?.cancel()
  glowAnimation = composer.animate(
    [
      { boxShadow: '0 0 10px rgba(217,119,87,0.025), 0 0 6px rgba(177,145,207,0.015)' },
      {
        boxShadow: '0 0 30px rgba(217,119,87,0.12), 0 -4px 22px rgba(177,145,207,0.075)',
        offset: 0.35,
      },
      {
        boxShadow: '0 0 20px rgba(217,119,87,0.065), 0 -2px 14px rgba(177,145,207,0.035)',
        offset: 0.7,
      },
      { boxShadow: '0 0 16px rgba(217,119,87,0.045), 0 -2px 10px rgba(177,145,207,0.025)' },
    ],
    { duration: 1500, easing: 'ease-in-out' },
  )
  edgeAnimation = composer.animate(
    [
      { opacity: 0.14 },
      { opacity: 0.46, offset: 0.35 },
      { opacity: 0.3, offset: 0.7 },
      { opacity: 0.24 },
    ],
    { duration: 1500, easing: 'ease-in-out', pseudoElement: '::before' },
  )
}
const suggestions = [
  { label: '安排今天的复习', prompt: '帮我安排今天的复习，我有 20 分钟。' },
  { label: '攻克薄弱知识点', prompt: '我想集中练习薄弱知识点，一步一步带我复习。' },
  { label: '考前快速回顾', prompt: '帮我做一次考前快速回顾，先梳理重点。' },
]

async function send() {
  const text = prompt.value.trim()
  if (!text) return
  append(
    text,
    attachedLibraries.value.map((x) => ({ id: x.id, name: x.name })),
  )
  prompt.value = ''
  await nextTick()
  conversation.value?.scrollTo({ top: conversation.value.scrollHeight, behavior: 'smooth' })
}

function choose(text: string) {
  prompt.value = text
}
</script>

<template>
  <section
    aria-label="复习 Agent"
    class="review-agent mx-auto grid min-h-[calc(100vh-180px)] w-full max-w-5xl gap-8 pb-10 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-12"
  >
    <aside
      aria-label="聊天记录"
      class="pt-5 lg:border-r lg:border-black/5 lg:pr-5 dark:lg:border-white/10"
    >
      <button
        type="button"
        class="agent-history-button mb-6 flex w-full items-center gap-2 rounded-xl px-3 py-3 text-sm text-accent"
        @click="selectChat(null)"
      >
        <span aria-hidden="true">＋</span> 新对话
      </button>
      <div class="mb-3 px-3 text-xs text-brand-mid">聊天记录</div>
      <p v-if="!history.length" class="px-3 text-xs leading-6 text-brand-mid">
        发送第一条消息后，对话会保存在这里。
      </p>
      <div class="flex max-h-36 gap-2 overflow-auto lg:max-h-[60vh] lg:flex-col">
        <button
          v-for="chat in history"
          :key="chat.id"
          type="button"
          :aria-current="activeId === chat.id ? 'true' : undefined"
          class="agent-history-button min-w-[150px] rounded-xl px-3 py-3 text-left lg:min-w-0"
          @click="selectChat(chat.id)"
        >
          <span class="block truncate text-sm">{{ chat.title }}</span>
          <span class="mt-1 block text-[11px] text-brand-mid"
            >{{ chatDate(chat.updatedAt) }} ·
            {{ chat.messages.filter((m) => m.role === 'user').length }} 条消息</span
          >
        </button>
      </div>
      <p class="mt-5 px-3 text-[11px] text-brand-mid">记录保存在当前浏览器</p>
      <button
        type="button"
        class="agent-history-button mt-6 w-full rounded-xl px-3 py-3 text-left text-sm"
        @click="libraryMode = 'manage'"
      >
        知识库管理 <span class="text-xs text-brand-mid">{{ available.length }}</span>
      </button>
    </aside>
    <div class="flex min-w-0 flex-col justify-center py-6 lg:py-12">
      <p v-if="storageError" role="alert" class="mb-4 text-xs text-red-500">{{ storageError }}</p>
      <div v-if="!messages.length" class="mb-8 text-center sm:mb-10">
        <h2
          class="text-[28px] font-medium tracking-tight text-brand-dark dark:text-brand-light sm:text-[36px]"
        >
          今天，从哪里开始？
        </h2>
        <p class="mt-3 text-sm text-brand-mid">一起理清思路，把不会的变成会的。</p>
      </div>

      <div
        v-if="messages.length"
        ref="conversation"
        role="log"
        aria-label="复习目标对话"
        aria-live="polite"
        class="mb-8 max-h-[50vh] space-y-6 overflow-y-auto pr-2"
      >
        <div
          v-for="(message, index) in messages"
          :key="index"
          class="flex"
          :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-[90%] whitespace-pre-wrap break-words text-sm leading-7 text-brand-dark dark:text-brand-light-gray"
            :class="message.role === 'user' ? 'rounded-2xl bg-accent/10 px-5 py-3' : 'px-1 py-2'"
          >
            <span
              v-if="message.role === 'assistant'"
              class="mb-2 block text-xs font-medium text-accent"
              >复习助手</span
            >
            {{ message.text }}
            <div v-if="message.knowledgeBases?.length" class="mt-2 flex flex-wrap gap-2">
              <span
                v-for="library in message.knowledgeBases"
                :key="library.id"
                class="rounded-lg border border-accent/20 px-2 py-1 text-[11px] text-accent"
                >▤ {{ library.name }}</span
              >
            </div>
          </div>
        </div>
      </div>

      <form
        class="agent-composer rounded-[22px] border border-black/10 bg-[#faf9f5] p-4 shadow-sm transition-colors focus-within:border-accent/40 dark:border-white/10 dark:bg-[#252320] sm:p-5"
        :style="{ '--agent-angle': `${lightAngle}deg` }"
        @click="animateComposer"
        @submit.prevent="send"
      >
        <label for="review-agent-prompt" class="sr-only">你的复习目标</label>
        <textarea
          id="review-agent-prompt"
          v-model="prompt"
          rows="2"
          maxlength="2000"
          placeholder="告诉我你想复习什么……"
          class="w-full resize-none bg-transparent text-[15px] leading-7 text-brand-dark outline-none placeholder:text-brand-mid dark:text-brand-light-gray"
          @keydown.enter.exact.prevent="!$event.isComposing && send()"
        />
        <div class="mt-3 flex items-center justify-between">
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="agent-suggestion flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs"
              @click.stop="libraryMode = 'insert'"
            >
              ▤ 插入知识库
            </button>
            <span class="text-xs text-brand-mid"
              >复习助手 <span class="mx-1 opacity-40">/</span>
              <span class="opacity-70">预览</span></span
            >
          </div>
          <button
            type="submit"
            :disabled="!prompt.trim()"
            aria-label="发送复习目标"
            class="agent-send flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-30 hover:enabled:opacity-80"
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 19V5m-6 6 6-6 6 6" />
            </svg>
          </button>
        </div>
        <div v-if="attachedLibraries.length" class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="library in attachedLibraries"
            :key="library.id"
            type="button"
            :aria-label="`移除知识库 ${library.name}`"
            class="agent-history-button rounded-lg border border-accent/20 px-2 py-1 text-xs"
            @click.stop="selectedLibraries = selectedLibraries.filter((id) => id !== library.id)"
          >
            ▤ {{ library.name }} <span aria-hidden="true">×</span>
          </button>
        </div>
      </form>

      <div v-if="!messages.length" class="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-3">
        <button
          v-for="suggestion in suggestions"
          :key="suggestion.label"
          type="button"
          class="agent-suggestion flex items-center gap-1.5 px-2 py-2 text-sm text-brand-mid transition-colors hover:text-accent"
          @click="choose(suggestion.prompt)"
        >
          <span class="text-accent/70" aria-hidden="true">↗</span>{{ suggestion.label }}
        </button>
      </div>
    </div>
    <KnowledgeLibraryDialog
      v-if="libraryMode"
      :mode="libraryMode"
      :libraries="libraries"
      :selected="attachedLibraries.map((x) => x.id)"
      :error="libraryError"
      :importing="importing"
      :import-progress="importProgress"
      :import-results="importResults"
      @close="libraryMode = null"
      @insert="selectedLibraries = $event"
      @save="saveLibrary"
      @archive="archiveLibrary"
      @import="importFiles"
    />
  </section>
</template>

<style scoped>
.review-agent .agent-history-button {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  color: var(--neo-ink) !important;
}
.review-agent .agent-history-button::after {
  content: none !important;
}
.review-agent .agent-history-button:hover,
.review-agent .agent-history-button[aria-current='true'] {
  background: var(--neo-selected) !important;
  color: var(--neo-accent) !important;
}
@property --agent-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: true;
}
.agent-composer {
  position: relative;
  isolation: isolate;
  transition:
    box-shadow 450ms ease,
    border-color 450ms ease;
}
.agent-composer::before {
  content: '';
  position: absolute;
  inset: -2px;
  padding: 2px;
  border-radius: 24px;
  background: conic-gradient(
    from var(--agent-angle),
    transparent 0%,
    rgba(217, 119, 87, 0.12) 15%,
    #eda17d 25%,
    #d97757 32%,
    transparent 43%,
    transparent 55%,
    #cab0dc 68%,
    #edc6a2 77%,
    transparent 90%
  );
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
  opacity: 0.14;
  transition:
    --agent-angle 1500ms cubic-bezier(0.16, 0.65, 0.2, 1),
    opacity 400ms ease;
}
.agent-composer:focus-within::before {
  opacity: 0.24;
}
.agent-composer:focus-within {
  border-color: transparent;
  box-shadow:
    0 0 16px rgba(217, 119, 87, 0.045),
    0 -2px 10px rgba(177, 145, 207, 0.025);
}
@media (prefers-reduced-motion: reduce) {
  .agent-composer::before,
  .review-agent .agent-send:not(:disabled) {
    animation: none;
  }
}
/* Reuse the search field's inset surface and animated focus gradient.
   Keep the text away from its inset edges, and keep suggestions flat. */
.review-agent textarea {
  padding: 12px 14px;
  line-height: 1.9 !important;
  color: var(--neo-ink) !important;
  animation: none !important;
  border: 1px solid rgba(129, 112, 87, 0.23) !important;
  border-radius: 12px !important;
  background-color: rgba(211, 206, 195, 0.2) !important;
  box-shadow:
    inset 2px 3px 7px rgba(114, 101, 79, 0.14),
    inset -2px -2px 5px rgba(255, 253, 248, 0.8) !important;
}
.review-agent textarea:focus {
  border-color: transparent !important;
  background-color: var(--neo-surface) !important;
  outline: 1px solid rgba(255, 253, 248, 0.85);
  outline-offset: 2px;
  animation: agent-field-flow 1500ms ease-out forwards !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 253, 248, 0.8),
    var(--neo-inset),
    0 0 0 3px rgba(217, 119, 87, 0.06) !important;
}
:global(.dark) .review-agent textarea {
  border-color: rgba(180, 172, 158, 0.28) !important;
  background-color: rgba(0, 0, 0, 0.14) !important;
  box-shadow:
    inset 2px 3px 7px rgba(0, 0, 0, 0.3),
    inset -1px -1px 3px rgba(255, 255, 255, 0.045) !important;
}
:global(.dark) .review-agent textarea:focus {
  border-color: transparent !important;
  background-color: var(--neo-surface) !important;
  outline: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 235, 211, 0.14),
    var(--neo-inset) !important;
}
@keyframes agent-field-flow {
  from {
    background-position: 0% 50%;
  }
  to {
    background-position: 25% 50%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .review-agent textarea:focus {
    animation: none !important;
  }
}
.review-agent textarea::placeholder {
  color: var(--neo-muted) !important;
  opacity: 1;
}
.review-agent .agent-suggestion {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  color: var(--neo-muted) !important;
  line-height: 1.75;
  filter: none !important;
}
.review-agent .agent-suggestion:hover {
  color: var(--neo-accent) !important;
}
.review-agent .agent-suggestion::after {
  content: none !important;
}
</style>
