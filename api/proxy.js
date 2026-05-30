export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const target = req.headers['x-target-url'];
  const apiKey = req.headers['x-api-key'];

  if (!target || !apiKey) {
    return res.status(400).json({ error: '缺少目标地址或 API Key。' });
  }

  if (!/^https?:\/\//.test(target)) {
    return res.status(400).json({ error: '目标地址必须是 http(s) 开头的完整 URL。' });
  }

  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body || {}),
    });

    const text = await response.text();
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (error) {
    res.status(502).json({ error: error?.message || '代理请求失败。' });
  }
}
