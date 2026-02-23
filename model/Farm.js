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
        logger.debug(`[QQ农场] 获取账号列表，查找用户: ${userId}, userKey: ${userKey}, 总账号数: ${accounts.length}`)
        
        const account = accounts.find(acc => {
            const matchByName = acc.name && acc.name.startsWith(userKey)
            const matchByUserId = acc.userId === userId
            if (matchByName || matchByUserId) {
                logger.debug(`[QQ农场] 匹配到账号: ${acc.id}, name: ${acc.name}, userId: ${acc.userId}`)
            }
            return matchByName || matchByUserId
        })
        
        return account
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
        const userKey = this.getUserKey(userId)
        logger.info(`[QQ农场] 开始删除用户账号: ${userId}`)
        
        // 获取所有可能匹配的账号（可能由于历史原因有多个）
        const accounts = await Api.getAccounts()
        const matchingAccounts = accounts.filter(acc => 
            (acc.name && acc.name.startsWith(userKey)) || acc.userId === userId
        )
        
        if (matchingAccounts.length === 0) {
            logger.info(`[QQ农场] 用户 ${userId} 没有绑定账号`)
            return false
        }
        
        logger.info(`[QQ农场] 找到 ${matchingAccounts.length} 个匹配账号:`, 
            matchingAccounts.map(a => ({ id: a.id, name: a.name, userId: a.userId })))

        try {
            // 删除所有匹配的账号
            for (const account of matchingAccounts) {
                logger.info(`[QQ农场] 正在删除账号: ${account.id}`)
                
                // 尝试停止账号（可能已停止或不存在，忽略错误）
                try {
                    await Api.stopAccount(account.id)
                    logger.debug(`[QQ农场] 账号 ${account.id} 已停止`)
                } catch (err) {
                    logger.debug(`[QQ农场] 停止账号 ${account.id} 失败（可能已停止）:`, err.message)
                }

                // 尝试删除账号（可能不存在，忽略错误）
                try {
                    await Api.deleteAccount(account.id)
                    logger.info(`[QQ农场] 账号 ${account.id} 已删除`)
                } catch (err) {
                    logger.debug(`[QQ农场] 删除服务端账号 ${account.id} 失败（可能不存在）:`, err.message)
                }
            }

            // 清除本地配置
            Config.deleteUserAutoAccount(userId)

            // 等待并确认账号已被删除（最多重试10次，每次300ms）
            for (let i = 0; i < 10; i++) {
                await new Promise(resolve => setTimeout(resolve, 300))
                const stillExists = await this.getUserAccount(userId)
                if (!stillExists) {
                    logger.info('[QQ农场] 账号删除已确认')
                    return true
                }
                logger.debug(`[QQ农场] 等待账号删除确认... (${i + 1}/10)`)
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
