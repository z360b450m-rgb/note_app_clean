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

function switchMode(next: 'login' | 'signup') {
  mode.value = next
  error.value = ''
}
async function submit() {
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = '请填写邮箱和密码。'
    return
  }
  if (mode.value === 'signup' && password.value.length < 8) {
    error.value = '密码至少需要 8 位。'
    return
  }
  if (mode.value === 'signup' && password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致。'
    return
  }
  loading.value = true
  try {
    const user =
      mode.value === 'login'
        ? await login(email.value, password.value)
        : await signup(email.value, password.value, fullName.value)
    emit('authenticated', user)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '操作失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-card bg-white rounded-[20px]" aria-label="账户登录与注册">
      <div class="auth-intro">
        <h1>让错题<br />成为进步的起点。</h1>
        <p>记录、整理、复习。<br />用适合自己的节奏，积累每一次收获。</p>
      </div>
      <form class="auth-form" @submit.prevent="submit">
        <div class="auth-tabs" aria-label="账户操作">
          <button type="button" :aria-pressed="mode === 'login'" @click="switchMode('login')">
            登录
          </button>
          <button type="button" :aria-pressed="mode === 'signup'" @click="switchMode('signup')">
            注册
          </button>
        </div>
        <h2>{{ title }}</h2>
        <label v-if="mode === 'signup'" for="auth-name">昵称 <span>（可选）</span></label>
        <input
          v-if="mode === 'signup'"
          id="auth-name"
          v-model="fullName"
          autocomplete="name"
          placeholder="怎么称呼你"
        />
        <label for="auth-email">邮箱</label>
        <input
          id="auth-email"
          v-model="email"
          type="email"
          autocomplete="email"
          placeholder="you@example.com"
          required
        />
        <label for="auth-password">密码</label>
        <input
          id="auth-password"
          v-model="password"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          :minlength="mode === 'signup' ? 8 : undefined"
          placeholder="至少 8 位"
          required
        />
        <label v-if="mode === 'signup'" for="auth-confirm">确认密码</label>
        <input
          v-if="mode === 'signup'"
          id="auth-confirm"
          v-model="confirmPassword"
          type="password"
          autocomplete="new-password"
          placeholder="再输入一次密码"
          required
        />
        <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
        <button :disabled="loading" class="auth-submit bg-accent">
          {{ loading ? '请稍候…' : mode === 'login' ? '登录' : '注册' }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: var(--neo-surface);
  color: var(--neo-ink);
  font:
    14px/1.65 'Microsoft YaHei',
    system-ui,
    sans-serif;
}
.auth-card {
  width: 100%;
  max-width: 820px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 35px;
  padding: 24px;
}
.auth-intro {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 18px;
}
.auth-intro h1 {
  margin: 0;
  font-size: 27px;
  font-weight: 700;
  line-height: 1.65;
}
.auth-intro p {
  margin: 0;
  color: var(--neo-muted);
}
.auth-form {
  min-width: 0;
}
.auth-tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}
.auth-tabs button {
  padding: 10px 16px;
  font-size: 14px;
}
.auth-form h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.65;
}
.auth-form label {
  display: block;
  margin: 16px 0 8px;
}
.auth-form label span {
  color: var(--neo-muted);
}
.auth-form input {
  width: 100%;
  padding: 12px;
  font: inherit;
}
.auth-submit {
  width: 100%;
  margin-top: 20px;
  padding: 10px 16px;
  font: inherit;
}
.auth-error {
  margin: 14px 0 0;
  color: #c44747;
  font-size: 13px;
}
@media (max-width: 700px) {
  .auth-page {
    padding: 20px;
  }
  .auth-card {
    grid-template-columns: 1fr;
    gap: 28px;
    padding: 18px;
  }
}
</style>
