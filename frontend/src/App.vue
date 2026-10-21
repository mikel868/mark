<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'

import LoginView from './auth/LoginView.vue'
import { useAuth } from './auth/auth-service'

const auth = useAuth()
onMounted(auth.initialize)
</script>

<template>
  <div v-if="!auth.ready.value" class="page-card">正在连接服务器…</div>
  <div v-else-if="auth.initializationError.value" class="page-card">
    <p>{{ auth.initializationError.value }}</p>
    <el-button @click="auth.initialize">重新连接</el-button>
  </div>
  <RouterView v-else-if="auth.isAuthenticated.value" :key="auth.generation.value" />
  <LoginView v-else />
</template>
