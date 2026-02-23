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
            }
        ]
    }
]

export const isSys = true
