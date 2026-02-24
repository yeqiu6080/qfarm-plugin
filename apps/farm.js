import plugin from '../../../lib/plugins/plugin.js'
import { Config, Api, Renderer } from '../components/index.js'
import { Farm, QrLogin, OfflineMonitor } from '../model/index.js'

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
                    reg: '^#?(重登农场|农场重登|重新登录农场)$',
                    fnc: 'reloginFarm'
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
                },
                {
                    reg: '^#?(开启掉线推送|掉线推送开启)$',
                    fnc: 'enableOfflineNotify'
                },
                {
                    reg: '^#?(关闭掉线推送|掉线推送关闭)$',
                    fnc: 'disableOfflineNotify'
                },
                {
                    reg: '^#?(掉线推送状态|我的掉线推送)$',
                    fnc: 'offlineNotifyStatus'
                },
                {
                    reg: '^#?农场更新$',
                    fnc: 'updatePlugin',
                    permission: 'master'
                },
                {
                    reg: '^#?农场下线\\s*(.+)?$',
                    fnc: 'adminOfflineUser',
                    permission: 'master'
                },
                {
                    reg: '^#?农场禁止\\s*(.+)?$',
                    fnc: 'adminBanUser',
                    permission: 'master'
                },
                {
                    reg: '^#?农场解禁\\s*(.+)?$',
                    fnc: 'adminUnbanUser',
                    permission: 'master'
                },
                {
                    reg: '^#?农场状态\\s*(.+)?$',
                    fnc: 'adminUserStatus',
                    permission: 'master'
                },
                {
                    reg: '^#?农场允许群\\s*(.+)?$',
                    fnc: 'adminAllowGroup',
                    permission: 'master'
                },
                {
                    reg: '^#?农场拒绝群\\s*(.+)?$',
                    fnc: 'adminDisallowGroup',
                    permission: 'master'
                },
                {
                    reg: '^#?农场管理状态$',
                    fnc: 'adminManageStatus',
                    permission: 'master'
                }
            ]
        })

        // 初始化扫码登录管理器
        this.qrLogin = new QrLogin()

        // 初始化掉线推送监控（异步启动）
        this.offlineMonitor = new OfflineMonitor()
        this.offlineMonitor.start().catch(err => {
            logger.error('[QQ农场] 启动掉线推送监控失败:', err)
        })
    }

    // 检查用户是否被禁止
    async checkUserBanned(e) {
        if (Config.isUserBanned(e.user_id)) {
            await e.reply('❌ 你已被禁止使用农场功能')
            return true
        }
        return false
    }

    // 检查群是否允许使用
    async checkGroupAllowed(e) {
        if (e.group_id && !Config.isGroupAllowed(e.group_id)) {
            await e.reply('❌ 本群已被禁止使用农场功能')
            return true
        }
        return false
    }

    // 查询农场状态
    async farmStatus(e) {
        try {
            // 检查禁止状态
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

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
                version: '1.0.0',
                userId: e.user_id,
                expProgress: status?.userState?.expProgress || null
            }, { scale: 1.2 })
        } catch (error) {
            logger.error('[QQ农场] 渲染状态失败:', error)
            return null
        }
    }

    // 登录农场
    async loginFarm(e) {
        try {
            // 检查禁止状态
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            await e.reply('正在获取登录链接，请稍候...')

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
                '请点击下方链接完成登录：\n\n',
                `${result.url}\n\n`,
                '⏰ 有效期3分钟，请尽快点击登录\n',
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
            // 检查禁止状态
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

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

    // 重新登录农场
    async reloginFarm(e) {
        try {
            // 检查禁止状态
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            // 先检查是否已登录
            const hasAccount = await Farm.hasUserAccount(e.user_id)

            if (hasAccount) {
                // 已登录，先退出
                await e.reply('🔄 正在重新登录，先退出当前账号...')
                const deleted = await Farm.deleteUserAccount(e.user_id)
                if (!deleted) {
                    await e.reply('❌ 退出当前账号失败，请稍后重试或使用"#退出农场"后再试')
                    return true
                }
            }

            // 开始新的登录流程
            await e.reply('正在获取登录链接，请稍候...')

            const result = await this.qrLogin.start(e.user_id, async (loginResult) => {
                if (loginResult.success) {
                    const autoMsg = loginResult.autoEnabled ? '自动挂机已开启' : '自动挂机未开启（可在设置中开启）'
                    await e.reply(`✅ 重新登录成功！\n🎮 ${autoMsg}\n💡 提示：使用"#我的农场"查看状态`)
                } else {
                    await e.reply(`❌ 重新登录失败: ${loginResult.message}`)
                }
            })

            if (!result.success) {
                await e.reply(`登录失败: ${result.message}`)
                return true
            }

            // 发送登录链接
            await e.reply([
                '═══ QQ农场重新登录 ═══\n',
                '请点击下方链接完成登录：\n\n',
                `${result.url}\n\n`,
                '⏰ 有效期3分钟，请尽快点击登录\n',
                '💡 提示：请确保使用手机QQ点击链接'
            ])

            return true
        } catch (error) {
            logger.error('[QQ农场] 重新登录失败:', error)
            await e.reply(`重新登录失败: ${error.message}`)
            return true
        }
    }

    // 开启自动挂机
    async enableAuto(e) {
        try {
            // 检查禁止状态
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

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
            // 检查禁止状态
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

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
        let msg = `═══ QQ农场插件帮助 ═══

📱 基础指令：
#我的农场 - 查看农场状态
#登录农场 - 扫码登录农场
#退出农场 - 退出并删除账号
#重登农场 - 退出并重新登录

⚙️ 自动挂机：
#开启自动挂机 - 启动自动挂机
#关闭自动挂机 - 停止自动挂机

📡 掉线推送：
#开启掉线推送 - 在当前群开启掉线提醒
#关闭掉线推送 - 关闭当前群的掉线提醒
#掉线推送状态 - 查看推送设置状态

📋 其他指令：
#农场帮助 - 显示本帮助

`

        if (e.isMaster) {
            msg += `🔧 主人指令：
#农场账号列表 - 查看所有账号
#设置农场服务器<地址> - 设置服务器地址
#农场更新 - 更新插件
#农场下线+QQ - 强制下线用户
#农场禁止+QQ - 禁止用户使用
#农场解禁+QQ - 解除用户禁止
#农场状态+QQ - 查看用户状态
#农场允许群+群号 - 允许群使用
#农场拒绝群+群号 - 拒绝群使用
#农场管理状态 - 查看管理状态

`
        }

        msg += `═══════════════════`
        await e.reply(msg)
    }

    // 开启掉线推送
    async enableOfflineNotify(e) {
        try {
            // 检查禁止状态
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            // 必须在群聊中使用
            if (!e.group) {
                await e.reply('❌ 该指令只能在群聊中使用')
                return true
            }

            const groupId = e.group_id
            const userId = e.user_id

            // 检查是否已经开启
            if (Config.isUserNotifyEnabled(userId, groupId)) {
                await e.reply('✅ 当前群已开启掉线推送，无需重复开启')
                return true
            }

            // 添加到推送列表
            Config.addUserNotifyGroup(userId, groupId)

            await e.reply([
                '✅ 已开启掉线推送\n',
                `群号: ${groupId}\n`,
                '💡 当农场掉线时，会在此群@你提醒\n',
                '使用 "#关闭掉线推送" 可关闭提醒'
            ])
            return true
        } catch (error) {
            logger.error('[QQ农场] 开启掉线推送失败:', error)
            await e.reply(`❌ 开启失败: ${error.message}`)
            return true
        }
    }

    // 关闭掉线推送
    async disableOfflineNotify(e) {
        try {
            // 检查禁止状态
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            // 必须在群聊中使用
            if (!e.group) {
                await e.reply('❌ 该指令只能在群聊中使用')
                return true
            }

            const groupId = e.group_id
            const userId = e.user_id

            // 检查是否已经开启
            if (!Config.isUserNotifyEnabled(userId, groupId)) {
                await e.reply('❌ 当前群未开启掉线推送')
                return true
            }

            // 从推送列表移除
            Config.removeUserNotifyGroup(userId, groupId)

            await e.reply([
                '✅ 已关闭掉线推送\n',
                `群号: ${groupId}\n`,
                '💡 农场掉线时将不再在此群提醒'
            ])
            return true
        } catch (error) {
            logger.error('[QQ农场] 关闭掉线推送失败:', error)
            await e.reply(`❌ 关闭失败: ${error.message}`)
            return true
        }
    }

    // 查看掉线推送状态
    async offlineNotifyStatus(e) {
        try {
            // 检查禁止状态
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            const userId = e.user_id
            const notifyConfig = Config.getOfflineNotifyConfig()
            const groupIds = Config.getUserNotifyGroups(userId)

            let msg = '═══ 掉线推送状态 ═══\n\n'
            msg += `功能状态: ${notifyConfig.enabled ? '✅ 已启用' : '❌ 已禁用'}\n`
            msg += `冷却时间: ${notifyConfig.cooldown || 300}秒\n\n`

            if (groupIds.length === 0) {
                msg += '当前未在任何群开启掉线推送\n'
                msg += '💡 在群聊中发送 "#开启掉线推送" 即可开启'
            } else {
                msg += `已开启推送的群 (${groupIds.length}个):\n`
                for (const groupId of groupIds) {
                    // 尝试获取群名称
                    let groupName = ''
                    try {
                        const group = Bot.pickGroup(groupId)
                        if (group && group.name) {
                            groupName = ` - ${group.name}`
                        }
                    } catch (err) {
                        // 忽略错误
                    }
                    msg += `  • ${groupId}${groupName}\n`
                }
            }

            msg += '\n═══════════════════'
            await e.reply(msg)
            return true
        } catch (error) {
            logger.error('[QQ农场] 查询掉线推送状态失败:', error)
            await e.reply(`❌ 查询失败: ${error.message}`)
            return true
        }
    }

    // 更新插件
    async updatePlugin(e) {
        try {
            await e.reply('🔄 正在检查并更新插件，请稍候...')

            const { execSync } = await import('child_process')
            const pluginPath = `${process.cwd()}/plugins/qfarm-plugin`

            // 执行 git pull
            const result = execSync('git pull', {
                cwd: pluginPath,
                encoding: 'utf-8',
                timeout: 60000
            })

            const output = result.trim()

            if (output.includes('Already up to date') || output.includes('已经是最新')) {
                await e.reply('✅ 插件已经是最新版本，无需更新')
            } else if (output.includes('Updating') || output.includes('更新')) {
                await e.reply([
                    '✅ 插件更新成功！\n',
                    '更新内容:\n',
                    `${output}\n\n`,
                    '💡 请重启 Yunzai-Bot 以应用更新'
                ])
            } else {
                await e.reply([
                    '⚠️ 更新结果:\n',
                    `${output}\n\n`,
                    '💡 如有问题请检查网络连接或手动更新'
                ])
            }

            return true
        } catch (error) {
            logger.error('[QQ农场] 插件更新失败:', error)
            let errorMsg = error.message
            if (error.message.includes('not a git repository')) {
                errorMsg = '当前插件不是通过 git 安装的，无法自动更新'
            } else if (error.message.includes('network')) {
                errorMsg = '网络连接失败，请检查网络后重试'
            }
            await e.reply(`❌ 更新失败: ${errorMsg}`)
            return true
        }
    }

    // ========== 主人管理功能 ==========

    // 解析QQ号（支持直接输入或@某人）
    parseQQ(msg) {
        if (!msg) return null
        // 匹配@某人
        const atMatch = msg.match(/\[CQ:at,qq=(\d+)\]/)
        if (atMatch) return atMatch[1]
        // 匹配纯数字QQ号
        const qqMatch = msg.trim().match(/^(\d+)$/)
        if (qqMatch) return qqMatch[1]
        return null
    }

    // 农场下线+qq - 强制下线指定用户的农场
    async adminOfflineUser(e) {
        try {
            const match = e.msg.match(/^#?农场下线\s*(.+)?$/)
            const qqParam = match?.[1]?.trim()

            if (!qqParam) {
                await e.reply('❌ 请指定要下线的QQ号\n格式: 农场下线+QQ号 或 农场下线@某人')
                return true
            }

            const targetQQ = this.parseQQ(qqParam)
            if (!targetQQ) {
                await e.reply('❌ 无法识别的QQ号，请使用纯数字QQ号或@某人')
                return true
            }

            // 检查是否是主人
            if (targetQQ === String(e.self_id)) {
                await e.reply('❌ 不能对Bot自身执行此操作')
                return true
            }

            // 获取用户账号
            const account = await Farm.getUserAccount(targetQQ)
            if (!account) {
                await e.reply(`❌ 用户 ${targetQQ} 没有登录农场`)
                return true
            }

            // 删除账号（会停止并删除）
            const success = await Farm.deleteUserAccount(targetQQ)

            if (success) {
                await e.reply([
                    '✅ 已强制下线用户农场\n',
                    `用户QQ: ${targetQQ}\n`,
                    `账号ID: ${account.id}\n`,
                    `账号名: ${account.name}`
                ])
            } else {
                await e.reply(`❌ 下线失败，用户 ${targetQQ} 可能没有登录农场`)
            }
            return true
        } catch (error) {
            logger.error('[QQ农场] 强制下线失败:', error)
            await e.reply(`❌ 操作失败: ${error.message}`)
            return true
        }
    }

    // 农场禁止+qq - 禁止指定用户使用农场
    async adminBanUser(e) {
        try {
            const match = e.msg.match(/^#?农场禁止\s*(.+)?$/)
            const qqParam = match?.[1]?.trim()

            if (!qqParam) {
                await e.reply('❌ 请指定要禁止的QQ号\n格式: 农场禁止+QQ号 或 农场禁止@某人')
                return true
            }

            const targetQQ = this.parseQQ(qqParam)
            if (!targetQQ) {
                await e.reply('❌ 无法识别的QQ号，请使用纯数字QQ号或@某人')
                return true
            }

            // 检查是否是主人
            if (targetQQ === String(e.self_id)) {
                await e.reply('❌ 不能禁止Bot自身')
                return true
            }

            // 如果用户已登录，先强制下线
            const account = await Farm.getUserAccount(targetQQ)
            if (account) {
                await Farm.deleteUserAccount(targetQQ)
            }

            // 添加到禁止列表
            const isNewBan = Config.banUser(targetQQ)

            await e.reply([
                isNewBan ? '✅ 已禁止用户使用农场' : '⚠️ 该用户已被禁止',
                `\n用户QQ: ${targetQQ}`,
                account ? '\n该用户的农场账号已被强制下线' : ''
            ])
            return true
        } catch (error) {
            logger.error('[QQ农场] 禁止用户失败:', error)
            await e.reply(`❌ 操作失败: ${error.message}`)
            return true
        }
    }

    // 农场解禁+qq - 解除对指定用户的禁止
    async adminUnbanUser(e) {
        try {
            const match = e.msg.match(/^#?农场解禁\s*(.+)?$/)
            const qqParam = match?.[1]?.trim()

            if (!qqParam) {
                await e.reply('❌ 请指定要解禁的QQ号\n格式: 农场解禁+QQ号 或 农场解禁@某人')
                return true
            }

            const targetQQ = this.parseQQ(qqParam)
            if (!targetQQ) {
                await e.reply('❌ 无法识别的QQ号，请使用纯数字QQ号或@某人')
                return true
            }

            // 从禁止列表移除
            const success = Config.unbanUser(targetQQ)

            if (success) {
                await e.reply([
                    '✅ 已解除用户禁止\n',
                    `用户QQ: ${targetQQ}\n`,
                    '该用户现在可以正常使用农场功能'
                ])
            } else {
                await e.reply(`❌ 用户 ${targetQQ} 不在禁止列表中`)
            }
            return true
        } catch (error) {
            logger.error('[QQ农场] 解禁用户失败:', error)
            await e.reply(`❌ 操作失败: ${error.message}`)
            return true
        }
    }

    // 农场状态+qq - 查看指定用户的农场状态
    async adminUserStatus(e) {
        try {
            const match = e.msg.match(/^#?农场状态\s*(.+)?$/)
            const qqParam = match?.[1]?.trim()

            // 如果没有指定QQ号，显示所有账号状态
            if (!qqParam) {
                return await this.adminAllStatus(e)
            }

            const targetQQ = this.parseQQ(qqParam)
            if (!targetQQ) {
                await e.reply('❌ 无法识别的QQ号，请使用纯数字QQ号或@某人')
                return true
            }

            // 获取用户账号
            const account = await Farm.getUserAccount(targetQQ)
            if (!account) {
                await e.reply(`❌ 用户 ${targetQQ} 没有登录农场`)
                return true
            }

            // 获取账号状态
            const status = await Farm.getUserAccountStatus(targetQQ)
            const isBanned = Config.isUserBanned(targetQQ)

            let msg = `═══ 用户农场状态 ═══\n\n`
            msg += `用户QQ: ${targetQQ}\n`
            msg += `禁止状态: ${isBanned ? '❌ 已禁止' : '✅ 正常'}\n`
            msg += `账号ID: ${account.id}\n`
            msg += `账号名: ${account.name}\n`
            msg += `平台: ${account.platform}\n`
            msg += `创建时间: ${new Date(account.createdAt).toLocaleString()}\n\n`

            if (status) {
                msg += `运行状态: ${status.isRunning ? '🟢 运行中' : '🔴 已停止'}\n`
                msg += `连接状态: ${status.isConnected ? '🟢 已连接' : '🔴 未连接'}\n`
                if (status.userState) {
                    msg += `昵称: ${status.userState.name || '未知'}\n`
                    msg += `等级: ${status.userState.level || 0}\n`
                    msg += `金币: ${(status.userState.gold || 0).toLocaleString()}\n`
                }
                if (status.stats) {
                    msg += `收获次数: ${status.stats.harvests || 0}\n`
                    msg += `偷取次数: ${status.stats.steals || 0}\n`
                }
            }

            msg += '\n═══════════════════'
            await e.reply(msg)
            return true
        } catch (error) {
            logger.error('[QQ农场] 查询用户状态失败:', error)
            await e.reply(`❌ 查询失败: ${error.message}`)
            return true
        }
    }

    // 查看所有账号状态（主人）
    async adminAllStatus(e) {
        try {
            const accounts = await Api.getAccounts()
            const bannedUsers = Config.getBannedUsers()

            if (accounts.length === 0) {
                await e.reply('当前没有登录的农场账号')
                return true
            }

            let msg = `═══ 农场账号总览 [共${accounts.length}个] ═══\n\n`

            let runningCount = 0
            let connectedCount = 0

            for (const account of accounts) {
                // 尝试从账号名提取QQ号
                const userKey = account.name.match(/^(?:user_|qq_)(\d+)_/)?.[1] ||
                               account.name.match(/^(?:user_|qq_)(\d+)$/)?.[1]
                const isBanned = userKey ? bannedUsers.includes(userKey) : false

                try {
                    const status = await Api.getAccountStatus(account.id)
                    if (status?.isRunning) runningCount++
                    if (status?.isConnected) connectedCount++

                    msg += `ID: ${account.id}\n`
                    msg += `名称: ${account.name}\n`
                    if (userKey) msg += `用户: ${userKey}${isBanned ? ' (已禁止)' : ''}\n`
                    msg += `状态: ${status?.isRunning ? '🟢' : '🔴'}运行 ${status?.isConnected ? '🟢' : '🔴'}连接\n`
                    if (status?.userState?.level) {
                        msg += `等级: ${status.userState.level} 金币: ${(status.userState.gold || 0).toLocaleString()}\n`
                    }
                    msg += '\n'
                } catch (err) {
                    msg += `ID: ${account.id}\n`
                    msg += `名称: ${account.name}\n`
                    msg += `状态: ⚠️ 查询失败\n\n`
                }
            }

            msg += `═══════════════════\n`
            msg += `运行中: ${runningCount}  已连接: ${connectedCount}  已禁止: ${bannedUsers.length}`

            await e.reply(msg)
            return true
        } catch (error) {
            logger.error('[QQ农场] 获取所有状态失败:', error)
            await e.reply(`❌ 查询失败: ${error.message}`)
            return true
        }
    }

    // 农场允许群+群号 - 允许指定群使用农场（白名单模式）
    async adminAllowGroup(e) {
        try {
            const match = e.msg.match(/^#?农场允许群\s*(.+)?$/)
            let groupId = match?.[1]?.trim()

            // 如果没有指定群号，使用当前群
            if (!groupId && e.group_id) {
                groupId = String(e.group_id)
            }

            if (!groupId) {
                await e.reply('❌ 请指定群号，或在群聊中直接使用"农场允许群"')
                return true
            }

            // 验证群号格式
            if (!/^\d+$/.test(groupId)) {
                await e.reply('❌ 群号格式错误，请输入纯数字群号')
                return true
            }

            // 添加到允许列表
            const isNew = Config.allowGroup(groupId)

            // 尝试获取群名称
            let groupName = ''
            try {
                const group = Bot.pickGroup(groupId)
                if (group && group.name) {
                    groupName = group.name
                }
            } catch (err) {
                // 忽略错误
            }

            await e.reply([
                isNew ? '✅ 已允许群使用农场' : '⚠️ 该群已在允许列表中',
                `\n群号: ${groupId}`,
                groupName ? `\n群名: ${groupName}` : '',
                '\n\n💡 提示: 开启白名单模式后，只有允许的群才能使用农场功能',
                '\n使用 "农场管理状态" 查看当前设置'
            ])
            return true
        } catch (error) {
            logger.error('[QQ农场] 允许群使用失败:', error)
            await e.reply(`❌ 操作失败: ${error.message}`)
            return true
        }
    }

    // 农场拒绝群+群号 - 拒绝指定群使用农场
    async adminDisallowGroup(e) {
        try {
            const match = e.msg.match(/^#?农场拒绝群\s*(.+)?$/)
            let groupId = match?.[1]?.trim()

            // 如果没有指定群号，使用当前群
            if (!groupId && e.group_id) {
                groupId = String(e.group_id)
            }

            if (!groupId) {
                await e.reply('❌ 请指定群号，或在群聊中直接使用"农场拒绝群"')
                return true
            }

            // 验证群号格式
            if (!/^\d+$/.test(groupId)) {
                await e.reply('❌ 群号格式错误，请输入纯数字群号')
                return true
            }

            // 从允许列表移除
            const success = Config.disallowGroup(groupId)

            // 尝试获取群名称
            let groupName = ''
            try {
                const group = Bot.pickGroup(groupId)
                if (group && group.name) {
                    groupName = group.name
                }
            } catch (err) {
                // 忽略错误
            }

            if (success) {
                await e.reply([
                    '✅ 已拒绝群使用农场\n',
                    `群号: ${groupId}`,
                    groupName ? `\n群名: ${groupName}` : '',
                    '\n\n该群将无法使用农场功能'
                ])
            } else {
                await e.reply(`❌ 群 ${groupId} 不在允许列表中`)
            }
            return true
        } catch (error) {
            logger.error('[QQ农场] 拒绝群使用失败:', error)
            await e.reply(`❌ 操作失败: ${error.message}`)
            return true
        }
    }

    // 农场管理状态 - 查看管理功能的状态
    async adminManageStatus(e) {
        try {
            const bannedUsers = Config.getBannedUsers()
            const allowedGroups = Config.getAllowedGroups()

            let msg = '═══ 农场管理状态 ═══\n\n'

            // 禁止用户列表
            msg += `📋 禁止用户列表 (${bannedUsers.length}人):\n`
            if (bannedUsers.length === 0) {
                msg += '  暂无\n'
            } else {
                for (const userId of bannedUsers) {
                    msg += `  • ${userId}\n`
                }
            }

            msg += '\n'

            // 允许群列表
            msg += `📋 允许群列表 (${allowedGroups.length}个):\n`
            if (allowedGroups.length === 0) {
                msg += '  所有群都允许（白名单未启用）\n'
            } else {
                for (const groupId of allowedGroups) {
                    // 尝试获取群名称
                    let groupName = ''
                    try {
                        const group = Bot.pickGroup(groupId)
                        if (group && group.name) {
                            groupName = ` - ${group.name}`
                        }
                    } catch (err) {
                        // 忽略错误
                    }
                    msg += `  • ${groupId}${groupName}\n`
                }
                msg += '\n⚠️ 白名单模式已启用，只有以上群可以使用农场'
            }

            msg += '\n═══════════════════\n'
            msg += '💡 主人指令:\n'
            msg += '• 农场下线+QQ - 强制下线用户\n'
            msg += '• 农场禁止+QQ - 禁止用户使用\n'
            msg += '• 农场解禁+QQ - 解除用户禁止\n'
            msg += '• 农场状态+QQ - 查看用户状态\n'
            msg += '• 农场允许群+群号 - 允许群使用\n'
            msg += '• 农场拒绝群+群号 - 拒绝群使用'

            await e.reply(msg)
            return true
        } catch (error) {
            logger.error('[QQ农场] 获取管理状态失败:', error)
            await e.reply(`❌ 查询失败: ${error.message}`)
            return true
        }
    }
}
