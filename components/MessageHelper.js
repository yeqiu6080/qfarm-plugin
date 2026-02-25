/**
 * 消息发送辅助工具
 * 提供带自动撤回功能的消息发送方法，避免刷屏影响群聊
 */

export default class MessageHelper {
    /**
     * 默认撤回时间（秒）
     * 0 表示不撤回
     */
    static DEFAULT_RECALL_TIME = 30

    /**
     * 发送带撤回的消息
     * @param {object} e - 事件对象
     * @param {string|array} msg - 消息内容
     * @param {object} options - 选项
     * @param {number} options.recallTime - 撤回时间（秒），默认30秒，0表示不撤回
     * @param {boolean} options.isGroup - 是否是群聊消息（自动检测）
     * @returns {Promise<object|null>} 消息发送结果
     */
    static async reply(e, msg, options = {}) {
        if (!e || !e.reply) {
            logger.error('[MessageHelper] 无效的事件对象')
            return null
        }

        const recallTime = options.recallTime ?? this.DEFAULT_RECALL_TIME
        const isGroup = options.isGroup ?? !!e.group

        try {
            // 发送消息
            const result = await e.reply(msg)

            // 如果是群聊且设置了撤回时间，则自动撤回
            if (isGroup && recallTime > 0 && result) {
                setTimeout(async () => {
                    try {
                        await this.recallMessage(e, result)
                    } catch (err) {
                        logger.debug('[MessageHelper] 撤回消息失败:', err.message)
                    }
                }, recallTime * 1000)
            }

            return result
        } catch (error) {
            logger.error('[MessageHelper] 发送消息失败:', error)
            return null
        }
    }

    /**
     * 发送临时提示消息（10秒后自动撤回）
     * 适用于短暂提示，如"正在处理..."
     * @param {object} e - 事件对象
     * @param {string|array} msg - 消息内容
     * @returns {Promise<object|null>}
     */
    static async tempReply(e, msg) {
        return this.reply(e, msg, { recallTime: 10 })
    }

    /**
     * 发送普通回复消息（30秒后自动撤回）
     * 适用于一般性的命令回复
     * @param {object} e - 事件对象
     * @param {string|array} msg - 消息内容
     * @returns {Promise<object|null>}
     */
    static async normalReply(e, msg) {
        return this.reply(e, msg, { recallTime: 30 })
    }

    /**
     * 发送重要消息（不撤回）
     * 适用于重要通知，如登录链接等
     * @param {object} e - 事件对象
     * @param {string|array} msg - 消息内容
     * @returns {Promise<object|null>}
     */
    static async importantReply(e, msg) {
        return this.reply(e, msg, { recallTime: 0 })
    }

    /**
     * 撤回消息
     * @param {object} e - 事件对象
     * @param {object} messageResult - 消息发送返回结果
     * @returns {Promise<boolean>}
     */
    static async recallMessage(e, messageResult) {
        if (!messageResult) return false

        try {
            // 获取消息ID
            const messageId = messageResult.message_id || messageResult.data?.message_id
            if (!messageId) return false

            // 尝试通过群对象撤回
            if (e.group) {
                await e.group.recallMsg(messageId)
                return true
            }

            // 尝试通过好友对象撤回
            if (e.friend) {
                await e.friend.recallMsg(messageId)
                return true
            }

            // 尝试通过 Bot 撤回
            if (e.bot && e.bot.recallMsg) {
                await e.bot.recallMsg(messageId)
                return true
            }

            return false
        } catch (error) {
            logger.debug('[MessageHelper] 撤回消息失败:', error.message)
            return false
        }
    }

    /**
     * 批量发送消息（带频率控制）
     * 适用于需要发送多条消息的场景，避免刷屏
     * @param {object} e - 事件对象
     * @param {array} messages - 消息内容数组
     * @param {object} options - 选项
     * @param {number} options.interval - 发送间隔（毫秒），默认1000ms
     * @param {number} options.recallTime - 撤回时间（秒）
     * @returns {Promise<array>} 发送结果数组
     */
    static async batchReply(e, messages, options = {}) {
        const interval = options.interval || 1000
        const recallTime = options.recallTime ?? this.DEFAULT_RECALL_TIME
        const results = []

        for (let i = 0; i < messages.length; i++) {
            const result = await this.reply(e, messages[i], { recallTime })
            results.push(result)

            // 不是最后一条，等待间隔
            if (i < messages.length - 1) {
                await this.sleep(interval)
            }
        }

        return results
    }

    /**
     * 发送合并转发消息（不撤回，避免影响阅读）
     * @param {object} e - 事件对象
     * @param {array} messages - 消息节点数组
     * @param {string} title - 转发标题
     * @returns {Promise<object|null>}
     */
    static async forwardReply(e, messages, title = '聊天记录') {
        if (!e || !messages || messages.length === 0) return null

        try {
            const forwardMsg = Bot.makeForwardMsg(messages.map((msg, index) => ({
                user_id: Bot.uin,
                nickname: Bot.nickname || 'Bot',
                message: msg
            })))

            return await e.reply(forwardMsg)
        } catch (error) {
            logger.error('[MessageHelper] 发送转发消息失败:', error)
            return null
        }
    }

    /**
     * 延迟函数
     * @param {number} ms - 毫秒
     * @returns {Promise<void>}
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}
