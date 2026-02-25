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
            }
        ]
    }
]

export const isSys = true
