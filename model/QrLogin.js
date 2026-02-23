import { Api, Config } from '../components/index.js'
import Farm from './Farm.js'

export default class QrLogin {
    constructor() {
        this.sessions = new Map() // userId -> { sessionId, checkInterval }
    }

    // 开始扫码登录
    async start(userId, callback) {
        // 检查是否已绑定
        if (await Farm.hasUserAccount(userId)) {
            return { success: false, message: '你已绑定农场账号，请先使用"#退出农场"解除绑定后再登录新账号' }
        }

        try {
            const response = await Api.startQrLogin()
            logger.info('[QQ农场] 扫码登录会话响应:', JSON.stringify(response))
            
            // 服务器返回格式: { success: true, data: { sessionId, status, message } }
            if (!response.success || !response.data) {
                throw new Error('服务器返回数据异常')
            }
            
            const sessionId = response.data.sessionId
            if (!sessionId) {
                logger.error('[QQ农场] 无法从响应中提取sessionId:', response)
                throw new Error('获取会话ID失败')
            }
            
            const qrResponse = await Api.getQrLoginUrl(sessionId)
            logger.info('[QQ农场] 二维码信息响应:', JSON.stringify(qrResponse))
            
            // 服务器返回格式: { success: true, data: { url, loginCode } }
            if (!qrResponse.success || !qrResponse.data) {
                throw new Error('获取二维码信息失败')
            }
            
            const qrUrl = qrResponse.data.url
            if (!qrUrl) {
                logger.error('[QQ农场] 无法从响应中提取qrUrl:', qrResponse)
                throw new Error('获取二维码链接失败')
            }
            
            // 保存会话
            this.sessions.set(userId, {
                sessionId: sessionId,
                startTime: Date.now()
            })
            
            // 开始轮询
            this.pollStatus(userId, callback)
            
            return { 
                success: true, 
                url: qrUrl,
                sessionId: sessionId
            }
        } catch (error) {
            logger.error('[QQ农场] 启动扫码登录失败:', error)
            return { success: false, message: error.message }
        }
    }

    // 轮询扫码状态
    async pollStatus(userId, callback) {
        const session = this.sessions.get(userId)
        if (!session) return

        const timeout = 120000 // 2分钟
        const interval = 3000 // 3秒

        const check = async () => {
            try {
                const response = await Api.queryQrStatus(session.sessionId)
                logger.debug('[QQ农场] 扫码状态响应:', JSON.stringify(response))
                
                // 服务器返回格式: { success: true, data: { status, code/message } }
                if (!response.success || !response.data) {
                    setTimeout(check, interval)
                    return
                }
                
                const status = response.data.status
                const code = response.data.code
                
                if (status === 'success') {
                    // 扫码成功，创建账号
                    const account = await Farm.createAccount(userId, code)
                    await Api.startAccount(account.id)
                    Config.setUserAutoAccount(userId, account.id)
                    
                    this.sessions.delete(userId)
                    
                    if (callback) {
                        callback({ 
                            success: true, 
                            stage: 'completed',
                            account 
                        })
                    }
                    return
                }
                
                if (status === 'expired' || status === 'failed') {
                    this.sessions.delete(userId)
                    if (callback) {
                        callback({ success: false, stage: 'expired', message: '二维码已过期' })
                    }
                    return
                }
                
                if (Date.now() - session.startTime > timeout) {
                    this.sessions.delete(userId)
                    if (callback) {
                        callback({ success: false, stage: 'timeout', message: '扫码超时' })
                    }
                    return
                }
                
                // 继续轮询
                setTimeout(check, interval)
            } catch (err) {
                logger.error('[QQ农场] 查询扫码状态失败:', err)
                setTimeout(check, interval)
            }
        }

        check()
    }

    // 取消登录
    cancel(userId) {
        this.sessions.delete(userId)
    }
}
