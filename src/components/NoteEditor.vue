<script setup lang="ts">
// @AI-NOTE: 编辑器组件 —— 数据读写通过 useEntries/useDrawing Hook。
// 禁止直接操作数据库、实现 SRS 算法、管理条目生命周期。
import { ref, computed, watch, onUnmounted, nextTick, inject, type Ref } from 'vue'
import type { NoteEntry, QuestionGroup } from '@/types'
import { useReviewLogs } from '@/composables/useReviewLogs'
import CameraCapture from './CameraCapture.vue'
import ScreenshotPicker from './ScreenshotPicker.vue'
import ImageCropper from './ImageCropper.vue'
import ImageFilterModal from './ImageFilterModal.vue'
import AnswerPanel from './AnswerPanel.vue'
import TagMultiSelect from './TagMultiSelect.vue'
import RichTextSizeControls from './RichTextSizeControls.vue'
import QuestionGroupConfirmModal from './QuestionGroupConfirmModal.vue'
import QuestionLinkModal from './QuestionLinkModal.vue'
import { saveImage, toDisplayHtml, toStorageHtml } from '@/services/imageStorage'
import { useRichTextSizing } from '@/composables/useRichTextSizing'
import { usePanelFontSize } from '@/composables/usePanelFontSize'
import { pastePlainText } from '@/utils/plainTextPaste'
import { decorateInternalLinks } from '@/utils/internalLinks'
// import { useKnowledgeBases } from '@/composables/useKnowledgeBases'
// const { kbs, refresh: refreshKbs } = useKnowledgeBases()
// refreshKbs()

const props = defineProps<{
  entry: NoteEntry
  group?: QuestionGroup | null
  groupEntries?: NoteEntry[]
  entries: NoteEntry[]
  answersHidden: boolean
  allSubjects?: string[]
  allTags?: string[]
  allSources?: string[]
}>()

const emit = defineEmits<{
  update: []
  reveal: []
  'blur-save': []
  'mount-canvas': [el: HTMLElement, entryId: string, field: string]
  'add-tag': [name: string]
  'enable-question-group': []
  'add-sub-question': []
  'select-sub-question': [id: string]
  'open-entry': [id: string]
}>()

function onBlur() {
  emit('blur-save')
}

const showQuestionGroupConfirm = ref(false)
const wrongAnswerHidden = ref(false)
const showQuestionLinkModal = ref(false)
const linkEditor = ref<'question' | 'material'>('question')
const linkedTargetId = ref<string | null>(null)

function openQuestionLinkModal(editor: 'question' | 'material', targetId: string | null = null) {
  linkEditor.value = editor
  linkedTargetId.value = targetId
  showQuestionLinkModal.value = true
}

function requestQuestionGroupConversion() {
  showQuestionGroupConfirm.value = true
}

function confirmQuestionGroupConversion() {
  showQuestionGroupConfirm.value = false
  emit('enable-question-group')
}

// Template refs
const questionBody = ref<HTMLDivElement | null>(null)
const questionContentRef = ref<HTMLDivElement | null>(null)
const materialBody = ref<HTMLDivElement | null>(null)
const materialContentRef = ref<HTMLDivElement | null>(null)
const materialFileInput = ref<HTMLInputElement | null>(null)
const editorLayoutEl = ref<HTMLDivElement | null>(null)

let suppressInput = false

const {
  fontSize: questionFontSize,
  fontSizeStyle: questionFontSizeStyle,
  setFontSize: setQuestionFontSize,
} = usePanelFontSize('question')
const {
  fontSize: materialFontSize,
  fontSizeStyle: materialFontSizeStyle,
  setFontSize: setMaterialFontSize,
} = usePanelFontSize('material')

const {
  hasSelectedImage: questionImageSelected,
  imageWidth: questionImageWidth,
  hasTextSelection: questionTextSelected,
  isBold: questionIsBold,
  captureSelection: captureQuestionSelection,
  handleEditorClick: handleQuestionEditorClick,
  applyFontSize: applyQuestionFontSize,
  toggleBold: toggleQuestionBold,
  applyHighlight: applyQuestionHighlight,
  applyImageWidth: applyQuestionImageWidth,
  serializeHtml: serializeQuestionHtml,
  resetSizingState: resetQuestionSizing,
  insertInternalLink: insertQuestionLink,
  removeInternalLink: unlinkQuestion,
} = useRichTextSizing(
  () => questionBody.value,
  onQuestionInput,
  setQuestionFontSize,
  (targetId) => openQuestionLinkModal('question', targetId),
)

const {
  hasSelectedImage: materialImageSelected,
  imageWidth: materialImageWidth,
  hasTextSelection: materialTextSelected,
  isBold: materialIsBold,
  captureSelection: captureMaterialSelection,
  handleEditorClick: handleMaterialEditorClick,
  applyFontSize: applyMaterialFontSize,
  toggleBold: toggleMaterialBold,
  applyHighlight: applyMaterialHighlight,
  applyImageWidth: applyMaterialImageWidth,
  serializeHtml: serializeMaterialHtml,
  resetSizingState: resetMaterialSizing,
  insertInternalLink: insertMaterialLink,
  removeInternalLink: removeMaterialLink,
} = useRichTextSizing(
  () => materialBody.value,
  onMaterialInput,
  setMaterialFontSize,
  (targetId) => openQuestionLinkModal('material', targetId),
)

function chooseQuestionLink(target: NoteEntry) {
  if (target.id === props.entry.id) return
  const insert = linkEditor.value === 'material' ? insertMaterialLink : insertQuestionLink
  if (insert(target.id, target.title || '关联题目')) showQuestionLinkModal.value = false
}

function removeActiveQuestionLink() {
  const remove = linkEditor.value === 'material' ? removeMaterialLink : unlinkQuestion
  if (remove()) showQuestionLinkModal.value = false
}

function openLinkedEntry(id: string) {
  if (!props.entries.some((entry) => entry.id === id)) return
  showQuestionLinkModal.value = false
  emit('open-entry', id)
}

// Helpers so template @event handlers stay single-statement (Vue compiler no ASI)
function onSubjectChange(e: Event) {
  props.entry.subject = (e.target as HTMLSelectElement).value
  emit('update')
}
function onSourceChange(e: Event) {
  props.entry.source = (e.target as HTMLSelectElement).value
  emit('update')
}
function onTagsChange(tags: string[]) {
  props.entry.tags = tags
  emit('update')
}
// function onKbChange(e: Event) {
//   props.entry.kbId = (e.target as HTMLSelectElement).value
//   emit('update')
// }
function onWrongAnswer(val: string) {
  props.entry.wrongAnswer = val
  emit('update')
}
function onCorrectAnswer(val: string) {
  props.entry.correctAnswer = val
  emit('update')
}

function onQuestionInput() {
  if (suppressInput) return
  if (questionBody.value) {
    props.entry.question = toStorageHtml(serializeQuestionHtml())
  }
  emit('update')
}

function onMaterialInput() {
  if (suppressInput || !props.group || !materialBody.value) return
  props.group.material = toStorageHtml(serializeMaterialHtml())
  emit('update')
}

function onQuestionPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  for (const item of Array.from(items || [])) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const blob = item.getAsFile()
      if (!blob) continue
      startPipeline(blob, 'question')
      return
    }
  }
  if (pastePlainText(e, questionBody.value)) onQuestionInput()
}

// Image tools for question panel
const qCamOpen = ref(false)
const qScreenshotOpen = ref(false)
const qFileInput = ref<HTMLInputElement | null>(null)
const imageToolTarget = ref<'question' | 'material'>('question')

// Image pipeline: crop → filter → insert
const pipelineStage = ref<'none' | 'crop' | 'filter'>('none')
const pipelineSrc = ref('')
const pipelineTarget = ref<'question' | 'material'>('question')

function openScreenshot(target: 'question' | 'material') {
  imageToolTarget.value = target
  qScreenshotOpen.value = true
}

function openCamera(target: 'question' | 'material') {
  imageToolTarget.value = target
  qCamOpen.value = true
}

function replacePipelineSource(source = '') {
  if (pipelineSrc.value.startsWith('blob:')) URL.revokeObjectURL(pipelineSrc.value)
  pipelineSrc.value = source
}

function startPipeline(src: string | Blob, target: 'question' | 'material' = 'question') {
  pipelineTarget.value = target
  replacePipelineSource(typeof src === 'string' ? src : URL.createObjectURL(src))
  pipelineStage.value = 'crop'
}

async function doInsertImage(src: string) {
  const el = pipelineTarget.value === 'material' ? materialBody.value : questionBody.value
  if (!el) return
  let displayUrl: string
  try {
    displayUrl = (await saveImage(props.entry.notebookId, src)).displayUrl
  } catch (error) {
    console.error('Failed to save image', error)
    return
  }
  el.focus()

  const img = document.createElement('img')
  img.src = displayUrl
  img.style.maxWidth = '100%'
  img.style.borderRadius = '6px'

  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(img)
    range.collapse(false)
    const br = document.createElement('br')
    range.insertNode(br)
    range.setStartAfter(br)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  } else {
    el.appendChild(img)
    el.appendChild(document.createElement('br'))
  }
  if (pipelineTarget.value === 'material') onMaterialInput()
  else onQuestionInput()
}

// --- Crop stage ---
function onCropConfirm(croppedSrc: string) {
  replacePipelineSource(croppedSrc)
  pipelineStage.value = 'filter'
}

function onCropSkip() {
  pipelineStage.value = 'filter'
}

function onCropCancel() {
  pipelineStage.value = 'none'
  replacePipelineSource()
}

// --- Filter stage ---
async function onFilterConfirm(filteredSrc: string, _threshold: number) {
  pipelineStage.value = 'none'
  await doInsertImage(filteredSrc)
  replacePipelineSource()
}

async function onFilterSkip() {
  pipelineStage.value = 'none'
  await doInsertImage(pipelineSrc.value)
  replacePipelineSource()
}

function onFilterCancel() {
  pipelineStage.value = 'none'
  replacePipelineSource()
}

function insertQuestionImage(src: string) {
  startPipeline(src, imageToolTarget.value)
}

function onQuestionDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
}

function onQuestionDrop(e: DragEvent) {
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  e.preventDefault()
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      startPipeline(file)
      break
    }
  }
}

function openQuestionFilePicker() {
  qFileInput.value?.click()
}

function openMaterialFilePicker() {
  materialFileInput.value?.click()
}

function onQuestionFileChange() {
  const file = qFileInput.value?.files?.[0]
  if (!file) return
  startPipeline(file)
  qFileInput.value!.value = ''
}

function onMaterialFileChange() {
  const file = materialFileInput.value?.files?.[0]
  if (!file) return
  startPipeline(file, 'material')
  materialFileInput.value!.value = ''
}

function onMaterialPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  for (const item of Array.from(items || [])) {
    if (!item.type.startsWith('image/')) continue
    e.preventDefault()
    const blob = item.getAsFile()
    if (blob) startPipeline(blob, 'material')
    return
  }
  if (pastePlainText(e, materialBody.value)) onMaterialInput()
}

function onMaterialDrop(e: DragEvent) {
  const file = Array.from(e.dataTransfer?.files || []).find((item) =>
    item.type.startsWith('image/'),
  )
  if (!file) return
  e.preventDefault()
  startPipeline(file, 'material')
}

function onQuestionCamCapture(dataUrl: string) {
  qCamOpen.value = false
  insertQuestionImage(dataUrl)
}

function onQuestionScreenshotCapture(dataUrl: string) {
  qScreenshotOpen.value = false
  // ScreenshotPicker already has its own crop, go straight to filter
  pipelineTarget.value = imageToolTarget.value
  replacePipelineSource(dataUrl)
  pipelineStage.value = 'filter'
}

const drawingEnabled = inject<Ref<boolean>>('drawingEnabled', ref(false))
const resizeCanvas = inject<() => void>('resizeCanvas', () => {})

type PanelId = 'material' | 'question' | 'wrong' | 'correct'
type PanelResizeType = 'primary-column' | 'primary-row' | 'secondary-column'

const activeFormattingPanel = ref<PanelId>('question')
const activeFormattingLabel = computed(
  () =>
    ({
      material: '公共材料',
      question: '题目',
      wrong: '错误答案',
      correct: '正确答案',
    })[activeFormattingPanel.value],
)

function activateFormattingPanel(panel: PanelId) {
  activeFormattingPanel.value = panel
}

interface PersistedPanelLayout {
  singleOrder: PanelId[]
  groupOrder: PanelId[]
  primaryColumnRatio: number
  primaryRowRatio: number
  secondaryColumnRatio: number
}

const PANEL_LAYOUT_KEY = 'cuotiben:panel-layout:v1'
const DEFAULT_SINGLE_ORDER: PanelId[] = ['question', 'wrong', 'correct']
const DEFAULT_GROUP_ORDER: PanelId[] = ['material', 'question', 'wrong', 'correct']
const layoutLocked = ref(true)
const singlePanelOrder = ref<PanelId[]>([...DEFAULT_SINGLE_ORDER])
const groupPanelOrder = ref<PanelId[]>([...DEFAULT_GROUP_ORDER])
const primaryColumnRatio = ref(0.42)
const primaryRowRatio = ref(0.46)
const secondaryColumnRatio = ref(0.5)
const draggingPanel = ref<PanelId | null>(null)
const dragOverPanel = ref<PanelId | null>(null)

function normalizePanelOrder(value: unknown, defaults: PanelId[]): PanelId[] {
  if (!Array.isArray(value)) return [...defaults]
  const allowed = new Set(defaults)
  const normalized = value.filter(
    (item, index): item is PanelId =>
      typeof item === 'string' && allowed.has(item as PanelId) && value.indexOf(item) === index,
  )
  defaults.forEach((panel) => {
    if (!normalized.includes(panel)) normalized.push(panel)
  })
  return normalized
}

function clampRatio(value: unknown, fallback: number, min = 0.24, max = 0.76): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback
}

function loadPanelLayout() {
  try {
    if (typeof localStorage === 'undefined') return
    const raw = localStorage.getItem(PANEL_LAYOUT_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as Partial<PersistedPanelLayout>
    singlePanelOrder.value = normalizePanelOrder(saved.singleOrder, DEFAULT_SINGLE_ORDER)
    groupPanelOrder.value = normalizePanelOrder(saved.groupOrder, DEFAULT_GROUP_ORDER)
    primaryColumnRatio.value = clampRatio(saved.primaryColumnRatio, 0.42, 0.28, 0.58)
    primaryRowRatio.value = clampRatio(saved.primaryRowRatio, 0.46, 0.28, 0.68)
    secondaryColumnRatio.value = clampRatio(saved.secondaryColumnRatio, 0.5, 0.28, 0.72)
  } catch {
    // Ignore malformed legacy layout data and keep the defaults.
  }
}

function persistPanelLayout() {
  if (typeof localStorage === 'undefined') return
  const state: PersistedPanelLayout = {
    singleOrder: [...singlePanelOrder.value],
    groupOrder: [...groupPanelOrder.value],
    primaryColumnRatio: primaryColumnRatio.value,
    primaryRowRatio: primaryRowRatio.value,
    secondaryColumnRatio: secondaryColumnRatio.value,
  }
  localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify(state))
}

loadPanelLayout()

const activePanelOrder = computed(() =>
  props.group ? groupPanelOrder.value : singlePanelOrder.value,
)

const panelLayoutStyle = computed(() => ({
  '--primary-column': `${primaryColumnRatio.value * 100}%`,
  '--primary-row': `${primaryRowRatio.value * 100}%`,
  '--secondary-left': `${secondaryColumnRatio.value}fr`,
  '--secondary-right': `${1 - secondaryColumnRatio.value}fr`,
}))

function panelSlotArea(index: number): string {
  if (props.group) {
    return (
      ['1 / 1 / 4 / 2', '1 / 3 / 2 / 6', '3 / 3 / 4 / 4', '3 / 5 / 4 / 6'][index] || '1 / 1 / 4 / 2'
    )
  }
  return ['1 / 1 / 2 / 4', '3 / 1 / 4 / 2', '3 / 3 / 4 / 4'][index] || '1 / 1 / 2 / 4'
}

function panelStyle(panel: PanelId): Record<string, string | number> {
  const index = activePanelOrder.value.indexOf(panel)
  return {
    '--panel-area': panelSlotArea(Math.max(0, index)),
    '--panel-order': Math.max(0, index),
  }
}

function swapPanelSlots(source: PanelId, target: PanelId) {
  if (source === target || layoutLocked.value) return
  const order = props.group ? groupPanelOrder.value : singlePanelOrder.value
  const sourceIndex = order.indexOf(source)
  const targetIndex = order.indexOf(target)
  if (sourceIndex !== -1 && targetIndex !== -1) {
    const nextOrder = [...order]
    ;[nextOrder[sourceIndex], nextOrder[targetIndex]] = [
      nextOrder[targetIndex],
      nextOrder[sourceIndex],
    ]
    if (props.group) groupPanelOrder.value = nextOrder
    else singlePanelOrder.value = nextOrder
    persistPanelLayout()
    nextTick(resizeCanvas)
  }
}

interface PanelPointerDragState {
  panel: PanelId
  pointerId: number
  startX: number
  startY: number
  active: boolean
}

let panelPointerDragState: PanelPointerDragState | null = null

function startPanelDrag(event: PointerEvent, panel: PanelId) {
  if (layoutLocked.value || event.button !== 0) return
  event.preventDefault()
  finishPanelDrag()
  panelPointerDragState = {
    panel,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
  }
  draggingPanel.value = panel
  document.body.classList.add('panel-dragging')
  window.addEventListener('pointermove', movePanelDrag)
  window.addEventListener('pointerup', stopPanelDrag)
  window.addEventListener('pointercancel', cancelPanelDrag)
}

function movePanelDrag(event: PointerEvent) {
  const state = panelPointerDragState
  if (!state || event.pointerId !== state.pointerId) return
  if (!state.active && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 5) {
    return
  }
  state.active = true
  event.preventDefault()
  const targetElement = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>('[data-panel-id]')
  const target = targetElement?.dataset.panelId as PanelId | undefined
  dragOverPanel.value =
    target && target !== state.panel && activePanelOrder.value.includes(target) ? target : null
}

function stopPanelDrag(event: PointerEvent) {
  const state = panelPointerDragState
  if (!state || event.pointerId !== state.pointerId) return
  const target = state.active ? dragOverPanel.value : null
  const source = state.panel
  finishPanelDrag()
  if (target) swapPanelSlots(source, target)
}

function cancelPanelDrag() {
  finishPanelDrag()
}

function finishPanelDrag() {
  panelPointerDragState = null
  draggingPanel.value = null
  dragOverPanel.value = null
  document.body.classList.remove('panel-dragging')
  window.removeEventListener('pointermove', movePanelDrag)
  window.removeEventListener('pointerup', stopPanelDrag)
  window.removeEventListener('pointercancel', cancelPanelDrag)
}

function toggleLayoutLock() {
  layoutLocked.value = !layoutLocked.value
  finishPanelDrag()
}

function resetPanelLayout() {
  singlePanelOrder.value = [...DEFAULT_SINGLE_ORDER]
  groupPanelOrder.value = [...DEFAULT_GROUP_ORDER]
  primaryColumnRatio.value = 0.42
  primaryRowRatio.value = 0.46
  secondaryColumnRatio.value = 0.5
  persistPanelLayout()
  nextTick(resizeCanvas)
}

interface PanelResizeState {
  type: PanelResizeType
  axis: 'x' | 'y'
  startPosition: number
  startRatio: number
  availableSize: number
}

let panelResizeState: PanelResizeState | null = null

function startPanelResize(e: MouseEvent, type: PanelResizeType) {
  if (layoutLocked.value || !editorLayoutEl.value) return
  e.preventDefault()
  const axis: 'x' | 'y' = type === 'primary-row' ? 'y' : 'x'
  const startRatio =
    type === 'primary-column'
      ? primaryColumnRatio.value
      : type === 'primary-row'
        ? primaryRowRatio.value
        : secondaryColumnRatio.value
  let availableSize =
    axis === 'y' ? editorLayoutEl.value.clientHeight : editorLayoutEl.value.clientWidth
  if (type === 'secondary-column' && props.group) {
    availableSize *= 1 - primaryColumnRatio.value
  }
  const startPosition = axis === 'x' ? e.clientX : e.clientY
  panelResizeState = { type, axis, startPosition, startRatio, availableSize }
  document.body.classList.add('panel-resizing')
  document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
  window.addEventListener('mousemove', resizePanels)
  window.addEventListener('mouseup', stopPanelResize)
}

function resizePanels(e: MouseEvent) {
  if (!panelResizeState) return
  const state = panelResizeState
  const currentPosition = state.axis === 'x' ? e.clientX : e.clientY
  const delta = currentPosition - state.startPosition

  const nextRatio = state.startRatio + delta / Math.max(1, state.availableSize)
  if (state.type === 'primary-column') {
    primaryColumnRatio.value = clampRatio(nextRatio, 0.42, 0.28, 0.58)
  } else if (state.type === 'primary-row') {
    primaryRowRatio.value = clampRatio(nextRatio, 0.46, 0.28, 0.68)
  } else secondaryColumnRatio.value = clampRatio(nextRatio, 0.5, 0.28, 0.72)

  resizeCanvas()
}

function stopPanelResize() {
  panelResizeState = null
  document.body.classList.remove('panel-resizing')
  document.body.style.cursor = ''
  window.removeEventListener('mousemove', resizePanels)
  window.removeEventListener('mouseup', stopPanelResize)
  persistPanelLayout()
  resizeCanvas()
}

const currentGroupIndex = computed(() =>
  (props.groupEntries || []).findIndex((entry) => entry.id === props.entry.id),
)

function selectSibling(offset: number) {
  const siblings = props.groupEntries || []
  const next = siblings[currentGroupIndex.value + offset]
  if (next) emit('select-sub-question', next.id)
}

// Review history
const { reviewLogs } = useReviewLogs(() => props.entry.notebookId)
const historyOpen = ref(false)

const entryLogs = computed(() =>
  reviewLogs.value
    .filter((l) => l.entryId === props.entry.id)
    .sort((a, b) => a.timestamp - b.timestamp),
)

const QUALITY_DEFS: Record<number | string, { label: string; color: string }> = {
  0: { label: '遗忘', color: '#ef4444' },
  1: { label: '错误', color: '#f97316' },
  2: { label: '勉强', color: '#f59e0b' },
  3: { label: '困难', color: '#eab308' },
  4: { label: '犹豫', color: '#84cc16' },
  5: { label: '完美', color: '#22c55e' },
  forgot: { label: '遗忘', color: '#ef4444' },
  unfamiliar: { label: '不熟练', color: '#f59e0b' },
  mastered: { label: '掌握', color: '#22c55e' },
}

function qualityInfo(q: number | string) {
  return QUALITY_DEFS[q] ?? { label: String(q), color: '#9ca3af' }
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// Set question content when entry changes, without v-html interference
watch(
  () => props.entry.id,
  () => {
    showQuestionGroupConfirm.value = false
    showQuestionLinkModal.value = false
    linkedTargetId.value = null
    wrongAnswerHidden.value = false
    activeFormattingPanel.value = 'question'
    resetQuestionSizing()
    nextTick(() => {
      if (questionBody.value) {
        suppressInput = true
        questionBody.value.innerHTML = toDisplayHtml(props.entry.question)
        decorateInternalLinks(questionBody.value, props.entries)
        suppressInput = false
      }
      if (questionContentRef.value) {
        emit('mount-canvas', questionContentRef.value, props.entry.id, 'question')
      }
    })
  },
  { immediate: true },
)

watch(
  () => [props.group?.id, props.entry.id] as const,
  () => {
    resetMaterialSizing()
    nextTick(() => {
      if (!materialBody.value) return
      suppressInput = true
      materialBody.value.innerHTML = toDisplayHtml(props.group?.material || '')
      decorateInternalLinks(materialBody.value, props.entries)
      suppressInput = false
      if (props.group && materialContentRef.value) {
        emit('mount-canvas', materialContentRef.value, props.entry.id, 'material')
      }
    })
  },
  { immediate: true },
)

watch(
  () => props.entries.map((entry) => `${entry.id}\u0000${entry.title}`).join('\u0001'),
  () => {
    nextTick(() => {
      if (questionBody.value) decorateInternalLinks(questionBody.value, props.entries)
      if (materialBody.value) decorateInternalLinks(materialBody.value, props.entries)
    })
  },
)

onUnmounted(() => {
  replacePipelineSource()
  finishPanelDrag()
  stopPanelResize()
})

function onQuestionWheel(e: WheelEvent) {
  const el = e.currentTarget as HTMLElement
  const atTop = el.scrollTop <= 0
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
  if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
    e.preventDefault()
  }
}
</script>

<template>
  <!-- @AI-VIEW: DOM 可自由重构。样式仅限 Tailwind CSS 工具类。严禁内联 style 或自定义 CSS。 -->
  <div class="flex-1 flex flex-col overflow-hidden overscroll-contain p-4 gap-3">
    <!-- Meta row -->
    <div class="flex items-center gap-2.5 px-1 flex-wrap">
      <!-- Subject select -->
      <div class="relative w-[130px]">
        <select
          class="w-full border border-gray-200 dark:border-[#2e2e2c] bg-gray-50 dark:bg-[#1e1e1c] rounded-lg px-2.5 py-1.5 text-xs outline-none text-gray-800 dark:text-brand-light focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all appearance-none cursor-pointer"
          :value="entry.subject"
          @change="onSubjectChange($event)"
          @blur="onBlur"
        >
          <option value="">-- 选择学科 --</option>
          <option v-for="s in allSubjects || []" :key="s" :value="s">{{ s }}</option>
          <option
            v-if="entry.subject && !(allSubjects || []).includes(entry.subject)"
            :value="entry.subject"
            hidden
          >
            {{ entry.subject }}
          </option>
        </select>
        <svg
          class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none w-3 h-3 text-gray-400 dark:text-gray-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      <!-- Source select -->
      <div class="relative w-[130px]">
        <select
          class="w-full border border-gray-200 dark:border-[#2e2e2c] bg-gray-50 dark:bg-[#1e1e1c] rounded-lg px-2.5 py-1.5 text-xs outline-none text-gray-800 dark:text-brand-light focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all appearance-none cursor-pointer"
          :value="entry.source"
          @change="onSourceChange($event)"
          @blur="onBlur"
        >
          <option value="">-- 选择来源 --</option>
          <option v-for="s in allSources || []" :key="s" :value="s">{{ s }}</option>
          <option
            v-if="entry.source && !(allSources || []).includes(entry.source)"
            :value="entry.source"
            hidden
          >
            {{ entry.source }}
          </option>
        </select>
        <svg
          class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none w-3 h-3 text-gray-400 dark:text-gray-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      <!-- <select ...> ... </select> -->

      <!-- Tags multi-select (same style as subject/source) -->
      <div class="relative w-[150px]">
        <TagMultiSelect
          :model-value="entry.tags"
          :all-tags="allTags || []"
          @update:model-value="onTagsChange($event)"
          @add-tag="(name) => emit('add-tag', name)"
        />
      </div>

      <div
        v-show="!drawingEnabled"
        class="ml-auto flex min-h-10 items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/70 px-2 py-1 dark:border-[#2e2e2c] dark:bg-[#1a1a18]"
        title="格式设置作用于当前编辑框"
      >
        <span class="shrink-0 text-xs font-semibold text-gray-400 dark:text-brand-mid">
          {{ activeFormattingLabel }}
        </span>
        <div id="rich-text-formatting-toolbar" class="flex min-h-8 items-center">
          <RichTextSizeControls
            v-if="activeFormattingPanel === 'question'"
            :image-selected="questionImageSelected"
            :image-width="questionImageWidth"
            :font-size="questionFontSize"
            :text-selected="questionTextSelected"
            :bold="questionIsBold"
            @preserve-selection="captureQuestionSelection"
            @font-size="applyQuestionFontSize"
            @toggle-bold="toggleQuestionBold"
            @highlight="applyQuestionHighlight"
            @image-width="applyQuestionImageWidth"
            @link="openQuestionLinkModal('question')"
          />
          <RichTextSizeControls
            v-else-if="activeFormattingPanel === 'material' && group"
            :image-selected="materialImageSelected"
            :image-width="materialImageWidth"
            :font-size="materialFontSize"
            :text-selected="materialTextSelected"
            :bold="materialIsBold"
            @preserve-selection="captureMaterialSelection"
            @font-size="applyMaterialFontSize"
            @toggle-bold="toggleMaterialBold"
            @highlight="applyMaterialHighlight"
            @image-width="applyMaterialImageWidth"
            @link="openQuestionLinkModal('material')"
          />
        </div>
      </div>

      <div class="flex items-center gap-2">
        <span
          v-if="!layoutLocked"
          class="hidden text-xs font-medium text-amber-600 dark:text-amber-300 xl:inline"
        >
          拖动板块手柄换位，拖动分隔线调整大小
        </span>
        <button
          v-if="!layoutLocked"
          data-testid="panel-layout-reset"
          class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-accent/40 hover:text-accent dark:border-[#383835] dark:bg-[#1e1e1c] dark:text-brand-mid"
          @click="resetPanelLayout"
        >
          恢复默认
        </button>
        <button
          data-testid="panel-layout-toggle"
          class="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
          :class="
            layoutLocked
              ? 'border border-gray-200 bg-white text-gray-600 hover:border-accent/40 hover:text-accent dark:border-[#383835] dark:bg-[#1e1e1c] dark:text-brand-light-gray'
              : 'bg-accent text-white shadow-sm hover:brightness-105'
          "
          @click="toggleLayoutLock"
        >
          {{ layoutLocked ? '调整布局' : '完成布局' }}
        </button>
      </div>
    </div>

    <!-- Review history timeline -->
    <div
      v-if="entryLogs.length > 0"
      class="mx-1 border border-gray-100 dark:border-[#2e2e2c] rounded-lg overflow-hidden flex-shrink-0"
    >
      <button
        class="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-gray-400 dark:text-brand-mid hover:bg-gray-50 dark:hover:bg-[#1e1e1c] transition-colors"
        @click="historyOpen = !historyOpen"
      >
        <span class="flex items-center gap-1.5">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          复习历史 ({{ entryLogs.length }})
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          class="transition-transform duration-200"
          :class="{ 'rotate-180': historyOpen }"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div v-if="historyOpen" class="px-3 pb-2.5 overflow-x-auto">
        <div class="flex items-start min-w-max pt-1">
          <template v-for="(log, i) in entryLogs" :key="log.id">
            <div class="flex flex-col items-center gap-0.5 flex-shrink-0" style="min-width: 44px">
              <span
                class="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-white dark:ring-gray-900"
                :style="{ backgroundColor: qualityInfo(log.quality).color }"
              />
              <span class="text-[9px] text-gray-400 dark:text-brand-mid leading-none">{{
                fmtDate(log.timestamp)
              }}</span>
              <span
                class="text-[9px] font-medium leading-none"
                :style="{ color: qualityInfo(log.quality).color }"
              >
                {{ qualityInfo(log.quality).label }}
              </span>
            </div>
            <div
              v-if="i < entryLogs.length - 1"
              class="flex-shrink-0 h-px mt-[5px] w-5 bg-gray-200 dark:bg-[#2a2a28]"
            />
          </template>
        </div>
      </div>
    </div>

    <!-- Slot-based panel workspace. Layout metadata is independent from entry data. -->
    <div
      ref="editorLayoutEl"
      class="editor-layout flex-1 min-h-0 grid overflow-y-auto lg:overflow-hidden"
      :class="{ 'has-group': group, 'layout-editing': !layoutLocked }"
      :style="panelLayoutStyle"
    >
      <section
        v-if="group"
        data-panel-id="material"
        data-testid="panel-module-material"
        class="panel-module material-panel bg-white dark:bg-[#141413] border border-gray-100 dark:border-[#2e2e2c] rounded-xl shadow-sm flex flex-col overflow-hidden group"
        :class="{
          'panel-drag-source': draggingPanel === 'material',
          'panel-drop-target': dragOverPanel === 'material',
        }"
        :style="panelStyle('material')"
        @mousedown="activateFormattingPanel('material')"
      >
        <div
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-500 dark:text-brand-mid border-b border-gray-100 dark:border-[#2e2e2c] bg-brand-light dark:bg-[#1e1e1c] flex-shrink-0"
        >
          <span class="w-2 h-2 rounded-full bg-sky-400" />
          公共材料
          <span class="text-xs font-normal text-gray-400">
            一拖 {{ groupEntries?.length || 1 }}
          </span>
          <button
            v-if="!layoutLocked"
            class="panel-drag-button"
            title="拖动公共材料板块换位"
            aria-label="拖动公共材料板块换位"
            @pointerdown.stop="startPanelDrag($event, 'material')"
            @click.stop
          >
            ⠿ 拖动
          </button>
          <div v-if="!drawingEnabled" class="ml-auto flex items-center gap-0.5">
            <button class="editor-tool" title="截屏" @click="openScreenshot('material')">▧</button>
            <button class="editor-tool" title="拍照" @click="openCamera('material')">◎</button>
            <button class="editor-tool" title="导入图片" @click="openMaterialFilePicker">＋</button>
            <input
              ref="materialFileInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onMaterialFileChange"
            />
          </div>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain" @wheel="onQuestionWheel">
          <div ref="materialContentRef" class="relative min-h-full">
            <div
              ref="materialBody"
              class="panel-body px-4 py-3 text-base leading-relaxed md-content outline-none min-h-full"
              :style="{ fontSize: materialFontSizeStyle }"
              :contenteditable="drawingEnabled ? 'false' : 'true'"
              data-placeholder="在这里输入所有小题共用的材料、图表或题干…"
              @input="onMaterialInput"
              @paste="onMaterialPaste"
              @dragover="onQuestionDragOver"
              @drop="onMaterialDrop"
              @click="handleMaterialEditorClick"
              @mouseup="captureMaterialSelection"
              @keyup="captureMaterialSelection"
              @blur="onBlur"
            />
          </div>
        </div>
      </section>

      <div
        v-if="group && !layoutLocked"
        data-testid="panel-resizer-primary-column"
        class="panel-resizer panel-resizer-v panel-resizer-primary-column"
        role="separator"
        aria-label="调整公共材料区域大小"
        title="拖动调整左右宽度"
        @mousedown="startPanelResize($event, 'primary-column')"
      >
        <span />
      </div>

      <!-- Question panel -->
      <div
        data-panel-id="question"
        data-testid="panel-module-question"
        class="panel-module bg-white dark:bg-[#141413] border border-gray-100 dark:border-[#2e2e2c] rounded-xl shadow-sm flex flex-col overflow-hidden group"
        :class="{
          'panel-drag-source': draggingPanel === 'question',
          'panel-drop-target': dragOverPanel === 'question',
        }"
        :style="panelStyle('question')"
        @mousedown="activateFormattingPanel('question')"
      >
        <div
          class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-400 dark:text-brand-mid border-b border-gray-100 dark:border-[#2e2e2c] bg-brand-light dark:bg-[#1e1e1c] flex-shrink-0"
        >
          <span class="w-2 h-2 rounded-full bg-accent" />
          题目

          <button
            v-if="!layoutLocked"
            class="panel-drag-button"
            title="拖动题目板块换位"
            aria-label="拖动题目板块换位"
            @pointerdown.stop="startPanelDrag($event, 'question')"
            @click.stop
          >
            ⠿ 拖动
          </button>

          <div v-if="group" class="ml-2 flex items-center gap-1">
            <button
              class="question-nav"
              :disabled="currentGroupIndex <= 0"
              title="上一小题"
              @click="selectSibling(-1)"
            >
              ‹
            </button>
            <span
              class="min-w-[58px] text-center text-[10px] font-medium text-gray-400 tabular-nums"
            >
              第 {{ currentGroupIndex + 1 }} / {{ groupEntries?.length || 1 }} 题
            </span>
            <button
              class="question-nav"
              :disabled="currentGroupIndex >= (groupEntries?.length || 1) - 1"
              title="下一小题"
              @click="selectSibling(1)"
            >
              ›
            </button>
            <button
              class="ml-1 px-2 py-1 rounded-md text-[10px] font-medium text-accent bg-accent/10 hover:bg-accent/15 transition-colors"
              @click="emit('add-sub-question')"
            >
              ＋ 添加小题
            </button>
          </div>
          <button
            v-else
            class="ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#bd5c3d] bg-[#d97757] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-px hover:bg-[#c96849] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d97757]/45 focus-visible:ring-offset-2 active:translate-y-0 active:shadow-sm dark:border-[#e18a6d] dark:bg-[#c96849] dark:hover:bg-[#d97757] dark:focus-visible:ring-offset-[#141413]"
            title="将当前题目转换为包含公共材料和多个小题的题组"
            @click="requestQuestionGroupConversion"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="7" height="6" rx="1" />
              <rect x="14" y="4" width="7" height="6" rx="1" />
              <rect x="8.5" y="14" width="7" height="6" rx="1" />
              <path d="M6.5 10v2h11v-2M12 12v2" />
            </svg>
            转为一拖 N 题组
          </button>

          <!-- Panel-specific image insertion tools -->
          <div v-if="!drawingEnabled" class="ml-auto flex items-center gap-0.5">
            <button
              class="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 dark:text-brand-mid dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 transition-all active:scale-90"
              title="截屏"
              @click="openScreenshot('question')"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="2" y="2" width="20" height="20" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </button>
            <button
              class="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 dark:text-brand-mid dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 transition-all active:scale-90"
              title="拍照"
              @click="openCamera('question')"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
            <button
              class="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 dark:text-brand-mid dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 transition-all active:scale-90"
              title="导入图片"
              @click="openQuestionFilePicker"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </button>
            <input
              ref="qFileInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onQuestionFileChange"
            />
          </div>
        </div>
        <div class="flex-1 overflow-y-auto overscroll-contain" @wheel="onQuestionWheel">
          <div ref="questionContentRef" :style="{ position: 'relative', minHeight: '100%' }">
            <div class="relative h-full">
              <div
                ref="questionBody"
                class="panel-body px-3.5 py-3 text-base leading-relaxed md-content outline-none min-h-full"
                :style="{ fontSize: questionFontSizeStyle }"
                :contenteditable="drawingEnabled ? 'false' : 'true'"
                data-placeholder="在此输入当前小题…"
                @input="onQuestionInput"
                @paste="onQuestionPaste"
                @dragover="onQuestionDragOver"
                @drop="onQuestionDrop"
                @click="handleQuestionEditorClick"
                @mouseup="captureQuestionSelection"
                @keyup="captureQuestionSelection"
                @blur="onBlur"
              />
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="!layoutLocked"
        data-testid="panel-resizer-primary-row"
        class="panel-resizer panel-resizer-h panel-resizer-primary-row"
        role="separator"
        aria-label="调整题目和答案区域的高度"
        title="拖动调整上下高度"
        @mousedown="startPanelResize($event, 'primary-row')"
      >
        <span />
      </div>

      <!-- Wrong answer panel -->
      <div
        data-panel-id="wrong"
        data-testid="panel-module-wrong"
        class="panel-module flex min-h-0"
        :class="{
          'panel-drag-source': draggingPanel === 'wrong',
          'panel-drop-target': dragOverPanel === 'wrong',
        }"
        :style="panelStyle('wrong')"
      >
        <AnswerPanel
          type="wrong"
          :hidden="wrongAnswerHidden"
          :model-value="entry.wrongAnswer"
          :entry-id="entry.id"
          :notebook-id="entry.notebookId"
          :entries="entries"
          :layout-editing="!layoutLocked"
          :formatting-active="activeFormattingPanel === 'wrong'"
          @update:model-value="onWrongAnswer($event)"
          @reveal="wrongAnswerHidden = !wrongAnswerHidden"
          @blur="onBlur"
          @layout-drag-start="startPanelDrag($event, 'wrong')"
          @activate-formatting="activateFormattingPanel"
          @mount-canvas="(el, entryId, field) => emit('mount-canvas', el, entryId, field)"
          @open-entry="emit('open-entry', $event)"
        />
      </div>

      <div
        v-if="!layoutLocked"
        data-testid="panel-resizer-secondary-column"
        class="panel-resizer panel-resizer-v panel-resizer-secondary-column"
        role="separator"
        aria-label="调整下方两个板块的宽度"
        title="拖动调整左右宽度"
        @mousedown="startPanelResize($event, 'secondary-column')"
      >
        <span />
      </div>

      <div
        data-panel-id="correct"
        data-testid="panel-module-correct"
        class="panel-module flex min-h-0"
        :class="{
          'panel-drag-source': draggingPanel === 'correct',
          'panel-drop-target': dragOverPanel === 'correct',
        }"
        :style="panelStyle('correct')"
      >
        <AnswerPanel
          type="correct"
          :hidden="answersHidden"
          :model-value="entry.correctAnswer"
          :entry-id="entry.id"
          :notebook-id="entry.notebookId"
          :entries="entries"
          :layout-editing="!layoutLocked"
          :formatting-active="activeFormattingPanel === 'correct'"
          @update:model-value="onCorrectAnswer($event)"
          @reveal="emit('reveal')"
          @blur="onBlur"
          @layout-drag-start="startPanelDrag($event, 'correct')"
          @activate-formatting="activateFormattingPanel"
          @mount-canvas="(el, entryId, field) => emit('mount-canvas', el, entryId, field)"
          @open-entry="emit('open-entry', $event)"
        />
      </div>
    </div>

    <CameraCapture v-if="qCamOpen" @capture="onQuestionCamCapture" @close="qCamOpen = false" />

    <ScreenshotPicker
      v-if="qScreenshotOpen"
      @capture="onQuestionScreenshotCapture"
      @close="qScreenshotOpen = false"
    />

    <ImageCropper
      v-if="pipelineStage === 'crop'"
      :image-src="pipelineSrc"
      @crop="onCropConfirm"
      @skip="onCropSkip"
      @cancel="onCropCancel"
    />

    <ImageFilterModal
      v-if="pipelineStage === 'filter'"
      :image-src="pipelineSrc"
      @confirm="onFilterConfirm"
      @skip="onFilterSkip"
      @cancel="onFilterCancel"
    />

    <QuestionGroupConfirmModal
      :visible="showQuestionGroupConfirm"
      @confirm="confirmQuestionGroupConversion"
      @cancel="showQuestionGroupConfirm = false"
    />

    <QuestionLinkModal
      :visible="showQuestionLinkModal"
      :entries="entries"
      :current-entry-id="entry.id"
      :linked-target-id="linkedTargetId"
      @choose="chooseQuestionLink"
      @open="openLinkedEntry"
      @remove="removeActiveQuestionLink"
      @cancel="showQuestionLinkModal = false"
    />
  </div>
</template>

<style scoped>
.editor-layout {
  grid-template-columns:
    minmax(260px, var(--secondary-left, 0.5fr)) 12px
    minmax(260px, var(--secondary-right, 0.5fr));
  grid-template-rows:
    minmax(150px, var(--primary-row, 46%)) 12px
    minmax(180px, 1fr);
}

.editor-layout.has-group {
  grid-template-columns:
    minmax(260px, var(--primary-column, 42%)) 12px
    minmax(220px, var(--secondary-left, 0.5fr)) 12px
    minmax(220px, var(--secondary-right, 0.5fr));
}

.panel-module {
  position: relative;
  grid-area: var(--panel-area);
  min-width: 0;
  min-height: 0;
  transition:
    box-shadow 160ms ease,
    opacity 160ms ease,
    outline-color 160ms ease;
}

.layout-editing .panel-module {
  outline: 1px dashed rgb(217 119 87 / 28%);
  outline-offset: -2px;
}

.panel-drop-target {
  z-index: 2;
  outline: 2px solid #d97757 !important;
  outline-offset: -3px;
  box-shadow: 0 8px 24px rgb(217 119 87 / 20%);
}

.panel-drag-source {
  opacity: 0.62;
}

.panel-drag-button {
  margin-left: 4px;
  display: inline-flex;
  cursor: grab;
  align-items: center;
  gap: 4px;
  border: 1px solid rgb(217 119 87 / 35%);
  border-radius: 6px;
  padding: 2px 8px;
  color: #c96849;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.25;
  touch-action: none;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.panel-drag-button:hover {
  color: white;
  background: #d97757;
}

.panel-drag-button:active {
  cursor: grabbing;
}

.panel-resizer {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: background-color 150ms ease;
  touch-action: none;
}

.panel-resizer-h {
  height: 12px;
  cursor: row-resize;
  grid-area: 2 / 1 / 3 / 4;
}

.editor-layout.has-group .panel-resizer-primary-row {
  grid-area: 2 / 3 / 3 / 6;
}

.panel-resizer-v {
  width: 12px;
  cursor: col-resize;
}

.panel-resizer-primary-column {
  grid-area: 1 / 2 / 4 / 3;
}

.panel-resizer-secondary-column {
  grid-area: 3 / 2 / 4 / 3;
}

.editor-layout.has-group .panel-resizer-secondary-column {
  grid-area: 3 / 4 / 4 / 5;
}

.panel-resizer span {
  display: block;
  border-radius: 999px;
  background: #cbd5e1;
  transition:
    background-color 150ms ease,
    transform 150ms ease;
}

.panel-resizer-h span {
  width: 48px;
  height: 3px;
}

.panel-resizer-v span {
  width: 3px;
  height: 48px;
}

@media (max-width: 1023px) {
  .editor-layout,
  .editor-layout.has-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }

  .panel-module {
    order: var(--panel-order);
    flex: 0 0 280px;
    min-height: 220px;
  }

  .panel-resizer {
    display: none;
  }
}

.panel-resizer:hover {
  background: rgb(217 119 87 / 10%);
}

.panel-resizer:hover span {
  background: #d97757;
  transform: scale(1.08);
}

:global(.panel-resizing),
:global(.panel-dragging) {
  user-select: none;
}

:global(.panel-dragging) {
  cursor: grabbing;
}

.dark .panel-resizer span {
  background: #4b5563;
}

.dark .panel-resizer:hover span {
  background: #d97757;
}

.editor-tool,
.question-nav {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  transition: all 150ms ease;
}
.editor-tool:hover,
.question-nav:hover:not(:disabled) {
  color: #4b5563;
  background: rgb(0 0 0 / 5%);
}
.question-nav:disabled {
  opacity: 0.3;
  cursor: default;
}

.panel-body:empty::before {
  content: attr(data-placeholder);
  color: #cbd5e1;
}
.dark .panel-body:empty::before {
  color: #4b5563;
}
</style>
