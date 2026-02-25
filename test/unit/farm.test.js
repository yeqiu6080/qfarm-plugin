/**
 * Farm 模型单元测试
 * 测试农场账号管理功能
 */

import { createTestRunner, assert, mock } from '../utils/test-framework.js'
import Farm from '../../model/Farm.js'
import Api from '../../components/Api.js'
import Config from '../../components/Config.js'

const runner = createTestRunner()

// 保存原始方法
let originalApiGetAccounts = null
let originalApiAddAccount = null
let originalApiDeleteAccount = null
let originalApiStartAccount = null
let originalApiStopAccount = null
let originalApiGetAccountStatus = null
let originalConfigSetUserAutoAccount = null
let originalConfigDeleteUserAutoAccount = null
let originalConfigGetUserAutoAccount = null

runner.beforeEach(() => {
  // 保存原始方法
  originalApiGetAccounts = Api.getAccounts
  originalApiAddAccount = Api.addAccount
  originalApiDeleteAccount = Api.deleteAccount
  originalApiStartAccount = Api.startAccount
  originalApiStopAccount = Api.stopAccount
  originalApiGetAccountStatus = Api.getAccountStatus
  originalConfigSetUserAutoAccount = Config.setUserAutoAccount
  originalConfigDeleteUserAutoAccount = Config.deleteUserAutoAccount
  originalConfigGetUserAutoAccount = Config.getUserAutoAccount
})

runner.afterEach(() => {
  // 恢复原始方法
  Api.getAccounts = originalApiGetAccounts
  Api.addAccount = originalApiAddAccount
  Api.deleteAccount = originalApiDeleteAccount
  Api.startAccount = originalApiStartAccount
  Api.stopAccount = originalApiStopAccount
  Api.getAccountStatus = originalApiGetAccountStatus
  Config.setUserAutoAccount = originalConfigSetUserAutoAccount
  Config.deleteUserAutoAccount = originalConfigDeleteUserAutoAccount
  Config.getUserAutoAccount = originalConfigGetUserAutoAccount
})

runner.describe('Farm.getUserKey()', () => {
  runner.it('应该生成正确的用户标识', () => {
    const key = Farm.getUserKey('123456')
    assert.equal(key, 'qq_123456')
  })

  runner.it('应该处理不同格式的用户ID', () => {
    assert.equal(Farm.getUserKey('abc'), 'qq_abc')
    assert.equal(Farm.getUserKey('123abc'), 'qq_123abc')
  })
})

runner.describe('Farm.getUserAccount()', () => {
  runner.it('应该通过固定格式找到账号', async () => {
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123456', userId: '123456' },
      { id: 2, name: 'other_account', userId: '999999' }
    ])

    const account = await Farm.getUserAccount('123456')

    assert.ok(account)
    assert.equal(account.id, 1)
    assert.equal(account.name, 'user_123456')
  })

  runner.it('应该通过 userId 找到账号', async () => {
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'some_name', userId: '123456' },
      { id: 2, name: 'other_account', userId: '999999' }
    ])

    const account = await Farm.getUserAccount('123456')

    assert.ok(account)
    assert.equal(account.id, 1)
  })

  runner.it('应该返回 undefined 当账号不存在', async () => {
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'other_account', userId: '999999' }
    ])

    const account = await Farm.getUserAccount('123456')

    assert.equal(account, undefined)
  })

  runner.it('应该优先匹配固定格式', async () => {
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123456', userId: 'other' },
      { id: 2, name: 'other_name', userId: '123456' }
    ])

    const account = await Farm.getUserAccount('123456')

    assert.ok(account)
    assert.equal(account.id, 1)
  })
})

runner.describe('Farm.hasUserAccount()', () => {
  runner.it('应该返回 true 当用户有账号', async () => {
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123456', userId: '123456' }
    ])

    const hasAccount = await Farm.hasUserAccount('123456')

    assert.equal(hasAccount, true)
  })

  runner.it('应该返回 false 当用户没有账号', async () => {
    Api.getAccounts = mock(async () => [])

    const hasAccount = await Farm.hasUserAccount('123456')

    assert.equal(hasAccount, false)
  })
})

runner.describe('Farm.createAccount()', () => {
  runner.it('应该创建账号并返回结果', async () => {
    Api.addAccount = mock(async (account) => ({
      id: 1,
      name: account.name,
      platform: account.platform
    }))

    const account = await Farm.createAccount('123456', 'login_code_abc')

    assert.ok(account)
    assert.equal(account.id, 1)
    assert.equal(account.name, 'user_123456')
  })

  runner.it('应该传递正确的参数', async () => {
    let capturedArgs = null
    Api.addAccount = mock(async (account) => {
      capturedArgs = account
      return { id: 1 }
    })

    await Farm.createAccount('123456', 'login_code_xyz')

    assert.equal(capturedArgs.name, 'user_123456')
    assert.equal(capturedArgs.code, 'login_code_xyz')
    assert.equal(capturedArgs.platform, 'qq')
    assert.equal(capturedArgs.userId, '123456')
    assert.equal(capturedArgs.config.enableSteal, true)
    assert.equal(capturedArgs.config.enableFriendHelp, true)
  })
})

runner.describe('Farm.deleteUserAccount()', () => {
  runner.it('应该删除用户账号', async () => {
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123456', userId: '123456' }
    ])
    Api.stopAccount = mock(async () => ({}))
    Api.deleteAccount = mock(async () => ({}))
    Config.deleteUserAutoAccount = mock(() => {})

    const result = await Farm.deleteUserAccount('123456')

    assert.equal(result, true)
  })

  runner.it('应该返回 false 当用户没有账号', async () => {
    Api.getAccounts = mock(async () => [])

    const result = await Farm.deleteUserAccount('123456')

    assert.equal(result, false)
  })

  runner.it('应该删除所有匹配的账号', async () => {
    let deletedIds = []
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123456', userId: '123456' },
      { id: 2, name: 'old_format', userId: '123456' }
    ])
    Api.stopAccount = mock(async () => ({}))
    Api.deleteAccount = mock(async (id) => {
      deletedIds.push(id)
      return {}
    })
    Config.deleteUserAutoAccount = mock(() => {})

    await Farm.deleteUserAccount('123456')

    assert.equal(deletedIds.length, 2)
    assert.ok(deletedIds.includes(1))
    assert.ok(deletedIds.includes(2))
  })
})

runner.describe('Farm.startUserAccount()', () => {
  runner.it('应该启动用户账号', async () => {
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123456', userId: '123456' }
    ])
    Api.getAccountStatus = mock(async () => ({
      isRunning: false
    }))
    Api.startAccount = mock(async () => ({
      isRunning: true
    }))
    Config.setUserAutoAccount = mock(() => {})

    const account = await Farm.startUserAccount('123456')

    assert.ok(account)
    assert.equal(account.id, 1)
  })

  runner.it('不应该重复启动已运行的账号', async () => {
    let startCalled = false
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123456', userId: '123456' }
    ])
    Api.getAccountStatus = mock(async () => ({
      isRunning: true
    }))
    Api.startAccount = mock(async () => {
      startCalled = true
      return {}
    })
    Config.setUserAutoAccount = mock(() => {})

    await Farm.startUserAccount('123456')

    assert.equal(startCalled, false)
  })

  runner.it('应该返回 null 当用户没有账号', async () => {
    Api.getAccounts = mock(async () => [])

    const account = await Farm.startUserAccount('123456')

    assert.equal(account, null)
  })

  runner.it('应该处理 404 错误并尝试启动', async () => {
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123456', userId: '123456' }
    ])
    Api.getAccountStatus = mock(async () => {
      throw new Error('HTTP 404: Not Found')
    })
    Api.startAccount = mock(async () => ({
      isRunning: true
    }))
    Config.setUserAutoAccount = mock(() => {})

    const account = await Farm.startUserAccount('123456')

    assert.ok(account)
  })

  runner.it('应该在 500 错误时抛出过期提示', async () => {
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123456', userId: '123456' }
    ])
    Api.getAccountStatus = mock(async () => {
      throw new Error('HTTP 500: Internal Server Error')
    })

    try {
      await Farm.startUserAccount('123456')
      assert.equal(true, false, '应该抛出错误')
    } catch (error) {
      assert.ok(error.message.includes('登录码可能已过期'))
    }
  })
})

runner.describe('Farm.stopUserAccount()', () => {
  runner.it('应该停止用户账号', async () => {
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123456', userId: '123456' }
    ])
    Api.getAccountStatus = mock(async () => ({
      isRunning: true
    }))
    Api.stopAccount = mock(async () => ({
      isRunning: false
    }))
    Config.deleteUserAutoAccount = mock(() => {})

    const account = await Farm.stopUserAccount('123456')

    assert.ok(account)
    assert.equal(account.id, 1)
  })

  runner.it('不应该重复停止已停止的账号', async () => {
    let stopCalled = false
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123456', userId: '123456' }
    ])
    Api.getAccountStatus = mock(async () => ({
      isRunning: false
    }))
    Api.stopAccount = mock(async () => {
      stopCalled = true
      return {}
    })
    Config.deleteUserAutoAccount = mock(() => {})

    await Farm.stopUserAccount('123456')

    assert.equal(stopCalled, false)
  })

  runner.it('应该返回 null 当用户没有账号', async () => {
    Api.getAccounts = mock(async () => [])

    const account = await Farm.stopUserAccount('123456')

    assert.equal(account, null)
  })

  runner.it('应该处理 404 错误', async () => {
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123456', userId: '123456' }
    ])
    Api.getAccountStatus = mock(async () => {
      throw new Error('HTTP 404: Not Found')
    })
    Config.deleteUserAutoAccount = mock(() => {})

    const account = await Farm.stopUserAccount('123456')

    assert.ok(account)
  })
})

runner.describe('Farm.getUserAccountStatus()', () => {
  runner.it('应该返回账号状态', async () => {
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123456', userId: '123456' }
    ])
    Api.getAccountStatus = mock(async () => ({
      isRunning: true,
      isConnected: true,
      userState: { level: 10, gold: 1000 },
      stats: { harvests: 100 }
    }))

    const status = await Farm.getUserAccountStatus('123456')

    assert.ok(status)
    assert.equal(status.isRunning, true)
    assert.equal(status.userState.level, 10)
  })

  runner.it('应该返回 null 当用户没有账号', async () => {
    Api.getAccounts = mock(async () => [])

    const status = await Farm.getUserAccountStatus('123456')

    assert.equal(status, null)
  })

  runner.it('应该在 404 时返回默认状态', async () => {
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123456', userId: '123456' }
    ])
    Api.getAccountStatus = mock(async () => {
      throw new Error('HTTP 404: Not Found')
    })

    const status = await Farm.getUserAccountStatus('123456')

    assert.ok(status)
    assert.equal(status.isRunning, false)
    assert.equal(status.isConnected, false)
  })
})

runner.describe('Farm.isUserAutoEnabled()', () => {
  runner.it('应该返回 true 当用户自动挂机已启用', async () => {
    Config.getUserAutoAccount = mock(() => 'account_1')
    Api.getAccounts = mock(async () => [
      { id: 'account_1', name: 'user_123456', userId: '123456' }
    ])

    const isEnabled = await Farm.isUserAutoEnabled('123456')

    assert.equal(isEnabled, true)
  })

  runner.it('应该返回 false 当用户没有设置自动挂机', async () => {
    Config.getUserAutoAccount = mock(() => null)

    const isEnabled = await Farm.isUserAutoEnabled('123456')

    assert.equal(isEnabled, false)
  })

  runner.it('应该返回 false 当账号ID不匹配', async () => {
    Config.getUserAutoAccount = mock(() => 'old_account_id')
    Api.getAccounts = mock(async () => [
      { id: 'new_account_id', name: 'user_123456', userId: '123456' }
    ])

    const isEnabled = await Farm.isUserAutoEnabled('123456')

    assert.equal(isEnabled, false)
  })
})

runner.describe('Farm.getAllAccounts()', () => {
  runner.it('应该返回所有账号列表', async () => {
    Api.getAccounts = mock(async () => [
      { id: 1, name: 'user_123', userId: '123', createdAt: '2024-01-01', isRunning: true },
      { id: 2, name: 'user_456', userId: '456', createdAt: '2024-01-02', isRunning: false },
      { id: 3, name: 'no_user_id', createdAt: '2024-01-03' }
    ])

    const accounts = await Farm.getAllAccounts()

    assert.isArray(accounts)
    assert.equal(accounts.length, 2)
    assert.ok(accounts.every(acc => acc.userId))
  })

  runner.it('应该返回空数组当 API 失败', async () => {
    Api.getAccounts = mock(async () => {
      throw new Error('API Error')
    })

    const accounts = await Farm.getAllAccounts()

    assert.isArray(accounts)
    assert.equal(accounts.length, 0)
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
