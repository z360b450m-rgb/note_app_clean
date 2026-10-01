import { computed, ref, type Ref } from 'vue'

export type FontSizePanel = 'question' | 'wrong' | 'correct' | 'material'
export type PanelFontSize = 13 | 16 | 18 | 24 | 32

export const PANEL_FONT_SIZES: readonly PanelFontSize[] = [13, 16, 18, 24, 32]

const DEFAULT_FONT_SIZE: PanelFontSize = 16
const STORAGE_KEY_PREFIX = 'cuotiben_fontsize_'

function isPanelFontSize(value: unknown): value is PanelFontSize {
  const numericValue = typeof value === 'string' ? Number(value) : value
  return PANEL_FONT_SIZES.includes(numericValue as PanelFontSize)
}

function readPanelFontSize(panel: FontSizePanel): PanelFontSize {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_FONT_SIZE
    const value = localStorage.getItem(`${STORAGE_KEY_PREFIX}${panel}`)
    return isPanelFontSize(value) ? (Number(value) as PanelFontSize) : DEFAULT_FONT_SIZE
  } catch {
    return DEFAULT_FONT_SIZE
  }
}

const panelFontSizes: Record<FontSizePanel, Ref<PanelFontSize>> = {
  question: ref(readPanelFontSize('question')),
  wrong: ref(readPanelFontSize('wrong')),
  correct: ref(readPanelFontSize('correct')),
  material: ref(readPanelFontSize('material')),
}

export function usePanelFontSize(panel: FontSizePanel) {
  const fontSize = panelFontSizes[panel]
  const fontSizeStyle = computed(() => `${fontSize.value}px`)

  function setFontSize(value: string | number) {
    if (!isPanelFontSize(value)) return
    const normalized = Number(value) as PanelFontSize
    fontSize.value = normalized
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${panel}`, String(normalized))
      }
    } catch {
      // Keep the in-memory preference when persistent storage is unavailable.
    }
  }

  return { fontSize, fontSizeStyle, setFontSize }
}
