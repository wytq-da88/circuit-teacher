# 更新记录

## 0.1.1 — API 兼容与 WorkBuddy 本地插件

- Agnes AI、OpenAI、DeepSeek 和兼容 API 预设；支持自己的 Agnes 免费/default Key。
- 整理根地址与完整 Chat Completions 地址，可选 JSON 模式，取消固定 temperature；DeepSeek 原生请求关闭 thinking。
- 模型请求可使用 Windows 系统 HTTP 代理或手动代理；区分本机服务未启动、网络失败、密钥、额度与参数错误。
- 密钥按服务商隔离，保存失败时保留输入，支持最高 300 秒超时。
- WorkBuddy stdio MCP 连接器：读取照片与任务、回传校验草稿、网页确认、撤销、待办恢复和取消；提供配置生成脚本与中文说明。

标准 MCP、代理与界面流程已验证；真实 Agnes/OpenAI/DeepSeek API 调用和 WorkBuddy 账号识别仍需要用户账号验收。WorkBuddy 自定义连接器尚未在官方市场上架。

## 0.1.0 — 首个公开预览版

- 中文本机工作台、基础电路编辑、三个教学案例。
- 可配置视觉 API，照片识别和中文修改先预览、再应用。
- 人工校对、撤销、保存及版本恢复。
- 教学时间轴、离线互动 HTML、PNG/SVG/PDF、工程 JSON 与 MP4 导出接口。
- MIT 开源、第三方来源记录和本机数据排除规则。

AI 识图准确率需要使用实际模型与纸图验证；内置模板和接口测试不等于真实识别验收。视频依赖本机渲染环境，请参阅 README 的导出说明。
