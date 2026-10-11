# 用 WorkBuddy 的模型处理电路工坊任务

工坊提供本地 **MCP 连接器**，让 WorkBuddy 当前选择的模型读取电路照片、修改要求并回传草稿。调用发生在 WorkBuddy 中，用量按该账号和模型的套餐规则计算。工坊不用读取 WorkBuddy 登录令牌，也不用在工坊填写 WorkBuddy API Key。

这是“网页创建待办 → 把任务指令发送给 WorkBuddy → 模型调用连接器 → 网页预览确认”的流程。网页不会自行在 WorkBuddy 中发消息或开启模型任务。

## 首次连接

1. 按 README 安装并启动工坊。保持 `http://127.0.0.1:4317/` 可访问。
2. 双击程序目录的 **`setup-workbuddy.cmd`**，或运行 `npm run setup:workbuddy`。生成文件均在本项目内：
   - `.cache/workbuddy/mcp.json`：可粘贴到自定义连接器的 MCP 配置。
   - `.cache/workbuddy/circuit-teacher-connector/`：含 `connector-meta.json`、`mcp.json` 和图标的连接器目录。
3. 打开 WorkBuddy，进入“专家·技能·连接器 → 连接器 → 自定义连接器”，按客户端提供的 MCP 配置方式添加 `.cache/workbuddy/mcp.json` 的内容，并启用。也可直接从工坊“AI 设置 → WorkBuddy 本地插件”复制同一配置。
4. 在工坊选择 **WorkBuddy 本地插件**，点击“保存并测试连接”。显示“本地插件已连接”代表 MCP 进程在线，具体模型与图片能力还需要实际任务验证。

配置会自动使用当前 Node 的路径和程序所在路径，包含空格的路径也使用参数数组传递。移动程序目录或更换 Node 安装路径后，请重新运行生成脚本，再更新 WorkBuddy 中的配置。生成的本机配置不要当作别人电脑通用的安装配置。

连接器目录按 [WorkBuddy 官方开发规范](https://open.workbuddy.cn/docs/connector) 生成，声明最低版本 4.24.0。当前可通过自定义 MCP 使用，尚未在 WorkBuddy 官方市场上架；市场发布需要另行提交审核。客户端入口参考 [官方连接器使用说明](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector)。

## 制作一次课件

1. WorkBuddy 中选择合适的模型；识别照片需模型支持图片输入。
2. 工坊中上传照片并点击识别，或输入中文要求后点击“生成建议”。
3. 页面出现待办条，点击“复制 WorkBuddy 指令”，把内容发送给 WorkBuddy。例如要求它读取指定任务、按照格式生成草稿、调用 `circuit_submit_result` 回传。
4. 回到工坊等待草稿预览。检查变化后点击“确认应用”，再校对和导出。取消待办后，迟到的结果会被拒绝；错误 JSON 与无效引用不会覆盖当前工程。
5. 浏览器关闭后可重新打开工坊，使用“WorkBuddy 待办”找回已提交的任务。任务在本机保存，服务重启后仍保留。

“修改演示”只改变讲解时间轴；“修改电路”改变线路后会重新检查动画。回传草稿不会直接保存或覆盖工程，必须在网页人工确认。对旧版本任务的草稿，网页会要求先处理版本冲突。

## 工具与数据范围

| 工具 | 功能 |
| --- | --- |
| `circuit_list_tasks` | 列出用户在工坊提交的待办摘要 |
| `circuit_get_task` | 读取指定待办的要求、电路与讲解；照片以 MCP 图片内容提供 |
| `circuit_submit_result` | 提交结构化 JSON 草稿，服务校验后供网页预览 |

本地 stdio 进程通过用户启用的连接器调用仅监听回环地址的工坊。工具不提供任意文件读取、命令执行或其他软件登录凭据。工程和待办保存在 `data/`，不要公开该目录。处理照片任务时，照片会通过 WorkBuddy 发给它选择的模型服务，按该服务的数据规则处理。

工坊的 API 使用统计不包含 WorkBuddy 内部模型调用，额度与用量在 WorkBuddy 中查看，参考 [官方套餐说明](https://www.workbuddy.cn/docs/workbuddy/Pricing)。本项目不附带共享额度，也不把 WorkBuddy 会员转换成外部通用 API。

## 排查

- **未连接：** 确保 `start.cmd` 已启动；连接器已启用；配置里的 Node 和脚本路径存在；允许客户端使用自定义 MCP 后重新连接。
- **任务一直等待：** 创建待办后还要把复制的指令发送给 WorkBuddy；网页不会自动触发它。
- **模型看不到照片：** 换支持图片和 MCP 图片内容的模型；原图仍可在工坊人工校对。
- **草稿校验失败：** 让 WorkBuddy 根据工具返回的具体错误修正 JSON，再提交同一任务，不要执行生成的代码。
- **需要重试已结束任务：** 已完成或取消的任务不能覆盖。回到工坊重新生成一个待办。

本版本已验证标准 SDK 的 stdio 工具调用、图片传递、草稿校验、网页预览和撤销；尚未使用真实 WorkBuddy 账号完成模型识别验收，不能据此承诺识图准确率。
