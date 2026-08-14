import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../..')
const requireFromMiniprogram = createRequire(path.join(repoRoot, 'miniprogram/package.json'))
const automator = requireFromMiniprogram('miniprogram-automator')
const cliPath = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const sourceProjectPath = path.join(repoRoot, 'miniprogram')
const projectPath = process.env.HANDBOOK_PROJECT_PATH || path.join(repoRoot, 'tmp/handbook-miniprogram')
const outputDir = path.join(repoRoot, 'docs/training-handbook/assets/screenshots')
const manifestPath = path.join(scriptDir, 'screenshot-manifest.json')
const mockPort = 49320
const mockOrigin = `http://127.0.0.1:${mockPort}`

const modules = [
  { id: 'silver-lens', name: '老摄影大师', icon: '📷', description: '修复老照片，创作艺术画', creditCost: 2, enabled: true, theme: { bg: '#FFF5DF', border: '#F2C56B', title: '#7A3E00' } },
  { id: 'copy-writer', name: '暖心文案', icon: '💌', description: '把心里话变成温暖文字', creditCost: 1, enabled: true, theme: { bg: '#FFF0EB', border: '#F0A887', title: '#8A321E' } },
  { id: 'story-time', name: 'AI故事会', icon: '📖', description: '为孩子创作四页专属故事', creditCost: 1, enabled: true, theme: { bg: '#EEF5FF', border: '#A9C6F2', title: '#184A9B' } },
  { id: 'life-assistant', name: '生活助手', icon: '🥗', description: '分析菜品营养，识别身边花草', creditCost: 1, enabled: true, theme: { bg: '#EFFBF2', border: '#9DD3A8', title: '#166534' } },
  { id: 'ai-photographer', name: 'AI摄影师', icon: '🎞️', description: '智能构图与拍摄指导', creditCost: 0, enabled: false, theme: { bg: '#F5F5F5', border: '#D5D5D5', title: '#666666' } },
  { id: 'ai-kaleidoscope', name: 'AI万花筒', icon: '🔮', description: '文字或语音问问生活里的事', creditCost: 1, enabled: true, theme: { bg: '#F7F0FF', border: '#C8AAE8', title: '#5B2788' } }
]

async function prepareTouristProject() {
  await fs.rm(projectPath, { recursive: true, force: true })
  await fs.mkdir(projectPath, { recursive: true })
  await fs.cp(path.join(sourceProjectPath, 'dist'), path.join(projectPath, 'dist'), { recursive: true })
  const config = JSON.parse(await fs.readFile(path.join(sourceProjectPath, 'project.config.json'), 'utf8'))
  config.appid = 'touristappid'
  config.projectname = 'lejoy-handbook-capture'
  await fs.writeFile(path.join(projectPath, 'project.config.json'), `${JSON.stringify(config, null, 2)}\n`)

  async function replaceApiBase(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name)
      if (entry.isDirectory()) await replaceApiBase(filePath)
      if (entry.isFile() && entry.name.endsWith('.js')) {
        const source = await fs.readFile(filePath, 'utf8')
        const updated = source.replaceAll('https://api.hxzhineng.xyz', mockOrigin)
        if (updated !== source) await fs.writeFile(filePath, updated)
      }
    }
  }
  await replaceApiBase(path.join(projectPath, 'dist'))
}

function startMockApi() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', mockOrigin)
    const send = (status, data) => {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' })
      response.end(JSON.stringify(data))
    }
    if (url.pathname === '/api/mp/auth/login') return send(200, { token: 'handbook-demo-token', user: { id: 9001, openId: 'handbook-demo', name: '培训演示账号', role: 'user', credits: 36 }, mock: true })
    if (url.pathname === '/api/mp/user/me') return send(200, { id: 9001, openId: 'handbook-demo', name: '培训演示账号', role: 'user', credits: 36 })
    if (url.pathname === '/api/mp/modules') return send(200, { modules })
    if (url.pathname === '/api/mp/credits/history') return send(200, { transactions: [{ id: 1, amount: 50, type: 'register', description: '培训演示积分', balanceAfter: 50, createdAt: '2026-08-14T00:00:00.000Z' }, { id: 2, amount: -2, type: 'consume', feature: '老摄影大师', description: '培训演示', balanceAfter: 48, createdAt: '2026-08-14T00:05:00.000Z' }] })
    if (url.pathname === '/api/mp/silverlens/styles') return send(200, { styles: [{ name: '油画', emoji: '🎨', description: '厚重笔触与温暖色彩' }, { name: '水彩', emoji: '🖌️', description: '清透明亮的水彩效果' }, { name: '素描', emoji: '✏️', description: '细腻铅笔线条' }, { name: '水墨画', emoji: '🪭', description: '东方水墨意境' }, { name: '三维动画风', emoji: '🧸', description: '立体柔和的动画质感' }, { name: '日式动漫风', emoji: '🌸', description: '清新明快的动漫画面' }, { name: '童话卡通风', emoji: '🏰', description: '温暖梦幻的童话画面' }] })
    return send(404, { error: { code: 'NOT_FOUND', message: '培训截图接口未配置' } })
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(mockPort, '127.0.0.1', () => resolve(server))
  })
}

async function wait(page, ms = 1800) {
  if (page) await page.waitFor(ms)
}

async function save(miniProgram, fileName) {
  const target = path.join(outputDir, fileName)
  await miniProgram.screenshot({ path: target })
  const stat = await fs.stat(target)
  if (stat.size < 10_000) throw new Error(`截图文件异常小: ${fileName}`)
  console.log(`[capture] ${fileName} ${(stat.size / 1024).toFixed(1)}KB`)
}

async function relaunch(miniProgram, route) {
  const page = await miniProgram.reLaunch(`/${route}`)
  if (!page) throw new Error(`无法打开页面: ${route}`)
  await wait(page)
  return page
}

async function ensureSignedIn(miniProgram) {
  let page = await relaunch(miniProgram, 'pages/login/index')
  const button = await page.$('button')
  if (!button) throw new Error('登录页未找到微信一键登录按钮')
  await button.tap()
  await wait(page, 4000)
  page = await miniProgram.currentPage()
  if (!page || page.path !== 'pages/home/index') {
    throw new Error(`自动登录失败，当前页面: ${page?.path ?? 'unknown'}`)
  }
  return page
}

async function captureRoute(miniProgram, item) {
  const page = await relaunch(miniProgram, item.path)
  await save(miniProgram, item.file)
  return page
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true })
  await prepareTouristProject()
  const mockServer = await startMockApi()
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const [loginItem, ...protectedItems] = manifest.items.filter((item) => item.id !== 'error-offline')
  const miniProgram = await automator.launch({ cliPath, projectPath, port: 9420, trustProject: true })
  const failures = []

  try {
    await miniProgram.callWxMethod('clearStorageSync')
    await captureRoute(miniProgram, loginItem)
    await ensureSignedIn(miniProgram)

    for (const item of protectedItems) {
      try {
        const page = await captureRoute(miniProgram, item)
        if (item.id === 'home-bottom') {
          await miniProgram.pageScrollTo(1800)
          await wait(page, 500)
          await save(miniProgram, item.file)
        }
      } catch (error) {
        failures.push(`${item.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  } finally {
    await miniProgram.close()
    await new Promise((resolve) => mockServer.close(resolve))
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
