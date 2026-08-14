import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../..')
const requireFromMiniprogram = createRequire(path.join(repoRoot, 'miniprogram/package.json'))
const { chromium } = requireFromMiniprogram('playwright')
const h5Root = path.join(repoRoot, 'miniprogram/dist-handbook-h5')
const outputDir = path.join(repoRoot, 'docs/training-handbook/assets/screenshots')
const manifestPath = path.join(scriptDir, 'screenshot-manifest.json')
const webPort = 49321
const webOrigin = `http://127.0.0.1:${webPort}`

const user = { id: 9001, openId: 'handbook-demo', name: '培训演示账号', role: 'user', credits: 36 }
const modules = [
  { id: 'silver-lens', name: '老摄影大师', icon: '📷', description: '修复老照片，创作艺术画', creditCost: 2, enabled: true, theme: { bg: '#FFF5DF', border: '#F2C56B', title: '#7A3E00' } },
  { id: 'copy-writer', name: '暖心文案', icon: '💌', description: '把心里话变成温暖文字', creditCost: 1, enabled: true, theme: { bg: '#FFF0EB', border: '#F0A887', title: '#8A321E' } },
  { id: 'story-time', name: 'AI故事会', icon: '📖', description: '为孩子创作四页专属故事', creditCost: 1, enabled: true, theme: { bg: '#EEF5FF', border: '#A9C6F2', title: '#184A9B' } },
  { id: 'life-assistant', name: '生活助手', icon: '🥗', description: '分析菜品营养，识别身边花草', creditCost: 1, enabled: true, theme: { bg: '#EFFBF2', border: '#9DD3A8', title: '#166534' } },
  { id: 'ai-photographer', name: 'AI摄影师', icon: '🎞️', description: '智能构图与拍摄指导', creditCost: 0, enabled: false, theme: { bg: '#F5F5F5', border: '#D5D5D5', title: '#666666' } },
  { id: 'ai-kaleidoscope', name: 'AI万花筒', icon: '🔮', description: '文字或语音问问生活里的事', creditCost: 1, enabled: true, theme: { bg: '#F7F0FF', border: '#C8AAE8', title: '#5B2788' } }
]

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.svg', 'image/svg+xml']
])

function startStaticServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', webOrigin)
      const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '')
      const requested = path.resolve(h5Root, relative)
      const safePath = requested.startsWith(h5Root) ? requested : path.join(h5Root, 'index.html')
      const data = await fs.readFile(safePath).catch(() => fs.readFile(path.join(h5Root, 'index.html')))
      response.writeHead(200, { 'content-type': mimeTypes.get(path.extname(safePath)) || 'application/octet-stream' })
      response.end(data)
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      response.end(error instanceof Error ? error.message : String(error))
    }
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(webPort, '127.0.0.1', () => resolve(server))
  })
}

function responseFor(pathname) {
  if (pathname === '/api/mp/auth/login') return { token: 'handbook-demo-token', user, mock: true }
  if (pathname === '/api/mp/user/me') return user
  if (pathname === '/api/mp/modules') return { modules }
  if (pathname === '/api/mp/credits/history') return { transactions: [
    { id: 2, amount: -2, type: 'consume', feature: '老摄影大师', description: '培训演示', balanceAfter: 36, createdAt: '2026-08-14T00:05:00.000Z' },
    { id: 1, amount: 50, type: 'register', description: '培训演示积分', balanceAfter: 50, createdAt: '2026-08-14T00:00:00.000Z' }
  ] }
  if (pathname === '/api/mp/silverlens/styles') return { styles: [
    { name: '油画', emoji: '🎨', description: '厚重笔触与温暖色彩' },
    { name: '水彩', emoji: '🖌️', description: '清透明亮的水彩效果' },
    { name: '素描', emoji: '✏️', description: '细腻铅笔线条' },
    { name: '水墨画', emoji: '🪭', description: '东方水墨意境' },
    { name: '三维动画风', emoji: '🧸', description: '立体柔和的动画质感' },
    { name: '日式动漫风', emoji: '🌸', description: '清新明快的动漫画面' },
    { name: '童话卡通风', emoji: '🏰', description: '温暖梦幻的童话画面' }
  ] }
  return { error: { code: 'NOT_FOUND', message: '培训截图接口未配置' } }
}

async function configureContext(context) {
  await context.route('http://127.0.0.1:49320/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const data = responseFor(pathname)
    const status = data.error ? 404 : 200
    await route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(data) })
  })
}

async function waitForApp(page) {
  await page.waitForSelector('#app', { state: 'attached' })
  await page.waitForTimeout(1400)
}

async function save(page, fileName) {
  const target = path.join(outputDir, fileName)
  await page.screenshot({ path: target, fullPage: false })
  const stat = await fs.stat(target)
  if (stat.size < 10_000) throw new Error(`截图文件异常小: ${fileName}`)
  console.log(`[capture] ${fileName} ${(stat.size / 1024).toFixed(1)}KB`)
}

async function openRoute(page, route) {
  await page.goto(`${webOrigin}/#/${route}`, { waitUntil: 'networkidle' })
  await waitForApp(page)
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true })
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const server = await startStaticServer()
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const failures = []

  try {
    const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
    await configureContext(guest)
    const guestPage = await guest.newPage()
    guestPage.on('dialog', (dialog) => dialog.accept())
    const login = manifest.items.find((item) => item.id === 'login')
    await openRoute(guestPage, login.path)
    await save(guestPage, login.file)
    await guest.close()

    const signedIn = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
    await signedIn.addInitScript(({ demoUser }) => {
      localStorage.setItem('lejoy_mp_token', JSON.stringify('handbook-demo-token'))
      localStorage.setItem('lejoy_mp_user', JSON.stringify(demoUser))
      localStorage.setItem('lejoy_kaleidoscope_notice_seen', JSON.stringify(true))
    }, { demoUser: user })
    await configureContext(signedIn)
    const page = await signedIn.newPage()
    page.on('dialog', (dialog) => dialog.accept())
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`[browser] ${message.text()}`)
    })

    for (const item of manifest.items.filter((entry) => !['login', 'error-offline'].includes(entry.id))) {
      try {
        await openRoute(page, item.path)
        if (item.id === 'home-top') await page.evaluate(() => window.scrollTo(0, 0))
        if (item.id === 'home-bottom') await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        if (item.id === 'home-bottom') await page.waitForTimeout(300)
        await save(page, item.file)
      } catch (error) {
        failures.push(`${item.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    await signedIn.close()
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }

  if (failures.length) {
    console.error(failures.join('\n'))
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
