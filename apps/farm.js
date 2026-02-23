import plugin from '../../../lib/plugins/plugin.js'
import { Config, Api, Renderer } from '../components/index.js'
import { Farm, QrLogin } from '../model/index.js'
import HttpClient from '../components/HttpClient.js'

export default class FarmPlugin extends plugin {
    constructor() {
        super({
            name: 'QQ农场插件',
            dsc: 'QQ农场共享版管理插件',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^#?(我的农场|农场状态)$',
                    fnc: 'farmStatus'
                },
                {
                    reg: '^#?(登录农场|农场登录)$',
                    fnc: 'loginFarm'
                },
                {
                    reg: '^#?(退出农场|农场退出)$',
                    fnc: 'logoutFarm'
                },
                {
                    reg: '^#?(开启自动挂机|自动挂机开启)$',
                    fnc: 'enableAuto'
                },
                {
                    reg: '^#?(关闭自动挂机|自动挂机关闭)$',
                    fnc: 'disableAuto'
                },
                {
                    reg: '^#?(农场帮助|农场指令)$',
                    fnc: 'farmHelp'
                },
                {
                    reg: '^#?设置农场服务器(.+)?$',
                    fnc: 'setServer'
                },
                {
                    reg: '^#?(农场账号列表|我的农场账号)$',
                    fnc: 'accountList',
                    permission: 'master'
                }
            ]
        })

        // 初始化扫码登录管理器
        this.qrLogin = new QrLogin()
    }

    // 查询农场状态
    async farmStatus(e) {
        try {
            const account = await Farm.getUserAccount(e.user_id)

            // 渲染MD3风格状态图片
            const img = await this.renderStatus(e, account)

            if (img) {
                await e.reply(img)
            } else {
                // 渲染失败时发送文字
                if (!account) {
                    await e.reply('你还没有登录农场，请使用"#登录农场"进行登录')
                } else {
                    await e.reply('状态查询失败')
                }
            }
            return true
        } catch (error) {
            logger.error('[QQ农场] 查询状态失败:', error)
            await e.reply(`查询失败: ${error.message}`)
            return true
        }
    }

    // 渲染农场状态（MD3风格）
    async renderStatus(e, account) {
        try {
            if (!account) {
                // 未登录状态 - 使用新的简化调用方式
                return await Renderer.render('status/index', {
                    isLoggedIn: false,
                    version: '1.0.0'
                }, { scale: 1.2 })
            }

            // 获取账号状态
            const status = await Farm.getUserAccountStatus(e.user_id)
            const userKey = Farm.getUserKey(e.user_id)
            const autoEnabled = await Farm.isUserAutoEnabled(e.user_id)

            // 计算绑定时长
            const createdAt = new Date(account.createdAt)
            const now = new Date()
            const accountAge = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24))

            // 已登录状态 - 使用新的简化调用方式
            return await Renderer.render('status/index', {
                isLoggedIn: true,
                isRunning: status?.isRunning || false,
                isConnected: status?.isConnected || false,
                userName: status?.userState?.name || account.name.replace(userKey + '_', ''),
                level: status?.userState?.level || 0,
                gold: (status?.userState?.gold || 0).toLocaleString(),
                harvests: status?.stats?.harvests || 0,
                steals: status?.stats?.steals || 0,
                autoEnabled,
                accountAge: Math.max(0, accountAge),
                version: '1.0.0'
            }, { scale: 1.2 })
        } catch (error) {
            logger.error('[QQ农场] 渲染状态失败:', error)
            return null
        }
    }

    // 登录农场
    async loginFarm(e) {
        try {
            await e.reply('正在启动扫码登录，请稍候...')

            const result = await this.qrLogin.start(e.user_id, async (status) => {
                if (status.success) {
                    await e.reply([
                        '✅ 登录成功！\n',
                        `账号ID: ${status.account.id}\n`,
                        '已自动启动农场挂机\n',
                        '使用 "#我的农场" 查看状态'
                    ])
                } else {
                    await e.reply(`❌ ${status.message}`)
                }
            })

            if (!result.success) {
                await e.reply(result.message)
                return true
            }

            // 检查返回数据
            if (!result.url) {
                logger.error('[QQ农场] 登录返回数据异常:', result)
                await e.reply('获取登录链接失败，请稍后重试')
                return true
            }

            // 发送登录链接
            await e.reply([
                '═══ QQ农场登录 ═══\n',
                '请点击下方链接进行登录：\n\n',
                `${result.url}\n\n`,
                '⏰ 有效期2分钟，请尽快点击登录\n',
                '💡 提示：请确保使用手机QQ点击链接'
            ])

            return true
        } catch (error) {
            logger.error('[QQ农场] 登录失败:', error)
            await e.reply(`登录失败: ${error.message}`)
            return true
        }
    }

    // 退出农场
    async logoutFarm(e) {
        try {
            const success = await Farm.deleteUserAccount(e.user_id)

            if (!success) {
                await e.reply('你还没有登录农场')
                return true
            }

            await e.reply('✅ 已退出农场，账号已删除')
            return true
        } catch (error) {
            logger.error('[QQ农场] 退出失败:', error)
            await e.reply(`退出失败: ${error.message}`)
            return true
        }
    }

    // 开启自动挂机
    async enableAuto(e) {
        try {
            const account = await Farm.startUserAccount(e.user_id)

            if (!account) {
                await e.reply('你还没有登录农场，请先使用 "#登录农场"')
                return true
            }

            await e.reply('✅ 自动挂机已开启')
            return true
        } catch (error) {
            logger.error('[QQ农场] 开启自动挂机失败:', error)
            await e.reply(`开启失败: ${error.message}`)
            return true
        }
    }

    // 关闭自动挂机
    async disableAuto(e) {
        try {
            const account = await Farm.stopUserAccount(e.user_id)

            if (!account) {
                await e.reply('你还没有登录农场')
                return true
            }

            await e.reply('✅ 自动挂机已关闭')
            return true
        } catch (error) {
            logger.error('[QQ农场] 关闭自动挂机失败:', error)
            await e.reply(`关闭失败: ${error.message}`)
            return true
        }
    }

    // 设置服务器地址
    async setServer(e) {
        if (!e.isMaster) {
            await e.reply('只有主人才能设置服务器地址')
            return true
        }

        const url = e.msg.match(/设置农场服务器(.+)?$/)?.[1]?.trim()

        // 不带参数时显示设置页面
        if (!url) {
            return await this.renderSetting(e)
        }

        try {
            await Api.testConnection(url)
            Config.setServerUrl(url)
            await e.reply(`✅ 服务器地址已设置为: ${url}`)
            return true
        } catch (error) {
            await e.reply(`❌ 无法连接到服务器: ${error.message}`)
            return true
        }
    }

    // 渲染设置页面
    async renderSetting(e) {
        try {
            let serverOnline = false
            let totalAccounts = 0
            let runningAccounts = 0
            let totalHarvests = 0
            let totalSteals = 0

            try {
                const stats = await Api.getStats()
                serverOnline = true
                totalAccounts = stats?.totalAccounts || 0
                runningAccounts = stats?.runningAccounts || 0
                totalHarvests = stats?.totalHarvests || 0
                totalSteals = stats?.totalSteals || 0
            } catch (err) {
                logger.error('[QQ农场] 获取服务器状态失败:', err)
            }

            // 使用新的简化调用方式
            const img = await Renderer.render('setting/index', {
                serverOnline,
                totalAccounts,
                runningAccounts,
                totalHarvests,
                totalSteals,
                serverUrl: Config.getServerUrl(),
                version: '1.0.0'
            }, { scale: 1.2 })

            if (img) {
                await e.reply(img)
            } else {
                await e.reply('图片渲染失败')
            }
            return true
        } catch (error) {
            logger.error('[QQ农场] 渲染设置页面失败:', error)
            await e.reply(`渲染失败: ${error.message}`)
            return true
        }
    }

    // 账号列表（仅主人）
    async accountList(e) {
        try {
            const accounts = await Api.getAccounts()

            if (accounts.length === 0) {
                await e.reply('当前没有登录的农场账号')
                return true
            }

            let msg = `═══ 农场账号列表 [共${accounts.length}个] ═══\n`
            for (const account of accounts) {
                const userKey = account.name.match(/^(qq_\d+)_/)?.[1]
                const userId = userKey ? userKey.replace('qq_', '') : '未知'
                msg += `\nID: ${account.id}\n`
                msg += `名称: ${account.name}\n`
                msg += `用户: ${userId}\n`
                msg += `平台: ${account.platform}\n`
                msg += `创建: ${new Date(account.createdAt).toLocaleString()}\n`
            }
            msg += '\n══════════════════'

            await e.reply(msg)
            return true
        } catch (error) {
            logger.error('[QQ农场] 获取账号列表失败:', error)
            await e.reply(`获取失败: ${error.message}`)
            return true
        }
    }

    // 农场帮助 - 使用 yenai 风格标准帮助
    async farmHelp(e) {
        try {
            // 导入帮助配置
            const { helpCfg, helpList } = await import('../config/system/help_system.js')

            // 处理帮助列表（过滤权限）
            const helpGroup = []
            for (const group of helpList) {
                // 检查权限
                if (group.auth === 'master' && !e.isMaster) {
                    continue
                }

                // 处理列表项的图标样式
                const list = group.list.map(help => {
                    const icon = help.icon * 1
                    let css = ''
                    if (!icon) {
                        css = 'display:none'
                    } else {
                        const x = (icon - 1) % 10
                        const y = (icon - x - 1) / 10
                        css = `background-position:-${x * 50}px -${y * 50}px`
                    }
                    return {
                        ...help,
                        css
                    }
                })

                helpGroup.push({
                    group: group.group,
                    list
                })
            }

            // 渲染标准帮助图
            const img = await Renderer.render('help/index', {
                helpCfg,
                helpGroup,
                colCount: helpCfg.columnCount || 3,
                bg: 'bg.jpg',
                bgType: '1'
            }, { scale: 1.2 })

            if (img) {
                await e.reply(img)
            } else {
                // 渲染失败时发送文字帮助
                await this.sendTextHelp(e)
            }
            return true
        } catch (error) {
            logger.error('[QQ农场] 渲染帮助页面失败:', error)
            await this.sendTextHelp(e)
            return true
        }
    }

    // 发送文字帮助
    async sendTextHelp(e) {
        const msg = `═══ QQ农场插件帮助 ═══

📱 基础指令：
#我的农场 - 查看农场状态
#登录农场 - 扫码登录农场
#退出农场 - 退出并删除账号

⚙️ 自动挂机：
#开启自动挂机 - 启动自动挂机
#关闭自动挂机 - 停止自动挂机

📋 其他指令：
#农场账号列表 - 查看所有账号（仅主人）

🔧 主人指令：
#设置农场服务器<地址> - 设置服务器地址

═══════════════════`
        await e.reply(msg)
    }
}
