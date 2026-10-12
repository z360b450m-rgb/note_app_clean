<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { KnowledgeLibrary } from '@/composables/useKnowledgeLibraries'

const props = defineProps<{
  mode: 'insert' | 'manage'
  libraries: KnowledgeLibrary[]
  selected: string[]
  error: string
  importing: boolean
  importProgress: string
  importResults: { fileName: string; success: boolean; detail: string }[]
}>()
const emit = defineEmits<{
  close: []
  insert: [ids: string[]]
  save: [input: { id?: string; name: string; description: string; content: string }]
  archive: [id: string]
  import: [files: File[]]
}>()
const dialog = ref<HTMLDialogElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
function pickFiles(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) emit('import', Array.from(input.files))
  input.value = ''
}
const tab = ref(props.mode)
const query = ref('')
const chosen = ref([...props.selected])
const editing = ref(false)
const draft = ref({ id: undefined as string | undefined, name: '', description: '', content: '' })
const showArchived = ref(false)
const filtered = computed(() =>
  props.libraries.filter(
    (x) =>
      ((tab.value === 'manage' && showArchived.value) || !x.archived) &&
      `${x.name} ${x.description}`.toLowerCase().includes(query.value.toLowerCase()),
  ),
)
onMounted(() => dialog.value?.showModal())
watch(
  () => props.libraries,
  () => {
    if (!props.error) editing.value = false
  },
)
function toggle(id: string) {
  chosen.value = chosen.value.includes(id)
    ? chosen.value.filter((x) => x !== id)
    : [...chosen.value, id]
}
function edit(item?: KnowledgeLibrary) {
  draft.value = item
    ? { id: item.id, name: item.name, description: item.description, content: item.content }
    : { id: undefined, name: '', description: '', content: '' }
  editing.value = true
  nextTick(() => dialog.value?.querySelector<HTMLInputElement>('#knowledge-name')?.focus())
}
function insert() {
  emit(
    'insert',
    chosen.value.filter((id) => props.libraries.some((x) => x.id === id && !x.archived)),
  )
  emit('close')
}
function switchTab(mode: 'insert' | 'manage') {
  tab.value = mode
  editing.value = false
}
function createLibrary() {
  tab.value = 'manage'
  edit()
}
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="knowledge-heading"
    class="knowledge-dialog m-auto w-[min(760px,92vw)] max-h-[85vh] overflow-y-auto rounded-3xl border border-black/10 bg-[#eeece5] p-6 text-brand-dark shadow-xl dark:border-white/10 dark:bg-[#2d2b28] dark:text-brand-light"
    @cancel.prevent="emit('close')"
    @click="$event.target === dialog && emit('close')"
  >
    <header class="mb-5 flex items-start justify-between">
      <div>
        <h2 id="knowledge-heading" class="text-xl font-semibold">知识库</h2>
        <p class="mt-2 text-xs text-brand-mid">整理学习资料，为每次对话选择参考内容。</p>
      </div>
      <button
        type="button"
        aria-label="关闭知识库"
        class="rounded-lg px-3 py-1"
        @click="emit('close')"
      >
        ✕
      </button>
    </header>
    <div class="mb-5 flex gap-2">
      <button
        type="button"
        :aria-pressed="tab === 'insert'"
        class="rounded-xl px-4 py-2 text-sm"
        @click="switchTab('insert')"
      >
        插入知识库
      </button>
      <button
        type="button"
        :aria-pressed="tab === 'manage'"
        class="rounded-xl px-4 py-2 text-sm"
        @click="switchTab('manage')"
      >
        管理知识库
      </button>
    </div>
    <p v-if="error" role="alert" class="mb-4 text-sm text-red-500">{{ error }}</p>
    <input
      ref="fileInput"
      type="file"
      accept=".pdf,.md,application/pdf,text/markdown"
      multiple
      class="hidden"
      aria-label="导入 PDF 或 Markdown 文件"
      @change="pickFiles"
    />
    <div class="mb-5 rounded-xl border border-black/10 p-3 dark:border-white/10">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm">导入学习资料</p>
          <p class="mt-1 text-[11px] text-brand-mid">PDF / Markdown · 每个文件创建一个知识库</p>
        </div>
        <button
          type="button"
          :disabled="importing"
          class="rounded-xl px-4 py-2 text-sm"
          @click="fileInput?.click()"
        >
          {{ importing ? '导入中…' : '导入文件' }}
        </button>
      </div>
      <p v-if="importing" role="status" class="mt-3 text-xs text-accent">{{ importProgress }}</p>
      <ul v-if="importResults.length" aria-live="polite" class="mt-3 space-y-2">
        <li
          v-for="(result, index) in importResults"
          :key="index"
          class="break-words text-xs"
          :class="result.success ? 'text-brand-mid' : 'text-red-500'"
        >
          {{ result.success ? '✓' : '×' }} {{ result.fileName }} · {{ result.detail }}
        </li>
      </ul>
      <p class="mt-2 text-[11px] text-brand-mid">保存提取的文字；扫描版 PDF 暂不支持 OCR。</p>
    </div>
    <form v-if="editing" class="space-y-4" @submit.prevent="emit('save', draft)">
      <label class="block text-xs"
        >名称<input
          id="knowledge-name"
          v-model="draft.name"
          required
          maxlength="60"
          class="mt-2 block w-full px-3 py-2 text-sm"
          placeholder="例如：英语语法笔记"
      /></label>
      <label class="block text-xs"
        >简介<input
          v-model="draft.description"
          maxlength="200"
          class="mt-2 block w-full px-3 py-2 text-sm"
          placeholder="这个知识库包含什么？"
      /></label>
      <label class="block text-xs"
        >资料内容<textarea
          v-model="draft.content"
          rows="8"
          class="mt-2 block w-full resize-y px-3 py-3 text-sm leading-6"
          placeholder="粘贴笔记、知识点或复习材料……"
        />
      </label>
      <div class="flex justify-end gap-3">
        <button type="button" class="rounded-xl px-4 py-2 text-sm" @click="editing = false">
          取消</button
        ><button type="submit" class="rounded-xl bg-accent px-4 py-2 text-sm text-white">
          保存知识库
        </button>
      </div>
    </form>
    <template v-else>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <input
          v-model="query"
          aria-label="搜索知识库"
          placeholder="搜索知识库…"
          class="min-w-0 flex-1 px-3 py-2 text-sm"
        />
        <button type="button" class="rounded-xl px-4 py-2 text-sm" @click="createLibrary">
          ＋ 新建知识库
        </button>
      </div>
      <label v-if="tab === 'manage'" class="mb-4 flex items-center gap-2 text-xs text-brand-mid"
        ><input v-model="showArchived" type="checkbox" />显示已归档</label
      >
      <div
        v-if="!filtered.length"
        class="rounded-2xl border border-dashed border-black/10 px-5 py-10 text-center dark:border-white/10"
      >
        <p class="text-sm">{{ libraries.length ? '没有匹配的知识库' : '还没有知识库' }}</p>
        <p class="mt-2 text-xs text-brand-mid">新建一个知识库，放入你的笔记和复习资料。</p>
      </div>
      <div class="space-y-3">
        <div
          v-for="item in filtered"
          :key="item.id"
          class="flex items-start gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10"
        >
          <input
            v-if="tab === 'insert'"
            type="checkbox"
            :aria-label="`选择 ${item.name}`"
            :checked="chosen.includes(item.id)"
            class="mt-1"
            @change="toggle(item.id)"
          />
          <div class="min-w-0 flex-1">
            <h3 class="break-words text-sm font-medium">
              {{ item.name }}
              <span v-if="item.archived" class="text-xs text-brand-mid">已归档</span>
            </h3>
            <p class="mt-1 text-xs leading-6 text-brand-mid">
              {{ item.description || '暂无简介' }}
            </p>
            <p class="mt-2 text-[11px] text-brand-mid">
              {{ item.content.length.toLocaleString() }} 字 ·
              {{ item.source ? item.source.format.toUpperCase() : '本地资料'
              }}{{ item.source?.pageCount ? ` · ${item.source.pageCount} 页` : '' }}
            </p>
          </div>
          <div v-if="tab === 'manage'" class="flex flex-wrap gap-2">
            <button type="button" class="rounded-lg px-3 py-1.5 text-xs" @click="edit(item)">
              编辑</button
            ><button
              type="button"
              class="rounded-lg px-3 py-1.5 text-xs"
              @click="emit('archive', item.id)"
            >
              {{ item.archived ? '恢复' : '归档' }}
            </button>
          </div>
        </div>
      </div>
      <footer
        class="mt-6 flex items-center justify-between gap-3 border-t border-black/5 pt-4 dark:border-white/10"
      >
        <span class="text-[11px] text-brand-mid">保存在当前浏览器 · 尚未接入检索</span
        ><button
          v-if="tab === 'insert'"
          type="button"
          class="rounded-xl bg-accent px-4 py-2 text-sm text-white"
          @click="insert"
        >
          确认选择
          {{ chosen.filter((id) => libraries.some((x) => x.id === id && !x.archived)).length }} 个
        </button>
      </footer>
    </template>
  </dialog>
</template>

<style scoped>
.knowledge-dialog::backdrop {
  background: rgba(30, 27, 23, 0.3);
  backdrop-filter: blur(6px);
}
</style>
