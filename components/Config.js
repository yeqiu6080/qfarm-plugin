import fs from 'fs'
import path from 'path'

// 配置文件路径
const configPath = path.join(process.cwd(), 'plugins', 'qfarm-plugin', 'config', 'config.json')
const configDir = path.dirname(configPath)

// 默认配置
const defaultConfig = {
    serverUrl: 'http://127.0.0.1:3456',
    userAutoAccounts: {}, // 用户自动挂机状态: { userId: accountId }
    auto: {
        enabled: true // 登录后是否自动启用挂机
    },
    offlineNotify: {
        enabled: true, // 是否启用掉线推送功能
        userGroups: {}, // 用户开启推送的群: { userId: [groupId1, groupId2, ...] }
        cooldown: 300 // 推送冷却时间（秒），避免频繁推送
    }
}

export default class Config {
    // 确保配置目录存在
    static ensureConfigDir() {
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true })
        }
    }

    // 读取配置
    static load() {
        this.ensureConfigDir()
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2))
            return { ...defaultConfig }
        }
        try {
            const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'))
            return { ...defaultConfig, ...saved }
        } catch (e) {
            return { ...defaultConfig }
        }
    }

    // 保存配置
    static save(config) {
        this.ensureConfigDir()
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    }

    // 获取服务器地址
    static getServerUrl() {
        return this.load().serverUrl
    }

    // 设置服务器地址
    static setServerUrl(url) {
        const config = this.load()
        config.serverUrl = url
        this.save(config)
    }

    // 获取用户自动挂机状态
    static getUserAutoAccount(userId) {
        return this.load().userAutoAccounts[userId]
    }

    // 设置用户自动挂机状态
    static setUserAutoAccount(userId, accountId) {
        const config = this.load()
        config.userAutoAccounts[userId] = accountId
        this.save(config)
    }

    // 删除用户自动挂机状态
    static deleteUserAutoAccount(userId) {
        const config = this.load()
        delete config.userAutoAccounts[userId]
        this.save(config)
    }

    // 获取自动挂机配置
    static getAutoConfig() {
        return this.load().auto || { enabled: true }
    }

    // 设置自动挂机配置
    static setAutoConfig(autoConfig) {
        const config = this.load()
        config.auto = { ...config.auto, ...autoConfig }
        this.save(config)
    }

    // 获取掉线推送配置
    static getOfflineNotifyConfig() {
        return this.load().offlineNotify || { enabled: true, userGroups: {}, cooldown: 300 }
    }

    // 设置掉线推送配置
    static setOfflineNotifyConfig(notifyConfig) {
        const config = this.load()
        config.offlineNotify = { ...config.offlineNotify, ...notifyConfig }
        this.save(config)
    }

    // 获取用户开启推送的群列表
    static getUserNotifyGroups(userId) {
        const notifyConfig = this.getOfflineNotifyConfig()
        return notifyConfig.userGroups[userId] || []
    }

    // 为用户添加推送群
    static addUserNotifyGroup(userId, groupId) {
        const config = this.load()
        if (!config.offlineNotify) {
            config.offlineNotify = { enabled: true, userGroups: {}, cooldown: 300 }
        }
        if (!config.offlineNotify.userGroups[userId]) {
            config.offlineNotify.userGroups[userId] = []
        }
        if (!config.offlineNotify.userGroups[userId].includes(groupId)) {
            config.offlineNotify.userGroups[userId].push(groupId)
            this.save(config)
        }
    }

    // 为用户移除推送群
    static removeUserNotifyGroup(userId, groupId) {
        const config = this.load()
        if (!config.offlineNotify?.userGroups[userId]) return
        config.offlineNotify.userGroups[userId] = config.offlineNotify.userGroups[userId].filter(id => id !== groupId)
        this.save(config)
    }

    // 检查用户是否已开启某个群的推送
    static isUserNotifyEnabled(userId, groupId) {
        const groups = this.getUserNotifyGroups(userId)
        return groups.includes(groupId)
    }
}
