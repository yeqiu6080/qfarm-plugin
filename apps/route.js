import plugin from '../../../lib/plugins/plugin.js'
import { Config, Api } from '../components/index.js'
import Farm from '../model/Farm.js'
import { panelManager } from '../model/PanelManager.js'
import crypto from 'crypto'
import { BotConfig } from '../../../lib/config/config.js'

// 令牌管理器
class TokenManager {
    constructor() {
        this.tokens = new Map() // token -> { userId, role, createdAt, used }
        this.sessionTokens = new Map() // sessionToken -> { userId, role, createdAt } (长期有效)
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000) // 每分钟清理过期令牌
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
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QQ农场 - 错误</title>
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
        .error-card {
            background: white;
            border-radius: 24px;
            padding: 40px;
            text-align: center;
            max-width: 400px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .error-icon {
            width: 80px;
            height: 80px;
            background: #ffebee;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            font-size: 40px;
        }
        h1 { color: #c62828; font-size: 24px; margin-bottom: 12px; }
        p { color: #666; line-height: 1.6; }
    </style>
</head>
<body>
    <div class="error-card">
        <div class="error-icon">⚠️</div>
        <h1>${title}</h1>
        <p>${message}</p>
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

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QQ农场 - 个人面板</title>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
    <style>
        :root {
            --md-sys-color-primary: #6750A4;
            --md-sys-color-on-primary: #FFFFFF;
            --md-sys-color-primary-container: #EADDFF;
            --md-sys-color-on-primary-container: #21005D;
            --md-sys-color-secondary: #625B71;
            --md-sys-color-surface: #FFFBFE;
            --md-sys-color-surface-variant: #E7E0EC;
            --md-sys-color-outline: #79747E;
            --md-sys-color-error: #B3261E;
            --md-sys-color-success: #2E7D32;
            --md-sys-color-warning: #ED6C02;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%);
            min-height: 100vh;
            color: #1C1B1F;
        }

        .app-bar {
            background: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
            padding: 16px 24px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .app-bar h1 {
            font-size: 22px;
            font-weight: 500;
            flex: 1;
        }

        .app-bar .material-icons {
            font-size: 24px;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 24px;
        }

        .card {
            background: var(--md-sys-color-surface);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 16px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .card-title {
            font-size: 16px;
            font-weight: 500;
            color: var(--md-sys-color-secondary);
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 16px;
        }

        .status-item {
            text-align: center;
            padding: 16px;
            background: var(--md-sys-color-surface-variant);
            border-radius: 12px;
        }

        .status-value {
            font-size: 32px;
            font-weight: 700;
            color: var(--md-sys-color-primary);
        }

        .status-label {
            font-size: 12px;
            color: var(--md-sys-color-secondary);
            margin-top: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .info-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid var(--md-sys-color-surface-variant);
        }

        .info-row:last-child {
            border-bottom: none;
        }

        .info-label {
            color: var(--md-sys-color-secondary);
            font-size: 14px;
        }

        .info-value {
            font-weight: 500;
            font-size: 14px;
        }

        .badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 12px;
            border-radius: 16px;
            font-size: 12px;
            font-weight: 500;
        }

        .badge-success {
            background: #E8F5E9;
            color: var(--md-sys-color-success);
        }

        .badge-error {
            background: #FFEBEE;
            color: var(--md-sys-color-error);
        }

        .badge-warning {
            background: #FFF3E0;
            color: var(--md-sys-color-warning);
        }

        .badge-master {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }

        .viewing-other-banner {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 12px;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .viewing-other-banner .material-icons {
            font-size: 20px;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 12px 24px;
            border-radius: 24px;
            border: none;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .btn-primary {
            background: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
        }

        .btn-primary:hover {
            box-shadow: 0 2px 8px rgba(103, 80, 164, 0.4);
        }

        .btn-secondary {
            background: var(--md-sys-color-surface-variant);
            color: var(--md-sys-color-primary);
        }

        .btn-danger {
            background: var(--md-sys-color-error);
            color: white;
        }

        .actions {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }

        .empty-state {
            text-align: center;
            padding: 48px 24px;
        }

        .empty-state .material-icons {
            font-size: 64px;
            color: var(--md-sys-color-outline);
            margin-bottom: 16px;
        }

        .empty-state h2 {
            font-size: 20px;
            font-weight: 500;
            margin-bottom: 8px;
        }

        .empty-state p {
            color: var(--md-sys-color-secondary);
            margin-bottom: 24px;
        }

        .panel-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
        }

        .panel-item {
            background: var(--md-sys-color-surface-variant);
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
            border: 2px solid transparent;
        }

        .panel-item:hover {
            background: var(--md-sys-color-primary-container);
            border-color: var(--md-sys-color-primary);
            transform: translateY(-2px);
        }

        .panel-icon {
            font-size: 32px;
            margin-bottom: 8px;
        }

        .panel-label {
            font-size: 14px;
            font-weight: 500;
            color: var(--md-sys-color-on-surface);
            margin-bottom: 4px;
        }

        .panel-desc {
            font-size: 12px;
            color: var(--md-sys-color-secondary);
        }

        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .modal.show {
            display: flex;
        }

        .modal-content {
            background: var(--md-sys-color-surface);
            border-radius: 20px;
            max-width: 600px;
            width: 100%;
            max-height: 80vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .modal-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--md-sys-color-surface-variant);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .modal-title {
            font-size: 18px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .modal-close {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: var(--md-sys-color-secondary);
            padding: 4px;
            border-radius: 50%;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .modal-close:hover {
            background: var(--md-sys-color-surface-variant);
        }

        .modal-body {
            padding: 20px 24px;
            overflow-y: auto;
            flex: 1;
        }

        .log-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .log-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background: var(--md-sys-color-surface-variant);
            border-radius: 8px;
            border-left: 3px solid var(--md-sys-color-primary);
        }

        .log-item.farm { border-left-color: #4ade80; }
        .log-item.friend { border-left-color: #f472b6; }
        .log-item.system { border-left-color: #60a5fa; }
        .log-item.error { border-left-color: #ef4444; }

        .log-time {
            font-size: 12px;
            color: var(--md-sys-color-secondary);
            min-width: 50px;
            font-family: monospace;
        }

        .log-tag {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 4px;
            font-weight: 500;
            min-width: 45px;
            text-align: center;
        }

        .log-tag.farm { background: rgba(74, 222, 128, 0.15); color: #16a34a; }
        .log-tag.friend { background: rgba(244, 114, 182, 0.15); color: #db2777; }
        .log-tag.system { background: rgba(96, 165, 250, 0.15); color: #2563eb; }
        .log-tag.error { background: rgba(239, 68, 68, 0.15); color: #dc2626; }

        .log-message {
            flex: 1;
            font-size: 13px;
            color: var(--md-sys-color-on-surface);
        }

        .land-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
        }

        .land-item {
            background: var(--md-sys-color-surface-variant);
            border-radius: 12px;
            padding: 16px 8px;
            text-align: center;
            border: 2px solid transparent;
        }

        .land-item.locked { border-color: #64748b; background: rgba(100, 116, 139, 0.1); }
        .land-item.empty { border-color: #94a3b8; }
        .land-item.growing { border-color: #22c55e; }
        .land-item.mature { border-color: #fbbf24; background: rgba(251, 191, 36, 0.1); }
        .land-item.dead { border-color: #ef4444; }

        .land-id {
            font-size: 11px;
            color: var(--md-sys-color-secondary);
            margin-bottom: 4px;
        }

        .land-icon {
            font-size: 28px;
            margin-bottom: 4px;
        }

        .land-name {
            font-size: 12px;
            font-weight: 500;
            margin-bottom: 2px;
        }

        .land-phase {
            font-size: 11px;
            color: var(--md-sys-color-secondary);
        }

        .land-progress {
            height: 4px;
            background: rgba(0,0,0,0.1);
            border-radius: 2px;
            margin-top: 8px;
            overflow: hidden;
        }

        .land-progress-bar {
            height: 100%;
            border-radius: 2px;
            transition: width 0.3s;
        }

        .land-progress-bar.growing { background: #22c55e; }
        .land-progress-bar.mature { background: #fbbf24; }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
        }

        .stats-item {
            background: var(--md-sys-color-surface-variant);
            border-radius: 12px;
            padding: 16px;
            text-align: center;
        }

        .stats-value {
            font-size: 24px;
            font-weight: 700;
            color: var(--md-sys-color-primary);
            margin-bottom: 4px;
        }

        .stats-label {
            font-size: 12px;
            color: var(--md-sys-color-secondary);
        }

        .action-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .action-btn {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px;
            background: var(--md-sys-color-surface-variant);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
            width: 100%;
            text-align: left;
        }

        .action-btn:hover {
            background: var(--md-sys-color-primary-container);
        }

        .action-btn-icon {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            background: var(--md-sys-color-primary);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
        }

        .action-btn-content {
            flex: 1;
        }

        .action-btn-title {
            font-size: 14px;
            font-weight: 500;
            color: var(--md-sys-color-on-surface);
        }

        .action-btn-desc {
            font-size: 12px;
            color: var(--md-sys-color-secondary);
            margin-top: 2px;
        }

        .empty-logs {
            text-align: center;
            padding: 40px;
            color: var(--md-sys-color-secondary);
        }

        .toast {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: #323232;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            opacity: 0;
            transition: all 0.3s;
            z-index: 1000;
        }

        .toast.show {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }

        @media (max-width: 600px) {
            .container {
                padding: 16px;
            }
            
            .card {
                padding: 16px;
            }
            
            .status-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    </style>
</head>
<body>
    <div class="app-bar">
        <span class="material-icons">agriculture</span>
        <h1>QQ农场 ${isMaster ? '<span style="font-size:14px;background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:12px;margin-left:8px;">主人模式</span>' : ''}</h1>
        <span class="material-icons">account_circle</span>
    </div>

    <div class="container">
        ${isLoggedIn ? `
        ${isViewingOther ? `
        <!-- 查看他人提示 -->
        <div class="viewing-other-banner">
            <div style="display:flex;align-items:center;gap:8px;">
                <span class="material-icons">visibility</span>
                <span>正在查看用户 ${userId} 的数据</span>
            </div>
            <button onclick="switchUser('${auth.userId}')" style="background:rgba(255,255,255,0.2);border:none;color:white;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;">
                返回自己
            </button>
        </div>
        ` : ''}

        ${userSelectHtml}

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
        </div>
        ` : `
        <!-- 未登录状态 -->
        <div class="card empty-state">
            <span class="material-icons">account_circle_off</span>
            <h2>未绑定账号</h2>
            <p>你还没有绑定QQ农场账号，请在机器人中使用 "#登录农场" 指令进行登录</p>
        </div>
        `}
    </div>

    <div class="toast" id="toast"></div>

    <!-- 模态框 -->
    <div class="modal" id="modal">
        <div class="modal-content">
            <div class="modal-header">
                <div class="modal-title" id="modal-title">
                    <span class="material-icons">info</span>
                    <span>标题</span>
                </div>
                <button class="modal-close" onclick="closeModal()">×</button>
            </div>
            <div class="modal-body" id="modal-body">
                <!-- 动态内容 -->
            </div>
        </div>
    </div>

    <script>
        const token = new URLSearchParams(window.location.search).get('token');

        function showToast(message) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }

        function showModal(title, content) {
            document.getElementById('modal-title').innerHTML = title;
            document.getElementById('modal-body').innerHTML = content;
            document.getElementById('modal').classList.add('show');
        }

        function closeModal() {
            document.getElementById('modal').classList.remove('show');
        }

        // 点击模态框外部关闭
        document.getElementById('modal').addEventListener('click', (e) => {
            if (e.target.id === 'modal') closeModal();
        });

        async function toggleAuto() {
            try {
                const response = await fetch('/qfarm/api/toggle-auto', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                const data = await response.json();
                
                if (data.success) {
                    showToast(data.data.isRunning ? '已开始挂机' : '已停止挂机');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    showToast('操作失败: ' + data.message);
                }
            } catch (error) {
                showToast('网络错误');
            }
        }

        async function refreshStatus() {
            showToast('正在刷新...');
            location.reload();
        }

        async function logout() {
            if (!confirm('确定要退出登录吗？这将删除你的农场账号。')) return;
            
            try {
                const response = await fetch('/qfarm/api/logout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                const data = await response.json();
                
                if (data.success) {
                    showToast('已退出登录');
                    setTimeout(() => location.href = '/qfarm', 2000);
                } else {
                    showToast('退出失败: ' + data.message);
                }
            } catch (error) {
                showToast('网络错误');
            }
        }

        // 切换用户（仅主人）
        function switchUser(targetUserId) {
            const url = new URL(window.location.href);
            if (targetUserId === '${auth?.userId || ''}') {
                url.searchParams.delete('user');
            } else {
                url.searchParams.set('user', targetUserId);
            }
            window.location.href = url.toString();
        }

        // 显示日志
        async function showLogs() {
            showModal('<span class="material-icons">article</span> 运行日志', '<div style="text-align:center;padding:40px;">加载中...</div>');
            
            try {
                const response = await fetch('/qfarm/api/logs?token=' + token + '&limit=30');
                const data = await response.json();
                
                if (data.success && data.data.logs.length > 0) {
                    const logsHtml = data.data.logs.map(log => {
                        const date = new Date(log.time);
                        const time = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
                        return `<div class="log-item ${log.tagClass}">
                            <div class="log-time">${time}</div>
                            <div class="log-tag ${log.tagClass}">${log.tag}</div>
                            <div class="log-message">${log.message}</div>
                        </div>`;
                    }).join('');
                    showModal('<span class="material-icons">article</span> 运行日志', `<div class="log-list">${logsHtml}</div>`);
                } else {
                    showModal('<span class="material-icons">article</span> 运行日志', '<div class="empty-logs">暂无日志记录</div>');
                }
            } catch (error) {
                showModal('<span class="material-icons">article</span> 运行日志', '<div class="empty-logs">加载失败</div>');
            }
        }

        // 显示土地
        async function showLands() {
            showModal('<span class="material-icons">grass</span> 土地详情', '<div style="text-align:center;padding:40px;">加载中...</div>');
            
            try {
                const response = await fetch('/qfarm/api/lands?token=' + token);
                const data = await response.json();
                
                if (data.success) {
                    const summary = data.data.summary;
                    const summaryHtml = `<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
                        <div style="background:var(--md-sys-color-surface-variant);padding:8px 16px;border-radius:8px;font-size:12px;">
                            总计: <strong>${summary.total}</strong>
                        </div>
                        <div style="background:rgba(34,197,94,0.15);padding:8px 16px;border-radius:8px;font-size:12px;color:#16a34a;">
                            生长中: <strong>${summary.growing}</strong>
                        </div>
                        <div style="background:rgba(251,191,36,0.15);padding:8px 16px;border-radius:8px;font-size:12px;color:#d97706;">
                            可收获: <strong>${summary.mature}</strong>
                        </div>
                    </div>`;
                    
                    const landsHtml = data.data.lands.map(land => {
                        const progressBar = land.progress > 0 ? `<div class="land-progress"><div class="land-progress-bar ${land.statusClass}" style="width:${land.progress}%"></div></div>` : '';
                        return `<div class="land-item ${land.statusClass}">
                            <div class="land-id">#${land.id}</div>
                            <div class="land-icon">${land.plantIcon}</div>
                            <div class="land-name">${land.plantName}</div>
                            <div class="land-phase">${land.phaseName}</div>
                            ${progressBar}
                        </div>`;
                    }).join('');
                    
                    showModal('<span class="material-icons">grass</span> 土地详情', summaryHtml + '<div class="land-grid">' + landsHtml + '</div>');
                } else {
                    showModal('<span class="material-icons">grass</span> 土地详情', '<div class="empty-logs">加载失败</div>');
                }
            } catch (error) {
                showModal('<span class="material-icons">grass</span> 土地详情', '<div class="empty-logs">加载失败</div>');
            }
        }

        // 显示统计
        async function showStats() {
            showModal('<span class="material-icons">bar_chart</span> 统计数据', '<div style="text-align:center;padding:40px;">加载中...</div>');
            
            try {
                const response = await fetch('/qfarm/api/stats?token=' + token);
                const data = await response.json();
                
                if (data.success) {
                    const d = data.data;
                    let html = '<div class="stats-grid">';
                    html += `<div class="stats-item"><div class="stats-value">${d.harvests}</div><div class="stats-label">收获次数</div></div>`;
                    html += `<div class="stats-item"><div class="stats-value">${d.steals}</div><div class="stats-label">偷取次数</div></div>`;
                    html += `<div class="stats-item"><div class="stats-value">${d.helps}</div><div class="stats-label">帮助次数</div></div>`;
                    html += `<div class="stats-item"><div class="stats-value">${d.sells}</div><div class="stats-label">出售次数</div></div>`;
                    html += `<div class="stats-item"><div class="stats-value">${d.tasks}</div><div class="stats-label">完成任务</div></div>`;
                    html += `<div class="stats-item"><div class="stats-value">${d.totalGold.toLocaleString()}</div><div class="stats-label">累计金币</div></div>`;
                    html += '</div>';
                    
                    if (d.runtime) {
                        html += `<div style="background:var(--md-sys-color-surface-variant);padding:16px;border-radius:12px;margin-top:16px;">
                            <div style="font-size:12px;color:var(--md-sys-color-secondary);margin-bottom:4px;">运行时长</div>
                            <div style="font-size:18px;font-weight:600;">${d.runtime.formatted}</div>
                            <div style="font-size:12px;color:var(--md-sys-color-secondary);margin-top:4px;">启动于 ${d.runtime.startTime}</div>
                        </div>`;
                    }
                    
                    if (d.efficiency) {
                        html += `<div style="margin-top:16px;">
                            <div style="font-size:12px;color:var(--md-sys-color-secondary);margin-bottom:8px;">效率统计</div>
                            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                                <div style="background:var(--md-sys-color-surface-variant);padding:12px;border-radius:8px;text-align:center;">
                                    <div style="font-size:16px;font-weight:600;color:var(--md-sys-color-primary);">${d.efficiency.harvestsPerHour}</div>
                                    <div style="font-size:11px;color:var(--md-sys-color-secondary);">收获/小时</div>
                                </div>
                                <div style="background:var(--md-sys-color-surface-variant);padding:12px;border-radius:8px;text-align:center;">
                                    <div style="font-size:16px;font-weight:600;color:var(--md-sys-color-primary);">${d.efficiency.stealsPerHour}</div>
                                    <div style="font-size:11px;color:var(--md-sys-color-secondary);">偷取/小时</div>
                                </div>
                                <div style="background:var(--md-sys-color-surface-variant);padding:12px;border-radius:8px;text-align:center;">
                                    <div style="font-size:16px;font-weight:600;color:var(--md-sys-color-primary);">${d.efficiency.helpsPerHour}</div>
                                    <div style="font-size:11px;color:var(--md-sys-color-secondary);">帮助/小时</div>
                                </div>
                            </div>
                        </div>`;
                    }
                    
                    showModal('<span class="material-icons">bar_chart</span> 统计数据', html);
                } else {
                    showModal('<span class="material-icons">bar_chart</span> 统计数据', '<div class="empty-logs">加载失败</div>');
                }
            } catch (error) {
                showModal('<span class="material-icons">bar_chart</span> 统计数据', '<div class="empty-logs">加载失败</div>');
            }
        }

        // 显示操作
        function showActions() {
            const actions = [
                { name: 'checkFarm', icon: '🌾', title: '检查农场', desc: '检查农场状态并执行必要操作' },
                { name: 'sellFruits', icon: '📦', title: '出售果实', desc: '出售仓库中的果实获取金币' },
                { name: 'claimTasks', icon: '📝', title: '领取任务', desc: '领取并完成任务奖励' }
            ];
            
            const html = actions.map(action => `
                <button class="action-btn" onclick="executeAction('${action.name}')">
                    <div class="action-btn-icon">${action.icon}</div>
                    <div class="action-btn-content">
                        <div class="action-btn-title">${action.title}</div>
                        <div class="action-btn-desc">${action.desc}</div>
                    </div>
                    <span class="material-icons" style="color:var(--md-sys-color-secondary);">chevron_right</span>
                </button>
            `).join('');
            
            showModal('<span class="material-icons">bolt</span> 快捷操作', '<div class="action-list">' + html + '</div>');
        }

        // 执行操作
        async function executeAction(action) {
            closeModal();
            showToast('正在执行...');
            
            try {
                const response = await fetch('/qfarm/api/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, action })
                });
                const data = await response.json();
                
                if (data.success) {
                    showToast(data.data?.message || '操作完成');
                } else {
                    showToast('操作失败: ' + data.message);
                }
            } catch (error) {
                showToast('网络错误');
            }
        }

        // 自动刷新状态（每30秒）
        setInterval(() => {
            fetch('/qfarm/api/status?token=' + token)
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        // 可以在这里更新UI而不刷新页面
                    }
                });
        }, 30000);
    </script>
</body>
</html>`
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

            // 构建面板URL
            const panelUrl = `http://${e.bot?.server?.hostname || 'localhost'}:${e.bot?.server?.port || 2536}/qfarm?token=${token}`

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
