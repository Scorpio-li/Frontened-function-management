import { useCallback, useEffect, useState } from 'react';

import type { Account } from '@repo/contracts';
import { Badge, Button, Card, EmptyState, PageHeader } from '@repo/ui';

import { ApiRequestError, api } from '../api/client';
import { AccountDialog } from '../components/AccountDialog';
import { useAuth } from '../auth/useAuth';

type DialogState = { mode: 'create' } | { mode: 'edit'; account: Account };

interface Notice {
  tone: 'success' | 'danger';
  message: string;
}

/** 以本地化格式展示 ISO 时间，解析失败时原样返回。 */
function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

export function AccountsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await api.listAccounts();
      setAccounts(data);
    } catch (loadError) {
      setError(
        loadError instanceof ApiRequestError ? loadError.message : '账号列表加载失败，请稍后重试',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  function handleDialogSuccess(message: string): void {
    setDialog(null);
    setNotice({ tone: 'success', message });
    void loadAccounts();
  }

  async function handleDelete(account: Account): Promise<void> {
    if (!window.confirm(`确定删除账号「${account.username}」吗？删除后该账号将无法登录。`)) {
      return;
    }

    setDeletingId(account.id);

    try {
      await api.deleteAccount(account.id);
      setNotice({ tone: 'success', message: `已删除账号 ${account.username}` });
      await loadAccounts();
    } catch (deleteError) {
      setNotice({
        tone: 'danger',
        message:
          deleteError instanceof ApiRequestError ? deleteError.message : '删除失败，请稍后重试',
      });
    } finally {
      setDeletingId(null);
    }
  }

  function renderTableBody() {
    if (loading) {
      return (
        <tr>
          <td className="data-table__placeholder" colSpan={4}>
            正在加载账号列表…
          </td>
        </tr>
      );
    }

    if (error !== null) {
      return (
        <tr>
          <td className="data-table__placeholder" colSpan={4}>
            <p className="form-error">{error}</p>
            <Button size="sm" variant="secondary" onClick={() => void loadAccounts()}>
              重试
            </Button>
          </td>
        </tr>
      );
    }

    return accounts.map((account) => (
      <tr key={account.id}>
        <td>{account.username}</td>
        <td>
          <span className="role-cell">
            <Badge tone={account.role === 'admin' ? 'info' : 'neutral'}>
              {account.role === 'admin' ? '管理员' : '查看者'}
            </Badge>
          </span>
        </td>
        <td>{formatTime(account.createdAt)}</td>
        <td>
          {!isAdmin ? (
            <span className="form-hint">—</span>
          ) : account.role === 'admin' ? (
            <span className="form-hint">受保护</span>
          ) : (
            <div className="table-actions">
              <Button
                size="sm"
                variant="secondary"
                disabled={deletingId === account.id}
                onClick={() => setDialog({ mode: 'edit', account })}
              >
                编辑
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={deletingId === account.id}
                onClick={() => void handleDelete(account)}
              >
                {deletingId === account.id ? '删除中…' : '删除'}
              </Button>
            </div>
          )}
        </td>
      </tr>
    ));
  }

  return (
    <div className="page">
      <PageHeader
        title="账号管理"
        description={
          isAdmin
            ? '管理可登录本平台的账号；内置管理员受保护，不可编辑或删除。'
            : '当前账号为查看者，仅可浏览账号列表。'
        }
        actions={
          isAdmin ? (
            <Button onClick={() => setDialog({ mode: 'create' })}>新增账号</Button>
          ) : undefined
        }
      />

      {notice !== null ? (
        <p
          className={`banner banner--${notice.tone}`}
          role={notice.tone === 'danger' ? 'alert' : 'status'}
        >
          {notice.message}
        </p>
      ) : null}

      <Card
        title="账号列表"
        description={
          isAdmin ? '新建账号的角色固定为查看者。' : '如需新增或修改账号，请联系管理员。'
        }
      >
        {!loading && error === null && accounts.length === 0 ? (
          <EmptyState title="暂无账号" description="当前账号列表为空。" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">用户名</th>
                  <th scope="col">角色</th>
                  <th scope="col">创建时间</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>{renderTableBody()}</tbody>
            </table>
          </div>
        )}
      </Card>

      {dialog !== null ? (
        <AccountDialog
          mode={dialog.mode}
          account={dialog.mode === 'edit' ? dialog.account : undefined}
          onClose={() => setDialog(null)}
          onSuccess={handleDialogSuccess}
        />
      ) : null}
    </div>
  );
}
