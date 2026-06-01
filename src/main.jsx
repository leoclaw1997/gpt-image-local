import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const sizes = [
  { label: '1:1 方图', value: '1024x1024' },
  { label: '2:3 竖图', value: '1024x1536' },
  { label: '3:2 横图', value: '1536x1024' },
  { label: '16:9 横屏', value: '1792x1024' },
  { label: '9:16 竖屏', value: '1024x1792' },
];

const qualities = [
  { label: '标准', value: 'medium' },
  { label: '高清', value: 'high' },
  { label: '快速', value: 'low' },
];

const presets = [
  '电影感人像，柔和自然光，浅景深，细腻皮肤质感',
  '国风幻想场景，云海山川，金色晨光，史诗构图',
  '未来科技产品海报，干净背景，高级商业摄影',
  '治愈系插画，暖色调，柔软笔触，可爱角色',
];

const dbName = 'gpt-image-local-db';
const storeName = 'history';
const maxReferenceImages = 4;
const maxReferenceBytes = 20 * 1024 * 1024;

function openHistoryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: 'id' });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getHistory() {
  const db = await openHistoryDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).getAll();

    request.onsuccess = () => {
      const items = request.result.sort((a, b) => b.id - a.id).map((item) => {
        const d = new Date(item.id);
        return { ...item, date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
      });
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

async function saveHistoryItem(item) {
  const db = await openHistoryDb();

  await new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(item);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });

  return getHistory();
}

function imageSource(image) {
  if (image.url) return image.url;
  return `data:image/png;base64,${image.b64_json}`;
}

function editPathFromImagePath(imagePath) {
  const normalized = `/${String(imagePath || '/images/generations').replace(/^\/+/, '').replace(/\/+$/, '')}`;

  if (/\/images\/generations$/i.test(normalized)) {
    return normalized.replace(/\/images\/generations$/i, '/images/edits');
  }

  if (/\/generations$/i.test(normalized)) {
    return normalized.replace(/\/generations$/i, '/edits');
  }

  return '/images/edits';
}

function App() {
  const [prompt, setPrompt] = useState('一只穿着宇航服的橘猫站在月球上，背后是蓝色地球，电影感光影');
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState('medium');
  const [count, setCount] = useState(1);
  const [referenceImages, setReferenceImages] = useState([]);
  const [images, setImages] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyDate, setHistoryDate] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState('');
  const [configSuccess, setConfigSuccess] = useState('');
  const [config, setConfig] = useState({
    website: '',
    baseUrl: '',
    imagePath: '/images/generations',
    apiKey: '',
    hasApiKey: false,
    maskedApiKey: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const creatorPanelRef = useRef(null);
  const referenceImagesRef = useRef([]);
  const [creatorPanelHeight, setCreatorPanelHeight] = useState(null);

  const selectedSizeLabel = useMemo(
    () => sizes.find((item) => item.value === size)?.label,
    [size]
  );
  const historyDates = useMemo(
    () => [...new Set(history.map((item) => item.date).filter(Boolean))],
    [history]
  );
  const filteredHistory = useMemo(
    () => history.filter((item) => !historyDate || item.date === historyDate),
    [history, historyDate]
  );

  useEffect(() => {
    getHistory()
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    referenceImagesRef.current = referenceImages;
  }, [referenceImages]);

  useEffect(() => () => {
    referenceImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }, []);

  useEffect(() => {
    applyUrlConfigParams();
  }, []);

  useEffect(() => {
    if (!creatorPanelRef.current) return undefined;

    const updateHeight = () => setCreatorPanelHeight(creatorPanelRef.current.offsetHeight);
    const observer = new ResizeObserver(updateHeight);

    updateHeight();
    observer.observe(creatorPanelRef.current);
    window.addEventListener('resize', updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  function maskApiKey(apiKey) {
    if (!apiKey) return '';
    if (apiKey.length <= 10) return `${apiKey.slice(0, 3)}...`;
    return `${apiKey.slice(0, 5)}...${apiKey.slice(-4)}`;
  }

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
      throw new Error('请求接口只能填写路径，例如 /images/generations。');
    }
    return `/${imagePath.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  }

  function normalizeApiUrlParam(value) {
    const apiUrl = normalizeBaseUrl(value);

    if (/\/v1\/images\/generations$/i.test(apiUrl)) {
      return {
        baseUrl: apiUrl.replace(/\/v1\/images\/generations$/i, ''),
        imagePath: '/v1/images/generations',
      };
    }

    if (/\/images\/generations$/i.test(apiUrl)) {
      return {
        baseUrl: apiUrl.replace(/\/images\/generations$/i, ''),
        imagePath: '/images/generations',
      };
    }

    if (/\/v1$/i.test(apiUrl)) {
      return {
        baseUrl: apiUrl,
        imagePath: '/images/generations',
      };
    }

    return {
      baseUrl: apiUrl,
      imagePath: '/v1/images/generations',
    };
  }

  function applyUrlConfigParams() {
    const searchParams = new URLSearchParams(window.location.search);
    const apiUrl = searchParams.get('apiUrl') || searchParams.get('apiBaseUrl');
    const apiKey = searchParams.get('apiKey');

    if (apiUrl === null && apiKey === null) return;

    try {
      const stored = JSON.parse(localStorage.getItem('gpt-image-config') || '{}');
      const next = { ...stored };

      if (apiUrl !== null) {
        const urlConfig = normalizeApiUrlParam(apiUrl);
        next.baseUrl = urlConfig.baseUrl;
        next.imagePath = urlConfig.imagePath;
      }

      if (apiKey !== null) {
        next.apiKey = apiKey.trim();
      }

      localStorage.setItem('gpt-image-config', JSON.stringify(next));

      setConfig((current) => ({
        ...current,
        baseUrl: next.baseUrl || '',
        imagePath: next.imagePath || current.imagePath,
        apiKey: '',
        hasApiKey: Boolean(next.apiKey),
        maskedApiKey: maskApiKey(next.apiKey || ''),
      }));

      searchParams.delete('apiUrl');
      searchParams.delete('apiBaseUrl');
      searchParams.delete('apiKey');
      const nextSearch = searchParams.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
      window.history.replaceState(null, '', nextUrl);
    } catch (err) {
      setError(err.message || 'URL 配置参数无效。');
    }
  }

  function loadConfig() {
    setConfigLoading(true);
    setConfigError('');
    setConfigSuccess('');

    try {
      const stored = JSON.parse(localStorage.getItem('gpt-image-config') || '{}');
      const apiKey = stored.apiKey || '';
      setConfig({
        website: stored.website || '',
        baseUrl: stored.baseUrl || '',
        imagePath: stored.imagePath || '/images/generations',
        apiKey: '',
        hasApiKey: Boolean(apiKey),
        maskedApiKey: maskApiKey(apiKey),
      });
    } catch (err) {
      setConfigError('读取本地配置失败。');
    } finally {
      setConfigLoading(false);
    }
  }

  function openConfigPanel() {
    setConfigOpen(true);
    loadConfig();
  }

  function closeConfigPanel() {
    setConfigOpen(false);
    setConfigError('');
    setConfigSuccess('');
    setConfig((current) => ({ ...current, apiKey: '' }));
  }

  async function saveConfig() {
    setConfigSaving(true);
    setConfigError('');
    setConfigSuccess('');

    try {
      const stored = JSON.parse(localStorage.getItem('gpt-image-config') || '{}');
      const next = {
        website: normalizeWebsite(config.website),
        baseUrl: normalizeBaseUrl(config.baseUrl),
        imagePath: normalizeImagePath(config.imagePath),
        apiKey: config.apiKey.trim() || stored.apiKey || '',
      };
      localStorage.setItem('gpt-image-config', JSON.stringify(next));

      setConfig({
        website: next.website,
        baseUrl: next.baseUrl,
        imagePath: next.imagePath,
        apiKey: '',
        hasApiKey: Boolean(next.apiKey),
        maskedApiKey: maskApiKey(next.apiKey),
      });
      setConfigSuccess('配置已保存到本地浏览器。');
      setTimeout(() => {
        setConfigOpen(false);
        setConfigSuccess('');
      }, 1500);
    } catch (err) {
      setConfigError(err.message);
    } finally {
      setConfigSaving(false);
    }
  }

  function addReferenceImages(files) {
    const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith('image/'));

    if (!imageFiles.length) return;

    setReferenceImages((current) => {
      const slots = Math.max(maxReferenceImages - current.length, 0);
      const accepted = imageFiles.slice(0, slots).map((file) => ({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID?.() || Date.now()}`,
        name: file.name,
        file,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
      }));

      return [...current, ...accepted];
    });
  }

  function removeReferenceImage(id) {
    setReferenceImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((image) => image.id !== id);
    });
  }

  function clearReferenceImages() {
    setReferenceImages((current) => {
      current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      return [];
    });
  }

  async function requestImageGeneration({ baseUrl, imagePath, apiKey }) {
    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-target-url': `${baseUrl}${imagePath}`,
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'gpt-image-2',
        prompt: prompt.trim(),
        size,
        quality,
        n: 1,
      }),
    });

    return parseProxyImageResponse(response);
  }

  async function requestImageEdit({ baseUrl, editPath, apiKey }) {
    const body = new FormData();
    body.append('model', 'gpt-image-2');
    body.append('prompt', prompt.trim());
    referenceImages.forEach((image) => {
      body.append('image[]', image.file, image.name);
    });
    body.append('size', size);
    body.append('background', 'auto');
    body.append('output_format', 'png');
    body.append('response_format', 'b64_json');

    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: {
        'x-target-url': `${baseUrl}${editPath}`,
        'x-api-key': apiKey,
      },
      body,
    });

    return parseProxyImageResponse(response);
  }

  async function parseProxyImageResponse(response) {
    const text = await response.text();
    const payload = text && text.trim().startsWith('{') ? JSON.parse(text) : null;

    if (!response.ok || !payload) {
      throw new Error(payload?.error?.message || payload?.error || `图片生成失败，上游返回 ${response.status}。`);
    }

    return payload;
  }

  async function generateImage() {
    setError('');
    setLoading(true);

    try {
      const stored = JSON.parse(localStorage.getItem('gpt-image-config') || '{}');
      if (!stored.apiKey || !stored.baseUrl) {
        throw new Error('请先在「模型配置」中填入请求 API 地址和 API Key。');
      }

      if (typeof prompt !== 'string' || !prompt.trim()) {
        throw new Error('请输入图片提示词。');
      }

      const imageCount = Math.min(Math.max(Number(count) || 1, 1), 4);
      const baseUrl = String(stored.baseUrl).replace(/\/+$/, '');
      const imagePath = `/${String(stored.imagePath || '/images/generations').replace(/^\/+/, '').replace(/\/+$/, '')}`;
      const editPath = editPathFromImagePath(imagePath);
      const referenceBytes = referenceImages.reduce((sum, image) => sum + image.size, 0);
      const results = [];

      if (referenceBytes > maxReferenceBytes) {
        throw new Error('参考图片总大小超过 20MB，请减少图片数量或压缩后重试。');
      }

      for (let index = 0; index < imageCount; index += 1) {
        const payload = referenceImages.length
          ? await requestImageEdit({ baseUrl, editPath, apiKey: stored.apiKey })
          : await requestImageGeneration({ baseUrl, imagePath, apiKey: stored.apiKey });
        results.push(...payload.data);
      }

      const images = results.map((image) => ({
        url: image.url,
        b64_json: image.b64_json,
      }));

      const createdAt = new Date();
      const dateStr = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-${String(createdAt.getDate()).padStart(2, '0')}`;

      setImages(images);
      setHistory(await saveHistoryItem({
        id: createdAt.getTime(),
        prompt,
        size,
        quality,
        referenceNames: referenceImages.map((image) => image.name),
        images,
        date: dateStr,
        createdAt: createdAt.toLocaleString(),
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">GPT Image Studio</p>
          <h1>本地 AI 图片生成工作台</h1>
          <p className="subtitle">用 gpt-image-2 生成图片，API Key 仅保存在你当前浏览器。</p>
        </div>
        <div className="hero-actions">
          <div className="hero-actions-row">
            <div className="github-links">
              <a href="https://github.com/leoclaw1997/gpt-image-local" target="_blank" rel="noopener noreferrer" className="github-link" title="最新版">
                <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                <span>最新版</span>
              </a>
              <a href="https://github.com/leoclaw1997/gpt-image-2" target="_blank" rel="noopener noreferrer" className="github-link" title="稳定版">
                <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                <span>稳定版</span>
              </a>
            </div>
            <div className="status-pill">浏览器直连 · 本地存储</div>
          </div>
          <button className="config-button" type="button" onClick={openConfigPanel}>模型配置</button>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel creator-panel" ref={creatorPanelRef}>
          <label className="field-label" htmlFor="prompt">创作描述</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="描述你想生成的画面、风格、镜头、色彩、主体细节……"
          />

          <div className="preset-grid">
            {presets.map((item) => (
              <button key={item} type="button" onClick={() => setPrompt(item)}>
                {item}
              </button>
            ))}
          </div>

          <div className="reference-panel">
            <div className="reference-header">
              <span className="field-label">参考图片</span>
              {referenceImages.length > 0 && (
                <button className="text-button" type="button" onClick={clearReferenceImages}>清空</button>
              )}
            </div>
            <label className="upload-dropzone">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  addReferenceImages(event.target.files);
                  event.target.value = '';
                }}
              />
              <span>上传参考图进行修改</span>
              <small>最多 {maxReferenceImages} 张，总大小不超过 20MB</small>
            </label>
            {referenceImages.length > 0 && (
              <div className="reference-grid">
                {referenceImages.map((image) => (
                  <div className="reference-card" key={image.id}>
                    <img src={image.previewUrl} alt={image.name} />
                    <button type="button" onClick={() => removeReferenceImage(image.id)} aria-label={`移除 ${image.name}`}>移除</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="control-group">
            <span className="field-label">画面比例</span>
            <div className="segmented">
              {sizes.map((item) => (
                <button
                  key={item.value}
                  className={size === item.value ? 'active' : ''}
                  type="button"
                  onClick={() => setSize(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-row">
            <label>
              清晰度
              <select value={quality} onChange={(event) => setQuality(event.target.value)}>
                {qualities.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              数量
              <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
                {[1, 2, 3, 4].map((item) => (
                  <option key={item} value={item}>{item} 张</option>
                ))}
              </select>
            </label>
          </div>

          <button className="generate-button" type="button" onClick={generateImage} disabled={loading}>
            {loading ? '生成中…' : '开始生成'}
          </button>
        </aside>

        <section className="panel result-panel" style={creatorPanelHeight ? { height: creatorPanelHeight } : undefined}>
          <div className="result-header">
            <div>
              <p className="eyebrow">Preview</p>
              <h2>生成结果</h2>
            </div>
            <span>{selectedSizeLabel}</span>
          </div>

          <div className="result-canvas">
            {loading ? (
              <div className="image-grid">
                {Array.from({ length: count }).map((_, index) => (
                  <div className="image-card loading-card" key={`loading-${index}`}>
                    <div className="loading-card-inner">
                      <div className="loader-ring" />
                      <span>生成第 {index + 1} 张中…</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="empty-state">
                <div className="preview-error-card">
                  <strong>生成失败</strong>
                  <span>{error}</span>
                  <button className="config-button" type="button" onClick={openConfigPanel}>打开模型配置</button>
                </div>
              </div>
            ) : images.length === 0 ? (
              <div className="empty-state">
                <div className="empty-card">输入提示词后，作品会显示在这里。</div>
              </div>
            ) : (
              <div className="image-grid">
                {images.map((image, index) => (
                  <div className="image-card" key={index}>
                    <button className="preview-button" type="button" onClick={() => setPreviewImage(image)}>
                      <img src={imageSource(image)} alt={`生成图片 ${index + 1}`} />
                    </button>
                    <a className="download-button" href={imageSource(image)} download={`gpt-image-${index + 1}.png`}>
                      下载
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </section>

      <section className="panel history-panel">
        <div className="result-header history-header">
          <div>
            <p className="eyebrow">History</p>
            <h2>最近创作</h2>
            <p className="history-note">记录仅保存在当前浏览器本地，不会随代码分享。</p>
          </div>
          <div className="history-filter">
            <label>
              按日期查询
              <select value={historyDate} onChange={(event) => setHistoryDate(event.target.value)}>
                <option value="">全部日期</option>
                {historyDates.map((date) => (
                  <option key={date} value={date}>{date}</option>
                ))}
              </select>
            </label>
            {historyDate && <button className="secondary-button" type="button" onClick={() => setHistoryDate('')}>展示全部</button>}
          </div>
        </div>
        {history.length === 0 ? (
          <p className="muted">还没有生成记录。</p>
        ) : filteredHistory.length === 0 ? (
          <p className="muted">这一天没有生成记录。</p>
        ) : (
          <div className="history-list">
            {filteredHistory.map((item, index) => (
              <button
                key={`${item.createdAt}-${index}`}
                type="button"
                onClick={() => {
                  setPrompt(item.prompt);
                  setSize(item.size);
                  setQuality(item.quality);
                  setImages(item.images);
                  setError('');
                }}
              >
                <img src={imageSource(item.images[0])} alt="历史图片缩略图" />
                <span>{item.prompt}</span>
                <small>{item.createdAt}</small>
              </button>
            ))}
          </div>
        )}
      </section>

      {configOpen && (
        <div className="config-modal" role="dialog" aria-modal="true">
          <div className="config-modal-content">
            <div className="result-header">
              <div>
                <p className="eyebrow">Config</p>
                <h2>模型配置</h2>
              </div>
              <button className="close-button inline-close" type="button" onClick={closeConfigPanel}>关闭</button>
            </div>

            {configLoading ? (
              <p className="muted">正在读取配置…</p>
            ) : (
              <div className="config-form">
                <label>
                  官方网站
                  <input
                    value={config.website}
                    onChange={(event) => setConfig((current) => ({ ...current, website: event.target.value }))}
                    placeholder="https://platform.openai.com"
                  />
                </label>
                <label>
                  请求 API 地址
                  <input
                    value={config.baseUrl}
                    onChange={(event) => setConfig((current) => ({ ...current, baseUrl: event.target.value }))}
                    placeholder="https://api.openai.com/v1"
                  />
                </label>
                <label>
                  请求接口
                  <input
                    value={config.imagePath}
                    onChange={(event) => setConfig((current) => ({ ...current, imagePath: event.target.value }))}
                    placeholder="/images/generations"
                  />
                </label>
                <label>
                  API 密钥
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(event) => setConfig((current) => ({ ...current, apiKey: event.target.value }))}
                    placeholder="留空则保留当前密钥"
                  />
                </label>
                <p className="config-status">
                  当前密钥：{config.hasApiKey ? `已配置（${config.maskedApiKey}）` : '未配置'}
                </p>
                {configError && <div className="error-box">{configError}</div>}
                {configSuccess && <div className="success-box">{configSuccess}</div>}
                <div className="config-actions">
                  <button className="secondary-button" type="button" onClick={closeConfigPanel}>取消</button>
                  <button className="generate-button save-config-button" type="button" onClick={saveConfig} disabled={configSaving}>
                    {configSaving ? '保存中…' : '保存配置'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {previewImage && (
        <div className="preview-modal" role="dialog" aria-modal="true" onClick={() => setPreviewImage(null)}>
          <div className="preview-modal-content" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" type="button" onClick={() => setPreviewImage(null)}>关闭</button>
            <img src={imageSource(previewImage)} alt="放大预览" />
            <a className="modal-download-button" href={imageSource(previewImage)} download="gpt-image.png">下载图片</a>
          </div>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
