# AI 配置与连接排查

打开工坊右上角的“AI 设置”。先确认顶部显示“本机服务已连接”；如果未连接，请双击程序目录的 `start.cmd` 后点击“重新检查”。旧网页仍能显示画布，并不代表本机服务正在运行。

## Agnes AI 免费 Key

1. 打开 [Agnes API Key 控制台](https://platform.agnes-ai.com/settings/apiKeys)，登录后创建可用的免费/default Key，复制新密钥。
2. 在工坊选择 **Agnes AI（支持免费 Key）**。默认地址为 `https://apihub.agnes-ai.com/v1`，模型为 `agnes-2.5-flash`。
3. 粘贴该服务商的 Key，保留默认的“使用系统代理（自动）”，点击“保存并测试连接”。Agnes 预设默认关闭 API JSON 模式，工坊仍要求并校验严格 JSON 草稿。
4. 文字测试成功后，再上传自己的电路照片，检查识别结果和待确认项。

Agnes 官方提供免费/default Key 类型，适用于测试和低频使用；可用模型、余额、速率及收费规则以控制台和 [官方 Token Plan 文档](https://agnes-ai.com/en/docs/tokenplan) 为准。多建免费 Key 不会增加同一额度池。本项目不承诺无限免费调用，也不提供共享密钥。

上述地址与示例模型来自 [Agnes 官方 API FAQ](https://agnes-ai.com/en/docs/faqs)；其 [官方模型仓库](https://github.com/AgnesAI-Labs/AgnesAI-Models) 列出 `agnes-2.5-flash` 的文字和视觉输入能力。少量真实调用已验证基础电路测试图和中文修改；不同照片的效果仍需用你的账号实测。当前兼容单个完整 JSON 对象及其可选 JSON 代码框，混杂说明文字、多个对象或脚本仍会拒绝，不执行模型代码。

识别范围为30个以内的电源、开关、电阻、滑动变阻器、灯泡、电流表、电压表与导线。识别时先判断图片类型；工业线束、连接器装配、总线布线、PCB和交流图会提示超出范围，保留原工程。基础电路也需要逐一核对正负极、引脚和导线；元件数量正确不代表接线准确。

## OpenAI、DeepSeek 与兼容 API

| 来源 | 接口根地址 | 预设模型 | 说明 |
| --- | --- | --- | --- |
| OpenAI 官方 | `https://api.openai.com/v1` | `gpt-4.1-mini` | 需要 OpenAI API Key 与 API 额度 |
| DeepSeek 官方 | `https://api.deepseek.com` | `deepseek-flash` | 官方视觉文档支持图片输入 |
| Agnes AI | `https://apihub.agnes-ai.com/v1` | `agnes-2.5-flash` | 支持自己的免费/default Key |
| 其他兼容服务 | 服务商给出的根地址 | 服务商给出的模型 ID | 必须支持 Chat Completions 与 JSON 文本回复 |

可以填写根地址，或完整的 `/chat/completions` 地址，工坊会整理路径。服务商网页、API Key 管理页和登录页不能作为 API 地址。切换服务商后要填写对应密钥；同一服务商的已保存密钥留空会保留，点击“清除密钥”后保存才会删除。

`deepseek-v4-pro` 是官方文档中的有效模型名称，可以用于文字改图、改演示。照片识别优先选择官方 [视觉文档](https://api-docs.deepseek.com/guides/vision/) 推荐的 `deepseek-flash`。工坊对原生 DeepSeek 请求关闭 thinking，以便取得完整结构化草稿；参考 [Chat Completions 参数](https://api-docs.deepseek.com/api/create-chat-completion/)。

连接测试会调用你选择的模型，可能消耗该账号的 API 额度。文字测试成功只证明收到了规定的 JSON 回复，不替代图片识别验收。客户端订阅与 API 额度是否互通由服务商决定；WorkBuddy 账号的使用方式见 [WorkBuddy 接入说明](WorkBuddy接入.md)。

## 网络设置

- **使用系统代理（自动）：** 优先读取进程的 HTTP/HTTPS 代理环境变量；Windows 下也读取已启用的系统 HTTP 代理。只用于工坊的模型请求，不修改系统代理。访问本机模型服务时直接连接。
- **直接连接：** 不使用工坊代理。如果服务可以直接访问，可选择此项。
- **手动设置 HTTP 代理：** 填写代理软件的 HTTP 地址，例如 `http://127.0.0.1:7890`，端口以该软件实际配置为准。支持 HTTP/HTTPS CONNECT 代理；暂不支持 SOCKS、带账号密码的代理或仅提供 PAC 脚本的代理。

浏览器能打开服务商网页，但 Node 服务无法调用 API，可能是 Node 没有使用 Windows 系统代理。设置页会显示已检测到的代理地址。请求超时可设置为 1–300 秒；提高超时不能修复错误的 Key 或接口地址。

## 常见提示

| 提示 | 处理方法 |
| --- | --- |
| 无法连接本机服务 | 运行 `start.cmd`，检查 `logs/server-error.log`；当前画布仍保留 |
| HTTP 401 | 核对当前服务商的 Key 是否已保存、过期或复制不完整 |
| HTTP 402 / 429 额度不足 | 在服务商控制台查看余额或额度 |
| HTTP 429 请求频率过高 | 稍后重试，检查免费套餐的限额 |
| HTTP 404 | 核对接口路径和账号可用的模型 ID |
| 模型不支持 JSON 模式 | 关闭“启用 API JSON 模式”，再试一次 |
| 当前模型不接受图片 | 换支持图片输入的模型；不能用文字测试证明识图能力 |
| 超时、DNS、证书或代理连接失败 | 检查代理和 API 地址；不需要关闭 HTTPS 证书校验 |
| 无效 JSON / 无效元件引用 | 当前工程不变，调整要求或换模型重试 |

密钥只保存于本机 `data/settings.json`，该文件未加密且被 Git 忽略。密钥不回传到前端、不进入工程导出或日志。不要把整个 `data/` 目录上传到公开仓库；报告故障时只提供错误提示，不附密钥。
