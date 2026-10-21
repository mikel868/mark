<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import appealRecordIcon from '../assets/figma/appeal-record.svg'
import { useAuth } from '../auth/auth-service'
import CopyField from '../components/CopyField.vue'
import PlatformSwitcher from '../components/PlatformSwitcher.vue'
import { getPlatform, isPlatformId, type PlatformId } from '../domain/platform'

const TIKTOK_FEEDBACK_URL = 'https://www.tiktok.com/legal/report/feedback'
const PING0_URL = 'https://ping0.cc/'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const mobileMenuOpen = ref(false)

const platformId = computed<PlatformId>(() => {
  const value = route.params.platform
  return isPlatformId(value) ? value : 'ins'
})

const platform = computed(() => getPlatform(platformId.value))
const activeRoute = computed(() => String(route.name ?? 'accounts'))
const activeSectionLabel = computed(
  () => navItems.find((item) => item.name === activeRoute.value)?.label ?? '账号管理',
)
const platformLink = computed(() => {
  if (platformId.value === 'tiktok') {
    return {
      title: 'TikTok 反馈申诉网址',
      description: '提交 TikTok 账号或 IP 地区问题时使用',
      url: TIKTOK_FEEDBACK_URL,
    }
  }
  if (platformId.value === 'ping0') {
    return {
      title: 'Ping0 网址',
      description: '访问 Ping0 网站时使用',
      url: PING0_URL,
    }
  }
  return undefined
})

const navItems = [
  { name: 'accounts', label: '账号管理', badge: '01' },
  { name: 'appeal-flow', label: '申诉流程', badge: '02' },
  { name: 'appeal-records', label: '申诉记录', badge: '03' },
  { name: 'backup', label: '备份恢复', badge: '04' },
] as const

function navigate(name: string) {
  mobileMenuOpen.value = false
  void router.push({ name, params: { platform: platformId.value } })
}

async function logout() {
  mobileMenuOpen.value = false
  try {
    await auth.logout()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '退出失败，请重试')
  }
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" aria-label="主导航">
      <div class="brand">
        <span class="brand-mark">AM</span>
        <div>
          <strong>Appeal Manager</strong>
          <small>平台申诉管理台</small>
        </div>
      </div>

      <p class="nav-caption">工作空间</p>
      <nav>
        <button
          v-for="item in navItems"
          :key="item.name"
          type="button"
          class="nav-item"
          :class="{ active: activeRoute === item.name }"
          @click="navigate(item.name)"
        >
          <span v-if="item.name === 'appeal-records'" class="nav-asset" aria-hidden="true">
            <img :src="appealRecordIcon" alt="" width="20" height="20" />
          </span>
          <span v-else>{{ item.badge }}</span>
          {{ item.label }}
        </button>
      </nav>

      <div class="storage-note">
        <strong>服务器共享数据</strong>
        <p>不同设备登录后共享。<br />建议定期导出备份。</p>
        <button type="button" class="backup-shortcut" @click="navigate('backup')">导出备份</button>
      </div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div class="mobile-heading">
          <el-button class="menu-button" plain @click="mobileMenuOpen = true">菜单</el-button>
          <div>
            <strong>{{ platform.label }}</strong>
            <small>{{ platform.description }}</small>
          </div>
        </div>
        <div class="topbar-row">
          <span class="breadcrumb">工作空间&nbsp; / &nbsp;{{ activeSectionLabel }}</span>
          <div class="session-card">
            <span>服务器保存 · {{ auth.canWrite.value ? '管理员' : '只读账号' }}</span>
            <el-button link type="primary" @click="logout">退出</el-button>
          </div>
        </div>
      </header>

      <section class="content-area">
        <PlatformSwitcher v-if="activeRoute !== 'backup'" :model-value="platformId" />
        <el-alert
          v-if="!auth.canWrite.value"
          class="readonly-banner"
          type="info"
          :closable="false"
          show-icon
          title="当前为只读模式"
          description="可以查看、搜索、复制和导出备份，但不能添加、编辑、删除、导入或恢复数据。"
        />
        <section v-if="platformLink" class="platform-link-card" :aria-label="platformLink.title">
          <div class="platform-link-card__heading">
            <strong>{{ platformLink.title }}</strong>
            <span>{{ platformLink.description }}</span>
          </div>
          <div class="platform-link-card__actions">
            <CopyField :value="platformLink.url" :label="platformLink.title" />
            <el-link :href="platformLink.url" target="_blank" rel="noopener noreferrer">
              打开网址
            </el-link>
          </div>
        </section>
        <RouterView :key="`${platformId}-${activeRoute}`" />
      </section>
    </main>

    <el-drawer v-model="mobileMenuOpen" title="功能导航" direction="ltr" size="280px">
      <nav class="mobile-nav">
        <button
          v-for="item in navItems"
          :key="item.name"
          type="button"
          class="nav-item"
          :class="{ active: activeRoute === item.name }"
          @click="navigate(item.name)"
        >
          <span v-if="item.name === 'appeal-records'" class="nav-asset" aria-hidden="true">
            <img :src="appealRecordIcon" alt="" width="20" height="20" />
          </span>
          <span v-else>{{ item.badge }}</span>
          {{ item.label }}
        </button>
      </nav>
    </el-drawer>
  </div>
</template>

<style scoped>
.nav-asset {
  display: inline-flex;
  flex: 0 0 24px;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--surface);
  border-radius: 4px;
}

.nav-asset img {
  display: block;
  width: 20px;
  height: 20px;
}

.app-shell {
  display: grid;
  grid-template-columns: 238px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 26px 18px;
  color: #dce8f8;
  background: linear-gradient(160deg, rgba(25, 48, 83, 0.95), rgba(12, 27, 49, 0.98)), var(--navy);
}

.brand {
  display: flex;
  gap: 11px;
  align-items: center;
  padding: 0 7px 27px;
}

.brand-mark {
  display: grid;
  width: 42px;
  height: 42px;
  color: #fff;
  font-weight: 850;
  letter-spacing: -0.04em;
  background: linear-gradient(135deg, #1ec8bc, #2087d7);
  border-radius: 14px;
  place-items: center;
  box-shadow: 0 10px 24px rgba(21, 162, 154, 0.24);
}

.brand strong,
.brand small {
  display: block;
}

.brand small {
  margin-top: 3px;
  color: #91a6c1;
  font-size: 0.73rem;
}

nav {
  display: grid;
  gap: 8px;
}

.nav-item {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 12px 14px;
  color: #b7c7db;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 12px;
}

.nav-item span {
  color: #7890af;
  font-family: ui-monospace, monospace;
  font-size: 0.7rem;
}

.nav-item:hover,
.nav-item.active {
  color: #fff;
  background: rgba(255, 255, 255, 0.09);
}

.nav-item.active span {
  color: #4fe1d5;
}

.storage-note {
  margin-top: auto;
  padding: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
}

.storage-note strong {
  font-size: 0.78rem;
}

.storage-note p {
  margin: 6px 0 0;
  color: #90a6c0;
  font-size: 0.72rem;
  line-height: 1.55;
}

.main-area {
  min-width: 0;
}

.topbar {
  position: sticky;
  z-index: 10;
  top: 0;
  padding: 16px 26px;
  background: rgba(243, 246, 251, 0.92);
  border-bottom: 1px solid rgba(213, 222, 234, 0.75);
  backdrop-filter: blur(12px);
}

.mobile-heading {
  display: none;
}

.topbar-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
}

.session-card {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 184px;
  padding: 9px 10px 9px 13px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 13px;
  box-shadow: 0 7px 18px rgba(24, 42, 72, 0.06);
}

.session-card > div {
  display: grid;
  flex: 1;
  gap: 4px;
  min-width: 0;
}

.session-card strong {
  overflow: hidden;
  color: var(--navy);
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content-area {
  max-width: 1540px;
  padding: 28px;
  margin: 0 auto;
}

.readonly-banner {
  margin-bottom: 18px;
}

.platform-link-card {
  display: grid;
  grid-template-columns: minmax(190px, auto) minmax(0, 1fr);
  gap: 22px;
  align-items: center;
  padding: 16px 18px;
  margin-bottom: 18px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 15px;
  box-shadow: 0 8px 22px rgba(24, 42, 72, 0.05);
}

.platform-link-card__heading {
  display: grid;
  gap: 4px;
}

.platform-link-card__heading strong {
  color: var(--navy);
  font-size: 0.9rem;
}

.platform-link-card__heading span {
  color: var(--muted);
  font-size: 0.75rem;
}

.platform-link-card__actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  min-width: 0;
}

.app-shell {
  grid-template-columns: 224px minmax(0, 1fr);
  background: var(--am-bg);
}

.sidebar {
  padding: 24px;
  background: var(--navy);
}

.brand {
  gap: 12px;
  padding: 0;
  margin-bottom: 24px;
}

.brand-mark {
  width: 36px;
  height: 36px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0;
  background: var(--am-primary);
  border-radius: 12px;
  box-shadow: none;
}

.brand strong {
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.brand small {
  color: var(--am-nav-muted);
  font-size: 11px;
}

.nav-caption {
  margin: 0 0 16px;
  color: var(--am-nav-muted);
  font-size: 12px;
}

.sidebar nav {
  gap: 8px;
}

.nav-item {
  height: 44px;
  padding: 0 16px;
  color: var(--am-nav-muted);
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
}

.nav-item span {
  color: inherit;
  font-family: inherit;
  font-size: 12px;
  font-weight: 400;
}

.nav-item:hover,
.nav-item.active {
  background: var(--am-primary);
}

.nav-item.active span {
  color: #fff;
}

.storage-note {
  padding: 0;
  color: #fff;
  background: transparent;
  border: 0;
  border-radius: 0;
}

.storage-note strong {
  font-size: 14px;
  font-weight: 500;
}

.storage-note p {
  margin: 8px 0;
  color: var(--am-nav-muted);
  font-size: 12px;
  line-height: 18px;
}

.backup-shortcut {
  height: 40px;
  padding: 0 16px;
  color: var(--navy);
  font-size: 14px;
  cursor: pointer;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
}

.topbar {
  height: 72px;
  padding: 0 32px;
  background: #fff;
  border-bottom: 1px solid var(--line);
  backdrop-filter: none;
}

.topbar-row {
  display: flex;
  height: 100%;
  justify-content: space-between;
}

.breadcrumb {
  color: var(--navy);
  font-size: 12px;
}

.session-card {
  gap: 16px;
  min-width: 0;
  padding: 0;
  color: var(--muted);
  font-size: 12px;
  background: none;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.content-area {
  width: 100%;
  max-width: none;
  padding: 32px;
}

.content-area > :first-child.platform-switcher {
  margin-bottom: 16px;
}

.platform-link-card {
  border-radius: 8px;
  box-shadow: none;
}

@media (max-width: 940px) {
  .app-shell {
    display: block;
  }

  .sidebar {
    display: none;
  }

  .mobile-heading {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 12px;
  }

  .mobile-heading strong,
  .mobile-heading small {
    display: block;
  }

  .mobile-heading small {
    margin-top: 2px;
    color: var(--muted);
    font-size: 0.75rem;
  }

  .topbar-row {
    grid-template-columns: 1fr;
  }

  .session-card {
    justify-self: stretch;
  }
}

@media (max-width: 620px) {
  .topbar {
    padding: 13px 15px;
  }

  .content-area {
    padding: 18px 14px;
  }

  .platform-link-card {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .platform-link-card__actions {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .platform-link-card__actions :deep(.el-link) {
    justify-self: start;
  }
}
</style>
