import { useState } from 'react';

import { Button, Card, PageHeader } from '@repo/ui';
import introJs from 'intro.js';
import 'intro.js/introjs.css';

export function GuidePage() {
  const [status, setStatus] = useState('点击右上角「开始引导」，按提示逐步了解平台核心区域。');

  function startGuide(): void {
    introJs()
      .setOptions({
        nextLabel: '下一步',
        prevLabel: '上一步',
        doneLabel: '完成',
        skipLabel: '跳过',
        showProgress: true,
        showBullets: false,
        exitOnOverlayClick: false,
        steps: [
          {
            title: '欢迎使用',
            intro: '这是一个基于 intro.js 的新手引导 demo，会在真实页面上高亮讲解各个区域。',
            element: '#guide-step-welcome',
            position: 'bottom',
          },
          {
            title: '功能入口',
            intro: '实际项目中可以把步骤指向侧边栏、按钮或表单字段，这里用页面内的示例区块演示。',
            element: '#guide-step-feature',
            position: 'right',
          },
          {
            title: '角色信息',
            intro: '管理员与查看者会看到不同的菜单和操作入口，引导可以按角色定制步骤。',
            element: '#guide-step-role',
            position: 'top',
          },
          {
            title: '开始使用',
            intro: '引导到这里就结束了，可以随时点击「开始引导」重新查看。',
            element: '#guide-step-finish',
            position: 'top',
          },
        ],
      })
      .onComplete(() => {
        setStatus('引导已完成，可以开始使用平台。');
      })
      .onExit(() => {
        setStatus('引导已退出，可随时重新开始。');
      })
      .start();
  }

  return (
    <div className="page">
      <PageHeader
        title="后台新手引导"
        description="基于 intro.js 的分步高亮引导，适合新用户第一次进入后台时快速熟悉界面。"
        actions={<Button onClick={startGuide}>开始引导</Button>}
      />

      <Card title="引导步骤" description={status}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div
            id="guide-step-welcome"
            style={{
              padding: 16,
              borderRadius: 10,
              border: '1px solid var(--ffm-color-border)',
              background: 'var(--ffm-color-bg)',
            }}
          >
            <strong>第 1 步 · 欢迎</strong>
            <p className="form-hint" style={{ marginTop: 6 }}>
              引导会聚焦到页面上的真实元素，并用浮层说明用途。
            </p>
          </div>

          <div
            id="guide-step-feature"
            style={{
              padding: 16,
              borderRadius: 10,
              border: '1px solid var(--ffm-color-border)',
              background: 'var(--ffm-color-bg)',
            }}
          >
            <strong>第 2 步 · 功能入口</strong>
            <p className="form-hint" style={{ marginTop: 6 }}>
              实际项目中可以把步骤指向侧边栏、按钮或表单字段。
            </p>
          </div>

          <div
            id="guide-step-role"
            style={{
              padding: 16,
              borderRadius: 10,
              border: '1px solid var(--ffm-color-border)',
              background: 'var(--ffm-color-bg)',
            }}
          >
            <strong>第 3 步 · 角色信息</strong>
            <p className="form-hint" style={{ marginTop: 6 }}>
              管理员与查看者会看到不同的菜单和操作入口。
            </p>
          </div>

          <div
            id="guide-step-finish"
            style={{
              padding: 16,
              borderRadius: 10,
              border: '1px solid var(--ffm-color-border)',
              background: 'var(--ffm-color-bg)',
            }}
          >
            <strong>第 4 步 · 完成</strong>
            <p className="form-hint" style={{ marginTop: 6 }}>
              引导支持跳过、上一步、下一步与完成回调，可按需接入埋点。
            </p>
          </div>
        </div>

        <p className="form-hint" style={{ marginTop: 14 }}>
          组件文档：
          <a href="https://github.com/usablica/intro.js" target="_blank" rel="noreferrer">
            intro.js GitHub
          </a>
        </p>
      </Card>
    </div>
  );
}
