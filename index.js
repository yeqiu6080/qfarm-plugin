import FarmPlugin from './apps/farm.js'
import { FarmRoute, FarmRoutePlugin } from './apps/route.js'
import { FarmFeaturesPlugin } from './apps/features.js'

// 导出所有插件类
export { FarmPlugin, FarmRoutePlugin, FarmFeaturesPlugin }

// FarmRoute 供其他模块使用，不作为插件导出
export { FarmRoute }

logger.info(' - QQ农场插件加载成功')
