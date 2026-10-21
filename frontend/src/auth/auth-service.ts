import { computed, readonly, ref } from 'vue'
import { api, ApiError, refreshCsrf, resetCsrf } from '../data/api-client'
import type { AuthUser } from './types'
export type { AuthUser, AuthRole } from './types'
type ServerUser = { id: string; username: string; role: 'ADMIN' | 'READONLY' }
export function createAuthManager() {
  const session = ref<AuthUser | null>(null)
  const ready = ref(false)
  const initializationError = ref('')
  const generation = ref(0)
  const canWrite = computed(() => session.value?.role === 'admin')
  function accept(user: ServerUser) {
    session.value = { username: user.username, role: user.role === 'ADMIN' ? 'admin' : 'readonly' }
  }
  async function initialize() {
    ready.value = false
    initializationError.value = ''
    try {
      accept(await api<ServerUser>('/auth/me'))
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401))
        initializationError.value = error instanceof Error ? error.message : '会话检查失败'
      session.value = null
    } finally {
      ready.value = true
    }
  }
  async function login(username: string, password: string) {
    try {
      const user = await api<ServerUser>('/auth/login', {
        method: 'POST',
        body: new URLSearchParams({ username: username.trim(), password }),
      })
      await refreshCsrf()
      accept(user)
      generation.value++
      return { success: true }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '登录失败' }
    }
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST' })
    session.value = null
    resetCsrf()
    generation.value++
  }
  return {
    currentUser: readonly(session),
    ready: readonly(ready),
    initializationError: readonly(initializationError),
    generation: readonly(generation),
    isAuthenticated: computed(() => session.value !== null),
    canWrite,
    initialize,
    login,
    logout,
    expire: () => {
      session.value = null
    },
    assertCanWrite: () => {
      if (!canWrite.value) throw new Error('当前账号为只读权限，不能修改数据')
    },
  }
}
export const authManager = createAuthManager()
window.addEventListener('session-expired', authManager.expire)
export const useAuth = () => authManager
