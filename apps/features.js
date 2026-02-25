import plugin from '../../../lib/plugins/plugin.js'
import { Config, Api, Renderer, MessageHelper } from '../components/index.js'
import { Farm } from '../model/index.js'

/**
 * QQ农场扩展功能插件
 * 包含任务系统、每日奖励、种植策略、数据分析等功能
 */
export class FarmFeaturesPlugin extends plugin {
    constructor() {
        super({
            name: 'QQ农场扩展功能',
            dsc: 'QQ农场任务、奖励、策略等扩展功能',
            event: 'message',
            priority: 5000,
            rule: [
                // ========== 任务系统 ==========
                {
                    reg: '^#?(农场任务|我的任务|任务列表)$',
                    fnc: 'farmTasks'
                },
                {
                    reg: '^#?(领取任务|任务领取)\s*(\d+)?$',
                    fnc: 'claimTask'
                },
                {
                    reg: '^#?(一键领取|领取所有任务)$',
                    fnc: 'claimAllTasks'
                },
                // ========== 每日奖励 ==========
                {
                    reg: '^#?(每日奖励|农场奖励|奖励状态)$',
                    fnc: 'dailyRewards'
                },
                {
                    reg: '^#?(领取奖励|领取每日奖励)$',
                    fnc: 'claimDailyRewards'
                },
                // ========== 土地操作 ==========
                {
                    reg: '^#?(解锁土地|土地解锁)\s*(\d+)?$',
                    fnc: 'unlockLand'
                },
                {
                    reg: '^#?(升级土地|土地升级)\s*(\d+)?$',
                    fnc: 'upgradeLand'
                },
                // ========== 种植策略 ==========
                {
                    reg: '^#?(种植策略|农场策略|当前策略)$',
                    fnc: 'currentStrategy'
                },
                {
                    reg: '^#?(设置策略|策略设置)\s*(\S+)?$',
                    fnc: 'setStrategy'
                },
                {
                    reg: '^#?(策略列表|可用策略)$',
                    fnc: 'listStrategies'
                },
                // ========== 数据分析 ==========
                {
                    reg: '^#?(种植排行|效率排行|排行榜)$',
                    fnc: 'leaderboard'
                },
                {
                    reg: '^#?(种植推荐|作物推荐|推荐种植)$',
                    fnc: 'plantingRecommendation'
                },
                {
                    reg: '^#?(种子详情|查看种子)\s*(\d+)?$',
                    fnc: 'seedDetails'
                },
                // ========== 好友优化 ==========
                {
                    reg: '^#?(好友优化|优化状态|静默时段)$',
                    fnc: 'friendOptimizer'
                },
                {
                    reg: '^#?(设置静默|静默设置)\s*(\d+)?\s*(\d+)?$',
                    fnc: 'setQuietHours'
                },
                // ========== 批量控制（主人） ==========
                {
                    reg: '^#?(启动全部|全部启动|开启全部)$',
                    fnc: 'startAllAccounts',
                    permission: 'master'
                },
                {
                    reg: '^#?(停止全部|全部停止|关闭全部)$',
                    fnc: 'stopAllAccounts',
                    permission: 'master'
                }
            ]
        })
    }

    // 检查用户是否被禁止
    async checkUserBanned(e) {
        if (Config.isUserBanned(e.user_id)) {
            await MessageHelper.reply(e, '❌ 你已被禁止使用农场功能', { recallTime: 15 })
            return true
        }
        return false
    }

    // 检查群是否允许使用
    async checkGroupAllowed(e) {
        if (e.group_id && !Config.isGroupAllowed(e.group_id)) {
            await MessageHelper.reply(e, '❌ 本群已被禁止使用农场功能', { recallTime: 15 })
            return true
        }
        return false
    }

    // ========== 任务系统 ==========

    // 查看任务列表
    async farmTasks(e) {
        try {
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            const account = await Farm.getUserAccount(e.user_id)
            if (!account) {
                await MessageHelper.reply(e, '你还没有登录农场，请先使用 "#登录农场"', { recallTime: 20 })
                return true
            }

            const tasksData = await Api.getTasks(account.id)
            if (!tasksData) {
                await MessageHelper.reply(e, '❌ 获取任务列表失败，服务器可能不支持此功能', { recallTime: 15 })
                return true
            }

            const { growthTasks = [], dailyTasks = [] } = tasksData
            const allTasks = [...growthTasks, ...dailyTasks]

            if (allTasks.length === 0) {
                await MessageHelper.reply(e, '📋 当前没有可领取的任务', { recallTime: 15 })
                return true
            }

            // 统计任务状态
            const completedCount = allTasks.filter(t => t.status === 2).length
            const claimableCount = allTasks.filter(t => t.status === 1).length
            const pendingCount = allTasks.filter(t => t.status === 0).length

            let msg = '═══ 农场任务 ═══\n\n'

            // 成长任务
            if (growthTasks.length > 0) {
                msg += `📈 成长任务 (${growthTasks.length}个):\n`
                for (const task of growthTasks) {
                    const statusIcon = task.status === 2 ? '✅' : task.status === 1 ? '🎁' : '⏳'
                    msg += `  ${statusIcon} ${task.name}\n`
                    msg += `     ${task.desc} (${task.current}/${task.target})\n`
                    if (task.reward) msg += `     奖励: ${task.reward}\n`
                }
                msg += '\n'
            }

            // 每日任务
            if (dailyTasks.length > 0) {
                msg += `📅 每日任务 (${dailyTasks.length}个):\n`
                for (const task of dailyTasks) {
                    const statusIcon = task.status === 2 ? '✅' : task.status === 1 ? '🎁' : '⏳'
                    msg += `  ${statusIcon} ${task.name}\n`
                    msg += `     ${task.desc} (${task.current}/${task.target})\n`
                    if (task.reward) msg += `     奖励: ${task.reward}\n`
                }
                msg += '\n'
            }

            msg += `统计: ✅已完成${completedCount} 🎁可领取${claimableCount} ⏳进行中${pendingCount}\n\n`
            msg += '💡 使用 "#一键领取" 领取所有可领奖励'

            await MessageHelper.reply(e, msg, { recallTime: 45 })
            return true
        } catch (error) {
            logger.error('[QQ农场] 获取任务列表失败:', error)
            await MessageHelper.reply(e, `❌ 获取失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }

    // 领取单个任务
    async claimTask(e) {
        try {
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            const match = e.msg.match(/^#?(?:领取任务|任务领取)\s*(\d+)?$/)
            const taskId = match?.[1]

            if (!taskId) {
                await MessageHelper.reply(e, '❌ 请指定任务ID\n格式: #领取任务 [任务ID]', { recallTime: 20 })
                return true
            }

            const account = await Farm.getUserAccount(e.user_id)
            if (!account) {
                await MessageHelper.reply(e, '你还没有登录农场', { recallTime: 15 })
                return true
            }

            await MessageHelper.tempReply(e, '正在领取任务奖励...')

            const result = await Api.claimTask(account.id, taskId)
            if (!result) {
                await MessageHelper.reply(e, '❌ 领取失败，服务器可能不支持此功能', { recallTime: 15 })
                return true
            }

            if (result.claimed) {
                await MessageHelper.reply(e, `✅ 任务奖励领取成功！`, { recallTime: 20 })
            } else {
                await MessageHelper.reply(e, '⚠️ 该任务奖励无法领取（可能已完成或未达标）', { recallTime: 20 })
            }
            return true
        } catch (error) {
            logger.error('[QQ农场] 领取任务失败:', error)
            await MessageHelper.reply(e, `❌ 领取失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }

    // 一键领取所有任务
    async claimAllTasks(e) {
        try {
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            const account = await Farm.getUserAccount(e.user_id)
            if (!account) {
                await MessageHelper.reply(e, '你还没有登录农场', { recallTime: 15 })
                return true
            }

            await MessageHelper.tempReply(e, '正在一键领取所有任务奖励...')

            const result = await Api.claimAllTasks(account.id)
            if (!result) {
                await MessageHelper.reply(e, '❌ 领取失败，服务器可能不支持此功能', { recallTime: 15 })
                return true
            }

            if (result.claimed && result.claimed.length > 0) {
                await MessageHelper.reply(e, `✅ 成功领取 ${result.claimed.length} 个任务奖励！`, { recallTime: 20 })
            } else {
                await MessageHelper.reply(e, '⚠️ 当前没有可领取的任务奖励', { recallTime: 20 })
            }
            return true
        } catch (error) {
            logger.error('[QQ农场] 一键领取任务失败:', error)
            await MessageHelper.reply(e, `❌ 领取失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }

    // ========== 每日奖励 ==========

    // 查看每日奖励状态
    async dailyRewards(e) {
        try {
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            const account = await Farm.getUserAccount(e.user_id)
            if (!account) {
                await MessageHelper.reply(e, '你还没有登录农场', { recallTime: 15 })
                return true
            }

            const rewardsData = await Api.getDailyRewards(account.id)
            if (!rewardsData) {
                await MessageHelper.reply(e, '❌ 获取奖励状态失败，服务器可能不支持此功能', { recallTime: 15 })
                return true
            }

            const { dailyRewardState = {}, toggles = {} } = rewardsData

            const rewardItems = [
                { key: 'shopFree', name: '商城免费礼包', icon: '🎁' },
                { key: 'shareReward', name: '分享奖励', icon: '📤' },
                { key: 'monthCard', name: '月卡奖励', icon: '💳' },
                { key: 'mailReward', name: '邮箱奖励', icon: '📧' },
                { key: 'qqVip', name: 'QQ会员奖励', icon: '👑' },
                { key: 'collection', name: '图鉴奖励', icon: '📚' },
                { key: 'buyFertilizer', name: '点券购买化肥', icon: '💰' },
                { key: 'useFertilizerPack', name: '使用化肥礼包', icon: '🧪' }
            ]

            let msg = '═══ 每日奖励 ═══\n\n'

            for (const item of rewardItems) {
                const state = dailyRewardState[item.key]
                const enabled = toggles[item.key]
                const statusIcon = state === true ? '✅' : state === false ? '❌' : '⏸️'
                const enabledIcon = enabled ? '' : ' [已禁用]'
                msg += `${item.icon} ${item.name}: ${statusIcon}${enabledIcon}\n`
            }

            msg += '\n💡 使用 "#领取奖励" 手动触发领取\n'
            msg += '⚠️ 部分奖励需要先在服务器配置中启用'

            await MessageHelper.reply(e, msg, { recallTime: 40 })
            return true
        } catch (error) {
            logger.error('[QQ农场] 获取每日奖励失败:', error)
            await MessageHelper.reply(e, `❌ 获取失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }

    // 领取每日奖励
    async claimDailyRewards(e) {
        try {
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            const account = await Farm.getUserAccount(e.user_id)
            if (!account) {
                await MessageHelper.reply(e, '你还没有登录农场', { recallTime: 15 })
                return true
            }

            await MessageHelper.tempReply(e, '正在领取每日奖励...')

            const result = await Api.claimDailyRewards(account.id)
            if (!result) {
                await MessageHelper.reply(e, '❌ 领取失败，服务器可能不支持此功能', { recallTime: 15 })
                return true
            }

            await MessageHelper.reply(e, '✅ 每日奖励领取请求已发送！\n💡 实际领取结果请查看农场日志', { recallTime: 25 })
            return true
        } catch (error) {
            logger.error('[QQ农场] 领取每日奖励失败:', error)
            await MessageHelper.reply(e, `❌ 领取失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }

    // ========== 土地操作 ==========

    // 解锁土地
    async unlockLand(e) {
        try {
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            const match = e.msg.match(/^#?(?:解锁土地|土地解锁)\s*(\d+)?$/)
            const landId = match?.[1]

            if (!landId) {
                await MessageHelper.reply(e, '❌ 请指定土地ID\n格式: #解锁土地 [土地ID]', { recallTime: 20 })
                return true
            }

            const account = await Farm.getUserAccount(e.user_id)
            if (!account) {
                await MessageHelper.reply(e, '你还没有登录农场', { recallTime: 15 })
                return true
            }

            await MessageHelper.tempReply(e, `正在解锁土地 ${landId}...`)

            const result = await Api.unlockLand(account.id, landId)
            if (!result) {
                await MessageHelper.reply(e, '❌ 解锁失败，服务器可能不支持此功能', { recallTime: 15 })
                return true
            }

            if (result.success) {
                await MessageHelper.reply(e, `✅ 土地 ${landId} 解锁成功！`, { recallTime: 20 })
            } else {
                await MessageHelper.reply(e, `❌ 解锁失败: ${result.message || '未知错误'}`, { recallTime: 20 })
            }
            return true
        } catch (error) {
            logger.error('[QQ农场] 解锁土地失败:', error)
            await MessageHelper.reply(e, `❌ 解锁失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }

    // 升级土地
    async upgradeLand(e) {
        try {
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            const match = e.msg.match(/^#?(?:升级土地|土地升级)\s*(\d+)?$/)
            const landId = match?.[1]

            if (!landId) {
                await MessageHelper.reply(e, '❌ 请指定土地ID\n格式: #升级土地 [土地ID]', { recallTime: 20 })
                return true
            }

            const account = await Farm.getUserAccount(e.user_id)
            if (!account) {
                await MessageHelper.reply(e, '你还没有登录农场', { recallTime: 15 })
                return true
            }

            await MessageHelper.tempReply(e, `正在升级土地 ${landId}...`)

            const result = await Api.upgradeLand(account.id, landId)
            if (!result) {
                await MessageHelper.reply(e, '❌ 升级失败，服务器可能不支持此功能', { recallTime: 15 })
                return true
            }

            if (result.success) {
                await MessageHelper.reply(e, `✅ 土地 ${landId} 升级成功！`, { recallTime: 20 })
            } else {
                await MessageHelper.reply(e, `❌ 升级失败: ${result.message || '未知错误'}`, { recallTime: 20 })
            }
            return true
        } catch (error) {
            logger.error('[QQ农场] 升级土地失败:', error)
            await MessageHelper.reply(e, `❌ 升级失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }

    // ========== 种植策略 ==========

    // 查看当前策略
    async currentStrategy(e) {
        try {
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            const account = await Farm.getUserAccount(e.user_id)
            if (!account) {
                await MessageHelper.reply(e, '你还没有登录农场', { recallTime: 15 })
                return true
            }

            const strategyData = await Api.getAccountStrategy(account.id)
            if (!strategyData) {
                await MessageHelper.reply(e, '❌ 获取策略失败，服务器可能不支持此功能', { recallTime: 15 })
                return true
            }

            const strategyLabels = {
                'preferred': '指定种子优先',
                'max_exp': '经验效率优先',
                'max_fert_exp': '普通肥经验优先',
                'max_profit': '利润优先',
                'max_fert_profit': '普通肥利润优先',
                'highest_level': '最高等级作物',
                'lowest_cost': '最低成本',
                'balanced': '平衡策略'
            }

            let msg = '═══ 种植策略 ═══\n\n'
            msg += `当前策略: ${strategyLabels[strategyData.strategy] || strategyData.strategy}\n`
            if (strategyData.preferredSeedId) {
                msg += `优先种子ID: ${strategyData.preferredSeedId}\n`
            }
            if (strategyData.autoLandUnlock !== undefined) {
                msg += `自动解锁土地: ${strategyData.autoLandUnlock ? '✅' : '❌'}\n`
            }
            if (strategyData.autoLandUpgrade !== undefined) {
                msg += `自动升级土地: ${strategyData.autoLandUpgrade ? '✅' : '❌'}\n`
            }

            msg += '\n💡 使用 "#策略列表" 查看所有可用策略\n'
            msg += '使用 "#设置策略 [策略名]" 切换策略'

            await MessageHelper.reply(e, msg, { recallTime: 35 })
            return true
        } catch (error) {
            logger.error('[QQ农场] 获取策略失败:', error)
            await MessageHelper.reply(e, `❌ 获取失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }

    // 设置种植策略
    async setStrategy(e) {
        try {
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            const match = e.msg.match(/^#?(?:设置策略|策略设置)\s*(\S+)?$/)
            const strategy = match?.[1]

            if (!strategy) {
                await MessageHelper.reply(e, '❌ 请指定策略名称\n格式: #设置策略 [策略名]\n使用 "#策略列表" 查看可用策略', { recallTime: 25 })
                return true
            }

            const validStrategies = ['preferred', 'max_exp', 'max_fert_exp', 'max_profit', 'max_fert_profit', 'highest_level', 'lowest_cost', 'balanced']

            if (!validStrategies.includes(strategy)) {
                await MessageHelper.reply(e, `❌ 无效的策略名称: ${strategy}\n使用 "#策略列表" 查看可用策略`, { recallTime: 20 })
                return true
            }

            const account = await Farm.getUserAccount(e.user_id)
            if (!account) {
                await MessageHelper.reply(e, '你还没有登录农场', { recallTime: 15 })
                return true
            }

            await MessageHelper.tempReply(e, '正在设置种植策略...')

            const result = await Api.setAccountStrategy(account.id, strategy)
            if (!result) {
                await MessageHelper.reply(e, '❌ 设置失败，服务器可能不支持此功能', { recallTime: 15 })
                return true
            }

            const strategyLabels = {
                'preferred': '指定种子优先',
                'max_exp': '经验效率优先',
                'max_fert_exp': '普通肥经验优先',
                'max_profit': '利润优先',
                'max_fert_profit': '普通肥利润优先',
                'highest_level': '最高等级作物',
                'lowest_cost': '最低成本',
                'balanced': '平衡策略'
            }

            await MessageHelper.reply(e, `✅ 种植策略已设置为: ${strategyLabels[strategy] || strategy}`, { recallTime: 20 })
            return true
        } catch (error) {
            logger.error('[QQ农场] 设置策略失败:', error)
            await MessageHelper.reply(e, `❌ 设置失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }

    // 列出所有策略
    async listStrategies(e) {
        try {
            const strategies = await Api.getStrategies()

            if (!strategies || strategies.length === 0) {
                // 使用内置策略列表
                const builtInStrategies = [
                    { id: 'preferred', label: '指定种子优先', desc: '优先种植指定的种子' },
                    { id: 'max_exp', label: '经验效率优先', desc: '优先选择经验效率最高的作物' },
                    { id: 'max_fert_exp', label: '普通肥经验优先', desc: '使用普通化肥时经验最高的作物' },
                    { id: 'max_profit', label: '利润优先', desc: '优先选择利润最高的作物' },
                    { id: 'max_fert_profit', label: '普通肥利润优先', desc: '使用普通化肥时利润最高的作物' },
                    { id: 'highest_level', label: '最高等级作物', desc: '种植当前可种的最高等级作物' },
                    { id: 'lowest_cost', label: '最低成本', desc: '优先选择成本最低的作物' },
                    { id: 'balanced', label: '平衡策略', desc: '平衡经验和利润的综合策略' }
                ]

                let msg = '═══ 可用策略列表 ═══\n\n'
                for (const s of builtInStrategies) {
                    msg += `📌 ${s.label} (${s.id})\n`
                    msg += `   ${s.desc}\n\n`
                }
                msg += '💡 使用 "#设置策略 [策略ID]" 切换策略'

                await MessageHelper.reply(e, msg, { recallTime: 45 })
                return true
            }

            let msg = '═══ 可用策略列表 ═══\n\n'
            for (const s of strategies) {
                msg += `📌 ${s.label} (${s.id})\n`
                msg += `   ${s.desc}\n\n`
            }
            msg += '💡 使用 "#设置策略 [策略ID]" 切换策略'

            await MessageHelper.reply(e, msg, { recallTime: 45 })
            return true
        } catch (error) {
            logger.error('[QQ农场] 获取策略列表失败:', error)
            await MessageHelper.reply(e, `❌ 获取失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }

    // ========== 数据分析 ==========

    // 种植效率排行榜
    async leaderboard(e) {
        try {
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            await MessageHelper.tempReply(e, '正在获取排行榜数据...')

            const leaderboardData = await Api.getLeaderboard({ limit: 10 })
            if (!leaderboardData) {
                await MessageHelper.reply(e, '❌ 获取排行榜失败，服务器可能不支持此功能', { recallTime: 15 })
                return true
            }

            const { rankings = [], config = {} } = leaderboardData

            if (rankings.length === 0) {
                await MessageHelper.reply(e, '暂无排行榜数据', { recallTime: 15 })
                return true
            }

            let msg = '═══ 种植效率排行榜 ═══\n\n'
            msg += `排序方式: ${config.sortBy || 'exp_per_hour'}\n`
            msg += `土地数: ${config.lands || 18} | 等级: ${config.level || 100}\n\n`

            for (let i = 0; i < Math.min(10, rankings.length); i++) {
                const item = rankings[i]
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
                msg += `${medal} ${item.name}\n`
                msg += `   经验/小时: ${item.expPerHour} | 利润/小时: ${item.profitPerHour}\n`
                msg += `   生长时间: ${item.growTime}分钟 | 成本: ${item.cost}金币\n\n`
            }

            await MessageHelper.reply(e, msg, { recallTime: 50 })
            return true
        } catch (error) {
            logger.error('[QQ农场] 获取排行榜失败:', error)
            await MessageHelper.reply(e, `❌ 获取失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }

    // 种植推荐
    async plantingRecommendation(e) {
        try {
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            const account = await Farm.getUserAccount(e.user_id)
            const status = account ? await Farm.getUserAccountStatus(e.user_id) : null

            const level = status?.userState?.level || 1
            const lands = 18 // 默认18块地

            await MessageHelper.tempReply(e, '正在获取种植推荐...')

            const recommendation = await Api.getRecommendation(level, lands, 'exp')
            if (!recommendation) {
                await MessageHelper.reply(e, '❌ 获取推荐失败，服务器可能不支持此功能', { recallTime: 15 })
                return true
            }

            const { recommendation: mainRec, alternatives = [] } = recommendation

            let msg = '═══ 种植推荐 ═══\n\n'
            msg += `当前等级: ${level} | 土地数: ${lands}\n\n`

            if (mainRec) {
                msg += `🌟 推荐作物: ${mainRec.name}\n`
                msg += `   经验/小时: ${mainRec.expPerHour}\n`
                msg += `   利润/小时: ${mainRec.profitPerHour}\n`
                msg += `   生长时间: ${mainRec.growTime}分钟\n`
                msg += `   种子成本: ${mainRec.seedCost}金币\n\n`
            }

            if (alternatives.length > 0) {
                msg += '📋 其他选择:\n'
                for (const alt of alternatives.slice(0, 3)) {
                    msg += `   • ${alt.name} (经验/小时: ${alt.expPerHour})\n`
                }
            }

            await MessageHelper.reply(e, msg, { recallTime: 40 })
            return true
        } catch (error) {
            logger.error('[QQ农场] 获取推荐失败:', error)
            await MessageHelper.reply(e, `❌ 获取失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }

    // 种子详情
    async seedDetails(e) {
        try {
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            const match = e.msg.match(/^#?(?:种子详情|查看种子)\s*(\d+)?$/)
            const seedId = match?.[1]

            if (!seedId) {
                await MessageHelper.reply(e, '❌ 请指定种子ID\n格式: #种子详情 [种子ID]', { recallTime: 20 })
                return true
            }

            await MessageHelper.tempReply(e, '正在获取种子详情...')

            const seedData = await Api.getSeedDetails(seedId)
            if (!seedData) {
                await MessageHelper.reply(e, '❌ 获取种子详情失败，服务器可能不支持此功能', { recallTime: 15 })
                return true
            }

            let msg = '═══ 种子详情 ═══\n\n'
            msg += `名称: ${seedData.name || '未知'}\n`
            msg += `ID: ${seedData.id || seedId}\n`
            msg += `等级要求: ${seedData.level || 0}\n`
            msg += `种子成本: ${seedData.seedCost || 0}金币\n`
            msg += `果实售价: ${seedData.fruitPrice || 0}金币\n`
            msg += `生长时间: ${seedData.growTime || 0}分钟\n`
            msg += `收获经验: ${seedData.harvestExp || 0}\n\n`

            if (seedData.expPerHour) msg += `经验/小时: ${seedData.expPerHour}\n`
            if (seedData.profitPerHour) msg += `利润/小时: ${seedData.profitPerHour}\n`

            await MessageHelper.reply(e, msg, { recallTime: 35 })
            return true
        } catch (error) {
            logger.error('[QQ农场] 获取种子详情失败:', error)
            await MessageHelper.reply(e, `❌ 获取失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }

    // ========== 好友优化 ==========

    // 查看好友优化状态
    async friendOptimizer(e) {
        try {
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            const account = await Farm.getUserAccount(e.user_id)
            if (!account) {
                await MessageHelper.reply(e, '你还没有登录农场', { recallTime: 15 })
                return true
            }

            const optimizerData = await Api.getFriendOptimizer(account.id)
            if (!optimizerData) {
                await MessageHelper.reply(e, '❌ 获取优化状态失败，服务器可能不支持此功能', { recallTime: 15 })
                return true
            }

            const { quietHours = {}, visitStats = {} } = optimizerData

            let msg = '═══ 好友优化状态 ═══\n\n'

            // 静默时段
            msg += `🔕 静默时段: ${quietHours.enabled ? '✅ 已启用' : '❌ 已禁用'}\n`
            if (quietHours.enabled) {
                msg += `   时段: ${quietHours.startHour}:00 - ${quietHours.endHour}:00\n`
            }

            // 访问统计
            if (visitStats.totalVisits !== undefined) {
                msg += `\n📊 访问统计:\n`
                msg += `   总访问: ${visitStats.totalVisits}次\n`
                msg += `   成功访问: ${visitStats.successfulVisits}次\n`
                if (visitStats.lastVisitTime) {
                    msg += `   最后访问: ${new Date(visitStats.lastVisitTime).toLocaleString('zh-CN')}\n`
                }
            }

            msg += '\n💡 静默时段内将减少好友互动，避免打扰\n'
            msg += '使用 "#设置静默 [开始小时] [结束小时]" 设置时段'

            await MessageHelper.reply(e, msg, { recallTime: 40 })
            return true
        } catch (error) {
            logger.error('[QQ农场] 获取优化状态失败:', error)
            await MessageHelper.reply(e, `❌ 获取失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }

    // 设置静默时段
    async setQuietHours(e) {
        try {
            if (await this.checkUserBanned(e)) return true
            if (await this.checkGroupAllowed(e)) return true

            const match = e.msg.match(/^#?(?:设置静默|静默设置)\s*(\d+)?\s*(\d+)?$/)
            const startHour = parseInt(match?.[1]) || 23
            const endHour = parseInt(match?.[2]) || 7

            if (isNaN(startHour) || isNaN(endHour) || startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
                await MessageHelper.reply(e, '❌ 时间格式错误\n格式: #设置静默 [开始小时] [结束小时] (0-23)', { recallTime: 20 })
                return true
            }

            const account = await Farm.getUserAccount(e.user_id)
            if (!account) {
                await MessageHelper.reply(e, '你还没有登录农场', { recallTime: 15 })
                return true
            }

            await MessageHelper.tempReply(e, '正在设置静默时段...')

            const result = await Api.setQuietHours(account.id, true, startHour, endHour)
            if (!result) {
                await MessageHelper.reply(e, '❌ 设置失败，服务器可能不支持此功能', { recallTime: 15 })
                return true
            }

            await MessageHelper.reply(e, `✅ 静默时段已设置: ${startHour}:00 - ${endHour}:00`, { recallTime: 20 })
            return true
        } catch (error) {
            logger.error('[QQ农场] 设置静默时段失败:', error)
            await MessageHelper.reply(e, `❌ 设置失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }

    // ========== 批量控制（主人） ==========

    // 启动所有账号
    async startAllAccounts(e) {
        try {
            await MessageHelper.tempReply(e, '正在启动所有账号...')

            const result = await Api.startAllAccounts()
            if (!result) {
                await MessageHelper.reply(e, '❌ 启动失败，服务器可能不支持此功能', { recallTime: 15 })
                return true
            }

            // 统计结果
            const successCount = result.filter(r => r.success).length
            const failCount = result.length - successCount

            await MessageHelper.reply(e, [
                '✅ 批量启动完成\n',
                `成功: ${successCount}个\n`,
                `失败: ${failCount}个\n`,
                `总计: ${result.length}个账号`
            ], { recallTime: 30 })
            return true
        } catch (error) {
            logger.error('[QQ农场] 启动所有账号失败:', error)
            await MessageHelper.reply(e, `❌ 启动失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }

    // 停止所有账号
    async stopAllAccounts(e) {
        try {
            await MessageHelper.tempReply(e, '正在停止所有账号...')

            const result = await Api.stopAllAccounts()
            if (!result) {
                await MessageHelper.reply(e, '❌ 停止失败，服务器可能不支持此功能', { recallTime: 15 })
                return true
            }

            await MessageHelper.reply(e, '✅ 所有账号已停止', { recallTime: 20 })
            return true
        } catch (error) {
            logger.error('[QQ农场] 停止所有账号失败:', error)
            await MessageHelper.reply(e, `❌ 停止失败: ${error.message}`, { recallTime: 15 })
            return true
        }
    }
}
