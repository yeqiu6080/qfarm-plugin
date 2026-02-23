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
        if (response && response.success && response.data !== undefined) {
            return response.data
        }
        return response
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
        try {
            const response = await HttpClient.post(this.buildUrl('/api/accounts'), account)
            const data = this.extractData(response)

            // 检查服务端返回的错误
            if (data && data.success === false) {
                throw new Error(data.message || '服务端返回错误')
            }

            return data
        } catch (error) {
            // 增强错误信息
            if (error.message && error.message.includes('HTTP 500')) {
                throw new Error('服务器内部错误，可能是账号名称冲突或数据异常，请稍后重试')
            }
            throw error
        }
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
        // 扫码登录需要返回完整响应，因为需要检查 success 字段
        return response.data || response
    }

    // 获取扫码登录二维码URL
    static async getQrLoginUrl(sessionId) {
        const response = await HttpClient.get(this.buildUrl(`/api/qr-login/${sessionId}/url`))
        return response.data || response
    }

    // 查询扫码状态
    static async queryQrStatus(sessionId) {
        const response = await HttpClient.get(this.buildUrl(`/api/qr-login/${sessionId}/status`))
        return response.data || response
    }

    // 测试服务器连接
    static async testConnection(url) {
        // 测试连接时使用提供的 URL，而不是配置中的 URL
        const testUrl = `${url.replace(/\/$/, '')}/api/status`
        await HttpClient.get(testUrl, { timeout: 5000 })
        return true
    }
}
