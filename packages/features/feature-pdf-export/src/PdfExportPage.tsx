import { useRef, useState } from 'react';

import { Button, Card, PageHeader } from '@repo/ui';
import dompdf, { downloadPDF } from 'dompdf.js';

const PDF_FONT_FAMILY = 'Noto Sans SC';
const PDF_FONT_URL = '/fonts/NotoSansSC-Regular.ttf';

const BASE_PDF_OPTIONS = {
  format: 'a4' as const,
  pagination: true,
  backgroundColor: '#ffffff',
  marginPt: 24,
  useCORS: true,
};

let fontBytesPromise: Promise<Uint8Array> | null = null;

/**
 * dompdf.js 只识别 fontBytes / fontBase64，需先自行下载字体字节。
 * 同一份字体同时按 400 与 700 注册，保证标题加粗时也能命中中文字形。
 */
async function loadPdfFont(): Promise<Uint8Array> {
  fontBytesPromise ??= fetch(PDF_FONT_URL)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`字体加载失败：${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    })
    .catch((error: unknown) => {
      fontBytesPromise = null;
      throw error;
    });

  return fontBytesPromise;
}

function createPdfOptions(fontBytes: Uint8Array) {
  return {
    ...BASE_PDF_OPTIONS,
    fontConfig: [
      { fontFamily: PDF_FONT_FAMILY, fontWeight: 400 as const, fontBytes },
      { fontFamily: PDF_FONT_FAMILY, fontWeight: 700 as const, fontBytes },
    ],
  };
}

export function PdfExportPage() {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('点击「预览 PDF」在新窗口查看矢量导出结果。');

  async function handlePreview(): Promise<void> {
    const element = contentRef.current;
    if (!element || busy) return;

    setBusy(true);
    setStatus('正在生成 PDF…');

    try {
      const fontBytes = await loadPdfFont();
      const blob = await dompdf(element, createPdfOptions(fontBytes));
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setStatus('已生成 PDF 并在新窗口打开。');
    } catch {
      setStatus('PDF 生成失败，请稍后重试（检查中文字体是否加载成功）。');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(): Promise<void> {
    const element = contentRef.current;
    if (!element || busy) return;

    setBusy(true);
    setStatus('正在生成 PDF 文件…');

    try {
      const fontBytes = await loadPdfFont();
      await downloadPDF(element, createPdfOptions(fontBytes), 'dompdf-demo.pdf');
      setStatus('PDF 已开始下载。');
    } catch {
      setStatus('PDF 下载失败，请稍后重试（检查中文字体是否加载成功）。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="网页转矢量 PDF"
        description="基于 dompdf.js，把下方网页内容导出为文本可编辑、可搜索、可打印的矢量 PDF。"
      />

      <Card title="导出操作" description={status}>
        <div className="form-inline" style={{ marginBottom: 16 }}>
          <Button size="sm" disabled={busy} onClick={() => void handlePreview()}>
            {busy ? '处理中…' : '预览 PDF'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void handleDownload()}
          >
            下载 PDF
          </Button>
        </div>

        <p className="form-hint" style={{ marginBottom: 16 }}>
          内置中文字体为 GB2312 一级汉字子集（约 1.2 MB，覆盖 3700+ 常用汉字）；如需生僻字， 请替换
          apps/web/public/fonts/NotoSansSC-Regular.ttf 为完整 TTF。
        </p>

        <div
          ref={contentRef}
          style={{
            maxWidth: 760,
            padding: 32,
            borderRadius: 12,
            background: '#ffffff',
            color: '#0f172a',
            border: '1px solid #e2e8f0',
            fontFamily: `'${PDF_FONT_FAMILY}', sans-serif`,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 24 }}>前端功能管理平台 · 导出示例</h2>
          <p style={{ margin: '8px 0 20px', color: '#475569' }}>
            这段内容会被 dompdf.js 渲染为矢量 PDF，文字保持可选中、可复制、可搜索。
          </p>

          <h3 style={{ fontSize: 17, marginBottom: 8 }}>功能清单</h3>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, color: '#334155' }}>
            <li>账号登录、账号管理与角色隔离</li>
            <li>功能注册、导航生成与运行时启停</li>
            <li>数据热力图、图片标注、信息图等示例功能</li>
          </ul>

          <h3 style={{ fontSize: 17, margin: '20px 0 8px' }}>示例表格</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'left' }}>
                  模块
                </th>
                <th style={{ border: '1px solid #cbd5e1', padding: '8px 10px', textAlign: 'left' }}>
                  说明
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px' }}>dompdf.js</td>
                <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px' }}>
                  将 DOM 快照为矢量 PDF
                </td>
              </tr>
              <tr>
                <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px' }}>导出范围</td>
                <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px' }}>
                  当前卡片内的全部内容
                </td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: 20, fontSize: 13, color: '#64748b' }}>
            官方文档：https://dompdfjs.lisky.com.cn/
          </p>
        </div>
      </Card>
    </div>
  );
}
