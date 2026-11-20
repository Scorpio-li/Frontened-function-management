import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import { Button, Card, PageHeader } from '@repo/ui';
import { Canvas, FabricImage, IText, PencilBrush, Rect } from 'fabric';

const SAMPLE_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="520" viewBox="0 0 960 520">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="55%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
  </defs>
  <rect width="960" height="520" fill="url(#sky)"/>
  <circle cx="760" cy="120" r="64" fill="#fde68a" opacity="0.9"/>
  <path d="M0 430 L210 300 L360 380 L560 250 L760 360 L960 260 L960 520 L0 520 Z" fill="#0f172a" opacity="0.75"/>
  <path d="M0 470 L180 390 L400 460 L640 350 L820 440 L960 390 L960 520 L0 520 Z" fill="#020617" opacity="0.85"/>
  <text x="48" y="86" fill="#e2e8f0" font-family="sans-serif" font-size="34" font-weight="700">标注示例图片</text>
  <text x="48" y="124" fill="#cbd5e1" font-family="sans-serif" font-size="18">可以使用画笔、矩形或文字在此图上标注</text>
</svg>
`)}`;

export function AnnotationPage() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('在图片上拖拽即可选中对象，或选择画笔自由标注。');

  useEffect(() => {
    const element = canvasElRef.current;
    const wrap = wrapRef.current;
    if (!element || !wrap) return;

    const width = Math.max(520, wrap.clientWidth);
    const canvas = new Canvas(element, {
      width,
      height: Math.round((width * 520) / 960),
      backgroundColor: '#0f172a',
      selection: true,
    });
    fabricRef.current = canvas;

    let disposed = false;

    void FabricImage.fromURL(SAMPLE_IMAGE).then((image) => {
      if (disposed) return;
      image.scaleToWidth(canvas.getWidth());
      canvas.backgroundImage = image;
      canvas.requestRenderAll();
      setReady(true);
    });

    return () => {
      disposed = true;
      fabricRef.current = null;
      void canvas.dispose();
    };
  }, []);

  function enableDrawing(): void {
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.isDrawingMode = true;
    const brush = new PencilBrush(canvas);
    brush.color = '#ff3b30';
    brush.width = 4;
    canvas.freeDrawingBrush = brush;
    setStatus('画笔已开启，按住鼠标在图片上拖拽即可标注。');
  }

  function enableSelection(): void {
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.isDrawingMode = false;
    setStatus('已切换到选择模式，可拖拽选中、移动或删除标注。');
  }

  function addRect(): void {
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.isDrawingMode = false;
    const rect = new Rect({
      left: 80,
      top: 80,
      width: 200,
      height: 110,
      fill: 'rgba(255, 59, 48, 0.12)',
      stroke: '#ff3b30',
      strokeWidth: 2,
    });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.requestRenderAll();
    setStatus('已添加矩形选区，可拖动调整位置或按删除按钮移除。');
  }

  function addText(): void {
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.isDrawingMode = false;
    const text = new IText('标注文字', {
      left: 100,
      top: 220,
      fill: '#ff3b30',
      fontSize: 22,
      fontWeight: 'bold',
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.requestRenderAll();
    setStatus('已添加文字标注，双击可编辑内容。');
  }

  function removeSelected(): void {
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.getActiveObjects().forEach((object) => canvas.remove(object));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setStatus('已删除选中的标注。');
  }

  function clearAnnotations(): void {
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.getObjects().forEach((object) => canvas.remove(object));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setStatus('已清空全部标注，背景图片保留。');
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const canvas = fabricRef.current;
    const file = event.target.files?.[0];
    if (!canvas || !file) return;

    const objectUrl = URL.createObjectURL(file);

    try {
      const image = await FabricImage.fromURL(objectUrl);
      image.scaleToWidth(canvas.getWidth());
      canvas.backgroundImage = image;
      canvas.requestRenderAll();
      setStatus(`已载入图片「${file.name}」，可以开始标注。`);
    } finally {
      URL.revokeObjectURL(objectUrl);
      event.target.value = '';
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="图片选区标注"
        description="基于 Fabric.js 的图片标注 demo：画笔自由绘制、矩形选区、文字标注，并支持载入本地图片。"
      />

      <Card title="标注画布" description={status}>
        <div className="form-inline" style={{ marginBottom: 16 }}>
          <Button size="sm" disabled={!ready} onClick={enableDrawing}>
            画笔
          </Button>
          <Button size="sm" variant="secondary" disabled={!ready} onClick={enableSelection}>
            选择
          </Button>
          <Button size="sm" variant="secondary" disabled={!ready} onClick={addRect}>
            矩形
          </Button>
          <Button size="sm" variant="secondary" disabled={!ready} onClick={addText}>
            文字
          </Button>
          <Button size="sm" variant="secondary" disabled={!ready} onClick={removeSelected}>
            删除选中
          </Button>
          <Button size="sm" variant="danger" disabled={!ready} onClick={clearAnnotations}>
            清空标注
          </Button>
          <label className="form-field" style={{ flex: '0 1 220px' }}>
            <span>载入本地图片</span>
            <input type="file" accept="image/*" onChange={(event) => void handleUpload(event)} />
          </label>
        </div>

        <div ref={wrapRef} style={{ width: '100%', overflowX: 'auto' }}>
          <canvas ref={canvasElRef} />
        </div>
      </Card>
    </div>
  );
}
