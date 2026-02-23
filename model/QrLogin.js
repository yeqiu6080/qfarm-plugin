import { Api, Config } from '../components/index.js'
import Farm from './Farm.js'

export default class QrLogin {
    constructor() {
        this.sessions = new Map() // userId -> { sessionId, startTime, isProcessing }
    }

    // 开始扫码登录
    async start(userId, callback) {
        // 检查是否已绑定
        if (await Farm.hasUserAccount(userId)) {
            return { success: false, message: '你已绑定农场账号，请先使用"#退出农场"解除绑定后再登录新账号' }
        }

        // 检查是否已有进行中的登录
        if (this.sessions.has(userId)) {
            return { success: false, message: '已有进行中的登录，请等待或稍后重试' }
        }

        try {
            // 1. 创建扫码会话
            const response = await Api.startQrLogin()
            logger.info('[QQ农场] 扫码登录会话响应:', JSON.stringify(response))
            
            if (!response.success || !response.data) {
                throw new Error('服务器返回数据异常')
            }
            
            const sessionId = response.data.sessionId
            if (!sessionId) {
                logger.error('[QQ农场] 无法从响应中提取sessionId:', response)
                throw new Error('获取会话ID失败')
            }
            
            // 2. 获取登录链接
            const qrResponse = await Api.getQrLoginUrl(sessionId)
            logger.info('[QQ农场] 登录链接响应:', JSON.stringify(qrResponse))
            
            if (!qrResponse.success || !qrResponse.data) {
                throw new Error('获取登录链接失败')
            }
            
            const qrUrl = qrResponse.data.url
            if (!qrUrl) {
                logger.error('[QQ农场] 无法从响应中提取url:', qrResponse)
                throw new Error('获取登录链接失败')
            }
            
            // 3. 保存会话并开始轮询
            this.sessions.set(userId, {
                sessionId: sessionId,
                startTime: Date.now(),
                isProcessing: false
            })
            
            // 4. 开始轮询状态
            this.pollStatus(userId, callback)
            
            return { 
                success: true, 
                url: qrUrl,
                sessionId: sessionId
            }
        } catch (error) {
            logger.error('[QQ农场] 启动登录失败:', error)
            return { success: false, message: error.message }
        }
    }

    // 轮询扫码状态（参考WebUI实现，每2秒轮询一次）
    async pollStatus(userId, callback) {
        const timeout = 180000 // 3分钟（与WebUI一致）
        const interval = 2000 // 2秒（与WebUI一致）
        let pollCount = 0
        const maxPolls = 90 // 最多90次（3分钟）

        const check = async () => {
            pollCount++
            
            // 获取最新的会话状态
            const session = this.sessions.get(userId)
            if (!session) {
                logger.debug('[QQ农场] 会话已结束，停止轮询')
                return
            }

            // 如果正在处理中，跳过本次检查
            if (session.isProcessing) {
                logger.debug('[QQ农场] 正在处理中，跳过本次检查')
                setTimeout(check, interval)
                return
            }

            // 检查是否超过最大轮询次数
            if (pollCount > maxPolls) {
                logger.info('[QQ农场] 登录超时')
                this.sessions.delete(userId)
                if (callback) {
                    callback({ success: false, stage: 'timeout', message: '登录超时，请重试' })
                }
                return
            }

            try {
                const response = await Api.queryQrStatus(session.sessionId)
                logger.debug(`[QQ农场] 第${pollCount}次轮询，状态:`, JSON.stringify(response))

                // 检查会话是否还存在
                if (!this.sessions.has(userId)) {
                    logger.debug('[QQ农场] 会话已被删除，停止轮询')
                    return
                }

                // 服务器返回异常
                if (!response.success || !response.data) {
                    logger.warn('[QQ农场] 服务器返回异常:', response)
                    setTimeout(check, interval)
                    return
                }

                const data = response.data
                const status = data.status

                // 登录成功
                if (status === 'success') {
                    const code = data.code
                    if (!code) {
                        logger.error('[QQ农场] 登录成功但未返回code:', data)
                        setTimeout(check, interval)
                        return
                    }

                    // 标记为处理中
                    session.isProcessing = true
                    this.sessions.set(userId, session)

                    logger.info('[QQ农场] 登录成功，获取到code:', code)

                    // 先检查用户是否已经有账号了
                    const existingAccount = await Farm.getUserAccount(userId)
                    if (existingAccount) {
                        logger.info('[QQ农场] 用户已有账号，跳过创建:', existingAccount.id)
                        this.sessions.delete(userId)
                        if (callback) {
                            callback({
                                success: true,
                                stage: 'completed',
                                account: existingAccount
                            })
                        }
                        return
                    }

                    // 自动创建账号并启动
                    try {
                        logger.info('[QQ农场] 正在创建账号...')
                        const account = await Farm.createAccount(userId, code)
                        logger.info('[QQ农场] 账号创建成功:', account.id)
                        
                        // 启动账号
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
                    } catch (createErr) {
                        logger.error('[QQ农场] 创建账号失败:', createErr)
                        this.sessions.delete(userId)
                        if (callback) {
                            callback({ success: false, stage: 'error', message: '创建账号失败: ' + createErr.message })
                        }
                    }
                    return
                }

                // 二维码过期
                if (status === 'expired') {
                    logger.info('[QQ农场] 登录链接已过期')
                    this.sessions.delete(userId)
                    if (callback) {
                        callback({ success: false, stage: 'expired', message: '登录链接已过期，请重新获取' })
                    }
                    return
                }

                // 等待中，继续轮询
                if (status === 'waiting') {
                    logger.debug('[QQ农场] 等待用户点击链接登录...')
                }

                // 继续轮询
                setTimeout(check, interval)
            } catch (err) {
                logger.error('[QQ农场] 查询登录状态失败:', err.message)
                // 出错后继续轮询
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
