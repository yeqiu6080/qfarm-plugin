import fs from "fs"
import { Config } from "../../components/index.js"
import puppeteer from "../../../../lib/puppeteer/puppeteer.js"

const _path = process.cwd()
const Plugin_Name = "qfarm-plugin"

export default class {
    /**
     * 渲染HTML
     * @param {string} path 文件路径，格式: "app/tpl" 如 "help/index"
     * @param {object} params 传递给模板的数据
     * @param {object} cfg 配置选项
     * @param {number} cfg.scale 缩放比例，默认 1.2
     */
    async render(path, params, cfg = {}) {
        let [app, tpl] = path.split("/")

        // 布局路径
        let layoutPath = process.cwd() + `/plugins/${Plugin_Name}/resources/common/layout/`
        // 资源路径（相对渲染后的HTML文件）
        let resPath = `../../../../../plugins/${Plugin_Name}/resources/`

        // 组装模板数据
        let data = {
            ...params,
            _plugin: Plugin_Name,
            saveId: params.saveId || params.save_id || tpl,
            tplFile: `./plugins/${Plugin_Name}/resources/${app}/${tpl}.html`,
            pluResPath: resPath,
            _res_path: resPath,
            _layout_path: layoutPath,
            _tpl_path: process.cwd() + `/plugins/${Plugin_Name}/resources/common/tpl/`,
            defaultLayout: layoutPath + "default.html",
            elemLayout: layoutPath + "elem.html",
            pageGotoParams: {
                waitUntil: "networkidle0"
            },
            pageViewport: {
                width: 1130,
                height: 800
            },
            sys: {
                scale: this.#scale(cfg.scale || 1.2),
                copyright: params.copyright || `Created By Yunzai-Bot & QQ农场插件`
            },
            quality: 100
        }

        // debug模式下保存渲染数据，方便调试
        if (process.argv.includes("debug")) {
            let saveDir = _path + "/data/ViewData/"
            if (!fs.existsSync(saveDir)) {
                fs.mkdirSync(saveDir, { recursive: true })
            }
            let file = saveDir + tpl + ".json"
            data._app = app
            fs.writeFileSync(file, JSON.stringify(data, null, 2))
        }

        // 调用 Yunzai 的 puppeteer 截图
        let img = await puppeteer.screenshot(`${Plugin_Name}/${app}/${tpl}`, data)

        // 返回图片 segment，由调用者自行发送
        return img || false
    }

    /**
     * 计算缩放样式
     * @param {number} pct 缩放比例
     * @returns {string} style属性
     */
    #scale(pct = 1) {
        let scale = Config.render?.scale || 100
        scale = Math.min(2, Math.max(0.5, scale / 100))
        pct = pct * scale
        return `style='transform:scale(${pct})'`
    }
}
