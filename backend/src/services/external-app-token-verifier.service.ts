/**
 * @fileoverview 外部アプリ用トークンの検証（user-authentication タスク 75.1）
 *
 * Bearer トークンから利用者と範囲を解決する唯一の入口。窓口のミドルウェア（タスク75.2）が要求ごとに呼ぶ。
 *
 * 判定の順と方針:
 * 1. トークンは解析せず、認可サーバーのモデル（`AccessToken.find`、保存アダプター経由）で読む。
 *    リフレッシュトークン・認可コード・画面用の JWT は別の種別のキーなので見つからない
 * 2. 種別・期限（判定の時刻とライブラリの時刻の両方）・送信者の制約の無さ・想定利用者が
 *    `OAUTH_RESOURCE_URL` と完全に一致すること・許可の一覧にあるアプリであることを確かめる（33.3）
 * 3. Grant から接続を `assertActive` で判定する。要求の送信元を渡すので、要求の中で期限切れになった
 *    接続の終了の監査に送信元 IP が残る（48.2、48.3、51.7）。同意から 90 日の上限もここで効く
 * 4. 接続の利用者とアプリがトークンと一致し、範囲はトークンと接続の共通部分で `read` を含むこと（51.1）
 * 5. 利用者が存在し、有効で、制限中（初回のパスワード変更・2FA 未登録。34.2）でなく、権限「外部アプリの接続」を
 *    ワイルドカード（`*:*`・`external_app:*`・`*:connect`）を含む RBAC と同じ規則で持つこと（51.1）。
 *    判定は RBAC のキャッシュでなく DB の現在の値で行う。キャッシュの無効化はコミットの後に失敗しうるので、
 *    権限を外した直後のトークンを通さないため（接続の失効の判定と同じ方針）
 * 6. 進行中の接続の終了を待ってから接続が残っていることを確かめる。取り消しの途中の要求は、
 *    取り消しのコミットの後に成功しない
 * 7. 成功で利用を記録する（1 分に 1 回。失敗しても要求は失敗させない）
 *
 * 認証の不成立は全て `INVALID_TOKEN`（401）1 種で返し、理由を区別しない。DB の失敗（Grant の行の
 * ロックの待ちの期限切れを含む）は 401 にせず `ExternalAppTokenVerificationError` を投げ、窓口は 5xx にする。
 * 401 にすると、外部アプリが正常な接続を捨てて再度の同意へ進むため。トークンの値はログにもエラーにも含めない（48.8）。
 *
 * Design: Requirements 46-51 > ExternalAppTokenVerifier
 *
 * @requirement user-authentication/REQ-33.3
 * @requirement user-authentication/REQ-48.2
 * @requirement user-authentication/REQ-48.3
 * @requirement user-authentication/REQ-48.8
 * @requirement user-authentication/REQ-48.9
 * @requirement user-authentication/REQ-51.1
 * @requirement user-authentication/REQ-51.3
 * @requirement user-authentication/REQ-51.7
 *
 * @module services/external-app-token-verifier
 */

import type { Provider, OidcToken } from 'oidc-provider';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { ExternalAppClientRegistry } from '../oauth/client-registry.js';
import type {
  ExternalAppAuthError,
  ExternalAppPrincipal,
  ExternalAppScope,
} from '../oauth/oauth.types.js';
import type { RequestContext } from '../types/auth.types.js';
import { Err, Ok, type Result } from '../types/result.js';
import logger from '../utils/logger.js';
import type { ExternalAppConnectionService } from './external-app-connection.service.js';
import { permissionCovers } from './privilege-ceiling.js';

/** 不透明なトークンの形（base64url の文字）。これ以外は DB を引かずに拒否する */
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;
const ACCESS_TOKEN_KIND = 'AccessToken';
const ERROR_CODE_PATTERN = /^P\d{4}$/;
/** 接続に必要な権限（要件50.4・51.1） */
const CONNECT_PERMISSION = { resource: 'external_app', action: 'connect' } as const;
/** 主体に返す範囲の並び */
const SCOPE_ORDER: readonly ExternalAppScope[] = ['read', 'write'];

const INVALID_TOKEN: Result<never, ExternalAppAuthError> = Err({ kind: 'INVALID_TOKEN' });

/** 検証の依存 */
export interface ExternalAppTokenVerifierDeps {
  /** 認可サーバー。`AccessToken.find` で保存アダプターから読む */
  readonly provider: Pick<Provider, 'AccessToken'>;
  readonly prisma: Pick<PrismaClient, 'user'>;
  readonly connectionService: Pick<
    ExternalAppConnectionService,
    'assertActive' | 'confirmNotEnded' | 'touch'
  >;
  readonly clientRegistry: Pick<ExternalAppClientRegistry, 'isAllowed'>;
  /** `OAUTH_RESOURCE_URL`。想定利用者はこの値との完全一致だけを受け付ける */
  readonly resourceUrl: string;
}

/**
 * 検証を完了できない基盤の失敗（DB の障害・ロックの待ちの期限切れなど）。窓口は 5xx で返す。
 * 元の例外の文はトークンや問い合わせの値を含みうるので、文にも `cause` にも引き継がない（要件48.8）
 */
export class ExternalAppTokenVerificationError extends Error {
  readonly code?: string;

  constructor(operation: string, code?: string) {
    super(`外部アプリ用トークンの検証を完了できませんでした（${operation}）`);
    this.name = 'ExternalAppTokenVerificationError';
    this.code = code;
  }
}

/** トークンから読んだ、検証済みの値 */
interface TokenClaims {
  readonly accountId: string;
  readonly clientId: string;
  readonly grantId: string;
  readonly scopes: ReadonlySet<string>;
}

function safeErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && ERROR_CODE_PATTERN.test(code) ? code : undefined;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

export class ExternalAppTokenVerifier {
  constructor(private readonly deps: ExternalAppTokenVerifierDeps) {}

  /**
   * Bearer トークンを検証し、主体を返す
   *
   * @param bearerToken - `Authorization: Bearer` の値
   * @param now - 判定の時刻
   * @param source - 要求の送信元（期限切れの終了の監査に記録する）
   * @returns 主体。不成立は全て `INVALID_TOKEN`
   * @throws {ExternalAppTokenVerificationError} DB の失敗などで判定できないとき（401 にしない）
   */
  async verify(
    bearerToken: string,
    now: Date,
    source: RequestContext
  ): Promise<Result<ExternalAppPrincipal, ExternalAppAuthError>> {
    if (typeof bearerToken !== 'string' || !OPAQUE_TOKEN_PATTERN.test(bearerToken)) {
      return INVALID_TOKEN;
    }
    const token = await this.guard('find_token', () =>
      this.deps.provider.AccessToken.find(bearerToken)
    );
    const claims = this.readClaims(token, now);
    if (claims === null) {
      return INVALID_TOKEN;
    }

    const active = await this.guard('assert_active', () =>
      this.deps.connectionService.assertActive(claims.grantId, now, source)
    );
    if (!active.ok) {
      return INVALID_TOKEN;
    }
    const connection = active.value;
    if (connection.userId !== claims.accountId || connection.clientId !== claims.clientId) {
      return INVALID_TOKEN;
    }
    // 付与された範囲は接続の範囲を超えない
    const scopes = SCOPE_ORDER.filter(
      (scope) => claims.scopes.has(scope) && connection.scopes.includes(scope)
    );
    if (!scopes.includes('read')) {
      return INVALID_TOKEN;
    }

    if (!(await this.guard('load_user', () => this.isEligibleUser(connection.userId)))) {
      return INVALID_TOKEN;
    }
    // 取り消しなどの終了が進行中なら、そのコミットを待ってから残っているかを確かめる
    if (
      !(await this.guard('confirm_connection', () =>
        this.deps.connectionService.confirmNotEnded(connection.id)
      ))
    ) {
      return INVALID_TOKEN;
    }

    await this.recordUse(connection.id, now);
    return Ok({
      userId: connection.userId,
      clientId: connection.clientId,
      connectionId: connection.id,
      scopes,
    });
  }

  /** トークンの種別・期限・想定利用者・アプリを確かめる。満たさなければ null */
  private readClaims(token: OidcToken | undefined, now: Date): TokenClaims | null {
    if (!token || token.kind !== ACCESS_TOKEN_KIND) {
      return null;
    }
    // ライブラリは実時間で期限を確かめるので、判定の時刻でも確かめる
    if (typeof token.exp !== 'number' || token.exp * 1000 <= now.getTime()) {
      return null;
    }
    // 送信者の制約（DPoP・mTLS）は無効にしているので、付いたトークンは検証できない
    if (token.jkt !== undefined || token['x5t#S256'] !== undefined) {
      return null;
    }
    if (!this.isExpectedAudience(token.aud)) {
      return null;
    }
    const { accountId, clientId, grantId, scope } = token;
    if (
      !nonEmptyString(accountId) ||
      !nonEmptyString(clientId) ||
      !nonEmptyString(grantId) ||
      typeof scope !== 'string'
    ) {
      return null;
    }
    if (!this.deps.clientRegistry.isAllowed(clientId)) {
      return null;
    }
    return { accountId, clientId, grantId, scopes: new Set(scope.split(' ')) };
  }

  private isExpectedAudience(aud: OidcToken['aud']): boolean {
    const values = Array.isArray(aud) ? aud : aud === undefined ? [] : [aud];
    return values.length === 1 && values[0] === this.deps.resourceUrl;
  }

  /** 利用者が存在し、有効で、制限中でなく、権限「外部アプリの接続」を持つか（DB の現在の値） */
  private async isEligibleUser(userId: string): Promise<boolean> {
    const user = await this.deps.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isActive: true,
        mustChangePassword: true,
        twoFactorEnabled: true,
        userRoles: {
          select: {
            role: {
              select: {
                rolePermissions: {
                  select: { permission: { select: { resource: true, action: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!user?.isActive || user.mustChangePassword || !user.twoFactorEnabled) {
      return false;
    }
    return user.userRoles.some(({ role }) =>
      role.rolePermissions.some(({ permission }) =>
        permissionCovers(permission, CONNECT_PERMISSION)
      )
    );
  }

  /** 利用を記録する。失敗しても要求は失敗させず、例外の文（値を含みうる）は記録しない */
  private async recordUse(connectionId: string, now: Date): Promise<void> {
    try {
      await this.deps.connectionService.touch(connectionId, now);
    } catch (error) {
      logger.warn(
        { errorName: errorName(error), errorCode: safeErrorCode(error), connectionId },
        'Failed to record external app connection use'
      );
    }
  }

  private async guard<T>(operation: string, action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      throw new ExternalAppTokenVerificationError(operation, safeErrorCode(error));
    }
  }
}
