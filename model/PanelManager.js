import { Api, Config } from '../components/index.js'
import Farm from './Farm.js'

/**
 * 面板管理器
 * 管理WebSocket连接和实时数据推送
 */
export default class PanelManager {
    constructor() {
        this.ws = null
        this.isConnected = false
        this.reconnectTimer = null
        this.heartbeatTimer = null
        this.subscribedAccounts = new Set()
        this.messageHandlers = new Map()
        this.pendingRequests = new Map()
        this.requestId = 1
    }

    /**
     * 连接到WebSocket服务器
     */
    async connect() {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            return true
        }

        return new Promise((resolve, reject) => {
            try {
                const serverUrl = Config.getServerUrl().replace(/^http/, 'ws')
                this.ws = new WebSocket(serverUrl)

                this.ws.onopen = () => {
                    this.isConnected = true
                    logger.debug('[QQ农场面板] WebSocket已连接')
                    this.startHeartbeat()
                    resolve(true)
                }

                this.ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data)
                        this.handleMessage(msg)
                    } catch (err) {
                        logger.error('[QQ农场面板] 消息解析失败:', err)
                    }
                }

                this.ws.onclose = () => {
                    this.isConnected = false
                    this.stopHeartbeat()
                    logger.debug('[QQ农场面板] WebSocket已断开')
                    this.scheduleReconnect()
                }

                this.ws.onerror = (err) => {
                    logger.error('[QQ农场面板] WebSocket错误:', err)
                    reject(err)
                }

                // 连接超时
                setTimeout(() => {
                    if (!this.isConnected) {
                        reject(new Error('连接超时'))
                    }
                }, 10000)
            } catch (err) {
                reject(err)
            }
        })
    }

    /**
     * 断开连接
     */
    disconnect() {
        this.stopHeartbeat()
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }
        if (this.ws) {
            this.ws.close()
            this.ws = null
        }
        this.isConnected = false
        this.subscribedAccounts.clear()
    }

    /**
     * 启动心跳
     */
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected) {
                this.send({ action: 'ping' })
            }
        }, 30000)
    }

    /**
     * 停止心跳
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer)
            this.heartbeatTimer = null
        }
    }

    /**
     * 计划重连
     */
    scheduleReconnect() {
        if (this.reconnectTimer) return
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            this.connect().catch(() => {})
        }, 5000)
    }

    /**
     * 发送消息
     */
    send(data) {
        if (!this.isConnected || !this.ws) {
            return false
        }
        try {
            this.ws.send(JSON.stringify(data))
            return true
        } catch (err) {
            logger.error('[QQ农场面板] 发送失败:', err)
            return false
        }
    }

    /**
     * 发送请求并等待响应
     */
    async request(action, data = {}) {
        await this.connect()

        const id = this.requestId++
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id)
                reject(new Error('请求超时'))
            }, 10000)

            this.pendingRequests.set(id, { resolve, reject, timeout })
            this.send({ ...data, action, id })
        })
    }

    /**
     * 处理收到的消息
     */
    handleMessage(msg) {
        // 处理请求响应
        if (msg.id && this.pendingRequests.has(msg.id)) {
            const { resolve, reject, timeout } = this.pendingRequests.get(msg.id)
            clearTimeout(timeout)
            this.pendingRequests.delete(msg.id)

            if (msg.error) {
                reject(new Error(msg.error))
            } else {
                resolve(msg.data)
            }
            return
        }

        // 处理推送消息
        const { type, accountId, data } = msg
        if (type && this.messageHandlers.has(type)) {
            const handlers = this.messageHandlers.get(type)
            handlers.forEach(handler => {
                try {
                    handler(data, accountId)
                } catch (err) {
                    logger.error('[QQ农场面板] 消息处理错误:', err)
                }
            })
        }
    }

    /**
     * 订阅账号更新
     */
    async subscribe(accountId) {
        await this.connect()
        this.subscribedAccounts.add(accountId)
        return this.request('subscribe', { accountId })
    }

    /**
     * 取消订阅
     */
    async unsubscribe(accountId) {
        this.subscribedAccounts.delete(accountId)
        return this.request('unsubscribe', { accountId })
    }

    /**
     * 订阅所有账号
     */
    async subscribeAll() {
        await this.connect()
        return this.request('subscribe', { accountId: 'all' })
    }

    /**
     * 注册消息处理器
     */
    on(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, new Set())
        }
        this.messageHandlers.get(type).add(handler)

        // 返回取消订阅函数
        return () => this.off(type, handler)
    }

    /**
     * 移除消息处理器
     */
    off(type, handler) {
        if (this.messageHandlers.has(type)) {
            this.messageHandlers.get(type).delete(handler)
        }
    }

    /**
     * 获取账号日志
     */
    async getLogs(accountId, limit = 50) {
        try {
            return await Api.getAccountLogs(accountId, limit)
        } catch (err) {
            logger.error('[QQ农场面板] 获取日志失败:', err)
            return []
        }
    }

    /**
     * 获取用户面板数据（聚合）
     */
    async getUserPanelData(userId) {
        try {
            const account = await Farm.getUserAccount(userId)
            if (!account) {
                return null
            }

            const [status, logs] = await Promise.all([
                Farm.getUserAccountStatus(userId),
                this.getLogs(account.id, 30).catch(() => [])
            ])

            return {
                account,
                status,
                logs,
                isRunning: status?.isRunning || false,
                isConnected: status?.isConnected || false
            }
        } catch (err) {
            logger.error('[QQ农场面板] 获取面板数据失败:', err)
            return null
        }
    }

    /**
     * 获取土地详情
     */
    async getLands(userId) {
        try {
            const account = await Farm.getUserAccount(userId)
            if (!account) return null

            const lands = await Api.getLands(account.id)
            return lands
        } catch (err) {
            logger.error('[QQ农场面板] 获取土地详情失败:', err)
            return null
        }
    }

    /**
     * 执行单次操作
     */
    async executeAction(userId, action) {
        try {
            const account = await Farm.getUserAccount(userId)
            if (!account) {
                throw new Error('账号未登录')
            }

            return await Api.executeAction(account.id, action)
        } catch (err) {
            logger.error('[QQ农场面板] 执行操作失败:', err)
            throw err
        }
    }
}

// 导出单例
export const panelManager = new PanelManager()
