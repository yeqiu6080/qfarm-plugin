/**
 * QQ农场插件帮助配置
 * 参考 yenai-plugin 标准帮助样式
 */

export const helpCfg = {
    title: "QQ农场",
    subTitle: "Yunzai-Bot & QQ农场插件",
    columnCount: 3,
    colWidth: 265,
    theme: "all",
    style: {
        fontColor: "#ceb78b",
        descColor: "#eee",
        contBgColor: "rgba(6, 21, 31, .5)",
        contBgBlur: 3,
        headerBgColor: "rgba(6, 21, 31, .4)",
        rowBgColor1: "rgba(6, 21, 31, .2)",
        rowBgColor2: "rgba(6, 21, 31, .35)"
    }
}

export const helpList = [
    {
        group: "基础指令",
        list: [
            {
                icon: 1,
                title: "#我的农场",
                desc: "查看农场状态和统计"
            },
            {
                icon: 2,
                title: "#登录农场",
                desc: "扫码登录农场账号"
            },
            {
                icon: 3,
                title: "#退出农场",
                desc: "退出并删除账号"
            },
            {
                icon: 7,
                title: "#重登农场",
                desc: "退出并重新登录账号"
            },
            {
                icon: 24,
                title: "#农场帮助",
                desc: "显示本帮助信息"
            }
        ]
    },
    {
        group: "自动挂机",
        list: [
            {
                icon: 4,
                title: "#开启自动挂机",
                desc: "启动自动挂机功能"
            },
            {
                icon: 5,
                title: "#关闭自动挂机",
                desc: "停止自动挂机功能"
            }
        ]
    },
    {
        group: "掉线推送",
        list: [
            {
                icon: 8,
                title: "#开启掉线推送",
                desc: "在当前群开启掉线提醒"
            },
            {
                icon: 9,
                title: "#关闭掉线推送",
                desc: "关闭当前群的掉线提醒"
            },
            {
                icon: 10,
                title: "#掉线推送状态",
                desc: "查看推送设置状态"
            }
        ]
    },
    {
        group: "面板功能",
        list: [
            {
                icon: 19,
                title: "#农场面板",
                desc: "查看综合面板"
            },
            {
                icon: 20,
                title: "#农场日志",
                desc: "查看运行日志"
            },
            {
                icon: 21,
                title: "#农场土地",
                desc: "查看土地详情"
            },
            {
                icon: 22,
                title: "#农场统计",
                desc: "查看统计数据"
            },
            {
                icon: 23,
                title: "#农场操作",
                desc: "执行手动操作"
            }
        ]
    },
    {
        group: "任务系统",
        list: [
            {
                icon: 28,
                title: "#农场任务",
                desc: "查看任务列表"
            },
            {
                icon: 29,
                title: "#一键领取",
                desc: "领取所有任务奖励"
            },
            {
                icon: 30,
                title: "#领取任务 ID",
                desc: "领取指定任务"
            }
        ]
    },
    {
        group: "每日奖励",
        list: [
            {
                icon: 31,
                title: "#每日奖励",
                desc: "查看奖励状态"
            },
            {
                icon: 32,
                title: "#领取奖励",
                desc: "手动领取奖励"
            }
        ]
    },
    {
        group: "土地操作",
        list: [
            {
                icon: 33,
                title: "#解锁土地 ID",
                desc: "解锁指定土地"
            },
            {
                icon: 34,
                title: "#升级土地 ID",
                desc: "升级指定土地"
            }
        ]
    },
    {
        group: "种植策略",
        list: [
            {
                icon: 35,
                title: "#种植策略",
                desc: "查看当前策略"
            },
            {
                icon: 36,
                title: "#策略列表",
                desc: "查看可用策略"
            },
            {
                icon: 37,
                title: "#设置策略",
                desc: "切换种植策略"
            }
        ]
    },
    {
        group: "数据分析",
        list: [
            {
                icon: 38,
                title: "#种植排行",
                desc: "效率排行榜"
            },
            {
                icon: 39,
                title: "#种植推荐",
                desc: "作物种植推荐"
            },
            {
                icon: 40,
                title: "#种子详情 ID",
                desc: "查看种子信息"
            }
        ]
    },
    {
        group: "好友优化",
        list: [
            {
                icon: 41,
                title: "#好友优化",
                desc: "查看优化状态"
            },
            {
                icon: 42,
                title: "#设置静默",
                desc: "设置静默时段"
            }
        ]
    },
    {
        group: "Web面板",
        auth: "master",
        list: [
            {
                icon: 25,
                title: "#开启农场面板",
                desc: "开启Web面板访问"
            },
            {
                icon: 26,
                title: "#关闭农场面板",
                desc: "关闭Web面板访问"
            },
            {
                icon: 27,
                title: "#农场面板状态",
                desc: "查看面板服务状态"
            }
        ]
    },
    {
        group: "主人指令",
        auth: "master",
        list: [
            {
                icon: 6,
                title: "#农场账号列表",
                desc: "查看所有账号列表"
            },
            {
                icon: 7,
                title: "#设置农场服务器",
                desc: "设置服务器地址"
            },
            {
                icon: 11,
                title: "#农场更新",
                desc: "更新插件到最新版本"
            },
            {
                icon: 12,
                title: "#农场下线+QQ",
                desc: "强制下线指定用户"
            },
            {
                icon: 13,
                title: "#农场禁止+QQ",
                desc: "禁止用户使用农场"
            },
            {
                icon: 14,
                title: "#农场解禁+QQ",
                desc: "解除用户禁止"
            },
            {
                icon: 15,
                title: "#农场状态+QQ",
                desc: "查看指定用户状态"
            },
            {
                icon: 16,
                title: "#农场允许群+群号",
                desc: "允许群使用农场"
            },
            {
                icon: 17,
                title: "#农场拒绝群+群号",
                desc: "拒绝群使用农场"
            },
            {
                icon: 18,
                title: "#农场管理状态",
                desc: "查看管理状态"
            },
            {
                icon: 43,
                title: "#启动全部",
                desc: "启动所有账号"
            },
            {
                icon: 44,
                title: "#停止全部",
                desc: "停止所有账号"
            }
        ]
    }
]

export const isSys = true
