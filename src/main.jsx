import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { base64ToBlob, generateImages } from './imagesApi';
import {
  createId,
  defaultConfig,
  listHistory,
  normalizeBaseUrl,
  normalizeImagePath,
  readStoredConfig,
  saveHistoryItem,
  saveStoredConfig,
} from './storage';

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

function imageSource(image) {
  if (image.previewUrl) return image.previewUrl;
  if (image.url) return image.url;
  return `data:image/png;base64,${image.b64_json}`;
}

function displayConfig(config) {
  return {
    ...defaultConfig,
    ...config,
    apiKey: '',
  };
}

function dateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function App() {
  const [prompt, setPrompt] = useState('一只穿着宇航服的橘猫站在月球上，背后是蓝色地球，电影感光影');
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState('medium');
  const [count, setCount] = useState(1);
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
    ...defaultConfig,
    apiKey: '',
    hasApiKey: false,
    maskedApiKey: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const creatorPanelRef = useRef(null);
  const [creatorPanelHeight, setCreatorPanelHeight] = useState(null);

  const selectedSizeLabel = useMemo(
    () => sizes.find((item) => item.value === size)?.label,
    [size]
  );
  const historyDates = useMemo(
    () => [...new Set(history.map((item) => item.date).filter(Boolean))],
    [history]
  );
  const historyImageItems = useMemo(
    () => history
      .filter((item) => !historyDate || item.date === historyDate)
      .flatMap((item) => (item.images || []).map((image, index) => ({
        ...item,
        image,
        imageIndex: index,
      }))),
    [history, historyDate]
  );

  useEffect(() => {
    listHistory()
      .then(setHistory)
      .catch(() => setHistory([]));
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

  async function loadConfig() {
    setConfigLoading(true);
    setConfigError('');
    setConfigSuccess('');

    try {
      setConfig(displayConfig(await readStoredConfig()));
    } catch (err) {
      setConfigError(err.message);
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
      const current = await readStoredConfig();
      const next = {
        website: normalizeBaseUrl(config.website),
        baseUrl: normalizeBaseUrl(config.baseUrl),
        imagePath: normalizeImagePath(config.imagePath),
        model: String(config.model || defaultConfig.model).trim() || defaultConfig.model,
        apiKey: config.apiKey.trim() || current.apiKey,
      };

      if (next.website && !/^https?:\/\//.test(next.website)) {
        throw new Error('官方网站必须以 http:// 或 https:// 开头。');
      }

      if (!next.baseUrl || !/^https?:\/\//.test(next.baseUrl)) {
        throw new Error('请求 API 地址必须以 http:// 或 https:// 开头。');
      }

      if (!next.apiKey) {
        throw new Error('请填写 API 密钥。');
      }

      const saved = await saveStoredConfig(next);
      setConfig(displayConfig(saved));
      setConfigSuccess('配置已保存到当前浏览器。');
    } catch (err) {
      setConfigError(err.message);
    } finally {
      setConfigSaving(false);
    }
  }

  async function generateImage() {
    setError('');
    setLoading(true);

    try {
      const storedConfig = await readStoredConfig();

      if (!storedConfig.apiKey || !storedConfig.baseUrl) {
        throw new Error('请先在模型配置中设置请求 API 地址和 API Key。');
      }

      if (!prompt.trim()) {
        throw new Error('请输入图片提示词。');
      }

      const results = await generateImages({
        config: storedConfig,
        prompt: prompt.trim(),
        size,
        quality,
        count,
      });
      const createdAt = new Date();
      const createdAtIso = createdAt.toISOString();
      const createdAtLabel = createdAt.toLocaleString();
      const dateStr = dateString(createdAt);
      const imageRecords = results.map((result) => {
        const blob = base64ToBlob(result.b64Json, 'image/png');
        const blobKey = createId('blob');
        const image = {
          id: createId('img'),
          blobKey,
          mimeType: 'image/png',
          sizeBytes: blob.size,
          revisedPrompt: result.revisedPrompt,
          createdAt: createdAtIso,
          previewUrl: URL.createObjectURL(blob),
        };

        return {
          image,
          blobRecord: {
            key: blobKey,
            blob,
            createdAt: createdAtIso,
          },
        };
      });
      const nextImages = imageRecords.map((record) => record.image);

      setImages(nextImages);
      setHistory(await saveHistoryItem({
        id: createdAt.getTime(),
        prompt,
        size,
        quality,
        model: storedConfig.model,
        images: nextImages.map(({ previewUrl, ...image }) => image),
        date: dateStr,
        createdAt: createdAtLabel,
        createdAtIso,
      }, imageRecords.map((record) => record.blobRecord)));
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
          <p className="subtitle">用并发请求生成图片，配置和作品只保存在当前浏览器。</p>
        </div>
        <div className="hero-actions">
          <div className="status-pill">纯前端 · 浏览器创作</div>
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
        ) : historyImageItems.length === 0 ? (
          <p className="muted">这一天没有生成记录。</p>
        ) : (
          <div className="history-list">
            {historyImageItems.map((item) => (
              <button
                key={`${item.id}-${item.image.id || item.image.blobKey || item.imageIndex}`}
                type="button"
                onClick={() => {
                  setPrompt(item.prompt);
                  setSize(item.size);
                  setQuality(item.quality);
                  setImages([item.image]);
                  setError('');
                }}
              >
                <img src={imageSource(item.image)} alt="历史图片缩略图" />
                <span>{item.prompt}</span>
                <small>{item.createdAt} · 第 {item.imageIndex + 1} 张</small>
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
                    placeholder="https://api.openai.com"
                  />
                </label>
                <label>
                  请求接口
                  <input
                    value={config.imagePath}
                    onChange={(event) => setConfig((current) => ({ ...current, imagePath: event.target.value }))}
                    placeholder="/v1/images/generations"
                  />
                </label>
                <label>
                  模型
                  <input
                    value={config.model}
                    onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))}
                    placeholder="gpt-image-2"
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
