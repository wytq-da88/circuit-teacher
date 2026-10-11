# Sketch2Schematic AI 符号复用说明

- 项目：https://github.com/vitaliy-hnatyk/sketch2schematic-ai
- 固定来源提交：`2b097ce55f711e7968a7a996169eaf1f926bfe57`
- 原文件：[`src/utils/iecSymbolLibrary.js`](https://github.com/vitaliy-hnatyk/sketch2schematic-ai/blob/2b097ce55f711e7968a7a996169eaf1f926bfe57/src/utils/iecSymbolLibrary.js)
- 本目录 `iecSymbolLibrary.upstream.js` 为原始来源留档；`LICENSE` 为原始 MIT 许可。
- `shared/symbols.ts` 实际复用 `IEC_SYMBOL_GEOMETRY` 部分常量及 `svgMarkupForIecSymbol` 的电阻、电池、开关、灯泡 SVG 路径。
- 修改：统一引脚到左右 ±50 坐标；增加闭合开关状态、灯泡填色、电池极性文字；新增电流表、电压表、滑动变阻器。
- 离线 HTML/HyperFrames HTML 内附完整许可，SVG 内 metadata 附完整许可。

这些符号用于基础直流教学示意；本项目不声称第三方认证或物理仿真准确性。
