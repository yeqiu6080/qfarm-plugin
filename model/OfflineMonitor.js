import { Config, Api } from '../components/index.js'
import { Farm } from './index.js'

export default class OfflineMonitor {
    constructor() {
        this.checkInterval = null
        this.lastNotifyTime = {} // 记录每个用户上次推送时间: { userId: timestamp }
        this.accountStatusCache = {} // 缓存账号状态: { accountId: { isConnected, lastCheck } }
    }

    // 启动监控
    start() {
        if (this.checkInterval) {
            logger.info('[QQ农场] 掉线推送监控已在运行')
            return
        }

        logger.info('[QQ农场] 启动掉线推送监控')
        // 每30秒检查一次状态
        this.checkInterval = setInterval(() => {
            this.checkAllAccounts()
        }, 30000)
    }

    // 停止监控
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval)
            this.checkInterval = null
            logger.info('[QQ农场] 停止掉线推送监控')
        }
    }

    // 检查所有账号状态
    async checkAllAccounts() {
        try {
            const notifyConfig = Config.getOfflineNotifyConfig()
            if (!notifyConfig.enabled) return

            // 获取所有需要监控的用户（开启了推送的用户）
            const userGroups = notifyConfig.userGroups || {}
            const userIds = Object.keys(userGroups).filter(userId => {
                const groups = userGroups[userId]
                return Array.isArray(groups) && groups.length > 0
            })

            if (userIds.length === 0) return

            // 批量检查账号状态
            for (const userId of userIds) {
                await this.checkUserAccount(userId)
            }
        } catch (error) {
            logger.error('[QQ农场] 检查账号状态失败:', error)
        }
    }

    // 检查单个用户账号状态
    async checkUserAccount(userId) {
        try {
            const account = await Farm.getUserAccount(userId)
            if (!account) return

            const status = await Farm.getUserAccountStatus(userId)
            if (!status) return

            const accountId = account.id
            const prevStatus = this.accountStatusCache[accountId]

            // 更新缓存
            this.accountStatusCache[accountId] = {
                isConnected: status.isConnected,
                isRunning: status.isRunning,
                lastCheck: Date.now()
            }

            // 判断是否需要推送：之前是连接状态，现在断开
            if (prevStatus?.isConnected === true && status.isConnected === false) {
                await this.sendOfflineNotify(userId, status)
            }
        } catch (error) {
            logger.error(`[QQ农场] 检查用户 ${userId} 账号状态失败:`, error)
        }
    }

    // 发送掉线推送
    async sendOfflineNotify(userId, status) {
        try {
            const notifyConfig = Config.getOfflineNotifyConfig()
            const cooldown = notifyConfig.cooldown || 300

            // 检查冷却时间
            const lastNotify = this.lastNotifyTime[userId] || 0
            const now = Date.now()
            if (now - lastNotify < cooldown * 1000) {
                logger.debug(`[QQ农场] 用户 ${userId} 掉线推送冷却中，跳过`)
                return
            }

            // 获取用户开启推送的群列表
            const groupIds = Config.getUserNotifyGroups(userId)
            if (!groupIds || groupIds.length === 0) return

            // 构建推送消息
            const reason = status.disconnectedReason || '连接断开'
            const msg = [
                segment.at(userId),
                '\n⚠️ QQ农场掉线提醒\n',
                `原因: ${reason}\n`,
                `时间: ${new Date().toLocaleString()}\n`,
                '请使用 "#我的农场" 查看状态，或 "#重登农场" 重新登录'
            ]

            // 向所有开启推送的群发送消息
            let sentCount = 0
            for (const groupId of groupIds) {
                try {
                    // 检查Bot是否在该群中
                    const group = Bot.pickGroup(groupId)
                    if (!group) {
                        logger.debug(`[QQ农场] Bot不在群 ${groupId} 中，跳过推送`)
                        continue
                    }

                    await group.sendMsg(msg)
                    sentCount++
                } catch (err) {
                    logger.error(`[QQ农场] 向群 ${groupId} 发送掉线推送失败:`, err.message)
                }
            }

            if (sentCount > 0) {
                this.lastNotifyTime[userId] = now
                logger.info(`[QQ农场] 已向用户 ${userId} 的 ${sentCount} 个群发送掉线推送`)
            }
        } catch (error) {
            logger.error(`[QQ农场] 发送掉线推送失败:`, error)
        }
    }

    // 手动触发检查（用于测试）
    async manualCheck(userId) {
        await this.checkUserAccount(userId)
    }

    // 清除用户的推送缓存
    clearUserCache(userId) {
        delete this.lastNotifyTime[userId]
    }
}
