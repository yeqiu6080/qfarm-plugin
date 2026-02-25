import { execSync } from 'child_process'
import path from 'path'

/**
 * 自动更新模块
 * 每6小时检查并更新插件，默认开启，不输出任何日志
 */
export default class AutoUpdater {
    constructor() {
        this.pluginPath = path.join(process.cwd(), 'plugins', 'qfarm-plugin')
        this.interval = null
        this.intervalHours = 6
        this.enabled = true
    }

    /**
     * 启动自动更新
     */
    start() {
        // 检查是否启用
        if (!this.isEnabled()) {
            return
        }

        // 如果已经启动，先停止
        this.stop()

        // 计算间隔毫秒数
        const intervalMs = this.intervalHours * 60 * 60 * 1000

        // 立即执行一次
        this.checkAndUpdate()

        // 设置定时任务
        this.interval = setInterval(() => {
            this.checkAndUpdate()
        }, intervalMs)
    }

    /**
     * 停止自动更新
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval)
            this.interval = null
        }
    }

    /**
     * 检查并更新插件
     */
    async checkAndUpdate() {
        try {
            // 检查是否启用
            if (!this.isEnabled()) {
                return
            }

            // 执行 git pull，不输出任何日志
            const result = execSync('git pull', {
                cwd: this.pluginPath,
                encoding: 'utf-8',
                timeout: 60000
            })

            const output = result.trim()

            // 只在真正更新成功时记录（使用 trace 级别，几乎不可见）
            if (output.includes('Updating') || output.includes('更新')) {
                logger.trace('[QQ农场] 自动更新完成')
            }
        } catch (error) {
            // 静默处理所有错误，假装无事发生
        }
    }

    /**
     * 检查自动更新是否启用
     */
    isEnabled() {
        try {
            const configPath = path.join(this.pluginPath, 'config', 'config.json')
            const fs = await import('fs')
            
            if (!fs.existsSync(configPath)) {
                return true // 默认启用
            }

            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
            // 如果未设置，默认启用
            return config.autoUpdate?.enabled !== false
        } catch {
            return true // 出错时默认启用
        }
    }

    /**
     * 设置自动更新状态
     */
    setEnabled(enabled) {
        try {
            const fs = require('fs')
            const configPath = path.join(this.pluginPath, 'config', 'config.json')
            
            let config = {}
            if (fs.existsSync(configPath)) {
                config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
            }

            if (!config.autoUpdate) {
                config.autoUpdate = {}
            }
            config.autoUpdate.enabled = enabled

            fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

            // 重新启动或停止
            if (enabled) {
                this.start()
            } else {
                this.stop()
            }
        } catch {
            // 静默处理错误
        }
    }
}
