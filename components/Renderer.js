import puppeteer from "../lib/puppeteer/puppeteer.js"

export default class Renderer {
    /**
     * 渲染图片（简化接口，直接调用 puppeteer.render）
     * @param {string} template 模板路径，格式: "app/tpl" 如 "help/index"
     * @param {object} data 模板数据
     * @param {object} options 选项
     * @param {number} options.scale 缩放比例，默认 1.2
     * @returns {Promise<false|object>} 成功返回图片 segment，失败返回 false
     */
    static async render(template, data, options = {}) {
        const { scale = 1.2 } = options

        try {
            // 直接调用 puppeteer.render
            return await puppeteer.render(template, data, { scale })
        } catch (err) {
            logger.error('[QQ农场] 渲染错误:', err)
            return false
        }
    }

    /**
     * 网页截图
     * @param {string} url 网页URL
     * @param {object} params 参数
     * @returns {Promise<boolean|object>} 图片 segment 或 false
     */
    static async Webpage(url, params = {}) {
        try {
            return await puppeteer.Webpage(url, params)
        } catch (err) {
            logger.error('[QQ农场] 网页截图错误:', err)
            return false
        }
    }

    /**
     * 获取页面数据
     * @param {string} url 网页URL
     * @param {string} waitSelector 等待的选择器
     * @returns {Promise<object>} 页面数据
     */
    static async get(url, waitSelector) {
        try {
            return await puppeteer.get(url, waitSelector)
        } catch (err) {
            logger.error('[QQ农场] 获取页面数据错误:', err)
            return false
        }
    }
}
