import { useEffect, useState } from 'react';

interface MailForm {
  to: string;
  subject: string;
  body: string;
  isHtml: boolean;
}

interface MailResult {
  success: boolean;
  message: string;
}

interface SmtpStatus {
  loading: boolean;
  configured: boolean;
  connectionOk?: boolean;
  connectionMsg?: string;
}

const REQUIRED_ENV = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
];
const ENV_EXAMPLE = `SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@qq.com
SMTP_PASS=your-smtp-auth-code
SMTP_FROM=your-email@qq.com`;

export function MailPage() {
  const [form, setForm] = useState<MailForm>({
    to: '',
    subject: '',
    body: '',
    isHtml: false,
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<MailResult | null>(null);

  const [smtp, setSmtp] = useState<SmtpStatus>({ loading: true, configured: false });
  const [testingConnection, setTestingConnection] = useState(false);

  // 页面加载时检查 SMTP 配置状态
  useEffect(() => {
    let cancelled = false;
    async function checkConfigured() {
      try {
        const res = await fetch('/api/mail/configured', { credentials: 'include' });
        if (!res.ok) return;
        const data = (await res.json()) as { configured: boolean };
        if (!cancelled) {
          setSmtp({ loading: false, configured: data.configured });
        }
      } catch {
        // 后端未启动等情况，静默失败
        if (!cancelled) setSmtp({ loading: false, configured: false });
      }
    }
    checkConfigured();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleTestConnection() {
    if (!smtp.configured) return;
    setTestingConnection(true);
    try {
      const res = await fetch('/api/mail/verify', {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      setSmtp((prev) => ({
        ...prev,
        connectionOk: data.ok,
        connectionMsg: data.message,
      }));
    } catch (err) {
      setSmtp((prev) => ({
        ...prev,
        connectionOk: false,
        connectionMsg: err instanceof Error ? err.message : '测试失败',
      }));
    } finally {
      setTestingConnection(false);
    }
  }

  function updateField<K extends keyof MailForm>(key: K, value: MailForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (!smtp.configured) {
      setResult({ success: false, message: 'SMTP 未配置，请先在后端设置 SMTP 环境变量' });
      return;
    }

    if (!form.to.trim() || !form.subject.trim() || !form.body.trim()) {
      setResult({ success: false, message: '请填写完整的收件人、主题和正文' });
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to: form.to.trim(),
          subject: form.subject.trim(),
          [form.isHtml ? 'html' : 'text']: form.body,
        }),
      });

      const data = (await res.json()) as { message?: string };

      if (res.ok) {
        setResult({ success: true, message: data.message || '邮件发送成功' });
        setForm((prev) => ({ ...prev, subject: '', body: '' }));
      } else {
        setResult({ success: false, message: data.message || `发送失败 (${res.status})` });
      }
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : '网络错误，请确认后端已启动并配置 SMTP',
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="ffm-mail-page">
      <h3 className="ffm-mail-title">邮件发送</h3>
      <p className="ffm-mail-desc">
        通过后端 Nodemailer API 发送邮件，请在 <code>apps/server/.env.local</code> 中配置 SMTP
        环境变量。
      </p>

      {/* SMTP 配置状态提示 */}
      <SmtpStatusBanner smtp={smtp} onTest={handleTestConnection} testing={testingConnection} />

      <form className="ffm-mail-form" onSubmit={handleSubmit}>
        <div className="ffm-mail-field">
          <label className="ffm-mail-label" htmlFor="mail-to">
            收件人
          </label>
          <input
            id="mail-to"
            className="ffm-mail-input"
            type="email"
            placeholder="example@domain.com"
            value={form.to}
            onChange={(e) => updateField('to', e.target.value)}
            disabled={!smtp.configured || smtp.loading}
          />
        </div>

        <div className="ffm-mail-field">
          <label className="ffm-mail-label" htmlFor="mail-subject">
            主题
          </label>
          <input
            id="mail-subject"
            className="ffm-mail-input"
            type="text"
            placeholder="邮件主题"
            value={form.subject}
            onChange={(e) => updateField('subject', e.target.value)}
            disabled={!smtp.configured || smtp.loading}
          />
        </div>

        <div className="ffm-mail-field">
          <label className="ffm-mail-label" htmlFor="mail-body">
            正文
          </label>
          <textarea
            id="mail-body"
            className="ffm-mail-textarea"
            rows={10}
            placeholder={form.isHtml ? '<h1>Hello</h1><p>邮件内容</p>' : '邮件内容...'}
            value={form.body}
            onChange={(e) => updateField('body', e.target.value)}
            disabled={!smtp.configured || smtp.loading}
          />
        </div>

        <div className="ffm-mail-field ffm-mail-checkbox">
          <label>
            <input
              type="checkbox"
              checked={form.isHtml}
              onChange={(e) => updateField('isHtml', e.target.checked)}
              disabled={!smtp.configured || smtp.loading}
            />
            正文为 HTML 格式
          </label>
        </div>

        <button
          className="ffm-btn ffm-btn-primary ffm-mail-submit"
          type="submit"
          disabled={sending || !smtp.configured || smtp.loading}
        >
          {sending ? '发送中...' : '发送邮件'}
        </button>

        {result && (
          <div
            className={`ffm-mail-result ${result.success ? 'ffm-mail-success' : 'ffm-mail-error'}`}
          >
            {result.message}
          </div>
        )}
      </form>
    </div>
  );
}

/** SMTP 配置状态横幅组件。 */
function SmtpStatusBanner({
  smtp,
  onTest,
  testing,
}: {
  smtp: SmtpStatus;
  onTest: () => void;
  testing: boolean;
}) {
  if (smtp.loading) {
    return (
      <div className="ffm-mail-status ffm-mail-status--loading">
        <span className="ffm-mail-status__dot" />
        正在检查 SMTP 配置...
      </div>
    );
  }

  if (!smtp.configured) {
    return (
      <div className="ffm-mail-status ffm-mail-status--warn">
        <div className="ffm-mail-status__header">
          <span className="ffm-mail-status__icon">⚠️</span>
          <strong>SMTP 未配置</strong>
        </div>
        <p className="ffm-mail-status__text">
          请在 <code>apps/server/.env.local</code> 中设置以下环境变量，然后重启后端服务：
        </p>
        <ul className="ffm-mail-status__list">
          {REQUIRED_ENV.map((env) => (
            <li key={env}>
              <code>{env}</code>
            </li>
          ))}
        </ul>
        <details className="ffm-mail-status__example">
          <summary>查看 .env.local 示例配置</summary>
          <pre>{ENV_EXAMPLE}</pre>
        </details>
      </div>
    );
  }

  // 已配置 —— 可能还需要测试连接
  return (
    <div className="ffm-mail-status ffm-mail-status--ok">
      <div className="ffm-mail-status__header">
        <span className="ffm-mail-status__icon">✓</span>
        <strong>SMTP 已配置</strong>
        <button className="ffm-mail-status__test" type="button" onClick={onTest} disabled={testing}>
          {testing ? '测试中...' : '测试连接'}
        </button>
      </div>

      {smtp.connectionOk === true && (
        <p className="ffm-mail-status__text ffm-mail-status__text--ok">
          ✓ {smtp.connectionMsg || 'SMTP 连接正常'}
        </p>
      )}
      {smtp.connectionOk === false && (
        <p className="ffm-mail-status__text ffm-mail-status__text--err">
          ✗ {smtp.connectionMsg || '连接失败'} — 请检查主机、端口、账号密码是否正确
        </p>
      )}
      {smtp.connectionOk === undefined && (
        <p className="ffm-mail-status__text ffm-mail-status__text--hint">
          配置已检测到，建议点击「测试连接」验证主机可达性与账号密码是否正确
        </p>
      )}
    </div>
  );
}
