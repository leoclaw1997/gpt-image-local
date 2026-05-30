export async function generateImages({ config, prompt, size, quality, count }) {
  const requests = Array.from({ length: count }, () =>
    generateSingleImage({ config, prompt, size, quality })
  );

  return Promise.all(requests);
}

export function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

async function generateSingleImage({ config, prompt, size, quality }) {
  let response;

  try {
    response = await fetch(`${config.baseUrl}${config.imagePath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        prompt,
        size,
        quality,
        background: 'auto',
        output_format: 'png',
        response_format: 'b64_json',
      }),
    });
  } catch {
    throw new Error('服务器主动断开了连接，未返回任何响应。通常是提示词中存在不合规内容，或浏览器跨域请求被拦截。');
  }

  const payload = await parseImageResponse(response);
  const item = payload.data?.[0];

  if (!item?.b64_json) {
    throw new Error('响应中没有 data[0].b64_json，请确认接口支持 response_format: b64_json。');
  }

  return {
    b64Json: item.b64_json,
    revisedPrompt: item.revised_prompt,
  };
}

async function parseImageResponse(response) {
  const text = await response.text();
  const payload = text && text.trim().startsWith('{') ? JSON.parse(text) : {};

  if (!response.ok) {
    const detail = payload.error?.message || payload.error;
    throw new Error(detail ? `请求失败：HTTP ${response.status}：${detail}` : `请求失败：HTTP ${response.status}`);
  }

  return payload;
}
