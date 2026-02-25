import plugin from '../../../lib/plugins/plugin.js'
import { Config, Api } from '../components/index.js'
import Farm from '../model/Farm.js'
import crypto from 'crypto'

// 令牌管理器
class TokenManager {
    constructor() {
        this.tokens = new Map() // token -> { userId, createdAt, used }
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000) // 每分钟清理过期令牌
    }

    // 生成令牌
    generate(userId) {
        const token = crypto.randomBytes(16).toString('hex')
        this.tokens.set(token, {
            userId: String(userId),
            createdAt: Date.now(),
            used: false
        })
        return token
    }

    // 验证令牌
    verify(token) {
        const data = this.tokens.get(token)
        if (!data) return null
        if (data.used) return null
        if (Date.now() - data.createdAt > 5 * 60 * 1000) { // 5分钟过期
            this.tokens.delete(token)
            return null
        }
        return data.userId
    }

    // 使用令牌
    use(token) {
        const data = this.tokens.get(token)
        if (data) {
            data.used = true
            // 使用后5分钟内仍可查看，之后删除
            setTimeout(() => this.tokens.delete(token), 5 * 60 * 1000)
        }
    }

    // 清理过期令牌
    cleanup() {
        const now = Date.now()
        for (const [token, data] of this.tokens) {
            if (now - data.createdAt > 10 * 60 * 1000) { // 10分钟后彻底删除
                this.tokens.delete(token)
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
        
        if (!token) {
            res.writeHead(302, { 'Location': '/qfarm/login' })
            res.end()
            return true
        }

        const userId = tokenManager.verify(token)
        if (!userId) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(this.getErrorHtml('令牌已过期或无效', '请使用 "#农场面板" 指令获取新的通行令牌'))
            return true
        }

        // 标记令牌已使用（但保留会话）
        tokenManager.use(token)

        // 获取用户数据
        const account = await Farm.getUserAccount(userId)
        const status = account ? await Farm.getUserAccountStatus(userId) : null

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(this.getPanelHtml(userId, account, status))
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
            const userId = tokenManager.verify(token)
            
            if (!userId) {
                res.writeHead(401)
                res.end(JSON.stringify({ success: false, message: '未授权' }))
                return true
            }

            try {
                const account = await Farm.getUserAccount(userId)
                const status = account ? await Farm.getUserAccountStatus(userId) : null
                
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
                        status: status
                    }
                }))
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
    getPanelHtml(userId, account, status) {
        const isLoggedIn = !!account
        const isRunning = status?.isRunning || false
        const isConnected = status?.isConnected || false
        const userName = status?.userState?.name || '未知'
        const level = status?.userState?.level || 0
        const gold = (status?.userState?.gold || 0).toLocaleString()
        const harvests = status?.stats?.harvests || 0
        const steals = status?.stats?.steals || 0

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
        <h1>QQ农场</h1>
        <span class="material-icons">account_circle</span>
    </div>

    <div class="container">
        ${isLoggedIn ? `
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

    <script>
        const token = new URLSearchParams(window.location.search).get('token');

        function showToast(message) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }

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

            // 生成令牌
            const token = tokenManager.generate(e.user_id)
            
            // 构建面板URL
            const panelUrl = `http://${e.bot?.server?.hostname || 'localhost'}:${e.bot?.server?.port || 2536}/qfarm?token=${token}`

            await e.reply([
                '═══ QQ农场面板 ═══\n\n',
                `🔗 面板地址:\n${panelUrl}\n\n`,
                '⏰ 令牌有效期: 5分钟\n',
                '💡 提示: 点击链接即可打开MD3风格面板\n',
                '   可管理农场账号、设置挂机项目等'
            ], { recallMsg: 60 })

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
