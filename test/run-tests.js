/**
 * 测试运行入口
 * 运行所有单元测试和集成测试
 */

import { createTestRunner } from './utils/test-framework.js'

// 导入所有测试模块
import configTests from './unit/config.test.js'
import apiTests from './unit/api.test.js'
import messageHelperTests from './unit/messageHelper.test.js'
import farmTests from './unit/farm.test.js'

const runner = createTestRunner()

console.log('╔════════════════════════════════════════════════════════╗')
console.log('║         QQ农场插件 (qfarm-plugin) 测试套件              ║')
console.log('╚════════════════════════════════════════════════════════╝')

async function runAllTests() {
  const allStats = {
    passed: 0,
    failed: 0,
    total: 0
  }

  // 运行 Config 测试
  console.log('\n┌────────────────────────────────────────────────────────┐')
  console.log('│ 组件测试: Config                                        │')
  console.log('└────────────────────────────────────────────────────────┘')
  const configStats = await configTests()
  allStats.passed += configStats.passed
  allStats.failed += configStats.failed
  allStats.total += configStats.total

  // 运行 Api 测试
  console.log('\n┌────────────────────────────────────────────────────────┐')
  console.log('│ 组件测试: Api                                           │')
  console.log('└────────────────────────────────────────────────────────┘')
  const apiStats = await apiTests()
  allStats.passed += apiStats.passed
  allStats.failed += apiStats.failed
  allStats.total += apiStats.total

  // 运行 MessageHelper 测试
  console.log('\n┌────────────────────────────────────────────────────────┐')
  console.log('│ 组件测试: MessageHelper                                 │')
  console.log('└────────────────────────────────────────────────────────┘')
  const messageStats = await messageHelperTests()
  allStats.passed += messageStats.passed
  allStats.failed += messageStats.failed
  allStats.total += messageStats.total

  // 运行 Farm 测试
  console.log('\n┌────────────────────────────────────────────────────────┐')
  console.log('│ 模型测试: Farm                                          │')
  console.log('└────────────────────────────────────────────────────────┘')
  const farmStats = await farmTests()
  allStats.passed += farmStats.passed
  allStats.failed += farmStats.failed
  allStats.total += farmStats.total

  // 最终汇总
  console.log('\n╔════════════════════════════════════════════════════════╗')
  console.log('║                     最终测试结果                        ║')
  console.log('╠════════════════════════════════════════════════════════╣')
  console.log(`║  总测试数: ${allStats.total.toString().padStart(3)}                                    ║`)
  console.log(`║  ✅ 通过: ${allStats.passed.toString().padStart(3)}                                    ║`)
  console.log(`║  ❌ 失败: ${allStats.failed.toString().padStart(3)}                                    ║`)
  console.log('╚════════════════════════════════════════════════════════╝')

  if (allStats.failed > 0) {
    console.log('\n⚠️  有测试失败，请检查上述输出')
    process.exit(1)
  } else {
    console.log('\n✨ 所有测试通过！')
    process.exit(0)
  }
}

runAllTests().catch(err => {
  console.error('测试运行出错:', err)
  process.exit(1)
})
