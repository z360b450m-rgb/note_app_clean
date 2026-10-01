import { computed, onBeforeUnmount, ref } from 'vue'

const FONT_COMMAND_SIZES: Record<string, string> = {
  '13': '3',
  '16': '4',
  '18': '5',
  '24': '6',
  '32': '7',
}

const HIGHLIGHT_COLORS = new Set(['#fff59d', '#bbf7d0', '#bfdbfe', '#fbcfe8', 'transparent'])
const BOLD_TYPING_MARKER = '\u200B'

function rangeBelongsToEditor(range: Range, editor: HTMLElement): boolean {
  const node = range.commonAncestorContainer
  return editor.contains(node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode)
}

export function useRichTextSizing(
  getEditor: () => HTMLElement | null,
  onContentChange: () => void,
  onDefaultFontSizeChange: (px: string) => void,
  onInternalLinkClick?: (targetId: string) => void,
) {
  const selectedImage = ref<HTMLImageElement | null>(null)
  const imageWidth = ref('auto')
  const hasSelectedImage = computed(() => !!selectedImage.value && selectedImage.value.isConnected)
  const hasTextSelection = ref(false)
  const isBold = ref(false)
  const selectedInternalLinkId = ref<string | null>(null)
  let savedRange: Range | null = null

  function clearSelectedImage() {
    selectedImage.value?.classList.remove('image-size-selected')
    selectedImage.value = null
    imageWidth.value = 'auto'
  }

  function captureSelection() {
    const editor = getEditor()
    const selection = window.getSelection()
    if (!editor || !selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (rangeBelongsToEditor(range, editor)) {
      savedRange = range.cloneRange()
      hasTextSelection.value = !range.collapsed
      isBold.value = document.queryCommandState('bold')
    }
  }

  function handleEditorClick(event: MouseEvent) {
    const editor = getEditor()
    const target = event.target
    if (!editor || !(target instanceof HTMLElement)) return

    const internalLink = target.closest<HTMLElement>('[data-entry-link]')
    if (internalLink && editor.contains(internalLink)) {
      event.preventDefault()
      event.stopPropagation()
      const targetId = internalLink.dataset.entryLink?.trim()
      if (targetId) {
        const range = document.createRange()
        range.selectNodeContents(internalLink)
        savedRange = range
        hasTextSelection.value = true
        selectedInternalLinkId.value = targetId
        onInternalLinkClick?.(targetId)
      }
      return
    }
    selectedInternalLinkId.value = null

    if (target instanceof HTMLImageElement && editor.contains(target)) {
      clearSelectedImage()
      selectedImage.value = target
      const width = target.style.width.replace('%', '')
      imageWidth.value = ['25', '50', '75', '100'].includes(width) ? width : 'auto'
      target.classList.add('image-size-selected')
    } else {
      clearSelectedImage()
    }
    captureSelection()
  }

  function insertInternalLink(targetId: string, fallbackText: string): boolean {
    const editor = getEditor()
    if (!editor || !targetId.trim()) return false
    const selection = restoreEditorSelection(editor, false)
    if (!selection || selection.rangeCount === 0) return false

    const range = selection.getRangeAt(0)
    const existingLink =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as HTMLElement).closest<HTMLElement>('[data-entry-link]')
        : range.commonAncestorContainer.parentElement?.closest<HTMLElement>('[data-entry-link]')

    if (existingLink && editor.contains(existingLink)) {
      existingLink.dataset.entryLink = targetId
      if (existingLink.dataset.entryLinkLabel === 'auto') {
        existingLink.textContent = fallbackText.trim() || '关联题目'
      }
      selectedInternalLinkId.value = targetId
      range.selectNodeContents(existingLink)
    } else {
      const link = document.createElement('a')
      link.dataset.entryLink = targetId
      link.setAttribute('role', 'link')
      link.setAttribute('tabindex', '0')
      if (range.collapsed) {
        link.dataset.entryLinkLabel = 'auto'
        link.textContent = fallbackText.trim() || '关联题目'
      } else {
        link.dataset.entryLinkLabel = 'custom'
        const content = range.extractContents()
        for (const nestedLink of Array.from(content.querySelectorAll('a'))) {
          nestedLink.replaceWith(...Array.from(nestedLink.childNodes))
        }
        link.appendChild(content)
      }
      range.insertNode(link)
      range.selectNodeContents(link)
      selectedInternalLinkId.value = targetId
    }

    selection.removeAllRanges()
    selection.addRange(range)
    savedRange = range.cloneRange()
    hasTextSelection.value = true
    onContentChange()
    return true
  }

  function removeInternalLink(): boolean {
    const editor = getEditor()
    if (!editor || !savedRange || !rangeBelongsToEditor(savedRange, editor)) return false
    const container = savedRange.commonAncestorContainer
    const link =
      (container.nodeType === Node.ELEMENT_NODE ? (container as HTMLElement) : container.parentElement)
        ?.closest<HTMLElement>('[data-entry-link]') || null
    if (!link || !editor.contains(link)) return false

    const parent = link.parentNode
    if (!parent) return false
    const fragment = document.createDocumentFragment()
    while (link.firstChild) fragment.appendChild(link.firstChild)
    const lastNode = fragment.lastChild
    parent.replaceChild(fragment, link)
    if (lastNode) {
      const range = document.createRange()
      range.setStartAfter(lastNode)
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      savedRange = range.cloneRange()
    }
    selectedInternalLinkId.value = null
    hasTextSelection.value = false
    onContentChange()
    return true
  }

  function normalizeFontElements(editor: HTMLElement) {
    for (const font of Array.from(editor.querySelectorAll('font[size]'))) {
      const size = font.getAttribute('size') || '4'
      const px =
        Object.entries(FONT_COMMAND_SIZES).find(([, commandSize]) => commandSize === size)?.[0] ||
        '16'
      // Keep the live node in place so the current selection remains valid.
      // The legacy <font> element is converted to <span> on serialization.
      font.style.fontSize = `${px}px`
      font.removeAttribute('size')
    }
  }

  function restoreEditorSelection(
    editor: HTMLElement,
    requireTextSelection = true,
  ): Selection | null {
    const selection = window.getSelection()
    if (!selection) return null
    editor.focus()
    selection.removeAllRanges()

    if (savedRange && rangeBelongsToEditor(savedRange, editor)) {
      if (requireTextSelection && savedRange.collapsed) return null
      selection.addRange(savedRange)
    } else {
      if (requireTextSelection) return null
      const range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
      selection.addRange(range)
    }
    return selection
  }

  function normalizeHighlights(editor: HTMLElement) {
    for (const span of Array.from(editor.querySelectorAll('span[style]'))) {
      const color = span.style.backgroundColor.replace(/\s/g, '').toLowerCase()
      if (color === 'transparent' || color === 'rgba(0,0,0,0)') {
        span.style.removeProperty('background-color')
        span.classList.remove('text-highlight')
      } else if (color) {
        span.classList.add('text-highlight')
      }
      if (span.style.length === 0) span.removeAttribute('style')
    }
  }

  function normalizeSerializedFormatting(root: HTMLElement) {
    for (const marker of Array.from(root.querySelectorAll('[data-bold-typing]'))) {
      marker.removeAttribute('data-bold-typing')
    }
    const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let textNode = textWalker.nextNode()
    while (textNode) {
      textNode.textContent = (textNode.textContent || '').replaceAll(BOLD_TYPING_MARKER, '')
      textNode = textWalker.nextNode()
    }

    for (const bold of Array.from(root.querySelectorAll('b'))) {
      const strong = document.createElement('strong')
      for (const attribute of Array.from(bold.attributes)) {
        strong.setAttribute(attribute.name, attribute.value)
      }
      while (bold.firstChild) strong.appendChild(bold.firstChild)
      bold.replaceWith(strong)
    }

    for (const font of Array.from(root.querySelectorAll('font'))) {
      const span = document.createElement('span')
      for (const attribute of Array.from(font.attributes)) {
        if (attribute.name !== 'size') span.setAttribute(attribute.name, attribute.value)
      }
      while (font.firstChild) span.appendChild(font.firstChild)
      font.replaceWith(span)
    }

    for (const span of Array.from(root.querySelectorAll('span'))) {
      if (span.style.length === 0) span.removeAttribute('style')
      if (span.attributes.length === 0) span.replaceWith(...Array.from(span.childNodes))
    }

    for (const element of Array.from(root.querySelectorAll('strong, span'))) {
      if (!element.textContent && element.children.length === 0) element.remove()
    }
  }

  function startBoldTyping(selection: Selection) {
    if (selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    const strong = document.createElement('strong')
    strong.dataset.boldTyping = 'true'
    const marker = document.createTextNode(BOLD_TYPING_MARKER)
    strong.appendChild(marker)
    range.insertNode(strong)
    range.setStart(marker, marker.length)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  function boldAncestorAtRange(range: Range, editor: HTMLElement): HTMLElement | null {
    let element =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as HTMLElement)
        : range.startContainer.parentElement
    while (element && element !== editor) {
      if (element.matches('strong, b')) return element
      element = element.parentElement
    }
    return null
  }

  function stopBoldTyping(selection: Selection, editor: HTMLElement): boolean {
    if (selection.rangeCount === 0) return false
    const range = selection.getRangeAt(0)
    const bold = boldAncestorAtRange(range, editor)
    if (!bold) return false

    const trailingRange = document.createRange()
    trailingRange.selectNodeContents(bold)
    trailingRange.setStart(range.startContainer, range.startOffset)
    const trailingContent = trailingRange.extractContents()
    const normalMarker = document.createTextNode(BOLD_TYPING_MARKER)
    bold.after(normalMarker)

    if (trailingContent.hasChildNodes()) {
      const trailingBold = bold.cloneNode(false) as HTMLElement
      trailingBold.removeAttribute('data-bold-typing')
      trailingBold.appendChild(trailingContent)
      normalMarker.after(trailingBold)
    }

    range.setStart(normalMarker, normalMarker.length)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    return true
  }

  function applyFontSize(px: string) {
    const editor = getEditor()
    const commandSize = FONT_COMMAND_SIZES[px]
    if (!editor || !commandSize) return

    const hasTextSelection =
      !!savedRange && rangeBelongsToEditor(savedRange, editor) && !savedRange.collapsed
    if (!hasTextSelection) {
      onDefaultFontSizeChange(px)
      return
    }

    const selection = window.getSelection()
    if (!selection) return
    editor.focus()
    selection.removeAllRanges()
    selection.addRange(savedRange!)

    document.execCommand('styleWithCSS', false, 'false')
    document.execCommand('fontSize', false, commandSize)
    normalizeFontElements(editor)
    captureSelection()
    onContentChange()
  }

  function toggleBold() {
    const editor = getEditor()
    if (!editor) return
    const selection = restoreEditorSelection(editor, false)
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (range.collapsed) {
      if (document.queryCommandState('bold')) {
        if (!stopBoldTyping(selection, editor)) document.execCommand('bold', false)
      } else startBoldTyping(selection)
    } else {
      document.execCommand('styleWithCSS', false, 'false')
      document.execCommand('bold', false)
    }
    captureSelection()
    onContentChange()
  }

  function applyHighlight(color: string) {
    const editor = getEditor()
    if (!editor || !HIGHLIGHT_COLORS.has(color) || !restoreEditorSelection(editor)) return

    document.execCommand('styleWithCSS', false, 'true')
    const applied = document.execCommand('hiliteColor', false, color)
    if (!applied) document.execCommand('backColor', false, color)
    normalizeHighlights(editor)
    captureSelection()
    onContentChange()
  }

  function applyImageWidth(width: string) {
    const image = selectedImage.value
    if (!image || !image.isConnected) return

    if (width === 'auto') {
      image.style.removeProperty('width')
    } else {
      image.style.width = `${width}%`
    }
    image.style.height = 'auto'
    image.style.maxWidth = '100%'
    imageWidth.value = width
    onContentChange()
  }

  function serializeHtml(): string {
    const editor = getEditor()
    if (!editor) return ''
    const clone = editor.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.image-size-selected').forEach((image) => {
      image.classList.remove('image-size-selected')
    })
    clone.querySelectorAll('[data-entry-link-state]').forEach((link) => {
      link.removeAttribute('data-entry-link-state')
      link.removeAttribute('title')
    })
    normalizeSerializedFormatting(clone)
    return clone.innerHTML
  }

  function resetSizingState() {
    clearSelectedImage()
    savedRange = null
    hasTextSelection.value = false
    isBold.value = false
    selectedInternalLinkId.value = null
  }

  onBeforeUnmount(resetSizingState)

  return {
    hasSelectedImage,
    imageWidth,
    hasTextSelection,
    isBold,
    selectedInternalLinkId,
    captureSelection,
    handleEditorClick,
    insertInternalLink,
    removeInternalLink,
    applyFontSize,
    toggleBold,
    applyHighlight,
    applyImageWidth,
    serializeHtml,
    resetSizingState,
  }
}
