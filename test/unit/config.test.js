/**
 * Config 组件单元测试
 * 测试配置管理功能
 */

import { createTestRunner, assert, mock } from '../utils/test-framework.js'
import Config from '../../components/Config.js'
import fs from 'fs'
import path from 'path'

const runner = createTestRunner()

// 测试配置
const testConfigPath = path.join(process.cwd(), 'plugins', 'qfarm-plugin', 'config', 'test_config.json')
const originalConfigPath = path.join(process.cwd(), 'plugins', 'qfarm-plugin', 'config', 'config.json')

// 备份原始配置
let originalConfig = null

runner.beforeEach(() => {
  // 备份原始配置
  if (fs.existsSync(originalConfigPath)) {
    originalConfig = fs.readFileSync(originalConfigPath, 'utf8')
  }
})

runner.afterEach(() => {
  // 恢复原始配置
  if (originalConfig) {
    fs.writeFileSync(originalConfigPath, originalConfig)
  }
  // 清理测试配置
  if (fs.existsSync(testConfigPath)) {
    fs.unlinkSync(testConfigPath)
  }
})

runner.describe('Config.load() - 配置加载', () => {
  runner.it('应该返回默认配置当配置文件不存在时', () => {
    // 临时删除配置文件
    if (fs.existsSync(originalConfigPath)) {
      fs.unlinkSync(originalConfigPath)
    }

    const config = Config.load()

    assert.hasProperty(config, 'serverUrl')
    assert.hasProperty(config, 'userAutoAccounts')
    assert.hasProperty(config, 'auto')
    assert.hasProperty(config, 'offlineNotify')
    assert.equal(config.serverUrl, 'http://127.0.0.1:3456')
  })

  runner.it('应该正确读取现有配置文件', () => {
    const testData = {
      serverUrl: 'http://test.server.com:8080',
      userAutoAccounts: { '123456': 'account_1' }
    }
    fs.writeFileSync(originalConfigPath, JSON.stringify(testData, null, 2))

    const config = Config.load()

    assert.equal(config.serverUrl, 'http://test.server.com:8080')
    assert.equal(config.userAutoAccounts['123456'], 'account_1')
  })

  runner.it('应该合并默认配置和保存的配置', () => {
    const partialConfig = {
      serverUrl: 'http://custom.server.com'
    }
    fs.writeFileSync(originalConfigPath, JSON.stringify(partialConfig))

    const config = Config.load()

    assert.equal(config.serverUrl, 'http://custom.server.com')
    // 应该保留默认配置中的其他字段
    assert.hasProperty(config, 'userAutoAccounts')
    assert.hasProperty(config, 'auto')
  })
})

runner.describe('Config.save() - 配置保存', () => {
  runner.it('应该正确保存配置到文件', () => {
    const testConfig = {
      serverUrl: 'http://saved.server.com',
      userAutoAccounts: { '789': 'acc_789' }
    }

    Config.save(testConfig)

    const saved = JSON.parse(fs.readFileSync(originalConfigPath, 'utf8'))
    assert.equal(saved.serverUrl, 'http://saved.server.com')
    assert.equal(saved.userAutoAccounts['789'], 'acc_789')
  })
})

runner.describe('Config.getServerUrl() / setServerUrl()', () => {
  runner.it('应该正确获取服务器地址', () => {
    const url = Config.getServerUrl()
    assert.isString(url)
    assert.ok(url.startsWith('http'))
  })

  runner.it('应该正确设置服务器地址', () => {
    const newUrl = 'http://new.server.com:9999'
    Config.setServerUrl(newUrl)

    const saved = Config.getServerUrl()
    assert.equal(saved, newUrl)
  })
})

runner.describe('Config.getUserAutoAccount() / setUserAutoAccount() / deleteUserAutoAccount()', () => {
  runner.it('应该返回 undefined 当用户没有自动挂机账号', () => {
    const account = Config.getUserAutoAccount('nonexistent_user')
    assert.equal(account, undefined)
  })

  runner.it('应该正确设置用户自动挂机账号', () => {
    Config.setUserAutoAccount('user_123', 'account_abc')

    const account = Config.getUserAutoAccount('user_123')
    assert.equal(account, 'account_abc')
  })

  runner.it('应该正确删除用户自动挂机账号', () => {
    Config.setUserAutoAccount('user_456', 'account_def')
    assert.equal(Config.getUserAutoAccount('user_456'), 'account_def')

    Config.deleteUserAutoAccount('user_456')
    assert.equal(Config.getUserAutoAccount('user_456'), undefined)
  })
})

runner.describe('Config.getAutoConfig() / setAutoConfig()', () => {
  runner.it('应该返回自动挂机配置', () => {
    const autoConfig = Config.getAutoConfig()
    assert.isObject(autoConfig)
    assert.hasProperty(autoConfig, 'enabled')
  })

  runner.it('应该正确更新自动挂机配置', () => {
    Config.setAutoConfig({ enabled: false })

    const config = Config.getAutoConfig()
    assert.equal(config.enabled, false)
  })
})

runner.describe('Config.getOfflineNotifyConfig()', () => {
  runner.it('应该返回掉线推送配置', () => {
    const notifyConfig = Config.getOfflineNotifyConfig()
    assert.isObject(notifyConfig)
    assert.hasProperty(notifyConfig, 'enabled')
    assert.hasProperty(notifyConfig, 'userGroups')
    assert.hasProperty(notifyConfig, 'cooldown')
  })
})

runner.describe('Config.addUserNotifyGroup() / removeUserNotifyGroup() / isUserNotifyEnabled()', () => {
  runner.it('应该正确添加用户推送群', () => {
    Config.addUserNotifyGroup('user_1', 'group_100')

    const groups = Config.getUserNotifyGroups('user_1')
    assert.includes(groups, 'group_100')
  })

  runner.it('应该正确检查用户是否开启推送', () => {
    Config.addUserNotifyGroup('user_2', 'group_200')

    assert.true(Config.isUserNotifyEnabled('user_2', 'group_200'))
    assert.false(Config.isUserNotifyEnabled('user_2', 'group_999'))
  })

  runner.it('应该正确移除用户推送群', () => {
    Config.addUserNotifyGroup('user_3', 'group_300')
    assert.true(Config.isUserNotifyEnabled('user_3', 'group_300'))

    Config.removeUserNotifyGroup('user_3', 'group_300')
    assert.false(Config.isUserNotifyEnabled('user_3', 'group_300'))
  })

  runner.it('不应该重复添加相同的群', () => {
    Config.addUserNotifyGroup('user_4', 'group_400')
    Config.addUserNotifyGroup('user_4', 'group_400')

    const groups = Config.getUserNotifyGroups('user_4')
    assert.equal(groups.filter(g => g === 'group_400').length, 1)
  })
})

runner.describe('Config.banUser() / unbanUser() / isUserBanned()', () => {
  runner.it('应该正确禁止用户', () => {
    Config.banUser('banned_user_1')

    assert.true(Config.isUserBanned('banned_user_1'))
  })

  runner.it('应该正确解除用户禁止', () => {
    Config.banUser('banned_user_2')
    assert.true(Config.isUserBanned('banned_user_2'))

    Config.unbanUser('banned_user_2')
    assert.false(Config.isUserBanned('banned_user_2'))
  })

  runner.it('应该返回 false 当禁止不存在的用户', () => {
    const result = Config.banUser('already_banned')
    assert.true(result)

    const result2 = Config.banUser('already_banned')
    assert.false(result2)
  })

  runner.it('应该返回 false 当解禁不存在的用户', () => {
    const result = Config.unbanUser('never_banned')
    assert.false(result)
  })
})

runner.describe('Config.allowGroup() / disallowGroup() / isGroupAllowed()', () => {
  runner.it('应该允许所有群当白名单为空时', () => {
    // 确保白名单为空
    const config = Config.load()
    config.allowedGroups = []
    Config.save(config)

    assert.true(Config.isGroupAllowed('any_group'))
  })

  runner.it('应该正确添加允许群', () => {
    Config.allowGroup('group_1000')

    assert.true(Config.isGroupAllowed('group_1000'))
    assert.false(Config.isGroupAllowed('group_9999'))
  })

  runner.it('应该正确移除允许群', () => {
    Config.allowGroup('group_2000')
    assert.true(Config.isGroupAllowed('group_2000'))

    Config.disallowGroup('group_2000')
    // 移除后应该回到白名单为空状态，允许所有群
    assert.true(Config.isGroupAllowed('group_2000'))
  })

  runner.it('不应该重复添加相同的群', () => {
    Config.allowGroup('group_3000')
    const result = Config.allowGroup('group_3000')
    assert.false(result)
  })
})

runner.describe('Config.getBannedUsers() / getAllowedGroups()', () => {
  runner.it('应该返回被禁止用户列表', () => {
    Config.banUser('test_ban_1')
    Config.banUser('test_ban_2')

    const banned = Config.getBannedUsers()
    assert.isArray(banned)
    assert.true(banned.includes('test_ban_1'))
    assert.true(banned.includes('test_ban_2'))
  })

  runner.it('应该返回允许群列表', () => {
    Config.allowGroup('test_group_1')
    Config.allowGroup('test_group_2')

    const allowed = Config.getAllowedGroups()
    assert.isArray(allowed)
    assert.true(allowed.includes('test_group_1'))
    assert.true(allowed.includes('test_group_2'))
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
