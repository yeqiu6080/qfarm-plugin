import HttpClient from './HttpClient.js'
import Config from './Config.js'

export default class Api {
    // 获取基础 URL
    static getBaseUrl() {
        return Config.getServerUrl()
    }

    // 构建完整 URL
    static buildUrl(path) {
        const baseUrl = this.getBaseUrl()
        // 移除末尾的斜杠，避免双斜杠
        const cleanBaseUrl = baseUrl.replace(/\/$/, '')
        // 确保路径以斜杠开头
        const cleanPath = path.startsWith('/') ? path : `/${path}`
        return `${cleanBaseUrl}${cleanPath}`
    }

    // 提取响应数据（服务器返回格式: { success: true, data: ... }）
    static extractData(response) {
        // HttpClient 返回的 response 结构是 { data: 服务端返回的数据, status, ... }
        // 服务端返回的数据格式是 { success: true, data: 实际数据 }
        const serverData = response?.data
        if (serverData && serverData.success === true && serverData.data !== undefined) {
            return serverData.data
        }
        return serverData
    }

    // 获取所有账号
    static async getAccounts() {
        const response = await HttpClient.get(this.buildUrl('/api/accounts'))
        const data = this.extractData(response)

        // 处理不同的响应格式
        if (Array.isArray(data)) {
            return data
        } else if (data && Array.isArray(data.accounts)) {
            return data.accounts
        } else {
            logger.warn('[QQ农场] 获取账号列表返回格式异常:', data)
            return []
        }
    }

    // 获取单个账号
    static async getAccount(accountId) {
        const response = await HttpClient.get(this.buildUrl(`/api/accounts/${accountId}`))
        return this.extractData(response)
    }

    // 添加账号
    static async addAccount(account) {
        const response = await HttpClient.post(this.buildUrl('/api/accounts'), account)
        return this.extractData(response)
    }

    // 删除账号
    static async deleteAccount(accountId) {
        await HttpClient.delete(this.buildUrl(`/api/accounts/${accountId}`))
    }

    // 启动账号
    static async startAccount(accountId) {
        const response = await HttpClient.post(this.buildUrl(`/api/accounts/${accountId}/start`))
        return this.extractData(response)
    }

    // 停止账号
    static async stopAccount(accountId) {
        const response = await HttpClient.post(this.buildUrl(`/api/accounts/${accountId}/stop`))
        return this.extractData(response)
    }

    // 获取账号状态
    static async getAccountStatus(accountId) {
        const response = await HttpClient.get(this.buildUrl(`/api/accounts/${accountId}/status`))
        return this.extractData(response)
    }

    // 获取所有账号状态
    static async getAllStatus() {
        const response = await HttpClient.get(this.buildUrl('/api/status'))
        return this.extractData(response)
    }

    // 获取统计数据
    static async getStats() {
        const response = await HttpClient.get(this.buildUrl('/api/stats'))
        return this.extractData(response)
    }

    // 开始扫码登录
    static async startQrLogin() {
        const response = await HttpClient.post(this.buildUrl('/api/qr-login'))
        return this.extractData(response)
    }

    // 获取扫码登录二维码URL
    static async getQrLoginUrl(sessionId) {
        const response = await HttpClient.get(this.buildUrl(`/api/qr-login/${sessionId}/url`))
        return this.extractData(response)
    }

    // 查询扫码状态
    static async queryQrStatus(sessionId) {
        const response = await HttpClient.get(this.buildUrl(`/api/qr-login/${sessionId}/status`))
        return this.extractData(response)
    }

    // 测试服务器连接
    static async testConnection(url) {
        // 测试连接时使用提供的 URL，而不是配置中的 URL
        const testUrl = `${url.replace(/\/$/, '')}/api/status`
        await HttpClient.get(testUrl, { timeout: 5000 })
        return true
    }

    // ========== 新增API支持（服务器v2+）==========

    // 获取服务器健康状态
    static async getHealth() {
        try {
            const response = await HttpClient.get(this.buildUrl('/api/health'))
            return this.extractData(response)
        } catch (error) {
            // 旧版服务器可能没有这个API
            return null
        }
    }

    // 获取账号每日奖励状态
    static async getDailyRewards(accountId) {
        try {
            const response = await HttpClient.get(this.buildUrl(`/api/accounts/${accountId}/daily-rewards`))
            return this.extractData(response)
        } catch (error) {
            // 旧版服务器可能没有这个API
            return null
        }
    }

    // 手动领取每日奖励
    static async claimDailyRewards(accountId) {
        try {
            const response = await HttpClient.post(this.buildUrl(`/api/accounts/${accountId}/daily-rewards/claim`))
            return this.extractData(response)
        } catch (error) {
            // 旧版服务器可能没有这个API
            return null
        }
    }

    // 获取土地详情
    static async getLands(accountId) {
        try {
            const response = await HttpClient.get(this.buildUrl(`/api/accounts/${accountId}/lands`))
            return this.extractData(response)
        } catch (error) {
            // 旧版服务器可能没有这个API
            return null
        }
    }

    // 解锁土地
    static async unlockLand(accountId, landId) {
        try {
            const response = await HttpClient.post(this.buildUrl(`/api/accounts/${accountId}/lands/${landId}/unlock`))
            return this.extractData(response)
        } catch (error) {
            // 旧版服务器可能没有这个API
            return null
        }
    }

    // 升级土地
    static async upgradeLand(accountId, landId) {
        try {
            const response = await HttpClient.post(this.buildUrl(`/api/accounts/${accountId}/lands/${landId}/upgrade`))
            return this.extractData(response)
        } catch (error) {
            // 旧版服务器可能没有这个API
            return null
        }
    }

    // 获取账号日志
    static async getAccountLogs(accountId, limit = 100) {
        try {
            const response = await HttpClient.get(this.buildUrl(`/api/accounts/${accountId}/logs?limit=${limit}`))
            return this.extractData(response)
        } catch (error) {
            // 旧版服务器可能没有这个API
            return []
        }
    }

    // 执行单次操作
    static async executeAction(accountId, action) {
        const response = await HttpClient.post(this.buildUrl(`/api/accounts/${accountId}/action`), { action })
        return this.extractData(response)
    }

    // 获取所有连接状态
    static async getAllConnections() {
        try {
            const response = await HttpClient.get(this.buildUrl('/api/connections'))
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // 获取单个账号连接状态
    static async getAccountConnection(accountId) {
        try {
            const response = await HttpClient.get(this.buildUrl(`/api/accounts/${accountId}/connection`))
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // 清理已停止的连接
    static async cleanupConnections() {
        try {
            const response = await HttpClient.post(this.buildUrl('/api/cleanup'))
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // 启动所有账号
    static async startAllAccounts() {
        try {
            const response = await HttpClient.post(this.buildUrl('/api/start-all'))
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // 停止所有账号
    static async stopAllAccounts() {
        try {
            const response = await HttpClient.post(this.buildUrl('/api/stop-all'))
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // ========== 任务系统 API ==========

    // 获取任务列表
    static async getTasks(accountId) {
        try {
            const response = await HttpClient.get(this.buildUrl(`/api/accounts/${accountId}/tasks`))
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // 领取单个任务
    static async claimTask(accountId, taskId) {
        try {
            const response = await HttpClient.post(this.buildUrl(`/api/accounts/${accountId}/tasks/${taskId}/claim`))
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // 一键领取所有任务
    static async claimAllTasks(accountId) {
        try {
            const response = await HttpClient.post(this.buildUrl(`/api/accounts/${accountId}/tasks/claim-all`))
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // ========== 种植策略 API ==========

    // 获取所有可用策略
    static async getStrategies() {
        try {
            const response = await HttpClient.get(this.buildUrl('/api/strategies'))
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // 获取账号策略状态
    static async getAccountStrategy(accountId) {
        try {
            const response = await HttpClient.get(this.buildUrl(`/api/accounts/${accountId}/strategy`))
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // 设置种植策略
    static async setAccountStrategy(accountId, strategy, preferredSeedId = null, settings = {}) {
        try {
            const data = { strategy, ...settings }
            if (preferredSeedId) data.preferredSeedId = preferredSeedId
            const response = await HttpClient.post(this.buildUrl(`/api/accounts/${accountId}/strategy`), data)
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // ========== 数据分析 API ==========

    // 获取种植效率排行榜
    static async getLeaderboard(options = {}) {
        try {
            const params = new URLSearchParams()
            if (options.lands) params.append('lands', options.lands)
            if (options.level) params.append('level', options.level)
            if (options.sortBy) params.append('sortBy', options.sortBy)
            if (options.fertilizer) params.append('fertilizer', options.fertilizer)
            if (options.limit) params.append('limit', options.limit)

            const query = params.toString() ? `?${params.toString()}` : ''
            const response = await HttpClient.get(this.buildUrl(`/api/analytics/leaderboard${query}`))
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // 获取种植推荐
    static async getRecommendation(level = 1, lands = 18, strategy = 'exp') {
        try {
            const response = await HttpClient.get(
                this.buildUrl(`/api/analytics/recommendation?level=${level}&lands=${lands}&strategy=${strategy}`)
            )
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // 获取种子详情
    static async getSeedDetails(seedId) {
        try {
            const response = await HttpClient.get(this.buildUrl(`/api/analytics/seeds/${seedId}`))
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // 比较多个种子
    static async compareSeeds(seedIds) {
        try {
            const response = await HttpClient.post(this.buildUrl('/api/analytics/compare'), { seedIds })
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // ========== 好友优化 API ==========

    // 获取好友优化器状态
    static async getFriendOptimizer(accountId) {
        try {
            const response = await HttpClient.get(this.buildUrl(`/api/accounts/${accountId}/friend-optimizer`))
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // 设置静默时段
    static async setQuietHours(accountId, enabled, startHour = 23, endHour = 7) {
        try {
            const response = await HttpClient.post(
                this.buildUrl(`/api/accounts/${accountId}/friend-optimizer/quiet-hours`),
                { enabled, startHour, endHour }
            )
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }

    // 清除访问统计
    static async clearFriendStats(accountId) {
        try {
            const response = await HttpClient.post(
                this.buildUrl(`/api/accounts/${accountId}/friend-optimizer/clear-stats`)
            )
            return this.extractData(response)
        } catch (error) {
            return null
        }
    }
}
