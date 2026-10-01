<script setup lang="ts">
// @AI-NOTE: 一拖 N 转化确认对话框 —— 仅负责防误触确认，实际转化由父组件执行。
import { onBeforeUnmount, watch } from 'vue'
import { useModalAnimations } from '@/composables/useModalAnimations'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const { enterModal, leaveModal } = useModalAnimations()

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.visible) emit('cancel')
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) document.addEventListener('keydown', onKeydown)
    else document.removeEventListener('keydown', onKeydown)
  },
)

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Transition :css="false" @enter="enterModal" @leave="leaveModal">
    <div
      v-if="visible"
      class="modal-overlay fixed inset-0 z-[999] flex items-center justify-center bg-black/30"
      @click.self="emit('cancel')"
    >
      <div
        class="modal-dialog w-[380px] max-w-[90vw] rounded-xl border border-gray-100 bg-white p-6 shadow-2xl dark:border-[#2e2e2c] dark:bg-[#141413]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="question-group-confirm-title"
      >
        <h3
          id="question-group-confirm-title"
          class="text-[15px] font-bold text-gray-800 dark:text-brand-light"
        >
          转为一拖 N 题组？
        </h3>
        <p class="mt-2 text-sm leading-6 text-gray-500 dark:text-brand-mid">
          转化后，当前题目会成为该题组的第 1 小题，并新增所有小题共用的材料区域。
        </p>

        <div class="mt-5 flex justify-end gap-2">
          <button
            class="rounded-lg border border-gray-100 bg-white px-4 py-2 text-[13px] font-medium text-gray-600 transition-all hover:bg-gray-50 active:scale-95 dark:border-[#2e2e2c] dark:bg-[#141413] dark:text-brand-light-gray dark:hover:bg-[#2a2a28]"
            @click="emit('cancel')"
          >
            取消
          </button>
          <button
            class="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition-all hover:brightness-110 active:scale-95"
            @click="emit('confirm')"
          >
            确认转化
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
