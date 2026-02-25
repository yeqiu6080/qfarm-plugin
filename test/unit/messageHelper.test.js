/**
 * MessageHelper 组件单元测试
 * 测试消息发送辅助功能
 */

import { createTestRunner, assert, mock, delay } from '../utils/test-framework.js'
import MessageHelper from '../../components/MessageHelper.js'

const runner = createTestRunner()

// 创建模拟事件对象
function createMockEvent(options = {}) {
  const replies = []
  const recalls = []

  return {
    user_id: '123456',
    group_id: options.isGroup ? '789012' : undefined,
    group: options.isGroup ? {
      recallMsg: mock(async (msgId) => {
        recalls.push(msgId)
        return true
      })
    } : undefined,
    friend: !options.isGroup ? {
      recallMsg: mock(async (msgId) => {
        recalls.push(msgId)
        return true
      })
    } : undefined,
    reply: mock(async (msg) => {
      replies.push(msg)
      return { message_id: `msg_${Date.now()}_${replies.length}` }
    }),
    replies,
    recalls
  }
}

runner.describe('MessageHelper.reply()', () => {
  runner.it('应该发送消息并返回结果', async () => {
    const e = createMockEvent({ isGroup: true })

    const result = await MessageHelper.reply(e, '测试消息')

    assert.ok(result)
    assert.equal(e.replies.length, 1)
    assert.equal(e.replies[0], '测试消息')
  })

  runner.it('应该处理数组消息', async () => {
    const e = createMockEvent({ isGroup: true })

    await MessageHelper.reply(e, ['消息1', '消息2'])

    assert.equal(e.replies.length, 1)
    assert.isArray(e.replies[0])
  })

  runner.it('应该返回 null 当事件对象无效', async () => {
    const result = await MessageHelper.reply(null, '测试消息')
    assert.equal(result, null)

    const result2 = await MessageHelper.reply({}, '测试消息')
    assert.equal(result2, null)
  })

  runner.it('应该自动撤回群聊消息', async () => {
    const e = createMockEvent({ isGroup: true })

    await MessageHelper.reply(e, '测试消息', { recallTime: 0.1 })

    // 等待撤回
    await delay(200)

    assert.equal(e.recalls.length, 1)
  })

  runner.it('不应该撤回私聊消息', async () => {
    const e = createMockEvent({ isGroup: false })

    await MessageHelper.reply(e, '测试消息', { recallTime: 0.1 })

    // 等待
    await delay(200)

    assert.equal(e.recalls.length, 0)
  })

  runner.it('不应该撤回当 recallTime 为 0', async () => {
    const e = createMockEvent({ isGroup: true })

    await MessageHelper.reply(e, '测试消息', { recallTime: 0 })

    // 等待
    await delay(200)

    assert.equal(e.recalls.length, 0)
  })
})

runner.describe('MessageHelper.tempReply()', () => {
  runner.it('应该发送临时消息（10秒后撤回）', async () => {
    const e = createMockEvent({ isGroup: true })

    await MessageHelper.tempReply(e, '临时消息')

    assert.equal(e.replies.length, 1)
    assert.equal(e.replies[0], '临时消息')
  })
})

runner.describe('MessageHelper.normalReply()', () => {
  runner.it('应该发送普通消息（30秒后撤回）', async () => {
    const e = createMockEvent({ isGroup: true })

    await MessageHelper.normalReply(e, '普通消息')

    assert.equal(e.replies.length, 1)
    assert.equal(e.replies[0], '普通消息')
  })
})

runner.describe('MessageHelper.importantReply()', () => {
  runner.it('应该发送重要消息（不撤回）', async () => {
    const e = createMockEvent({ isGroup: true })

    await MessageHelper.importantReply(e, '重要消息')

    // 等待
    await delay(200)

    assert.equal(e.replies.length, 1)
    assert.equal(e.recalls.length, 0)
  })
})

runner.describe('MessageHelper.recallMessage()', () => {
  runner.it('应该通过群对象撤回消息', async () => {
    const e = createMockEvent({ isGroup: true })

    const result = await MessageHelper.recallMessage(e, { message_id: '12345' })

    assert.equal(result, true)
    assert.equal(e.recalls.length, 1)
    assert.equal(e.recalls[0], '12345')
  })

  runner.it('应该通过好友对象撤回消息', async () => {
    const e = createMockEvent({ isGroup: false })

    const result = await MessageHelper.recallMessage(e, { message_id: '67890' })

    assert.equal(result, true)
    assert.equal(e.recalls.length, 1)
  })

  runner.it('应该返回 false 当没有消息ID', async () => {
    const e = createMockEvent({ isGroup: true })

    const result = await MessageHelper.recallMessage(e, null)
    assert.equal(result, false)

    const result2 = await MessageHelper.recallMessage(e, {})
    assert.equal(result2, false)
  })
})

runner.describe('MessageHelper.batchReply()', () => {
  runner.it('应该批量发送消息', async () => {
    const e = createMockEvent({ isGroup: true })

    const messages = ['消息1', '消息2', '消息3']
    const results = await MessageHelper.batchReply(e, messages, { interval: 50 })

    assert.equal(results.length, 3)
    assert.equal(e.replies.length, 3)
  })

  runner.it('应该遵守发送间隔', async () => {
    const e = createMockEvent({ isGroup: true })

    const startTime = Date.now()
    await MessageHelper.batchReply(e, ['消息1', '消息2'], { interval: 100 })
    const endTime = Date.now()

    // 至少等待了 100ms
    assert.ok(endTime - startTime >= 100)
  })
})

runner.describe('MessageHelper.forwardReply()', () => {
  runner.it('应该发送转发消息', async () => {
    // 模拟 Bot.makeForwardMsg
    global.Bot = {
      uin: '123456',
      nickname: '测试Bot',
      makeForwardMsg: mock((nodes) => ({ type: 'forward', nodes }))
    }

    const e = createMockEvent({ isGroup: true })

    const result = await MessageHelper.forwardReply(e, ['消息1', '消息2'])

    assert.ok(result)
    assert.equal(e.replies.length, 1)
  })

  runner.it('应该返回 null 当消息为空', async () => {
    const e = createMockEvent({ isGroup: true })

    const result = await MessageHelper.forwardReply(e, [])
    assert.equal(result, null)

    const result2 = await MessageHelper.forwardReply(e, null)
    assert.equal(result2, null)
  })
})

runner.describe('MessageHelper.sleep()', () => {
  runner.it('应该延迟指定时间', async () => {
    const startTime = Date.now()
    await MessageHelper.sleep(100)
    const endTime = Date.now()

    assert.ok(endTime - startTime >= 100)
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
