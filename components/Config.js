import fs from 'fs'
import path from 'path'

// 配置文件路径
const configPath = path.join(process.cwd(), 'plugins', 'qfarm-plugin', 'config', 'config.json')
const configDir = path.dirname(configPath)

// 默认配置
const defaultConfig = {
    serverUrl: 'http://127.0.0.1:3456',
    userAutoAccounts: {} // 用户自动挂机状态: { userId: accountId }
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
}
