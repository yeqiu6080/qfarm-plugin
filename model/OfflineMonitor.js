import { Config, Api } from '../components/index.js'
import { Farm } from './index.js'

// 单例实例
let instance = null

export default class OfflineMonitor {
    constructor() {
        // 单例模式：确保只有一个实例
        if (instance) {
            return instance
        }
        instance = this

        this.checkInterval = null
        this.lastNotifyTime = {} // 记录每个用户上次推送时间: { userId: timestamp }
        this.accountStatusCache = {} // 缓存账号状态: { accountId: { isConnected, lastCheck } }
        this.notifiedOffline = {} // 记录已发送掉线通知的用户: { userId: boolean }
        this.disconnectStartTime = {} // 记录开始断开连接的时间: { userId: timestamp }
        this.sendingNotify = {} // 记录正在发送通知的用户，防止并发发送: { userId: boolean }
    }

    // 启动监控
    async start() {
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

            // 判断是否需要推送：之前是连接状态，现在断开；或者首次检查就是断开状态
            if (status.isConnected === false) {
                if (prevStatus?.isConnected === true) {
                    // 从连接变为断开，记录开始时间
                    if (!this.disconnectStartTime[userId]) {
                        this.disconnectStartTime[userId] = Date.now()
                        logger.info(`[QQ农场] 用户 ${userId} 从连接变为断开，开始计时`)
                    }
                } else if (!prevStatus && !this.disconnectStartTime[userId]) {
                    // 首次检查就是断开状态（可能是插件重启后），也记录开始时间
                    this.disconnectStartTime[userId] = Date.now()
                    logger.info(`[QQ农场] 用户 ${userId} 首次检查即为断开状态，开始计时`)
                }
            }

            // 如果账号已恢复连接，清除相关标记
            if (status.isConnected === true) {
                if (this.notifiedOffline[userId]) {
                    delete this.notifiedOffline[userId]
                    logger.debug(`[QQ农场] 用户 ${userId} 账号已恢复连接，清除掉线通知标记`)
                }
                if (this.disconnectStartTime[userId]) {
                    delete this.disconnectStartTime[userId]
                    logger.debug(`[QQ农场] 用户 ${userId} 账号已恢复连接，清除断开计时`)
                }
            }

            // 检查是否需要发送掉线通知：断开状态持续超过确认时间，且未发送过通知，且不在发送中
            if (status.isConnected === false && this.disconnectStartTime[userId] && !this.notifiedOffline[userId] && !this.sendingNotify[userId]) {
                const disconnectDuration = Date.now() - this.disconnectStartTime[userId]
                const confirmDelay = 60000 // 确认延迟：60秒，避免状态抖动导致频繁推送

                if (disconnectDuration >= confirmDelay) {
                    logger.info(`[QQ农场] 用户 ${userId} 掉线超过${confirmDelay/1000}秒，准备发送掉线通知`)
                    this.sendingNotify[userId] = true
                    try {
                        const sent = await this.sendOfflineNotify(userId, status)
                        // 只有实际发送成功后才标记为已通知
                        if (sent) {
                            this.notifiedOffline[userId] = true
                        }
                    } finally {
                        delete this.sendingNotify[userId]
                    }
                } else {
                    logger.debug(`[QQ农场] 用户 ${userId} 掉线${Math.floor(disconnectDuration/1000)}秒，未满${confirmDelay/1000}秒确认延迟`)
                }
            }
        } catch (error) {
            logger.error(`[QQ农场] 检查用户 ${userId} 账号状态失败:`, error)
        }
    }

    // 发送掉线推送
    // 返回值：boolean，是否实际发送了消息
    async sendOfflineNotify(userId, status) {
        try {
            const notifyConfig = Config.getOfflineNotifyConfig()
            const cooldown = notifyConfig.cooldown || 300

            // 检查冷却时间
            const lastNotify = this.lastNotifyTime[userId] || 0
            const now = Date.now()
            if (now - lastNotify < cooldown * 1000) {
                logger.debug(`[QQ农场] 用户 ${userId} 掉线推送冷却中，跳过`)
                return false
            }

            // 获取用户开启推送的群列表
            const groupIds = Config.getUserNotifyGroups(userId)
            if (!groupIds || groupIds.length === 0) return false

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
            const totalGroups = groupIds.length
            logger.info(`[QQ农场] 用户 ${userId} 掉线通知将发送到 ${totalGroups} 个群: ${groupIds.join(', ')}`)
            
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
                    logger.info(`[QQ农场] 已向群 ${groupId} 发送掉线推送`)
                } catch (err) {
                    logger.error(`[QQ农场] 向群 ${groupId} 发送掉线推送失败:`, err.message)
                }
            }

            if (sentCount > 0) {
                this.lastNotifyTime[userId] = now
                this.notifiedOffline[userId] = true // 标记已发送掉线通知
                logger.info(`[QQ农场] 用户 ${userId} 掉线推送完成，成功发送 ${sentCount}/${totalGroups} 个群`)
                return true
            }
            logger.warn(`[QQ农场] 用户 ${userId} 掉线推送失败，未成功发送到任何群`)
            return false
        } catch (error) {
            logger.error(`[QQ农场] 发送掉线推送失败:`, error)
            return false
        }
    }

    // 手动触发检查（用于测试）
    async manualCheck(userId) {
        await this.checkUserAccount(userId)
    }

    // 清除用户的推送缓存
    clearUserCache(userId) {
        delete this.lastNotifyTime[userId]
        delete this.notifiedOffline[userId]
        delete this.disconnectStartTime[userId]
        delete this.sendingNotify[userId]
    }
}
