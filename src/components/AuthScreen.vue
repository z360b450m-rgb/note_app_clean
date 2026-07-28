<script setup lang="ts">
import { computed, ref } from 'vue'
import { login, signup, type AuthUser } from '@/services/auth'

const emit = defineEmits<{ authenticated: [user: AuthUser] }>()
const mode = ref<'login' | 'signup'>('login')
const fullName = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)
const title = computed(() => (mode.value === 'login' ? '欢迎回来' : '创建你的账号'))
const subtitle = computed(() => mode.value === 'login' ? '登录后继续整理和复习你的笔记。' : '用一个账号保护并同步你的学习资料。')

function switchMode(next: 'login' | 'signup') { mode.value = next; error.value = '' }
async function submit() {
  error.value = ''
  if (!email.value.trim() || !password.value) { error.value = '请填写邮箱和密码。'; return }
  if (mode.value === 'signup' && password.value.length < 8) { error.value = '密码至少需要 8 位。'; return }
  if (mode.value === 'signup' && password.value !== confirmPassword.value) { error.value = '两次输入的密码不一致。'; return }
  loading.value = true
  try {
    const user = mode.value === 'login' ? await login(email.value, password.value) : await signup(email.value, password.value, fullName.value)
    emit('authenticated', user)
  } catch (err) { error.value = err instanceof Error ? err.message : '操作失败，请稍后重试。' }
  finally { loading.value = false }
}
</script>

<template>
  <main class="min-h-screen bg-[#faf9f5] dark:bg-[#141413] text-brand-dark dark:text-brand-light flex items-center justify-center p-5">
    <section class="w-full max-w-[940px] grid overflow-hidden rounded-[20px] border border-[#e8e6dc] dark:border-[#2e2e2c] bg-white dark:bg-[#1e1e1c] shadow-[0_24px_70px_rgba(20,20,19,0.10)] md:grid-cols-[1.08fr_0.92fr]">
      <div class="hidden md:flex flex-col justify-between bg-[#f3eee4] dark:bg-[#242421] p-10">
        <div>
          <div class="flex h-10 w-10 items-center justify-center rounded-[11px] bg-accent text-xl font-semibold text-white">N</div>
          <p class="mt-10 text-[12px] font-medium tracking-[0.18em] text-accent">NOTES · REVIEW · GROW</p>
          <h1 class="mt-3 max-w-sm font-display text-4xl leading-tight text-brand-dark dark:text-brand-light">把每一次整理，变成下一次掌握。</h1>
        </div>
        <p class="max-w-xs text-sm leading-6 text-[#77746b] dark:text-brand-mid">你的错题、标签和复习记录，会在登录后安全地同步到后端。</p>
      </div>
      <div class="p-7 sm:p-10">
        <div class="flex rounded-[9px] bg-[#f5f3ed] p-1 dark:bg-[#2a2a28]">
          <button class="flex-1 rounded-[7px] px-3 py-2 text-[13px] transition-colors" :class="mode === 'login' ? 'bg-white text-brand-dark shadow-sm dark:bg-[#1e1e1c] dark:text-brand-light' : 'text-brand-mid'" @click="switchMode('login')">登录</button>
          <button class="flex-1 rounded-[7px] px-3 py-2 text-[13px] transition-colors" :class="mode === 'signup' ? 'bg-white text-brand-dark shadow-sm dark:bg-[#1e1e1c] dark:text-brand-light' : 'text-brand-mid'" @click="switchMode('signup')">注册</button>
        </div>
        <h2 class="mt-8 font-display text-2xl font-semibold">{{ title }}</h2>
        <p class="mt-2 text-[13px] text-[#77746b] dark:text-brand-mid">{{ subtitle }}</p>
        <form class="mt-7 space-y-4" @submit.prevent="submit">
          <label v-if="mode === 'signup'" class="block"><span class="text-[12px] font-medium">昵称 <span class="text-brand-mid">（可选）</span></span><input v-model="fullName" autocomplete="name" placeholder="怎么称呼你" class="mt-1.5 w-full rounded-[8px] border border-[#e8e6dc] bg-transparent px-3 py-2.5 text-[13px] outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10" /></label>
          <label class="block"><span class="text-[12px] font-medium">邮箱</span><input v-model="email" type="email" autocomplete="email" placeholder="you@example.com" class="mt-1.5 w-full rounded-[8px] border border-[#e8e6dc] bg-transparent px-3 py-2.5 text-[13px] outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10" /></label>
          <label class="block"><span class="text-[12px] font-medium">密码</span><input v-model="password" type="password" autocomplete="current-password" placeholder="至少 8 位" class="mt-1.5 w-full rounded-[8px] border border-[#e8e6dc] bg-transparent px-3 py-2.5 text-[13px] outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10" /></label>
          <label v-if="mode === 'signup'" class="block"><span class="text-[12px] font-medium">确认密码</span><input v-model="confirmPassword" type="password" autocomplete="new-password" placeholder="再输入一次密码" class="mt-1.5 w-full rounded-[8px] border border-[#e8e6dc] bg-transparent px-3 py-2.5 text-[13px] outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10" /></label>
          <p v-if="error" class="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">{{ error }}</p>
          <button :disabled="loading" class="mt-2 w-full rounded-[8px] bg-accent px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50">{{ loading ? '请稍候…' : mode === 'login' ? '登录并继续' : '创建账号' }}</button>
        </form>
      </div>
    </section>
  </main>
</template>
