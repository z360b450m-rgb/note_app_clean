<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

defineProps<{ label: string; count: number; selected: boolean; manageable?: boolean; quickCreate?: boolean }>()
const emit = defineEmits<{ select: []; edit: []; delete: []; quickCreate: [] }>()
const menuOpen = ref(false)
const root = ref<HTMLElement | null>(null)
function closeOutside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) menuOpen.value = false
}
function action(type: 'edit' | 'delete' | 'quickCreate') {
  menuOpen.value = false
  if (type === 'edit') emit('edit')
  else if (type === 'delete') emit('delete')
  else emit('quickCreate')
}
onMounted(() => document.addEventListener('pointerdown', closeOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOutside))
</script>

<template>
  <div ref="root" class="filter-item-row" :class="{ 'is-selected': selected }" @keydown.esc="menuOpen = false">
    <div class="filter-item-main">
      <button class="filter-item-select" :aria-pressed="selected" @click="menuOpen = false; emit('select')">
        <span class="truncate" :title="label">{{ label }}</span>
        <span class="filter-item-count tabular-nums">{{ count }}</span>
      </button>
      <button v-if="manageable" class="filter-item-more" :aria-label="`${label}的操作`" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
        </svg>
      </button>
    </div>
    <Transition name="popover">
      <div v-if="menuOpen" class="filter-item-menu">
        <button v-if="quickCreate" @click="action('quickCreate')">＋ 新建错题</button>
        <button @click="action('edit')">重命名</button>
        <button class="filter-item-delete" @click="action('delete')">删除</button>
      </div>
    </Transition>
  </div>
</template>
