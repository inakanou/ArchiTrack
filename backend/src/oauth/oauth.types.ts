/**
 * @fileoverview 外部アプリの接続で共有する型（design.md「Requirements 46-51 > 共通の型」）
 *
 * @module oauth/oauth.types
 */

import type { RequestContext } from '../types/auth.types.js';

/** 外部アプリに許す操作の範囲 */
export type ExternalAppScope = 'read' | 'write';

/** 外部アプリ用トークンから解決した主体 */
export interface ExternalAppPrincipal {
  readonly userId: string;
  readonly clientId: string;
  readonly connectionId: string;
  readonly scopes: readonly ExternalAppScope[];
}

/** 接続が終わった理由 */
export type ConnectionEndReason =
  | 'USER_REVOKED'
  | 'ADMIN_REVOKED'
  | 'REPLACED'
  | 'IDLE_EXPIRED'
  | 'ABSOLUTE_EXPIRED'
  | 'PASSWORD_CHANGED'
  | 'LOGOUT_ALL'
  | 'ACCOUNT_DEACTIVATED'
  | 'ACCOUNT_DELETED'
  | 'PERMISSION_LOST'
  | 'CLIENT_REMOVED'
  | 'TOKEN_REUSE';

/** 接続の出来事の監査（要件51.7）。トークンの値と HMAC の ID を持たない（要件48.8） */
export interface ConnectionAuditEvent {
  readonly kind:
    | 'CONSENT_GRANTED'
    | 'CONSENT_DENIED'
    | 'CONNECTION_REPLACED'
    | 'CONNECTION_ENDED'
    | 'TOKEN_REUSE_DETECTED'
    | 'REFRESH_GRACE_APPLIED';
  readonly actorUserId: string | null;
  readonly targetUserId: string;
  readonly clientId: string;
  readonly scopes: readonly ExternalAppScope[];
  readonly reason: ConnectionEndReason | null;
  readonly occurredAt: Date;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  /** 再利用を検知したトークンの種類。`TOKEN_REUSE_DETECTED` で記録する（通知には含まれない） */
  readonly reuseKind?: TokenReuseEvent['kind'];
}

/** 認可サーバーの保存側が検知したトークンの再利用 */
export interface TokenReuseEvent {
  readonly grantId: string;
  readonly kind: 'authorization_code' | 'refresh_token' | 'grant_revocation';
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

/** 再利用の処理。保存アダプターへ注入し、アダプターから接続のサービスを参照しない */
export type TokenReuseHandler = (event: TokenReuseEvent) => Promise<void>;

/** 接続の作成・置き換えの入力 */
export interface CreateConnectionInput {
  readonly userId: string;
  readonly clientId: string;
  /** 今回の同意で新しく作った Grant の ID（再度の同意でも既存の Grant を再利用しない） */
  readonly grantId: string;
  readonly scopes: readonly ExternalAppScope[];
  readonly consentedAt: Date;
  /** 同意の手続きの開始時に読んだ利用者の失効の世代。現在の世代と違えば接続を作らない */
  readonly expectedRevocationGeneration: number;
  /** 同意の要求の送信元（監査に記録する） */
  readonly source?: RequestContext;
}

/** 画面と API に返す接続の表現 */
export interface ExternalAppConnectionView {
  readonly id: string;
  readonly appName: string;
  readonly scopes: readonly ExternalAppScope[];
  readonly consentedAt: string;
  readonly lastUsedAt: string | null;
  readonly expiresAt: string;
}

/** 管理者の一覧の一行。Grant とトークンの情報を含めない（要件49.6） */
export interface AdminExternalAppConnectionView extends ExternalAppConnectionView {
  readonly clientId: string;
  readonly user: {
    readonly id: string;
    readonly displayName: string;
    readonly email: string;
  };
}

/** 全利用者の一覧の絞り込みとページ（要件49.7） */
export interface ConnectionFilter {
  readonly userId?: string;
  readonly clientId?: string;
  readonly page: number;
  readonly limit: number;
}

/** 全利用者の一覧のページ（他の一覧の API と同じ形） */
export interface PaginatedConnections {
  readonly data: readonly AdminExternalAppConnectionView[];
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly totalPages: number;
  };
}

/** 接続を操作した実行者と要求の送信元（要件51.7） */
export interface AuditActor {
  /** 実行者の ID。定期処理など実行者のいない処理では null */
  readonly userId: string | null;
  readonly source?: RequestContext;
}

/** 有効と判定した接続 */
export interface ActiveConnection {
  readonly id: string;
  readonly userId: string;
  readonly clientId: string;
  readonly grantId: string;
  readonly scopes: readonly ExternalAppScope[];
}
