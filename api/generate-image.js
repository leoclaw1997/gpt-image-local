export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY || '';
  const baseUrl = (process.env.OPENAI_BASE_URL || '').trim().replace(/\/+$/, '');
  const imagePath = `/${(process.env.OPENAI_IMAGE_PATH || '/images/generations').replace(/^\/+/, '').replace(/\/+$/, '')}`;

  if (!apiKey || !baseUrl) {
    return res.status(500).json({ error: '服务器未配置 API Key 或请求地址。' });
  }

  try {
    const { prompt, size = '1024x1024', quality = 'medium', n = 1 } = req.body || {};

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: '请输入图片提示词。' });
    }

    const imageCount = Math.min(Math.max(Number(n) || 1, 1), 4);
    const results = [];

    for (let index = 0; index < imageCount; index += 1) {
      const response = await fetch(`${baseUrl}${imagePath}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
        throw new Error(payload?.error?.message || payload?.error || `图片生成失败，上游返回 ${response.status}。`);
      }

      results.push(...payload.data);
    }

    const images = results.map((image) => ({
      url: image.url,
      b64_json: image.b64_json,
    }));

    res.status(200).json({ images });
  } catch (error) {
    const message = error?.message || '图片生成失败。';
    res.status(500).json({ error: message });
  }
}
