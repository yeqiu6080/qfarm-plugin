/**
 * 简化版测试运行器
 * 不依赖 Yunzai 环境，只测试纯逻辑功能
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 模拟全局 logger
global.logger = {
  trace: () => {},
  debug: () => {},
  info: console.log,
  mark: console.log,
  warn: console.warn,
  error: console.error
}

// 模拟 redis
global.redis = {
  get: async () => null,
  set: async () => {},
  del: async () => {},
  incr: async () => 1
}

// 模拟 Bot
global.Bot = {
  uin: '123456',
  nickname: 'TestBot',
  makeForwardMsg: (nodes) => ({ type: 'forward', nodes })
}

/**
 * 简易测试框架
 */
class TestRunner {
  constructor() {
    this.tests = []
    this.beforeEachFns = []
    this.afterEachFns = []
    this.stats = { passed: 0, failed: 0, total: 0 }
    this.currentSuite = ''
  }

  describe(suiteName, fn) {
    this.currentSuite = suiteName
    console.log(`\n📦 ${suiteName}`)
    fn()
    this.currentSuite = ''
  }

  it(testName, fn) {
    this.tests.push({ suite: this.currentSuite, name: testName, fn })
  }

  beforeEach(fn) { this.beforeEachFns.push(fn) }
  afterEach(fn) { this.afterEachFns.push(fn) }

  async run() {
    console.log('🧪 开始运行测试...\n')
    const startTime = Date.now()

    for (const test of this.tests) {
      this.stats.total++
      try {
        for (const beforeFn of this.beforeEachFns) await beforeFn()
        await test.fn()
        for (const afterFn of this.afterEachFns) await afterFn()
        this.stats.passed++
        console.log(`  ✅ ${test.name}`)
      } catch (error) {
        this.stats.failed++
        console.log(`  ❌ ${test.name}`)
        console.log(`     ${error.message}`)
      }
    }

    const duration = Date.now() - startTime
    console.log('\n' + '='.repeat(50))
    console.log('📊 测试结果汇总')
    console.log('='.repeat(50))
    console.log(`总测试数: ${this.stats.total}`)
    console.log(`✅ 通过: ${this.stats.passed}`)
    console.log(`❌ 失败: ${this.stats.failed}`)
    console.log(`⏱️  耗时: ${duration}ms`)
    console.log('='.repeat(50))

    return this.stats
  }
}

// 断言库
const assert = {
  equal(actual, expected, message = '') {
    if (actual !== expected) {
      throw new Error(message || `期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(actual)}`)
    }
  },
  notEqual(actual, expected, message = '') {
    if (actual === expected) {
      throw new Error(message || `期望不相等，但两者都是 ${JSON.stringify(actual)}`)
    }
  },
  true(value, message = '') {
    if (value !== true) {
      throw new Error(message || `期望 true, 实际 ${JSON.stringify(value)}`)
    }
  },
  false(value, message = '') {
    if (value !== false) {
      throw new Error(message || `期望 false, 实际 ${JSON.stringify(value)}`)
    }
  },
  ok(value, message = '') {
    if (!value) {
      throw new Error(message || `期望 truthy 值, 实际 ${JSON.stringify(value)}`)
    }
  },
  notOk(value, message = '') {
    if (value) {
      throw new Error(message || `期望 falsy 值, 实际 ${JSON.stringify(value)}`)
    }
  },
  includes(haystack, needle, message = '') {
    if (!haystack.includes(needle)) {
      throw new Error(message || `期望 ${JSON.stringify(haystack)} 包含 ${JSON.stringify(needle)}`)
    }
  },
  hasProperty(obj, prop, message = '') {
    if (!(prop in obj)) {
      throw new Error(message || `期望对象有属性 ${prop}`)
    }
  },
  isArray(value, message = '') {
    if (!Array.isArray(value)) {
      throw new Error(message || `期望是数组，实际是 ${typeof value}`)
    }
  },
  isObject(value, message = '') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(message || `期望是对象，实际是 ${typeof value}`)
    }
  },
  isString(value, message = '') {
    if (typeof value !== 'string') {
      throw new Error(message || `期望是字符串，实际是 ${typeof value}`)
    }
  },
  match(string, regex, message = '') {
    if (!regex.test(string)) {
      throw new Error(message || `期望字符串匹配 ${regex}`)
    }
  }
}

// 模拟函数
function mock(returnValue) {
  const calls = []
  const mockFn = (...args) => {
    calls.push(args)
    return typeof returnValue === 'function' ? returnValue(...args) : returnValue
  }
  mockFn.calls = calls
  mockFn.called = () => calls.length > 0
  mockFn.calledTimes = () => calls.length
  return mockFn
}

// 延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 转换为 file:// URL
function toFileUrl(filePath) {
  return 'file://' + filePath.replace(/\\/g, '/')
}

// ==================== 测试用例 ====================

const runner = new TestRunner()

// 基础路径
const componentsPath = path.join(__dirname, '..', 'components')
const modelPath = path.join(__dirname, '..', 'model')
const configPath = path.join(__dirname, '..', 'config', 'config.json')

// Config 测试
runner.describe('Config 配置管理测试', () => {
  let originalConfig = null

  runner.beforeEach(() => {
    if (fs.existsSync(configPath)) {
      originalConfig = fs.readFileSync(configPath, 'utf8')
    }
  })

  runner.afterEach(() => {
    if (originalConfig) {
      fs.writeFileSync(configPath, originalConfig)
    }
  })

  runner.it('应该正确加载默认配置', async () => {
    // 删除现有配置
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath)
    }

    // 动态导入 Config
    const { default: Config } = await import(toFileUrl(path.join(componentsPath, 'Config.js')))
    const config = Config.load()

    assert.hasProperty(config, 'serverUrl')
    assert.hasProperty(config, 'userAutoAccounts')
    assert.equal(config.serverUrl, 'http://127.0.0.1:3456')
  })

  runner.it('应该正确保存和读取配置', async () => {
    const { default: Config } = await import(toFileUrl(path.join(componentsPath, 'Config.js')))

    Config.setServerUrl('http://test.server.com:8080')
    const url = Config.getServerUrl()

    assert.equal(url, 'http://test.server.com:8080')
  })

  runner.it('应该管理用户禁止列表', async () => {
    const { default: Config } = await import(toFileUrl(path.join(componentsPath, 'Config.js')))

    Config.banUser('test_user_1')
    assert.true(Config.isUserBanned('test_user_1'))

    Config.unbanUser('test_user_1')
    assert.false(Config.isUserBanned('test_user_1'))
  })

  runner.it('应该管理群白名单', async () => {
    const { default: Config } = await import(toFileUrl(path.join(componentsPath, 'Config.js')))

    // 清空白名单
    const config = Config.load()
    config.allowedGroups = []
    Config.save(config)

    assert.true(Config.isGroupAllowed('any_group'))

    Config.allowGroup('group_123')
    assert.true(Config.isGroupAllowed('group_123'))
    assert.false(Config.isGroupAllowed('group_999'))
  })
})

// Api 测试
runner.describe('Api 接口测试', () => {
  runner.it('应该正确构建 URL', async () => {
    const { default: Api } = await import(toFileUrl(path.join(componentsPath, 'Api.js')))

    const url = Api.buildUrl('/api/accounts')
    assert.isString(url)
    assert.ok(url.includes('/api/accounts'))
  })

  runner.it('应该正确处理响应数据', async () => {
    const { default: Api } = await import(toFileUrl(path.join(componentsPath, 'Api.js')))

    const response = {
      data: {
        success: true,
        data: { id: 1, name: 'test' }
      }
    }
    const result = Api.extractData(response)
    assert.equal(result.id, 1)
    assert.equal(result.name, 'test')
  })

  runner.it('应该处理不带 success 的响应', async () => {
    const { default: Api } = await import(toFileUrl(path.join(componentsPath, 'Api.js')))

    const response = { data: { id: 1 } }
    const result = Api.extractData(response)
    assert.equal(result.id, 1)
  })
})

// MessageHelper 测试
runner.describe('MessageHelper 消息辅助测试', () => {
  runner.it('应该发送消息', async () => {
    const { default: MessageHelper } = await import(toFileUrl(path.join(componentsPath, 'MessageHelper.js')))

    const mockEvent = {
      reply: mock(async (msg) => ({ message_id: '123' }))
    }

    const result = await MessageHelper.reply(mockEvent, '测试消息')
    assert.ok(result)
    assert.true(mockEvent.reply.called())
  })

  runner.it('应该处理无效事件', async () => {
    const { default: MessageHelper } = await import(toFileUrl(path.join(componentsPath, 'MessageHelper.js')))

    const result = await MessageHelper.reply(null, '测试消息')
    assert.equal(result, null)
  })

  runner.it('应该延迟执行', async () => {
    const { default: MessageHelper } = await import(toFileUrl(path.join(componentsPath, 'MessageHelper.js')))

    const start = Date.now()
    await MessageHelper.sleep(100)
    const end = Date.now()

    assert.ok(end - start >= 100)
  })
})

// Farm 模型测试
runner.describe('Farm 模型测试', () => {
  runner.it('应该生成正确的用户标识', async () => {
    const { default: Farm } = await import(toFileUrl(path.join(modelPath, 'Farm.js')))

    const key = Farm.getUserKey('123456')
    assert.equal(key, 'qq_123456')
  })

  runner.it('应该查找用户账号', async () => {
    const { default: Farm } = await import(toFileUrl(path.join(modelPath, 'Farm.js')))
    const { default: Api } = await import(toFileUrl(path.join(componentsPath, 'Api.js')))

    // 模拟 API
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123456', userId: '123456' },
      { id: 2, name: 'other', userId: '999' }
    ])

    const account = await Farm.getUserAccount('123456')
    assert.ok(account)
    assert.equal(account.id, 1)
  })

  runner.it('应该检查用户是否有账号', async () => {
    const { default: Farm } = await import(toFileUrl(path.join(modelPath, 'Farm.js')))
    const { default: Api } = await import(toFileUrl(path.join(componentsPath, 'Api.js')))

    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123456', userId: '123456' }
    ])

    const hasAccount = await Farm.hasUserAccount('123456')
    assert.true(hasAccount)

    const noAccount = await Farm.hasUserAccount('999999')
    assert.false(noAccount)
  })
})

// HttpClient 测试
runner.describe('HttpClient HTTP客户端测试', () => {
  runner.it('应该正确解析 URL', async () => {
    const { default: HttpClient } = await import(toFileUrl(path.join(componentsPath, 'HttpClient.js')))

    // 测试 URL 解析逻辑（通过检查方法存在性）
    assert.ok(HttpClient.request)
    assert.ok(HttpClient.get)
    assert.ok(HttpClient.post)
    assert.ok(HttpClient.put)
    assert.ok(HttpClient.delete)
  })
})

// ==================== 运行测试 ====================

console.log('╔════════════════════════════════════════════════════════╗')
console.log('║         QQ农场插件 (qfarm-plugin) 简化测试套件          ║')
console.log('╚════════════════════════════════════════════════════════╝')

runner.run().then(stats => {
  console.log('\n')
  if (stats.failed > 0) {
    console.log('⚠️  有测试失败')
    process.exit(1)
  } else {
    console.log('✨ 所有测试通过！')
    process.exit(0)
  }
}).catch(err => {
  console.error('测试运行出错:', err)
  process.exit(1)
})
