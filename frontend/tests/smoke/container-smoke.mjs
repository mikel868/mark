const baseUrl = process.env.APP_URL ?? 'http://127.0.0.1:8088'

const health = await waitForHealth()
assert(health.status === 200, `health expected 200, received ${health.status}`)

const root = await fetch(`${baseUrl}/`)
assert(root.status === 200, `root expected 200, received ${root.status}`)
assert(
  root.headers.get('content-security-policy')?.includes("default-src 'self'"),
  'Content-Security-Policy header missing',
)

const deepRoute = await fetch(`${baseUrl}/tiktok/appeal-records`)
assert(deepRoute.status === 200, `deep route expected 200, received ${deepRoute.status}`)
assert(
  (await deepRoute.text()).includes('<div id="app"></div>'),
  'deep route did not return SPA shell',
)

const api = await fetch(`${baseUrl}/api/v1/auth/me`)
assert(api.status !== 200, 'unauthenticated/unavailable API must not return the SPA as 200')
assert(!(await api.text()).includes('<div id="app"></div>'), 'API errors must not fall back to SPA')
console.log('容器静态文件、深层路由、安全响应头及 API 隔离验证通过。')

async function waitForHealth() {
  const deadline = Date.now() + 20_000
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.status === 200) return response
      lastError = new Error(`health returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw lastError instanceof Error ? lastError : new Error('container health check timed out')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
