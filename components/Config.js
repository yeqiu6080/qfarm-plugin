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
    },
    bannedUsers: [], // 被禁止使用的用户列表: [userId1, userId2, ...]
    allowedGroups: [], // 允许使用的群列表（空数组表示所有群都允许）: [groupId1, groupId2, ...]
    autoUpdate: {
        enabled: true // 是否启用自动更新（每6小时检查一次）
    }
}

export default class Config {
    // 配置缓存
    static configCache = null
    static configMtime = 0

    // 确保配置目录存在
    static ensureConfigDir() {
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true })
        }
    }

    // 读取配置（带缓存）
    static load() {
        this.ensureConfigDir()
        
        // 检查文件是否存在
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2))
            this.configCache = { ...defaultConfig }
            this.configMtime = Date.now()
            return this.configCache
        }

        try {
            // 检查文件修改时间
            const stats = fs.statSync(configPath)
            const mtime = stats.mtimeMs

            // 如果缓存有效，直接返回缓存
            if (this.configCache && mtime === this.configMtime) {
                return this.configCache
            }

            // 读取新配置
            const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'))
            this.configCache = { ...defaultConfig, ...saved }
            this.configMtime = mtime
            return this.configCache
        } catch (e) {
            return { ...defaultConfig }
        }
    }

    // 清除配置缓存（在保存后调用）
    static clearCache() {
        this.configCache = null
        this.configMtime = 0
    }

    // 保存配置
    static save(config) {
        this.ensureConfigDir()
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
        // 清除缓存，下次读取时会重新加载
        this.clearCache()
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

    // ========== 用户禁止功能 ==========

    // 获取被禁止的用户列表
    static getBannedUsers() {
        return this.load().bannedUsers || []
    }

    // 禁止用户使用
    static banUser(userId) {
        const config = this.load()
        if (!config.bannedUsers) {
            config.bannedUsers = []
        }
        if (!config.bannedUsers.includes(userId)) {
            config.bannedUsers.push(userId)
            this.save(config)
            return true
        }
        return false
    }

    // 解除用户禁止
    static unbanUser(userId) {
        const config = this.load()
        if (!config.bannedUsers) return false
        const index = config.bannedUsers.indexOf(userId)
        if (index > -1) {
            config.bannedUsers.splice(index, 1)
            this.save(config)
            return true
        }
        return false
    }

    // 检查用户是否被禁止
    static isUserBanned(userId) {
        const bannedUsers = this.getBannedUsers()
        return bannedUsers.includes(userId)
    }

    // ========== 群白名单功能 ==========

    // 获取允许的群列表
    static getAllowedGroups() {
        return this.load().allowedGroups || []
    }

    // 允许群使用
    static allowGroup(groupId) {
        const config = this.load()
        if (!config.allowedGroups) {
            config.allowedGroups = []
        }
        if (!config.allowedGroups.includes(groupId)) {
            config.allowedGroups.push(groupId)
            this.save(config)
            return true
        }
        return false
    }

    // 拒绝群使用
    static disallowGroup(groupId) {
        const config = this.load()
        if (!config.allowedGroups) return false
        const index = config.allowedGroups.indexOf(groupId)
        if (index > -1) {
            config.allowedGroups.splice(index, 1)
            this.save(config)
            return true
        }
        return false
    }

    // 检查群是否允许使用（空列表表示所有群都允许）
    static isGroupAllowed(groupId) {
        const allowedGroups = this.getAllowedGroups()
        // 如果白名单为空，表示所有群都允许
        if (allowedGroups.length === 0) return true
        return allowedGroups.includes(groupId)
    }

    // ========== 自动更新功能 ==========

    // 获取自动更新配置
    static getAutoUpdateConfig() {
        return this.load().autoUpdate || { enabled: true }
    }

    // 设置自动更新配置
    static setAutoUpdateConfig(autoUpdateConfig) {
        const config = this.load()
        config.autoUpdate = { ...config.autoUpdate, ...autoUpdateConfig }
        this.save(config)
    }

    // 检查自动更新是否启用
    static isAutoUpdateEnabled() {
        const config = this.load()
        // 默认启用
        return config.autoUpdate?.enabled !== false
    }
}
