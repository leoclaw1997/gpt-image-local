function maskApiKey(apiKey) {
  if (!apiKey) return '';
  if (apiKey.length <= 10) return `${apiKey.slice(0, 3)}...`;
  return `${apiKey.slice(0, 5)}...${apiKey.slice(-4)}`;
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY || '';

  res.status(200).json({
    website: process.env.OPENAI_WEBSITE || '',
    baseUrl: process.env.OPENAI_BASE_URL || '',
    imagePath: process.env.OPENAI_IMAGE_PATH || '/images/generations',
    hasApiKey: Boolean(apiKey),
    maskedApiKey: maskApiKey(apiKey),
  });
}
