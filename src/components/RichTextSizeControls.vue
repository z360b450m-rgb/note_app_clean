<script setup lang="ts">
defineProps<{
  imageSelected: boolean
  imageWidth: string
  fontSize: number
  textSelected: boolean
  bold: boolean
}>()

const emit = defineEmits<{
  'preserve-selection': []
  'font-size': [size: string]
  'image-width': [width: string]
  'toggle-bold': []
  highlight: [color: string]
  link: []
}>()

function onFontSizeChange(event: Event) {
  const select = event.target as HTMLSelectElement
  if (select.value) emit('font-size', select.value)
  select.value = ''
}

function onImageWidthChange(event: Event) {
  const select = event.target as HTMLSelectElement
  if (select.value) emit('image-width', select.value)
}

function onHighlightChange(event: Event) {
  const select = event.target as HTMLSelectElement
  if (select.value) emit('highlight', select.value)
  select.value = ''
}
</script>

<template>
  <div class="flex items-center gap-1" @mousedown="emit('preserve-selection')">
    <button
      type="button"
      aria-label="切换加粗"
      :aria-pressed="bold"
      title="加粗所选文字；未选择文字时切换后续输入的加粗状态"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-sm font-bold text-gray-600 outline-none transition-colors hover:border-accent/50 hover:text-accent dark:border-[#3a3a37] dark:bg-[#1a1a18] dark:text-brand-mid dark:hover:text-brand-light"
      :class="{ '!border-accent !bg-accent/10 !text-accent': bold }"
      @click="emit('toggle-bold')"
    >
      B
    </button>

    <select
      aria-label="设置文字荧光颜色"
      title="为所选文字添加或清除荧光"
      :disabled="!textSelected"
      class="h-8 w-[68px] shrink-0 rounded-lg border border-gray-200 bg-white px-1 text-xs text-gray-500 outline-none hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#3a3a37] dark:bg-[#1a1a18] dark:text-brand-mid"
      @change="onHighlightChange"
    >
      <option value="" selected disabled>荧光</option>
      <option value="#fff59d">黄色</option>
      <option value="#bbf7d0">绿色</option>
      <option value="#bfdbfe">蓝色</option>
      <option value="#fbcfe8">粉色</option>
      <option value="transparent">清除</option>
    </select>

    <button
      type="button"
      aria-label="链接到其他题目"
      title="将所选文字链接到其他题目；未选择文字时插入题目名称"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 outline-none transition-colors hover:border-accent/50 hover:text-accent dark:border-[#3a3a37] dark:bg-[#1a1a18] dark:text-brand-mid dark:hover:text-brand-light"
      @click="emit('link')"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    </button>

    <select
      aria-label="调整字体大小"
      title="调整字体大小；未选中文字时设置并记住此面板的默认字号"
      class="h-8 w-[88px] rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-500 outline-none hover:border-accent/50 dark:border-[#3a3a37] dark:bg-[#1a1a18] dark:text-brand-mid"
      @change="onFontSizeChange"
    >
      <option value="" selected disabled>{{ fontSize }}</option>
      <option value="13">13 px</option>
      <option value="16">16 px</option>
      <option value="18">18 px</option>
      <option value="24">24 px</option>
      <option value="32">32 px</option>
    </select>

    <select
      aria-label="调整图片大小"
      :disabled="!imageSelected"
      :value="imageWidth"
      :title="imageSelected ? '调整当前图片大小' : '请先点击内容中的图片'"
      class="h-8 w-[70px] rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-500 outline-none hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#3a3a37] dark:bg-[#1a1a18] dark:text-brand-mid"
      @change="onImageWidthChange"
    >
      <option value="auto">原始</option>
      <option value="25">25%</option>
      <option value="50">50%</option>
      <option value="75">75%</option>
      <option value="100">100%</option>
    </select>
  </div>
</template>
