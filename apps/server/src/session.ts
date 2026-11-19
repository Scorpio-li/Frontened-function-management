import { randomBytes } from 'node:crypto';

/** 会话 Cookie 名称。 */
export const SESSION_COOKIE_NAME = 'ffm_session';

interface SessionRecord {
  accountId: string;
  expiresAt: number;
}

/** 内存会话表，服务重启后全部失效（P0 接受）。 */
export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  /** 创建会话并返回随机 sessionId。 */
  create(accountId: string): string {
    const sessionId = randomBytes(32).toString('hex');
    this.sessions.set(sessionId, { accountId, expiresAt: Date.now() + this.ttlMs });
    return sessionId;
  }

  /** 读取会话，过期或不存在时返回 null 并顺带清理过期项。 */
  get(sessionId: string): { accountId: string } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(sessionId);
      return null;
    }
    return { accountId: session.accountId };
  }

  destroy(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** 销毁某个账号的全部会话，用于删除账号后强制下线。 */
  destroyByAccount(accountId: string): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.accountId === accountId) {
        this.sessions.delete(sessionId);
      }
    }
  }
}
