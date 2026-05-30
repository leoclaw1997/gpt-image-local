# 本地 AI 图片生成工作台

一个本地运行的图片生成桌面应用：前端使用 Vite + React，后端使用 Express 作为本地代理，支持打包为独立可执行文件。

## 快速开始

进入项目目录：

```bash
cd gpt-image-local
```

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

启动后打开浏览器访问：

```text
http://localhost:5173
```

## 打包为桌面应用

打包成独立可执行文件，无需浏览器或 Node.js 环境。

按平台打包：

```bash
npm run electron:build:win     # Windows .exe
npm run electron:build:mac     # macOS .dmg（需在 Mac 上运行）
npm run electron:build:linux   # Linux AppImage
```

产物位于 `release/` 目录：

- Windows：`GPT Image Studio Setup 0.1.0.exe`
- macOS：`GPT Image Studio-0.1.0.dmg`
- Linux：`GPT Image Studio-0.1.0.AppImage`

> macOS 打包需要在 Mac 机器上运行，Windows/Linux 交叉编译 macOS 需要 Apple 签名证书。

开发模式启动 Electron（带 DevTools）：

```bash
npm run electron:dev
```

## 配置模型接口

页面右上角点击"模型配置"，填写：

- 官方网站：可选，用于记录服务商官网地址
- 请求 API 地址：必填，例如 `https://api.openai.com/v1` 或你的代理地址
- 请求接口：默认 `/images/generations`
- API 密钥：必填；留空保存时会保留已有密钥

保存后配置会写入 `.env` 文件。

## 环境变量示例

如果需要手动配置，可以复制示例文件：

```bash
cp .env.example .env
```

`.env` 示例：

```env
OPENAI_WEBSITE=
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_BASE_URL=
OPENAI_IMAGE_PATH=/images/generations
PORT=8787
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 同时启动前端和后端 |
| `npm run dev:client` | 只启动前端 |
| `npm run dev:server` | 只启动后端 |
| `npm run build` | 构建前端生产版本 |
| `npm run electron:dev` | Electron 开发模式 |
| `npm run electron:build:win` | 打包 Windows 版 |
| `npm run electron:build:mac` | 打包 macOS 版（需在 Mac 上运行） |
| `npm run electron:build:linux` | 打包 Linux 版 |

## 数据存储说明

- API 配置保存在项目根目录 `.env` 中。
- 最近创作记录保存在当前浏览器的 IndexedDB 中，不会随代码分享，也不会提交到 Git。
- 生成图片通过本地后端代理请求，不会把 API Key 暴露给前端页面响应。
