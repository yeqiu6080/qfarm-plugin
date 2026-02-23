import _ from "lodash"
import render from "./render.js"
import Renderer from "../../../../lib/renderer/loader.js"

const renderer = Renderer.getRenderer()

export default new class extends render {
    constructor() {
        super()
        this.browser = false
        this.shoting = []
    }

    /**
     * 网页截图
     * @param {string} url - 需要截图的网页URL
     * @param {object} params - 参数对象
     * @param {object} params.headers - HTTP请求头
     * @param {object} params.setViewport - 设置视口大小
     * @param {boolean} params.font - 是否添加特定字体样式
     * @param {object} params.cookie - 需要设置的cookie
     * @param {boolean} params.fullPage - 是否截取整个页面，默认true
     * @param {string} params.emulate - 模拟的设备类型
     * @param {Function} params.beforeLaunch - 页面创建前的回调
     * @param {Function} params.afterLaunch - 页面创建后的回调
     * @returns {Promise<boolean|object>} - 返回图片segment或false
     */
    async Webpage(url, {
        headers = false,
        setViewport = false,
        font = false,
        cookie = false,
        fullPage = true,
        emulate = false,
        beforeLaunch = null,
        afterLaunch = null
    }) {
        if (!(await this.launch())) {
            return false
        }

        let buff = ""
        let start = Date.now()
        let name = _.truncate(url)
        this.shoting.push(name)

        try {
            const page = await this.browser.newPage()

            if (typeof beforeLaunch === "function") {
                await beforeLaunch(page)
            }

            // 设置请求头
            if (headers) await page.setExtraHTTPHeaders(headers)

            // 设置cookie
            if (cookie) await page.setCookie(...cookie)

            // 模拟设备
            if (emulate) await page.emulate(emulate)

            // 设置视口
            if (setViewport) await page.setViewport(setViewport)

            // 打开页面
            await page.goto(url, { timeout: 1000 * 60, waitUntil: "networkidle0" })

            // 设置字体
            if (font) {
                await page.addStyleTag({
                    content: `* {font-family: "汉仪文黑-65W","雅痞-简","圆体-简","PingFang SC","微软雅黑", sans-serif !important;}`
                })
            }

            if (typeof afterLaunch === "function") {
                await afterLaunch(page)
            }

            // 截图
            buff = await page.screenshot({
                type: "jpeg",
                fullPage,
                quality: 100,
                encoding: "base64"
            })

            await page.close().catch((err) => logger.error(err))
        } catch (err) {
            logger.error(`[QQ农场] 网页截图失败:${name}${err}`)

            // 关闭浏览器
            if (this.browser) {
                await this.browser.close().catch((err) => logger.error(err))
            }
            this.browser = false
            buff = ""
            return false
        }

        this.shoting.pop()

        if (!buff) {
            logger.error(`[QQ农场] 网页截图为空:${name}`)
            return false
        }

        renderer.renderNum++

        // 计算图片大小
        let kb = (buff.length / 1024).toFixed(2) + "kb"
        logger.mark(
            `[QQ农场][网页截图][${name}][${renderer.renderNum}次] ${kb} ${logger.green(
                `${Date.now() - start}ms`
            )}`
        )

        renderer.restart()
        return segment.image("base64://" + buff)
    }

    /**
     * 获取页面数据
     * @param {string} url - 要跳转的URL
     * @param {string} waitSelector - 等待的选择器
     * @returns {object} - 页面数据
     */
    async get(url, waitSelector) {
        if (!(await this.launch())) {
            return false
        }

        const page = await this.browser.newPage()
        try {
            logger.debug("[QQ农场] Puppeteer get", url)
            await page.goto(url)
            await page.waitForSelector(waitSelector).catch((e) => {
                logger.error(`[QQ农场] Puppeteer get "${url}" wait "${waitSelector}" error`)
                logger.error(e)
            })
            const res = await page.evaluate(() => ({
                url: window.location.href,
                data: document.documentElement.outerHTML
            }))
            return res
        } catch (e) {
            logger.error(`[QQ农场] Puppeteer get "${url}" error`)
            throw e
        } finally {
            page.close()
        }
    }

    /**
     * 启动浏览器
     */
    async launch() {
        if (this.browser) return this.browser
        if (!renderer.browser) {
            let res = await renderer.browserInit()
            if (!res) return false
        }
        this.browser = renderer.browser
        return this.browser
    }
}
