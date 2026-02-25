/**
 * 简易测试框架
 * 为 qfarm-plugin 提供单元测试支持
 */

export class TestRunner {
  constructor() {
    this.tests = []
    this.beforeEachFns = []
    this.afterEachFns = []
    this.stats = {
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0
    }
    this.currentSuite = ''
  }

  describe(suiteName, fn) {
    this.currentSuite = suiteName
    console.log(`\n📦 ${suiteName}`)
    fn()
    this.currentSuite = ''
  }

  it(testName, fn) {
    this.tests.push({
      suite: this.currentSuite,
      name: testName,
      fn
    })
  }

  beforeEach(fn) {
    this.beforeEachFns.push(fn)
  }

  afterEach(fn) {
    this.afterEachFns.push(fn)
  }

  async run() {
    console.log('🧪 开始运行测试...\n')
    const startTime = Date.now()

    for (const test of this.tests) {
      this.stats.total++

      try {
        // 运行 beforeEach
        for (const beforeFn of this.beforeEachFns) {
          await beforeFn()
        }

        // 运行测试
        await test.fn()

        // 运行 afterEach
        for (const afterFn of this.afterEachFns) {
          await afterFn()
        }

        this.stats.passed++
        console.log(`  ✅ ${test.name}`)
      } catch (error) {
        this.stats.failed++
        console.log(`  ❌ ${test.name}`)
        console.log(`     ${error.message}`)
        if (error.stack) {
          console.log(`     ${error.stack.split('\n')[1]?.trim()}`)
        }
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
export const assert = {
  equal(actual, expected, message = '') {
    if (actual !== expected) {
      throw new Error(
        message || `期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(actual)}`
      )
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

  throws(fn, message = '') {
    let threw = false
    try {
      fn()
    } catch (e) {
      threw = true
    }
    if (!threw) {
      throw new Error(message || '期望函数抛出异常，但没有抛出')
    }
  },

  async throwsAsync(fn, message = '') {
    let threw = false
    try {
      await fn()
    } catch (e) {
      threw = true
    }
    if (!threw) {
      throw new Error(message || '期望异步函数抛出异常，但没有抛出')
    }
  },

  includes(haystack, needle, message = '') {
    if (!haystack.includes(needle)) {
      throw new Error(
        message || `期望 ${JSON.stringify(haystack)} 包含 ${JSON.stringify(needle)}`
      )
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

  isNumber(value, message = '') {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error(message || `期望是数字，实际是 ${typeof value}`)
    }
  },

  greaterThan(actual, expected, message = '') {
    if (!(actual > expected)) {
      throw new Error(message || `期望 ${actual} > ${expected}`)
    }
  },

  lessThan(actual, expected, message = '') {
    if (!(actual < expected)) {
      throw new Error(message || `期望 ${actual} < ${expected}`)
    }
  },

  match(string, regex, message = '') {
    if (!regex.test(string)) {
      throw new Error(message || `期望字符串匹配 ${regex}`)
    }
  }
}

// 创建模拟对象
export function mock(returnValue) {
  const calls = []
  const mockFn = (...args) => {
    calls.push(args)
    return typeof returnValue === 'function' ? returnValue(...args) : returnValue
  }
  mockFn.calls = calls
  mockFn.called = () => calls.length > 0
  mockFn.calledTimes = () => calls.length
  mockFn.calledWith = (...args) => {
    return calls.some(call => JSON.stringify(call) === JSON.stringify(args))
  }
  mockFn.lastCall = () => calls[calls.length - 1]
  mockFn.reset = () => { calls.length = 0 }
  return mockFn
}

// 创建间谍函数
export function spy(obj, method) {
  const original = obj[method]
  const calls = []

  obj[method] = (...args) => {
    calls.push(args)
    return original.apply(obj, args)
  }

  obj[method].restore = () => {
    obj[method] = original
  }
  obj[method].calls = calls
  obj[method].called = () => calls.length > 0
  obj[method].calledTimes = () => calls.length

  return obj[method]
}

// 测试辅助函数
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function withTimeout(promise, ms, message = '操作超时') {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout])
}

// 导出便捷函数
export function createTestRunner() {
  return new TestRunner()
}
