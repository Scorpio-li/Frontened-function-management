import nodemailer from 'nodemailer';

/** SMTP 配置，全部来自环境变量。 */
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/** 发送邮件的参数。 */
export interface MailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

let cachedConfig: SmtpConfig | null = null;

function readBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw.trim().toLowerCase() === 'true';
}

/** 从环境变量读取 SMTP 配置；返回 null 表示未配置。 */
export function readSmtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  if (cachedConfig) return cachedConfig;

  const host = env.SMTP_HOST?.trim();
  const portRaw = env.SMTP_PORT?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS?.trim();
  const from = env.SMTP_FROM?.trim();

  // 至少需要 host + user + pass 才视为已配置
  if (!host || !user || !pass) return null;

  const port = portRaw ? Number(portRaw) : 465;
  if (!Number.isFinite(port) || port <= 0) return null;

  cachedConfig = {
    host,
    port,
    secure: readBool(env.SMTP_SECURE, port === 465),
    user,
    pass,
    from: from || user,
  };
  return cachedConfig;
}

export function clearSmtpCache(): void {
  cachedConfig = null;
}

/** 创建 transporter 实例（内部复用，调用方负责后续操作）。 */
function createTransporter() {
  const config = readSmtpConfig();
  if (!config) return null;
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

/** 测试 SMTP 连接是否可用（调用 nodemailer 的 verify）。 */
export async function verifySmtpConnection(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const transporter = createTransporter();
  if (!transporter) {
    return { ok: false, message: 'SMTP 未配置，请先设置 SMTP_HOST / SMTP_USER / SMTP_PASS' };
  }
  try {
    await transporter.verify();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : '连接失败';
    return { ok: false, message };
  }
}

/** 发送邮件。未配置 SMTP 时会抛出明确错误。 */
export async function sendMail(
  options: MailOptions,
  env?: NodeJS.ProcessEnv,
): Promise<{ messageId: string }> {
  // sendMail 调用时强制读取 env（不依赖缓存），避免测试场景串扰
  const config = env ? readSmtpConfig(env) : readSmtpConfig();
  if (!config) {
    throw new Error(
      'SMTP 未配置，请在 apps/server/.env.local 中设置 SMTP_HOST / SMTP_USER / SMTP_PASS',
    );
  }

  if (!options.to || !options.to.trim()) {
    throw new Error('收件人地址不能为空');
  }
  if (!options.subject || !options.subject.trim()) {
    throw new Error('邮件主题不能为空');
  }
  if (!options.text && !options.html) {
    throw new Error('邮件正文不能为空（text 或 html 至少提供一个）');
  }

  const transporter = createTransporter();
  if (!transporter) {
    throw new Error('SMTP 未配置');
  }

  const info = await transporter.sendMail({
    from: config.from,
    to: options.to.trim(),
    subject: options.subject.trim(),
    text: options.text,
    html: options.html,
  });

  return { messageId: info.messageId };
}
