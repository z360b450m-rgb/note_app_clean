import { computed, ref } from 'vue'
import { getStoredUser } from '@/services/auth'

export interface KnowledgeLibrary {
  id: string
  name: string
  description: string
  content: string
  updatedAt: number
  archived?: boolean
  source?: { fileName: string; format: 'pdf' | 'md'; size: number; pageCount?: number }
}
export function useKnowledgeLibraries() {
  const key = `review-knowledge-libraries-v1:${getStoredUser()?.id ?? 'local'}`
  const libraries = ref<KnowledgeLibrary[]>([])
  const error = ref('')
  const importing = ref(false)
  const importProgress = ref('')
  const importResults = ref<{ fileName: string; success: boolean; detail: string }[]>([])
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const saved = JSON.parse(raw)
      if (
        !Array.isArray(saved) ||
        !saved.every(
          (x: KnowledgeLibrary) =>
            typeof x.id === 'string' &&
            typeof x.name === 'string' &&
            typeof x.description === 'string' &&
            typeof x.content === 'string',
        )
      )
        throw new Error('Invalid library')
      libraries.value = saved
    }
  } catch {
    error.value = '本地知识库无法读取。'
  }
  function save(input: {
    id?: string
    name: string
    description: string
    content: string
    source?: KnowledgeLibrary['source']
  }) {
    if (!input.name.trim()) {
      error.value = '请输入知识库名称'
      return false
    }
    const item: KnowledgeLibrary = {
      id: input.id ?? crypto.randomUUID(),
      name: input.name.trim(),
      description: input.description.trim(),
      content: input.content,
      updatedAt: Date.now(),
      archived: libraries.value.find((x) => x.id === input.id)?.archived ?? false,
      source: input.source ?? libraries.value.find((x) => x.id === input.id)?.source,
    }
    const next = [...libraries.value.filter((x) => x.id !== item.id), item]
    return commit(next)
  }
  function commit(next: KnowledgeLibrary[]) {
    try {
      localStorage.setItem(key, JSON.stringify(next))
      libraries.value = next
      error.value = ''
      return true
    } catch {
      error.value = '保存失败，浏览器存储空间可能不足。'
      return false
    }
  }
  function archive(id: string) {
    return commit(libraries.value.map((x) => (x.id === id ? { ...x, archived: !x.archived } : x)))
  }
  const available = computed(() => libraries.value.filter((x) => !x.archived))
  async function importFiles(files: File[]) {
    if (importing.value) return
    importing.value = true
    importResults.value = []
    try {
      for (const file of files) {
        try {
          const extension = file.name.split('.').at(-1)?.toLowerCase()
          if (extension !== 'pdf' && extension !== 'md') throw new Error('仅支持 .pdf 和 .md 文件')
          if (file.size > (extension === 'pdf' ? 30 : 5) * 1024 * 1024)
            throw new Error(extension === 'pdf' ? 'PDF 请小于 30 MB' : 'Markdown 请小于 5 MB')
          importProgress.value = `正在读取 ${file.name}`
          let content = ''
          let pageCount: number | undefined
          if (extension === 'md') {
            const bytes = new Uint8Array(await file.arrayBuffer())
            try {
              content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
            } catch {
              throw new Error('Markdown 请使用 UTF-8 编码')
            }
            if (!content.trim()) throw new Error('文件内容为空')
          } else {
            const { extractKnowledgePdf } = await import('@/utils/parsePdf')
            const result = await extractKnowledgePdf(file, (page, total) => {
              importProgress.value = `${file.name} · 第 ${page} / ${total} 页`
            })
            content = result.content
            pageCount = result.pageCount
          }
          if (
            !save({
              name: file.name.replace(/\.(pdf|md)$/i, ''),
              description: `导入自 ${file.name}`,
              content,
              source: { fileName: file.name, format: extension, size: file.size, pageCount },
            })
          )
            throw new Error(error.value)
          importResults.value.push({
            fileName: file.name,
            success: true,
            detail: `${content.length.toLocaleString()} 字${pageCount ? ` · ${pageCount} 页` : ''}`,
          })
        } catch (cause) {
          importResults.value.push({
            fileName: file.name,
            success: false,
            detail: cause instanceof Error ? cause.message : '读取失败，请检查文件是否损坏',
          })
        }
      }
    } finally {
      importing.value = false
      importProgress.value = ''
    }
  }
  return {
    libraries,
    available,
    error,
    save,
    archive,
    importing,
    importProgress,
    importResults,
    importFiles,
  }
}
