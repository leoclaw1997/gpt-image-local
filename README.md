# 本地 AI 图片生成工作台

一个纯前端图片生成工具：前端使用 Vite + React，支持在浏览器中填写模型接口配置、并发生成图片、预览下载，并把创作历史保存在当前浏览器本地。

> 说明：项目已经移除本地后端代理。API Key 会保存在浏览器 IndexedDB 中，只适合个人自用或可信环境，不适合公开部署给陌生用户使用。

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
- 请求 API 地址：必填，例如 `https://api.openai.com` 或支持浏览器跨域的代理域名
- 请求接口：默认 `/v1/images/generations`
- 模型：默认 `gpt-image-2`
- API 密钥：必填；留空保存时会保留已有密钥

配置会保存到当前浏览器的 IndexedDB。

如果接口不允许浏览器跨域请求，生成时会失败。此时需要换成支持 CORS 的接口地址，或者重新引入服务端代理。

## 生成请求

点击生成时，每张图片都会单独发送一个图片生成请求，多张图片使用并发请求。

请求体会包含：

```json
{
  "model": "gpt-image-2",
  "prompt": "你的提示词",
  "size": "1024x1024",
  "quality": "medium",
  "background": "auto",
  "output_format": "png",
  "response_format": "b64_json"
}
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动前端开发服务 |
| `npm run build` | 构建前端生产版本 |
| `npm run preview` | 预览生产构建 |

## GitHub Pages 部署

项目使用 GitHub Actions 部署到 GitHub Pages，工作流文件位于 `.github/workflows/deploy.yml`。

仓库需要这样配置：

1. 进入仓库 `Settings -> Pages`
2. `Build and deployment` 的 `Source` 选择 `GitHub Actions`
3. 进入 `Settings -> Environments -> github-pages`
4. `Deployment branches and tags` 需要允许 `main` 分支部署
5. 推送到 `main` 分支后会自动构建并部署

如果部署阶段报错：

```text
Branch "main" is not allowed to deploy to github-pages due to environment protection rules.
```

说明 `github-pages` 环境的部署分支规则没有放行 `main`，按上面的第 3-4 步调整后重新运行 Actions 即可。

如果使用自定义域名，请确认 `public/CNAME` 中的域名正确，并在 DNS 中配置到 GitHub Pages。

## 数据存储说明

- API 配置保存在 IndexedDB 的 `settings` store 中。
- 最近创作记录保存在 IndexedDB 的 `history` store 中。
- 图片二进制保存在 IndexedDB 的 `imageBlobs` store 中，历史记录只引用图片的 `blobKey`。
- 项目不再包含 Express、Vercel Serverless API、本地后端代理或 Electron 桌面端。
