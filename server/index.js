import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// 打包后 asar 是只读的，配置文件需要写到 asar 外面
const isAsar = __dirname.includes('app.asar');
const configDir = isAsar ? path.resolve(projectRoot, '..', '..') : projectRoot;
const distPath = path.join(projectRoot, 'dist');
const envPath = path.join(configDir, '.env');

dotenv.config({ path: envPath });

const port = Number(process.env.PORT || 8787);

function normalizeBaseUrl(value) {
  const baseUrl = String(value || '').trim().replace(/\/+$/, '');

  if (!baseUrl) return '';

  if (!/^https?:\/\//.test(baseUrl)) {
    throw new Error('请求 API 地址必须以 http:// 或 https:// 开头。');
  }

  return baseUrl;
}

function normalizeWebsite(value) {
  const website = String(value || '').trim().replace(/\/+$/, '');

  if (!website) return '';

  if (!/^https?:\/\//.test(website)) {
    throw new Error('官方网站必须以 http:// 或 https:// 开头。');
  }

  return website;
}

function normalizeImagePath(value) {
  const imagePath = String(value || '/images/generations').trim() || '/images/generations';

  if (/^https?:\/\//.test(imagePath)) {
    throw new Error('请求接口只能填写路径，例如 /images/generations，完整域名请填写到请求 API 地址。');
  }

  return `/${imagePath.replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

function maskApiKey(apiKey) {
  if (!apiKey) return '';
  if (apiKey.length <= 10) return `${apiKey.slice(0, 3)}...`;
  return `${apiKey.slice(0, 5)}...${apiKey.slice(-4)}`;
}

function publicConfig() {
  return {
    website: runtimeConfig.website,
    baseUrl: runtimeConfig.baseUrl,
    imagePath: runtimeConfig.imagePath,
    hasApiKey: Boolean(runtimeConfig.apiKey),
    maskedApiKey: maskApiKey(runtimeConfig.apiKey),
  };
}

async function writeEnvConfig() {
  const content = [
    `OPENAI_WEBSITE=${runtimeConfig.website}`,
    `OPENAI_API_KEY=${runtimeConfig.apiKey}`,
    `OPENAI_BASE_URL=${runtimeConfig.baseUrl}`,
    `OPENAI_IMAGE_PATH=${runtimeConfig.imagePath}`,
    `PORT=${port}`,
    '',
  ].join('\n');

  await fs.writeFile(envPath, content, 'utf8');
}

const runtimeConfig = {
  website: normalizeWebsite(process.env.OPENAI_WEBSITE),
  apiKey: process.env.OPENAI_API_KEY || '',
  baseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL),
  imagePath: normalizeImagePath(process.env.OPENAI_IMAGE_PATH),
};

app.use(express.json({ limit: '1mb' }));
app.use(express.static(distPath));

function isMultipartRequest(req) {
  return req.headers['content-type']?.toLowerCase().startsWith('multipart/form-data') ?? false;
}

function readRawRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

app.get('/api/config', (req, res) => {
  res.json(publicConfig());
});

app.post('/api/config', async (req, res) => {
  try {
    const { website, baseUrl, imagePath, apiKey } = req.body;

    runtimeConfig.website = normalizeWebsite(website);
    runtimeConfig.baseUrl = normalizeBaseUrl(baseUrl);
    runtimeConfig.imagePath = normalizeImagePath(imagePath);

    if (typeof apiKey === 'string' && apiKey.trim()) {
      runtimeConfig.apiKey = apiKey.trim();
    }

    await writeEnvConfig();

    res.json(publicConfig());
  } catch (error) {
    res.status(400).json({ error: error.message || '保存模型配置失败。' });
  }
});

app.post('/api/proxy', async (req, res) => {
  const target = req.headers['x-target-url'];
  const apiKey = req.headers['x-api-key'];
  const contentType = req.headers['content-type'] || '';

  if (!target || !apiKey) {
    return res.status(400).json({ error: '缺少目标地址或 API Key。' });
  }

  if (!/^https?:\/\//.test(target)) {
    return res.status(400).json({ error: '目标地址必须是 http(s) 开头的完整 URL。' });
  }

  try {
    const multipart = isMultipartRequest(req);
    const body = multipart ? await readRawRequestBody(req) : JSON.stringify(req.body || {});
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': multipart ? contentType : 'application/json',
    };

    const response = await fetch(target, {
      method: 'POST',
      headers,
      body,
    });

    const text = await response.text();
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (error) {
    res.status(502).json({ error: error?.message || '代理请求失败。' });
  }
});

app.post('/api/generate-image', async (req, res) => {
  try {
    if (!runtimeConfig.apiKey || !runtimeConfig.baseUrl) {
      return res.status(500).json({ error: '请先在模型配置中设置请求 API 地址和 API Key。' });
    }

    const { prompt, size = '1024x1024', quality = 'medium', n = 1 } = req.body;

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: '请输入图片提示词。' });
    }

    const imageCount = Math.min(Math.max(Number(n) || 1, 1), 4);
    const results = [];

    for (let index = 0; index < imageCount; index += 1) {
      const response = await fetch(`${runtimeConfig.baseUrl}${runtimeConfig.imagePath}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${runtimeConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt: prompt.trim(),
          size,
          quality,
          n: 1,
        }),
      });

      const text = await response.text();
      const payload = text && text.trim().startsWith('{') ? JSON.parse(text) : null;

      if (!response.ok || !payload) {
        throw new Error(payload?.error?.message || payload?.error || `图片生成失败，上游服务返回 ${response.status}，且响应不是 JSON。请检查请求 API 地址和官方路径。`);
      }

      results.push(...payload.data);
    }

    const images = results.map((image) => ({
      url: image.url,
      b64_json: image.b64_json,
    }));

    res.json({ images });
  } catch (error) {
    const message = error?.response?.data?.error?.message || error?.message || '图片生成失败。';
    res.status(500).json({ error: message });
  }
});

app.get('*splat', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`Image proxy server running at http://localhost:${port}`);
});
