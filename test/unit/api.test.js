/**
 * Api 组件单元测试
 * 测试 API 调用功能
 */

import { createTestRunner, assert, mock } from '../utils/test-framework.js'
import Api from '../../components/Api.js'
import HttpClient from '../../components/HttpClient.js'
import Config from '../../components/Config.js'

const runner = createTestRunner()

// 模拟 HttpClient
let originalHttpGet = null
let originalHttpPost = null
let originalHttpDelete = null

runner.beforeEach(() => {
  // 保存原始方法
  originalHttpGet = HttpClient.get
  originalHttpPost = HttpClient.post
  originalHttpDelete = HttpClient.delete
})

runner.afterEach(() => {
  // 恢复原始方法
  HttpClient.get = originalHttpGet
  HttpClient.post = originalHttpPost
  HttpClient.delete = originalHttpDelete
})

runner.describe('Api.getBaseUrl() / buildUrl()', () => {
  runner.it('应该正确获取基础 URL', () => {
    const baseUrl = Api.getBaseUrl()
    assert.isString(baseUrl)
    assert.ok(baseUrl.startsWith('http'))
  })

  runner.it('应该正确构建完整 URL', () => {
    const url = Api.buildUrl('/api/accounts')
    assert.isString(url)
    assert.ok(url.includes('/api/accounts'))
  })

  runner.it('应该处理带斜杠的路径', () => {
    const url1 = Api.buildUrl('api/accounts')
    const url2 = Api.buildUrl('/api/accounts')
    assert.ok(url1.includes('/api/accounts'))
    assert.ok(url2.includes('/api/accounts'))
  })

  runner.it('应该避免双斜杠', () => {
    // 设置一个带斜杠结尾的 URL
    const originalGetServerUrl = Config.getServerUrl
    Config.getServerUrl = () => 'http://test.com/'

    const url = Api.buildUrl('/api/accounts')
    assert.notOk(url.includes('//api'))

    Config.getServerUrl = originalGetServerUrl
  })
})

runner.describe('Api.extractData()', () => {
  runner.it('应该正确提取响应数据', () => {
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

  runner.it('应该返回原始数据当没有 success 字段', () => {
    const response = {
      data: { id: 1, name: 'test' }
    }
    const result = Api.extractData(response)
    assert.equal(result.id, 1)
  })

  runner.it('应该处理 null 响应', () => {
    const result = Api.extractData(null)
    assert.equal(result, undefined)
  })
})

runner.describe('Api.getAccounts()', () => {
  runner.it('应该返回账号列表', async () => {
    HttpClient.get = mock(async () => ({
      data: {
        success: true,
        data: [
          { id: 1, name: 'account1' },
          { id: 2, name: 'account2' }
        ]
      }
    }))

    const accounts = await Api.getAccounts()
    assert.isArray(accounts)
    assert.equal(accounts.length, 2)
  })

  runner.it('应该处理嵌套的 accounts 字段', async () => {
    HttpClient.get = mock(async () => ({
      data: {
        success: true,
        data: {
          accounts: [
            { id: 1, name: 'account1' }
          ]
        }
      }
    }))

    const accounts = await Api.getAccounts()
    assert.isArray(accounts)
    assert.equal(accounts[0].id, 1)
  })

  runner.it('应该返回空数组当响应格式异常', async () => {
    HttpClient.get = mock(async () => ({
      data: {
        success: true,
        data: null
      }
    }))

    const accounts = await Api.getAccounts()
    assert.isArray(accounts)
    assert.equal(accounts.length, 0)
  })
})

runner.describe('Api.getAccount()', () => {
  runner.it('应该返回单个账号信息', async () => {
    HttpClient.get = mock(async () => ({
      data: {
        success: true,
        data: { id: 1, name: 'account1' }
      }
    }))

    const account = await Api.getAccount(1)
    assert.equal(account.id, 1)
    assert.equal(account.name, 'account1')
  })
})

runner.describe('Api.addAccount()', () => {
  runner.it('应该添加账号并返回结果', async () => {
    HttpClient.post = mock(async () => ({
      data: {
        success: true,
        data: { id: 1, name: 'new_account' }
      }
    }))

    const account = await Api.addAccount({ name: 'new_account' })
    assert.equal(account.id, 1)
  })
})

runner.describe('Api.deleteAccount()', () => {
  runner.it('应该删除账号', async () => {
    let deleted = false
    HttpClient.delete = mock(async () => {
      deleted = true
      return { data: { success: true } }
    })

    await Api.deleteAccount(1)
    assert.true(deleted)
  })
})

runner.describe('Api.startAccount() / stopAccount()', () => {
  runner.it('应该启动账号', async () => {
    HttpClient.post = mock(async () => ({
      data: {
        success: true,
        data: { isRunning: true }
      }
    }))

    const result = await Api.startAccount(1)
    assert.equal(result.isRunning, true)
  })

  runner.it('应该停止账号', async () => {
    HttpClient.post = mock(async () => ({
      data: {
        success: true,
        data: { isRunning: false }
      }
    }))

    const result = await Api.stopAccount(1)
    assert.equal(result.isRunning, false)
  })
})

runner.describe('Api.getAccountStatus()', () => {
  runner.it('应该返回账号状态', async () => {
    HttpClient.get = mock(async () => ({
      data: {
        success: true,
        data: {
          isRunning: true,
          isConnected: true,
          userState: { level: 10, gold: 1000 }
        }
      }
    }))

    const status = await Api.getAccountStatus(1)
    assert.equal(status.isRunning, true)
    assert.equal(status.userState.level, 10)
  })
})

runner.describe('Api.getAllStatus()', () => {
  runner.it('应该返回所有账号状态', async () => {
    HttpClient.get = mock(async () => ({
      data: {
        success: true,
        data: [
          { id: 1, isRunning: true },
          { id: 2, isRunning: false }
        ]
      }
    }))

    const status = await Api.getAllStatus()
    assert.isArray(status)
    assert.equal(status.length, 2)
  })
})

runner.describe('Api.getStats()', () => {
  runner.it('应该返回统计数据', async () => {
    HttpClient.get = mock(async () => ({
      data: {
        success: true,
        data: {
          totalAccounts: 10,
          runningAccounts: 5,
          totalHarvests: 100
        }
      }
    }))

    const stats = await Api.getStats()
    assert.equal(stats.totalAccounts, 10)
    assert.equal(stats.runningAccounts, 5)
  })
})

runner.describe('Api.startQrLogin()', () => {
  runner.it('应该开始扫码登录', async () => {
    HttpClient.post = mock(async () => ({
      data: {
        success: true,
        data: {
          sessionId: 'test_session_123',
          url: 'http://example.com/qr'
        }
      }
    }))

    const result = await Api.startQrLogin()
    assert.equal(result.sessionId, 'test_session_123')
    assert.equal(result.url, 'http://example.com/qr')
  })
})

runner.describe('Api.getQrLoginUrl()', () => {
  runner.it('应该获取扫码登录 URL', async () => {
    HttpClient.get = mock(async () => ({
      data: {
        success: true,
        data: { url: 'http://example.com/qr/123' }
      }
    }))

    const result = await Api.getQrLoginUrl('session_123')
    assert.equal(result.url, 'http://example.com/qr/123')
  })
})

runner.describe('Api.queryQrStatus()', () => {
  runner.it('应该查询扫码状态', async () => {
    HttpClient.get = mock(async () => ({
      data: {
        success: true,
        data: {
          status: 'confirmed',
          account: { id: 1, name: 'new_account' }
        }
      }
    }))

    const result = await Api.queryQrStatus('session_123')
    assert.equal(result.status, 'confirmed')
    assert.ok(result.account)
  })
})

runner.describe('Api.testConnection()', () => {
  runner.it('应该测试服务器连接', async () => {
    HttpClient.get = mock(async () => ({
      data: { success: true },
      status: 200
    }))

    const result = await Api.testConnection('http://test.server.com')
    assert.equal(result, true)
  })
})

runner.describe('Api.getHealth()', () => {
  runner.it('应该获取服务器健康状态', async () => {
    HttpClient.get = mock(async () => ({
      data: {
        success: true,
        data: { status: 'healthy', version: '1.0.0' }
      }
    }))

    const result = await Api.getHealth()
    assert.equal(result.status, 'healthy')
  })

  runner.it('应该返回 null 当 API 不存在', async () => {
    HttpClient.get = mock(async () => {
      throw new Error('404 Not Found')
    })

    const result = await Api.getHealth()
    assert.equal(result, null)
  })
})

runner.describe('Api.getLands()', () => {
  runner.it('应该获取土地详情', async () => {
    HttpClient.get = mock(async () => ({
      data: {
        success: true,
        data: [
          { id: 1, unlocked: true, plant: { name: '苹果', phase: 5 } },
          { id: 2, unlocked: false }
        ]
      }
    }))

    const lands = await Api.getLands(1)
    assert.isArray(lands)
    assert.equal(lands.length, 2)
  })
})

runner.describe('Api.getAccountLogs()', () => {
  runner.it('应该获取账号日志', async () => {
    HttpClient.get = mock(async () => ({
      data: {
        success: true,
        data: [
          { time: '2024-01-01 10:00:00', tag: '农场', message: '收获苹果' },
          { time: '2024-01-01 10:05:00', tag: '好友', message: '帮助好友' }
        ]
      }
    }))

    const logs = await Api.getAccountLogs(1, 10)
    assert.isArray(logs)
    assert.equal(logs.length, 2)
  })

  runner.it('应该返回空数组当 API 不存在', async () => {
    HttpClient.get = mock(async () => {
      throw new Error('404 Not Found')
    })

    const logs = await Api.getAccountLogs(1)
    assert.isArray(logs)
    assert.equal(logs.length, 0)
  })
})

runner.describe('Api.executeAction()', () => {
  runner.it('应该执行操作', async () => {
    HttpClient.post = mock(async () => ({
      data: {
        success: true,
        data: { message: '操作成功' }
      }
    }))

    const result = await Api.executeAction(1, 'checkFarm')
    assert.equal(result.message, '操作成功')
  })
})

// 运行测试
export default async function runTests() {
  return await runner.run()
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().then(stats => {
    process.exit(stats.failed > 0 ? 1 : 0)
  })
}
