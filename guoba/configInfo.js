import Config from "../components/Config.js"

// 获取配置数据
export function getConfigData() {
    const config = Config.load()
    return {
        serverUrl: config.serverUrl,
        autoEnabled: config.auto?.enabled ?? true,
        offlineNotifyEnabled: config.offlineNotify?.enabled ?? true,
        offlineNotifyCooldown: config.offlineNotify?.cooldown ?? 300,
        bannedUsers: config.bannedUsers || [],
        allowedGroups: config.allowedGroups || [],
        routeEnabled: config.route?.enabled ?? true
    }
}

// 保存配置数据
export function setConfigData(data, { Result }) {
    try {
        const config = Config.load()

        // 服务器地址
        if (data.serverUrl !== undefined) {
            config.serverUrl = data.serverUrl
        }

        // 自动挂机配置
        if (data.autoEnabled !== undefined) {
            config.auto = { enabled: data.autoEnabled }
        }

        // 掉线推送配置
        if (data.offlineNotifyEnabled !== undefined || data.offlineNotifyCooldown !== undefined) {
            config.offlineNotify = {
                enabled: data.offlineNotifyEnabled ?? config.offlineNotify?.enabled ?? true,
                userGroups: config.offlineNotify?.userGroups || {},
                cooldown: data.offlineNotifyCooldown ?? config.offlineNotify?.cooldown ?? 300
            }
        }

        // 禁止用户列表
        if (data.bannedUsers !== undefined) {
            config.bannedUsers = data.bannedUsers
        }

        // 允许群列表
        if (data.allowedGroups !== undefined) {
            config.allowedGroups = data.allowedGroups
        }

        // Web面板路由配置
        if (data.routeEnabled !== undefined) {
            config.route = { enabled: data.routeEnabled }
        }

        Config.save(config)
        return Result.ok({}, "保存成功~")
    } catch (error) {
        logger.error("[QQ农场] 保存配置失败:", error)
        return Result.error("保存失败: " + error.message)
    }
}

// Schema 定义
export const schemas = [
    {
        component: "Divider",
        label: "服务器配置"
    },
    {
        field: "serverUrl",
        label: "服务器地址",
        component: "Input",
        required: true,
        placeholder: "请输入QQ农场服务器地址，如 http://127.0.0.1:3456",
        helpMessage: "QQ农场共享版服务器的访问地址"
    },
    {
        component: "Divider",
        label: "自动挂机配置"
    },
    {
        field: "autoEnabled",
        label: "自动启用挂机",
        component: "Switch",
        defaultValue: true,
        helpMessage: "用户登录后是否自动启用挂机功能"
    },
    {
        component: "Divider",
        label: "掉线推送配置"
    },
    {
        field: "offlineNotifyEnabled",
        label: "启用掉线推送",
        component: "Switch",
        defaultValue: true,
        helpMessage: "账号掉线时是否向用户推送通知"
    },
    {
        field: "offlineNotifyCooldown",
        label: "推送冷却时间",
        component: "InputNumber",
        defaultValue: 300,
        min: 60,
        max: 3600,
        helpMessage: "掉线推送的冷却时间（秒），避免频繁推送"
    },
    {
        component: "Divider",
        label: "权限管理"
    },
    {
        field: "bannedUsers",
        label: "禁止使用的用户",
        component: "Select",
        mode: "tags",
        placeholder: "输入用户QQ号后按回车添加",
        helpMessage: "被禁止使用的用户QQ号列表"
    },
    {
        field: "allowedGroups",
        label: "允许使用的群",
        component: "Select",
        mode: "tags",
        placeholder: "输入群号后按回车添加",
        helpMessage: "允许使用插件的群号列表（为空表示所有群都允许）"
    },
    {
        component: "Divider",
        label: "Web面板配置"
    },
    {
        field: "routeEnabled",
        label: "启用Web面板",
        component: "Switch",
        defaultValue: true,
        helpMessage: "是否启用Web面板路由功能，关闭后将无法通过浏览器访问农场面板"
    }
]

export default {
    schemas,
    getConfigData,
    setConfigData
}
