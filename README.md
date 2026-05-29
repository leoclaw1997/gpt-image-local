# 本地 AI 图片生成工作台

一个纯前端图片生成工具：前端使用 Vite + React，支持在浏览器中填写模型接口配置、生成图片、预览下载，并把创作历史保存在当前浏览器本地。

> 说明：项目已经移除本地后端代理。API Key 会保存在浏览器 `localStorage` 中，只适合个人自用或可信环境，不适合公开部署给陌生用户使用。

## 快速开始

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

## 模型配置

页面右上角点击“模型配置”，填写：

- 官方网站：可选，用于记录服务商官网地址
- 请求 API 地址：必填，例如 `https://api.openai.com/v1` 或支持浏览器跨域的代理地址
- 请求接口：默认 `/images/generations`
- API 密钥：必填；留空保存时会保留已有密钥

配置会保存到当前浏览器的 `localStorage`。

如果接口不允许浏览器跨域请求，生成时会失败。此时需要换成支持 CORS 的接口地址，或者重新引入服务端代理。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动前端开发服务 |
| `npm run build` | 构建前端生产版本 |
| `npm run preview` | 预览生产构建 |

## 数据存储说明

- API 配置保存在当前浏览器的 `localStorage` 中。
- 最近创作记录保存在当前浏览器的 IndexedDB 中。
- 项目不再包含 Express、Vercel Serverless API、本地后端代理或 Electron 桌面端。
