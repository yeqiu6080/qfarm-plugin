import plugin from '../../../lib/plugins/plugin.js'
import { Config, Api } from '../components/index.js'
import Farm from '../model/Farm.js'
import { panelManager } from '../model/PanelManager.js'
import crypto from 'crypto'
import { BotConfig } from '../../../lib/config/config.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 模板缓存
const templateCache = new Map()

// 读取模板文件
function loadTemplate(templateName) {
    // 检查缓存
    if (templateCache.has(templateName)) {
        return templateCache.get(templateName)
    }
    
    const templatePath = path.join(__dirname, '..', 'templates', templateName)
    try {
        const content = fs.readFileSync(templatePath, 'utf8')
        templateCache.set(templateName, content)
        return content
    } catch (err) {
        logger.error(`[QQ农场路由] 加载模板失败: ${templateName}`, err)
        return null
    }
}

// 简单的模板替换函数
function renderTemplate(template, data) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : match
    })
}

// 令牌管理器
class TokenManager {
    constructor() {
        this.tokens = new Map() // token -> { userId, role, createdAt, used }
        this.sessionTokens = new Map() // sessionToken -> { userId, role, createdAt } (长期有效)
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000) // 每分钟清理过期令牌
        this.isDestroyed = false
    }

    // 销毁方法，清理定时器防止内存泄漏
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval)
            this.cleanupInterval = null
        }
        this.isDestroyed = true
        this.tokens.clear()
        this.sessionTokens.clear()
    }

    // 生成临时令牌（用于初始登录）
    generate(userId, isMaster = false) {
        const token = crypto.randomBytes(16).toString('hex')
        this.tokens.set(token, {
            userId: String(userId),
            role: isMaster ? 'master' : 'user',
            createdAt: Date.now(),
            used: false
        })
        return token
    }

    // 生成会话令牌（长期使用，用于记住登录状态）
    generateSession(userId, isMaster = false) {
        const token = crypto.randomBytes(32).toString('hex')
        this.sessionTokens.set(token, {
            userId: String(userId),
            role: isMaster ? 'master' : 'user',
            createdAt: Date.now()
        })
        return token
    }

    // 验证令牌（支持临时令牌和会话令牌）
    verify(token) {
        // 先检查临时令牌
        const tempData = this.tokens.get(token)
        if (tempData) {
            if (tempData.used) return null
            if (Date.now() - tempData.createdAt > 5 * 60 * 1000) { // 5分钟过期
                this.tokens.delete(token)
                return null
            }
            return {
                userId: tempData.userId,
                role: tempData.role,
                isMaster: tempData.role === 'master'
            }
        }

        // 检查会话令牌（7天有效期）
        const sessionData = this.sessionTokens.get(token)
        if (sessionData) {
            if (Date.now() - sessionData.createdAt > 7 * 24 * 60 * 60 * 1000) { // 7天过期
                this.sessionTokens.delete(token)
                return null
            }
            return {
                userId: sessionData.userId,
                role: sessionData.role,
                isMaster: sessionData.role === 'master'
            }
        }

        return null
    }

    // 使用临时令牌（标记为已使用，但5分钟内仍有效）
    use(token) {
        const data = this.tokens.get(token)
        if (data) {
            data.used = true
            // 使用后5分钟内仍可查看，之后删除
            setTimeout(() => this.tokens.delete(token), 5 * 60 * 1000)
        }
    }

    // 检查是否是主人
    isMaster(userId) {
        const masters = Array.isArray(BotConfig.master) ? BotConfig.master : [BotConfig.master]
        return masters.includes(String(userId))
    }

    // 获取用户列表（仅主人可用）
    async getUserList() {
        try {
            const accounts = await Farm.getAllAccounts()
            return accounts.map(acc => ({
                userId: acc.userId,
                id: acc.id,
                createdAt: acc.createdAt
            }))
        } catch (error) {
            logger.error('[QQ农场路由] 获取用户列表失败:', error)
            return []
        }
    }

    // 清理过期令牌
    cleanup() {
        const now = Date.now()
        // 清理临时令牌
        for (const [token, data] of this.tokens) {
            if (now - data.createdAt > 10 * 60 * 1000) { // 10分钟后彻底删除
                this.tokens.delete(token)
            }
        }
        // 清理过期会话令牌
        for (const [token, data] of this.sessionTokens) {
            if (now - data.createdAt > 7 * 24 * 60 * 60 * 1000) { // 7天后删除
                this.sessionTokens.delete(token)
            }
        }
    }
}

const tokenManager = new TokenManager()

// 路由处理类
export class FarmRoute {
    constructor() {
        this.id = 'qfarm'
        this.name = 'QQ农场路由'
    }

    // 处理路由请求
    async deal(req, res) {
        const url = req.url

        // 检查路由是否启用
        if (!Config.isRouteEnabled()) {
            if (url.startsWith('/qfarm')) {
                res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' })
                res.end(this.getDisabledHtml())
                return true
            }
            return false
        }

        // 面板页面
        if (url === '/qfarm' || url === '/qfarm/') {
            return this.renderPanel(req, res)
        }

        // API接口
        if (url.startsWith('/qfarm/api/')) {
            return this.handleApi(req, res)
        }

        return false
    }

    // 渲染面板页面
    async renderPanel(req, res) {
        const urlObj = new URL(req.url, `http://${req.headers.host}`)
        const token = urlObj.searchParams.get('token')
        const targetUserId = urlObj.searchParams.get('user') // 主人可指定查看其他用户
        
        if (!token) {
            res.writeHead(302, { 'Location': '/qfarm/login' })
            res.end()
            return true
        }

        const auth = tokenManager.verify(token)
        if (!auth) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(this.getErrorHtml('令牌已过期或无效', '请使用 "#农场面板" 指令获取新的通行令牌'))
            return true
        }

        // 标记令牌已使用（但保留会话）
        tokenManager.use(token)

        // 确定要查看的用户ID
        let viewUserId = auth.userId
        let isViewingOther = false
        
        // 如果是主人且指定了目标用户，则查看他人数据
        if (auth.isMaster && targetUserId && targetUserId !== auth.userId) {
            viewUserId = targetUserId
            isViewingOther = true
        }

        // 获取用户数据
        const account = await Farm.getUserAccount(viewUserId)
        const status = account ? await Farm.getUserAccountStatus(viewUserId) : null
        
        // 如果是主人，获取用户列表供切换
        let userList = []
        if (auth.isMaster) {
            userList = await tokenManager.getUserList()
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(this.getPanelHtml(viewUserId, account, status, auth, isViewingOther, userList))
        return true
    }

    // 处理API请求
    async handleApi(req, res) {
        const urlObj = new URL(req.url, `http://${req.headers.host}`)
        const path = urlObj.pathname
        
        res.setHeader('Content-Type', 'application/json; charset=utf-8')

        // 获取用户状态
        if (path === '/qfarm/api/status') {
            const token = urlObj.searchParams.get('token')
            const targetUserId = urlObj.searchParams.get('user')
            const auth = tokenManager.verify(token)
            
            if (!auth) {
                res.writeHead(401)
                res.end(JSON.stringify({ success: false, message: '未授权' }))
                return true
            }

            try {
                // 主人可以查看他人，普通用户只能看自己
                let viewUserId = auth.userId
                if (auth.isMaster && targetUserId) {
                    viewUserId = targetUserId
                }

                const account = await Farm.getUserAccount(viewUserId)
                const status = account ? await Farm.getUserAccountStatus(viewUserId) : null
                
                res.writeHead(200)
                res.end(JSON.stringify({
                    success: true,
                    data: {
                        hasAccount: !!account,
                        account: account ? {
                            id: account.id,
                            name: account.name,
                            createdAt: account.createdAt
                        } : null,
                        status: status,
                        isMaster: auth.isMaster,
                        isViewingOther: viewUserId !== auth.userId
                    }
                }))
            } catch (error) {
                res.writeHead(500)
                res.end(JSON.stringify({ success: false, message: error.message }))
            }
            return true
        }

        // 获取用户列表（仅主人）
        if (path === '/qfarm/api/users') {
            const token = urlObj.searchParams.get('token')
            const auth = tokenManager.verify(token)
            
            if (!auth || !auth.isMaster) {
                res.writeHead(403)
                res.end(JSON.stringify({ success: false, message: '无权限' }))
                return true
            }

            try {
                const users = await tokenManager.getUserList()
                res.writeHead(200)
                res.end(JSON.stringify({ success: true, data: { users } }))
            } catch (error) {
                res.writeHead(500)
                res.end(JSON.stringify({ success: false, message: error.message }))
            }
            return true
        }

        // 切换自动挂机
        if (path === '/qfarm/api/toggle-auto') {
            return this.handleToggleAuto(req, res)
        }

        // 获取账号详细状态
        if (path === '/qfarm/api/account-details') {
            return this.handleAccountDetails(req, res)
        }

        // 退出登录
        if (path === '/qfarm/api/logout') {
            return this.handleLogout(req, res)
        }

        // 获取日志
        if (path === '/qfarm/api/logs') {
            return this.handleLogs(req, res)
        }

        // 获取土地详情
        if (path === '/qfarm/api/lands') {
            return this.handleLands(req, res)
        }

        // 获取统计数据
        if (path === '/qfarm/api/stats') {
            return this.handleStats(req, res)
        }

        // 执行操作
        if (path === '/qfarm/api/action') {
            return this.handleAction(req, res)
        }

        res.writeHead(404)
        res.end(JSON.stringify({ success: false, message: '接口不存在' }))
        return true
    }

    // 处理切换自动挂机
    async handleToggleAuto(req, res) {
        if (req.method !== 'POST') {
            res.writeHead(405)
            res.end(JSON.stringify({ success: false, message: '方法不允许' }))
            return true
        }

        let body = ''
        req.on('data', chunk => body += chunk)
        req.on('end', async () => {
            try {
                const data = JSON.parse(body)
                const userId = tokenManager.verify(data.token)
                
                if (!userId) {
                    res.writeHead(401)
                    res.end(JSON.stringify({ success: false, message: '未授权' }))
                    return
                }

                const account = await Farm.getUserAccount(userId)
                if (!account) {
                    res.writeHead(400)
                    res.end(JSON.stringify({ success: false, message: '未绑定账号' }))
                    return
                }

                const status = await Farm.getUserAccountStatus(userId)
                const isRunning = status?.isRunning || false

                if (isRunning) {
                    await Farm.stopUserAccount(userId)
                } else {
                    await Farm.startUserAccount(userId)
                }

                res.writeHead(200)
                res.end(JSON.stringify({ success: true, data: { isRunning: !isRunning } }))
            } catch (error) {
                res.writeHead(500)
                res.end(JSON.stringify({ success: false, message: error.message }))
            }
        })
        return true
    }

    // 获取账号详细信息
    async handleAccountDetails(req, res) {
        const urlObj = new URL(req.url, `http://${req.headers.host}`)
        const token = urlObj.searchParams.get('token')
        const userId = tokenManager.verify(token)
        
        if (!userId) {
            res.writeHead(401)
            res.end(JSON.stringify({ success: false, message: '未授权' }))
            return true
        }

        try {
            const account = await Farm.getUserAccount(userId)
            if (!account) {
                res.writeHead(400)
                res.end(JSON.stringify({ success: false, message: '未绑定账号' }))
                return true
            }

            // 获取详细信息
            const [status, dailyRewards, lands] = await Promise.all([
                Farm.getUserAccountStatus(userId),
                Api.getDailyRewards(account.id).catch(() => null),
                Api.getLands(account.id).catch(() => null)
            ])

            res.writeHead(200)
            res.end(JSON.stringify({
                success: true,
                data: {
                    status,
                    dailyRewards,
                    lands
                }
            }))
        } catch (error) {
            res.writeHead(500)
            res.end(JSON.stringify({ success: false, message: error.message }))
        }
        return true
    }

    // 处理退出登录
    async handleLogout(req, res) {
        if (req.method !== 'POST') {
            res.writeHead(405)
            res.end(JSON.stringify({ success: false, message: '方法不允许' }))
            return true
        }

        let body = ''
        req.on('data', chunk => body += chunk)
        req.on('end', async () => {
            try {
                const data = JSON.parse(body)
                const userId = tokenManager.verify(data.token)
                
                if (!userId) {
                    res.writeHead(401)
                    res.end(JSON.stringify({ success: false, message: '未授权' }))
                    return
                }

                await Farm.deleteUserAccount(userId)
                res.writeHead(200)
                res.end(JSON.stringify({ success: true }))
            } catch (error) {
                res.writeHead(500)
                res.end(JSON.stringify({ success: false, message: error.message }))
            }
        })
        return true
    }

    // 处理获取日志
    async handleLogs(req, res) {
        const urlObj = new URL(req.url, `http://${req.headers.host}`)
        const token = urlObj.searchParams.get('token')
        const targetUserId = urlObj.searchParams.get('user')
        const auth = tokenManager.verify(token)
        
        if (!auth) {
            res.writeHead(401)
            res.end(JSON.stringify({ success: false, message: '未授权' }))
            return true
        }

        try {
            // 主人可以查看他人，普通用户只能看自己
            let viewUserId = auth.userId
            if (auth.isMaster && targetUserId) {
                viewUserId = targetUserId
            }

            const account = await Farm.getUserAccount(viewUserId)
            if (!account) {
                res.writeHead(400)
                res.end(JSON.stringify({ success: false, message: '未绑定账号' }))
                return true
            }

            const limit = parseInt(urlObj.searchParams.get('limit')) || 50
            const logs = await panelManager.getLogs(account.id, limit)

            res.writeHead(200)
            res.end(JSON.stringify({
                success: true,
                data: {
                    logs: logs.map(log => ({
                        time: log.time,
                        tag: log.tag,
                        message: log.message,
                        tagClass: this.getLogTagClass(log.tag)
                    })),
                    isMaster: auth.isMaster,
                    isViewingOther: viewUserId !== auth.userId,
                    viewedUserId: viewUserId
                }
            }))
        } catch (error) {
            res.writeHead(500)
            res.end(JSON.stringify({ success: false, message: error.message }))
        }
        return true
    }

    // 处理获取土地详情
    async handleLands(req, res) {
        const urlObj = new URL(req.url, `http://${req.headers.host}`)
        const token = urlObj.searchParams.get('token')
        const targetUserId = urlObj.searchParams.get('user')
        const auth = tokenManager.verify(token)
        
        if (!auth) {
            res.writeHead(401)
            res.end(JSON.stringify({ success: false, message: '未授权' }))
            return true
        }

        try {
            // 主人可以查看他人，普通用户只能看自己
            let viewUserId = auth.userId
            if (auth.isMaster && targetUserId) {
                viewUserId = targetUserId
            }

            const [status, landsData] = await Promise.all([
                Farm.getUserAccountStatus(viewUserId),
                panelManager.getLands(viewUserId)
            ])

            const processedLands = this.processLandsData(landsData)

            res.writeHead(200)
            res.end(JSON.stringify({
                success: true,
                data: {
                    lands: processedLands,
                    summary: {
                        total: processedLands.length,
                        unlocked: processedLands.filter(l => !l.locked).length,
                        growing: processedLands.filter(l => l.statusClass === 'growing').length,
                        mature: processedLands.filter(l => l.statusClass === 'mature').length,
                        empty: processedLands.filter(l => l.empty).length,
                        dead: processedLands.filter(l => l.statusClass === 'dead').length
                    },
                    userName: status?.userState?.name,
                    level: status?.userState?.level,
                    isMaster: auth.isMaster,
                    isViewingOther: viewUserId !== auth.userId,
                    viewedUserId: viewUserId
                }
            }))
        } catch (error) {
            res.writeHead(500)
            res.end(JSON.stringify({ success: false, message: error.message }))
        }
        return true
    }

    // 处理获取统计数据
    async handleStats(req, res) {
        const urlObj = new URL(req.url, `http://${req.headers.host}`)
        const token = urlObj.searchParams.get('token')
        const targetUserId = urlObj.searchParams.get('user')
        const auth = tokenManager.verify(token)
        
        if (!auth) {
            res.writeHead(401)
            res.end(JSON.stringify({ success: false, message: '未授权' }))
            return true
        }

        try {
            // 主人可以查看他人，普通用户只能看自己
            let viewUserId = auth.userId
            if (auth.isMaster && targetUserId) {
                viewUserId = targetUserId
            }

            const status = await Farm.getUserAccountStatus(viewUserId)
            if (!status) {
                res.writeHead(400)
                res.end(JSON.stringify({ success: false, message: '未绑定账号' }))
                return true
            }

            const stats = status.stats || {}
            const hasData = stats.harvests > 0 || stats.steals > 0 || stats.helps > 0

            // 计算运行时间
            let runtime = null
            if (stats.startTime) {
                const start = new Date(stats.startTime)
                const now = new Date()
                const diff = Math.floor((now - start) / 1000)
                const hours = Math.floor(diff / 3600)
                const minutes = Math.floor((diff % 3600) / 60)
                runtime = {
                    formatted: hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`,
                    startTime: start.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                }
            }

            // 计算效率
            let efficiency = null
            if (runtime && stats.startTime) {
                const start = new Date(stats.startTime)
                const now = new Date()
                const hours = Math.max(1, (now - start) / 3600000)
                efficiency = {
                    harvestsPerHour: (stats.harvests / hours).toFixed(1),
                    stealsPerHour: (stats.steals / hours).toFixed(1),
                    helpsPerHour: (stats.helps / hours).toFixed(1)
                }
            }

            res.writeHead(200)
            res.end(JSON.stringify({
                success: true,
                data: {
                    hasData,
                    harvests: stats.harvests || 0,
                    steals: stats.steals || 0,
                    helps: stats.helps || 0,
                    sells: stats.sells || 0,
                    tasks: stats.tasks || 0,
                    totalGold: (stats.sells || 0) * 100,
                    runtime,
                    efficiency,
                    userName: status.userState?.name,
                    level: status.userState?.level,
                    gold: status.userState?.gold || 0,
                    isMaster: auth.isMaster,
                    isViewingOther: viewUserId !== auth.userId,
                    viewedUserId: viewUserId
                }
            }))
        } catch (error) {
            res.writeHead(500)
            res.end(JSON.stringify({ success: false, message: error.message }))
        }
        return true
    }

    // 处理执行操作
    async handleAction(req, res) {
        if (req.method !== 'POST') {
            res.writeHead(405)
            res.end(JSON.stringify({ success: false, message: '方法不允许' }))
            return true
        }

        let body = ''
        req.on('data', chunk => body += chunk)
        req.on('end', async () => {
            try {
                const data = JSON.parse(body)
                const userId = tokenManager.verify(data.token)
                
                if (!userId) {
                    res.writeHead(401)
                    res.end(JSON.stringify({ success: false, message: '未授权' }))
                    return
                }

                const { action } = data
                const validActions = ['checkFarm', 'sellFruits', 'claimTasks']
                
                if (!validActions.includes(action)) {
                    res.writeHead(400)
                    res.end(JSON.stringify({ success: false, message: '无效的操作' }))
                    return
                }

                const result = await panelManager.executeAction(userId, action)
                res.writeHead(200)
                res.end(JSON.stringify({ success: true, data: result }))
            } catch (error) {
                res.writeHead(500)
                res.end(JSON.stringify({ success: false, message: error.message }))
            }
        })
        return true
    }

    // 辅助方法：获取日志标签样式类
    getLogTagClass(tag) {
        const tagMap = {
            '农场': 'farm',
            '好友': 'friend',
            '系统': 'system',
            '错误': 'error',
            '连接': 'connection',
            '任务': 'task',
            '仓库': 'system',
            '升级': 'system'
        }
        return tagMap[tag] || 'system'
    }

    // 辅助方法：处理土地数据
    processLandsData(landsData) {
        if (!landsData || !Array.isArray(landsData)) {
            return []
        }

        const phaseNames = ['种子', '发芽', '小叶', '大叶', '开花', '成熟', '枯死']
        const plantIcons = ['🌱', '🌿', '🌾', '🌻', '🌹', '🍎', '🥀']

        return landsData.map(land => {
            const isLocked = !land.unlocked
            const isEmpty = !land.plant
            const phase = land.plant?.phase || 0
            const isMature = phase === 6
            const isDead = phase === 7
            const isDry = land.plant?.isDry || false

            let statusClass = 'empty'
            let statusIcon = '🌱'

            if (isLocked) {
                statusClass = 'locked'
                statusIcon = '🔒'
            } else if (isEmpty) {
                statusClass = 'empty'
                statusIcon = '🌱'
            } else if (isDead) {
                statusClass = 'dead'
                statusIcon = '🥀'
            } else if (isMature) {
                statusClass = 'mature'
                statusIcon = '✨'
            } else if (isDry) {
                statusClass = 'dry'
                statusIcon = '💧'
            } else {
                statusClass = 'growing'
                statusIcon = '🌿'
            }

            return {
                id: land.id,
                locked: isLocked,
                empty: isEmpty,
                statusClass,
                statusIcon,
                plantIcon: plantIcons[phase] || '🌱',
                plantName: land.plant?.name || '空地',
                phaseName: phaseNames[phase] || '未知',
                progress: land.plant?.progress || 0,
                timeText: land.plant?.remainTime || '',
                unlockCost: land.unlockCost
            }
        })
    }

    // 获取错误页面HTML
    getErrorHtml(title, message) {
        const template = loadTemplate('error.html')
        if (!template) {
            // 如果模板加载失败，返回简单的错误信息
            return `<h1>${title}</h1><p>${message}</p>`
        }
        return renderTemplate(template, { title, message })
    }

    // 获取路由禁用页面HTML
    getDisabledHtml() {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QQ农场 - 服务不可用</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .disabled-card {
            background: white;
            border-radius: 24px;
            padding: 40px;
            text-align: center;
            max-width: 400px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .disabled-icon {
            width: 80px;
            height: 80px;
            background: #fff3e0;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            font-size: 40px;
        }
        h1 { color: #e65100; font-size: 24px; margin-bottom: 12px; }
        p { color: #666; line-height: 1.6; margin-bottom: 8px; }
        .hint { color: #999; font-size: 14px; margin-top: 16px; }
    </style>
</head>
<body>
    <div class="disabled-card">
        <div class="disabled-icon">🚫</div>
        <h1>Web面板已停用</h1>
        <p>QQ农场Web面板功能当前已被停用</p>
        <p class="hint">请联系Bot主人通过指令"#开启农场面板"或锅巴配置开启</p>
    </div>
</body>
</html>`
    }

    // 获取面板HTML
    getPanelHtml(userId, account, status, auth = null, isViewingOther = false, userList = []) {
        const isLoggedIn = !!account
        const isRunning = status?.isRunning || false
        const isConnected = status?.isConnected || false
        const userName = status?.userState?.name || '未知'
        const level = status?.userState?.level || 0
        const gold = (status?.userState?.gold || 0).toLocaleString()
        const harvests = status?.stats?.harvests || 0
        const steals = status?.stats?.steals || 0
        const isMaster = auth?.isMaster || false
        
        // 生成用户选择下拉框（仅主人）
        let userSelectHtml = ''
        if (isMaster && userList.length > 0) {
            const options = userList.map(u => 
                `<option value="${u.userId}" ${u.userId === userId ? 'selected' : ''}>${u.id} (QQ: ${u.userId})</option>`
            ).join('')
            userSelectHtml = `
            <div style="margin-bottom: 16px;">
                <label style="font-size: 14px; color: var(--md-sys-color-secondary); display: block; margin-bottom: 8px;">切换用户查看</label>
                <select id="userSelect" onchange="switchUser(this.value)" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--md-sys-color-outline); background: var(--md-sys-color-surface); font-size: 14px;">
                    <option value="${auth.userId}">自己 (${auth.userId})</option>
                    ${options}
                </select>
            </div>`
        }

        // 生成主人模式标签
        const masterBadge = isMaster ? '<span style="font-size:14px;background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:12px;margin-left:8px;">主人模式</span>' : ''

        // 生成内容区域
        let content = ''
        if (isLoggedIn) {
            // 查看他人提示
            const viewingOtherBanner = isViewingOther ? `
            <div class="viewing-other-banner">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span class="material-icons">visibility</span>
                    <span>正在查看用户 ${userId} 的数据</span>
                </div>
                <button onclick="switchUser('${auth.userId}')" style="background:rgba(255,255,255,0.2);border:none;color:white;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;">
                    返回自己
                </button>
            </div>` : ''

            content = viewingOtherBanner + userSelectHtml + `
            <!-- 状态概览 -->
            <div class="card">
                <div class="card-title">
                    <span class="material-icons">dashboard</span>
                    状态概览
                </div>
                <div class="status-grid">
                    <div class="status-item">
                        <div class="status-value">${level}</div>
                        <div class="status-label">等级</div>
                    </div>
                    <div class="status-item">
                        <div class="status-value">${gold}</div>
                        <div class="status-label">金币</div>
                    </div>
                    <div class="status-item">
                        <div class="status-value">${harvests}</div>
                        <div class="status-label">收获</div>
                    </div>
                    <div class="status-item">
                        <div class="status-value">${steals}</div>
                        <div class="status-label">偷取</div>
                    </div>
                </div>
            </div>

            <!-- 账号信息 -->
            <div class="card">
                <div class="card-title">
                    <span class="material-icons">person</span>
                    账号信息
                </div>
                <div class="info-row">
                    <span class="info-label">游戏昵称</span>
                    <span class="info-value">${userName}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">运行状态</span>
                    <span class="badge ${isRunning ? 'badge-success' : 'badge-error'}">
                        <span class="material-icons" style="font-size: 14px;">${isRunning ? 'check_circle' : 'cancel'}</span>
                        ${isRunning ? '运行中' : '已停止'}
                    </span>
                </div>
                <div class="info-row">
                    <span class="info-label">连接状态</span>
                    <span class="badge ${isConnected ? 'badge-success' : 'badge-warning'}">
                        <span class="material-icons" style="font-size: 14px;">${isConnected ? 'wifi' : 'wifi_off'}</span>
                        ${isConnected ? '已连接' : '未连接'}
                    </span>
                </div>
                <div class="info-row">
                    <span class="info-label">账号ID</span>
                    <span class="info-value" style="font-family: monospace;">${account.id}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">创建时间</span>
                    <span class="info-value">${new Date(account.createdAt).toLocaleString('zh-CN')}</span>
                </div>
            </div>

            <!-- 面板功能快捷入口 -->
            <div class="card">
                <div class="card-title">
                    <span class="material-icons">dashboard</span>
                    面板功能
                </div>
                <div class="panel-grid">
                    <div class="panel-item" onclick="showLogs()">
                        <div class="panel-icon">📋</div>
                        <div class="panel-label">运行日志</div>
                        <div class="panel-desc">查看最近操作记录</div>
                    </div>
                    <div class="panel-item" onclick="showLands()">
                        <div class="panel-icon">🌱</div>
                        <div class="panel-label">土地详情</div>
                        <div class="panel-desc">查看所有土地状态</div>
                    </div>
                    <div class="panel-item" onclick="showStats()">
                        <div class="panel-icon">📊</div>
                        <div class="panel-label">统计数据</div>
                        <div class="panel-desc">收获/偷取/帮助统计</div>
                    </div>
                    <div class="panel-item" onclick="showActions()">
                        <div class="panel-icon">⚡</div>
                        <div class="panel-label">快捷操作</div>
                        <div class="panel-desc">手动执行农场操作</div>
                    </div>
                </div>
            </div>

            <!-- 操作按钮 -->
            <div class="card">
                <div class="card-title">
                    <span class="material-icons">settings</span>
                    操作
                </div>
                <div class="actions">
                    <button class="btn ${isRunning ? 'btn-secondary' : 'btn-primary'}" onclick="toggleAuto()">
                        <span class="material-icons">${isRunning ? 'pause' : 'play_arrow'}</span>
                        ${isRunning ? '停止挂机' : '开始挂机'}
                    </button>
                    <button class="btn btn-secondary" onclick="refreshStatus()">
                        <span class="material-icons">refresh</span>
                        刷新状态
                    </button>
                    <button class="btn btn-danger" onclick="logout()">
                        <span class="material-icons">logout</span>
                        退出登录
                    </button>
                </div>
            </div>`
        } else {
            content = `
            <!-- 未登录状态 -->
            <div class="card empty-state">
                <span class="material-icons">account_circle_off</span>
                <h2>未绑定账号</h2>
                <p>你还没有绑定QQ农场账号，请在机器人中使用 "#登录农场" 指令进行登录</p>
            </div>`
        }

        // 加载模板并渲染
        const template = loadTemplate('panel.html')
        if (!template) {
            return '<h1>模板加载失败</h1>'
        }

        return renderTemplate(template, {
            masterBadge,
            content,
            authUserId: auth?.userId || ''
        })
    }
}

// 插件类 - 用于注册指令
export class FarmRoutePlugin extends plugin {
    constructor() {
        super({
            name: 'QQ农场面板路由',
            dsc: 'QQ农场Web面板路由',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#?(农场面板|面板令牌)$',
                    fnc: 'generateToken'
                }
            ]
        })
    }

    // 生成一次性通行令牌
    async generateToken(e) {
        try {
            // 检查路由是否启用
            if (!Config.isRouteEnabled()) {
                await e.reply('❌ Web面板功能当前已停用，请联系主人开启', { recallMsg: 15 })
                return true
            }

            // 检查是否被禁止
            if (Config.isUserBanned(e.user_id)) {
                await e.reply('❌ 你已被禁止使用农场功能', { recallMsg: 15 })
                return true
            }

            // 检查群是否允许
            if (e.group_id && !Config.isGroupAllowed(e.group_id)) {
                await e.reply('❌ 本群已被禁止使用农场功能', { recallMsg: 15 })
                return true
            }

            // 检查是否是主人
            const isMaster = tokenManager.isMaster(e.user_id)

            // 生成令牌（主人有额外权限）
            const token = tokenManager.generate(e.user_id, isMaster)

            // 获取自定义Bot基础地址
            const botBaseUrl = Config.getBotBaseUrl()

            // 构建面板URL
            let panelUrl
            if (botBaseUrl) {
                // 使用自定义地址
                const baseUrl = botBaseUrl.replace(/\/$/, '') // 移除末尾的斜杠
                panelUrl = `${baseUrl}/qfarm?token=${token}`
            } else {
                // 自动检测地址
                panelUrl = `http://${e.bot?.server?.hostname || 'localhost'}:${e.bot?.server?.port || 2536}/qfarm?token=${token}`
            }

            let msg = [
                '═══ QQ农场面板 ═══\n\n',
                `🔗 面板地址:\n${panelUrl}\n\n`,
                '⏰ 令牌有效期: 5分钟\n',
                '💡 提示: 点击链接即可打开MD3风格面板\n',
                '   可管理农场账号、设置挂机项目等'
            ]

            // 主人额外提示
            if (isMaster) {
                msg.push('\n👑 主人模式: 可查看所有用户数据')
            }

            await e.reply(msg, { recallMsg: 60 })

            return true
        } catch (error) {
            logger.error('[QQ农场] 生成面板令牌失败:', error)
            await e.reply('❌ 生成令牌失败: ' + error.message, { recallMsg: 15 })
            return true
        }
    }
}

// 导出令牌管理器供其他模块使用
export { tokenManager }
