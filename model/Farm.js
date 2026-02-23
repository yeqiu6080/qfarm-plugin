import { Api, Config } from '../components/index.js'

export default class Farm {
    // 获取用户标识
    static getUserKey(userId) {
        return `qq_${userId}`
    }

    // 获取用户绑定的账号
    static async getUserAccount(userId) {
        const userKey = this.getUserKey(userId)
        const accounts = await Api.getAccounts()
        return accounts.find(acc => acc.name.startsWith(userKey) || acc.userId === userId)
    }

    // 检查用户是否已绑定账号
    static async hasUserAccount(userId) {
        const account = await this.getUserAccount(userId)
        return !!account
    }

    // 创建账号
    static async createAccount(userId, code) {
        const userKey = this.getUserKey(userId)
        // 使用更短的随机后缀，避免名称过长
        const randomSuffix = Math.random().toString(36).substring(2, 8)
        const accountName = `${userKey}_${randomSuffix}`

        return await Api.addAccount({
            name: accountName,
            code: code,
            platform: 'qq',
            userId: userId,
            config: {
                enableSteal: true,
                enableFriendHelp: true
            }
        })
    }

    // 删除用户账号
    static async deleteUserAccount(userId) {
        const account = await this.getUserAccount(userId)
        if (!account) return false

        try {
            // 尝试停止账号（可能已停止或不存在，忽略错误）
            try {
                await Api.stopAccount(account.id)
            } catch (err) {
                logger.debug('[QQ农场] 停止账号失败（可能已停止）:', err.message)
            }

            // 尝试删除账号（可能不存在，忽略错误）
            try {
                await Api.deleteAccount(account.id)
            } catch (err) {
                logger.debug('[QQ农场] 删除服务端账号失败（可能不存在）:', err.message)
            }

            // 清除本地配置
            Config.deleteUserAutoAccount(userId)

            // 等待并确认账号已被删除（最多重试5次，每次200ms）
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 200))
                const stillExists = await this.getUserAccount(userId)
                if (!stillExists) {
                    logger.debug('[QQ农场] 账号删除已确认')
                    return true
                }
                logger.debug(`[QQ农场] 等待账号删除确认... (${i + 1}/5)`)
            }

            logger.warn('[QQ农场] 账号删除后仍可查询到，可能存在同步延迟')
            return true
        } catch (err) {
            logger.error('[QQ农场] 删除账号失败:', err)
            return false
        }
    }

    // 启动用户账号
    static async startUserAccount(userId) {
        const account = await this.getUserAccount(userId)
        if (!account) return null

        try {
            const status = await Api.getAccountStatus(account.id)
            if (!status?.isRunning) {
                await Api.startAccount(account.id)
            }
        } catch (error) {
            // 404 表示账号未运行，直接启动
            if (error.message?.includes('HTTP 404')) {
                try {
                    await Api.startAccount(account.id)
                } catch (startError) {
                    // 启动失败，可能是code过期或网络问题
                    if (startError.message?.includes('HTTP 500')) {
                        throw new Error('启动失败，登录码可能已过期，请使用"#退出农场"后重新登录')
                    }
                    throw startError
                }
            } else if (error.message?.includes('HTTP 500')) {
                // 500 错误通常是启动失败
                throw new Error('启动失败，登录码可能已过期，请使用"#退出农场"后重新登录')
            } else {
                throw error
            }
        }

        Config.setUserAutoAccount(userId, account.id)
        return account
    }

    // 停止用户账号
    static async stopUserAccount(userId) {
        const account = await this.getUserAccount(userId)
        if (!account) return null

        try {
            const status = await Api.getAccountStatus(account.id)
            if (status?.isRunning) {
                await Api.stopAccount(account.id)
            }
        } catch (error) {
            // 404 表示账号未运行，无需停止
            if (!error.message?.includes('HTTP 404')) {
                throw error
            }
        }

        Config.deleteUserAutoAccount(userId)
        return account
    }

    // 获取用户账号状态
    static async getUserAccountStatus(userId) {
        const account = await this.getUserAccount(userId)
        if (!account) return null

        try {
            return await Api.getAccountStatus(account.id)
        } catch (error) {
            // 404 表示账号未运行，返回默认状态
            if (error.message?.includes('HTTP 404')) {
                return {
                    isRunning: false,
                    isConnected: false,
                    userState: {},
                    stats: {}
                }
            }
            throw error
        }
    }

    // 检查用户自动挂机状态
    static isUserAutoEnabled(userId) {
        const autoAccountId = Config.getUserAutoAccount(userId)
        if (!autoAccountId) return false
        
        // 异步检查账号是否匹配
        return this.getUserAccount(userId).then(account => {
            return account?.id === autoAccountId
        })
    }
}
