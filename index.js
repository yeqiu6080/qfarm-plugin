import FarmPlugin from './apps/farm.js'
import { FarmRoute, FarmRoutePlugin } from './apps/route.js'

// 只导出插件类，FarmRoute 是路由处理类，不是插件
export { FarmPlugin, FarmRoutePlugin }

// FarmRoute 供其他模块使用，不作为插件导出
export { FarmRoute }

logger.info(' - QQ农场插件加载成功')
