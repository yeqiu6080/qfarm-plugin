import { Api, Config } from '../components/index.js'
import Farm from './Farm.js'

export default class QrLogin {
    constructor() {
        this.sessions = new Map() // userId -> { sessionId, startTime, isProcessing }
    }

    // 开始扫码登录
    async start(userId, callback) {
        // 检查是否已绑定（带重试，避免服务端缓存问题）
        let hasAccount = await Farm.hasUserAccount(userId)
        if (hasAccount) {
            // 等待一小段时间后再次确认，避免服务端缓存
            await new Promise(resolve => setTimeout(resolve, 300))
            hasAccount = await Farm.hasUserAccount(userId)
            if (hasAccount) {
                return { success: false, message: '你已绑定农场账号，请先使用"#退出农场"解除绑定后再登录新账号' }
            }
        }

        // 检查是否已有进行中的登录
        if (this.sessions.has(userId)) {
            return { success: false, message: '已有进行中的登录，请等待或稍后重试' }
        }

        try {
            // 1. 创建扫码会话
            const response = await Api.startQrLogin()
            logger.info('[QQ农场] 扫码登录会话响应:', JSON.stringify(response))

            if (!response || !response.sessionId) {
                throw new Error('服务器返回数据异常')
            }

            const sessionId = response.sessionId

            // 2. 获取登录链接
            const qrResponse = await Api.getQrLoginUrl(sessionId)
            logger.info('[QQ农场] 登录链接响应:', JSON.stringify(qrResponse))

            if (!qrResponse || !qrResponse.url) {
                throw new Error('获取登录链接失败')
            }

            const qrUrl = qrResponse.url
            
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
                if (!response || !response.status) {
                    logger.warn('[QQ农场] 服务器返回异常:', response)
                    setTimeout(check, interval)
                    return
                }

                const status = response.status

                // 登录成功
                if (status === 'success') {
                    const code = response.code
                    if (!code) {
                        logger.error('[QQ农场] 登录成功但未返回code:', response)
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
                        logger.info('[QQ农场] 用户已有账号，启动现有账号:', existingAccount.id)
                        
                        try {
                            // 启动已存在的账号
                            await Api.startAccount(existingAccount.id)
                            logger.info('[QQ农场] 现有账号启动成功:', existingAccount.id)
                            
                            // 设置自动挂机
                            const autoConfig = Config.getAutoConfig?.() || { enabled: true }
                            if (autoConfig.enabled !== false) {
                                Config.setUserAutoAccount(userId, existingAccount.id)
                                logger.info('[QQ农场] 已启用自动挂机')
                            }
                        } catch (startErr) {
                            logger.error('[QQ农场] 启动现有账号失败:', startErr)
                            // 启动失败也继续返回成功，因为账号已存在
                        }
                        
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

                        if (!account || !account.id) {
                            throw new Error('服务器返回的账号数据异常')
                        }

                        logger.info('[QQ农场] 账号创建成功:', account.id)

                        // 立即启动账号（避免code过期）
                        logger.info('[QQ农场] 正在启动账号...')
                        await Api.startAccount(account.id)
                        logger.info('[QQ农场] 账号启动成功')

                        // 根据自动挂机配置决定是否启用自动功能
                        const autoConfig = Config.getAutoConfig?.() || { enabled: true }
                        if (autoConfig.enabled !== false) {
                            Config.setUserAutoAccount(userId, account.id)
                            logger.info('[QQ农场] 已启用自动挂机')
                        }

                        this.sessions.delete(userId)

                        if (callback) {
                            callback({
                                success: true,
                                stage: 'completed',
                                account,
                                autoEnabled: autoConfig.enabled !== false
                            })
                        }
                    } catch (createErr) {
                        logger.error('[QQ农场] 创建账号或启动失败:', createErr)
                        this.sessions.delete(userId)
                        if (callback) {
                            callback({ success: false, stage: 'error', message: '创建账号或启动失败: ' + createErr.message })
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
