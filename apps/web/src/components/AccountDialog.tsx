import { useEffect, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';

import { PASSWORD_MIN_LENGTH, USERNAME_PATTERN } from '@repo/contracts';
import type { Account, UpdateAccountRequest } from '@repo/contracts';
import { Button } from '@repo/ui';

import { ApiRequestError, api } from '../api/client';

export interface AccountDialogProps {
  mode: 'create' | 'edit';
  /** 编辑模式下待修改的账号。 */
  account?: Account;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function AccountDialog({ mode, account, onClose, onSuccess }: AccountDialogProps) {
  const [username, setUsername] = useState(account?.username ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = mode === 'edit';

  // 按 ESC 关闭，提交中不响应。
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, submitting]);

  function validate(): string | null {
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      return '请输入用户名';
    }

    if (!USERNAME_PATTERN.test(trimmedUsername)) {
      return '用户名需为 3–32 位小写字母、数字、下划线或连字符';
    }

    if (!isEdit && !password) {
      return '请输入密码';
    }

    if (password && password.length < PASSWORD_MIN_LENGTH) {
      return `密码至少 ${PASSWORD_MIN_LENGTH} 位`;
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const validationError = validate();
    if (validationError !== null) {
      setError(validationError);
      return;
    }

    const trimmedUsername = username.trim();
    setError(null);
    setSubmitting(true);

    try {
      if (isEdit && account) {
        const payload: UpdateAccountRequest = { username: trimmedUsername };
        if (password) {
          payload.password = password;
        }

        await api.updateAccount(account.id, payload);
        onSuccess(`已更新账号 ${trimmedUsername}`);
      } else {
        await api.createAccount({ username: trimmedUsername, password });
        onSuccess(`已创建账号 ${trimmedUsername}`);
      }
    } catch (submitError) {
      setError(
        submitError instanceof ApiRequestError ? submitError.message : '操作失败，请稍后重试',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget && !submitting) {
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={handleBackdropMouseDown}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title">
        <header className="modal__header">
          <h2 id="account-dialog-title">{isEdit ? '编辑账号' : '新增账号'}</h2>
          <p>{isEdit ? '修改账号用户名，密码留空表示不修改。' : '新账号的角色固定为查看者。'}</p>
        </header>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal__body">
            <label className="form-field" htmlFor="account-username">
              <span>用户名</span>
              <input
                id="account-username"
                name="username"
                value={username}
                autoComplete="off"
                autoFocus
                disabled={submitting}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>

            <label className="form-field" htmlFor="account-password">
              <span>密码</span>
              <input
                id="account-password"
                name="password"
                type="password"
                value={password}
                autoComplete="new-password"
                disabled={submitting}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            <p className="form-hint">
              {isEdit
                ? `留空表示不修改；如需重置密码，至少 ${PASSWORD_MIN_LENGTH} 位。`
                : `至少 ${PASSWORD_MIN_LENGTH} 位。`}
            </p>

            {error !== null ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <footer className="modal__footer">
            <Button variant="secondary" disabled={submitting} onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? '保存中…' : isEdit ? '保存' : '创建'}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
