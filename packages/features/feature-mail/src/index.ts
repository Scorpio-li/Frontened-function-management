import { defineFeature } from '@repo/core';

import { MailPage } from './MailPage';

export const mailFeature = defineFeature({
  id: 'mail',
  name: '邮件发送',
  description: '通过后端 Nodemailer API 发送邮件，支持 HTML 内容与附件。',
  version: '0.1.0',
  implementationSteps: [
    {
      text: '安装 nodemailer 依赖（后端）。',
      code: 'pnpm --filter @repo/server add nodemailer\npnpm --filter @repo/server add -D @types/nodemailer',
    },
    {
      text: '在后端创建邮件发送服务。',
      code: `// apps/server/src/mailer.ts
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendMail(options: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}) {
  return transporter.sendMail({ from: process.env.SMTP_FROM, ...options });
}`,
    },
    {
      text: '在 Fastify app 中注册邮件发送路由。',
      code: `// apps/server/src/app.ts
app.post('/api/mail/send', async (request, reply) => {
  // 校验登录态 + 参数 → 调用 sendMail()
});`,
    },
    {
      text: '前端通过 fetch 调用 /api/mail/send。',
      code: `const res = await fetch('/api/mail/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ to, subject, html }),
  credentials: 'include',
});`,
    },
    {
      text: '在宿主注册功能并运行检查。',
      code: `// apps/web/src/features.ts
import { mailFeature } from '@repo/feature-mail';

pnpm install
pnpm check`,
    },
  ],
  routes: [{ path: '', label: '发送邮件', element: MailPage }],
});
