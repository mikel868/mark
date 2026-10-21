<script setup lang="ts">
import { reactive, ref } from 'vue'

import { useAuth } from './auth-service'

const auth = useAuth()
const form = reactive({ username: '', password: '' })
const errorMessage = ref('')
const submitting = ref(false)

async function submit() {
  if (submitting.value) return
  submitting.value = true
  errorMessage.value = ''
  const result = await auth.login(form.username, form.password)
  if (!result.success) errorMessage.value = result.message ?? '登录失败'
  submitting.value = false
}
</script>

<template>
  <main class="login-page">
    <section class="login-hero" aria-label="Appeal Manager 介绍">
      <div class="hero-brand">AM / Appeal Manager</div>
      <div class="hero-message">
        <h2>让每次申诉<br />都有清晰的记录。</h2>
        <p>账号、流程、证据和反馈，<br />在同一个工作台中有序管理。</p>
      </div>
      <p class="hero-note">数据由服务器统一保存 · 建议定期备份</p>
    </section>
    <section class="login-card">
      <div class="login-heading">
        <h1 aria-label="登录 Appeal Manager">登录工作台</h1>
        <p>使用管理员或只读账号进入。</p>
      </div>

      <el-alert
        v-if="errorMessage"
        class="login-error"
        type="error"
        :closable="false"
        :title="errorMessage"
        show-icon
      />

      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="账号">
          <el-input
            v-model="form.username"
            aria-label="账号"
            autocomplete="username"
            placeholder="请输入账号"
            size="large"
            autofocus
          />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            aria-label="密码"
            autocomplete="current-password"
            placeholder="请输入密码"
            size="large"
            type="password"
            show-password
          />
        </el-form-item>
        <el-button
          class="login-button"
          type="primary"
          native-type="submit"
          size="large"
          :loading="submitting"
        >
          登录
        </el-button>
      </el-form>

      <div class="role-notes">
        <p>管理员：维护账号、流程、记录与备份。<br />只读账号：查看、搜索、复制和导出。</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  grid-template-columns: minmax(400px, 4fr) minmax(500px, 5fr);
  min-height: 100vh;
  background: #fff;
}

.login-hero {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 32px;
  color: #fff;
  background: var(--navy);
}

.hero-brand {
  font-size: 16px;
  font-weight: 500;
}

.hero-message {
  margin-top: clamp(100px, 22vh, 220px);
  margin-bottom: auto;
}

.hero-message h2 {
  margin: 0 0 28px;
  font-size: clamp(34px, 3vw, 40px);
  line-height: 1.4;
}

.hero-message p {
  color: var(--am-nav-muted);
  font-size: 16px;
  line-height: 24px;
}

.hero-note {
  margin: 0;
  color: var(--am-nav-muted);
  font-size: 12px;
}

.login-card {
  align-self: center;
  justify-self: center;
  width: min(448px, calc(100% - 64px));
  padding: 0;
}

.login-heading {
  margin: 0 0 28px;
}

.login-heading h1 {
  margin: 0 0 22px;
  color: var(--navy);
  font-size: 24px;
  line-height: 34px;
}

.login-heading > p:last-child {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 22px;
}

.login-error {
  margin-top: 12px;
}

.login-card :deep(.el-form) {
  margin-top: 28px;
}

.login-card :deep(.el-form-item) {
  margin-bottom: 20px;
}

.login-button {
  width: 100%;
  margin-top: 4px;
}

.role-notes {
  margin-top: 22px;
}

.role-notes p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 18px;
}

@media (max-width: 900px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-hero {
    min-height: 220px;
  }

  .hero-message {
    display: none;
  }

  .login-card {
    margin: 80px auto;
  }
}
</style>
