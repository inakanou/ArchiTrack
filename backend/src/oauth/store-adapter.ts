/**
 * @fileoverview 認可サーバー（oidc-provider）の保存アダプター（user-authentication タスク 73.1）
 *
 * アクセストークン・リフレッシュトークン・認可コードは、キーを HMAC にして本体から値を除き、
 * DB の値だけではトークンを復元できない形で保存する（要件48.7、48.8）。読み出しでは提示された値を
 * `jti` に戻す。接続のサービスは参照せず、Grant の失効は注入された処理へ渡す。
 *
 * Design: Requirements 46-51 > OAuthStoreAdapter
 *
 * @module oauth/store-adapter
 */

import { createHmac } from 'crypto';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { RequestContext } from '../types/auth.types.js';
import type { TokenReuseHandler } from './oauth.types.js';

/** 値を HMAC にして保存する種別 */
const HMAC_KEYED_KINDS: ReadonlySet<string> = new Set([
  'AccessToken',
  'RefreshToken',
  'AuthorizationCode',
]);

/** Grant に属し、`grant_id` の列を持つトークンの種別（ライブラリの失効の対象と同じ） */
const GRANT_BOUND_KINDS: ReadonlySet<string> = new Set([
  'AccessToken',
  'RefreshToken',
  'AuthorizationCode',
  'DeviceCode',
  'BackchannelAuthenticationRequest',
  'PreAuthorizedCode',
]);

/** 使用済みなら期限の後も読み出す種別（再利用の検知を期限の判定より先に行うため） */
const REUSE_DETECTED_KINDS: ReadonlySet<string> = new Set(['RefreshToken', 'AuthorizationCode']);

const TOKEN_HMAC_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;
const PRISMA_ERROR_CODE_PATTERN = /^P\d{4}$/;

/** アダプターが使う DB の範囲 */
export type OAuthStoreDb = Pick<PrismaClient, 'oAuthStoreRecord'>;

/** ライブラリと受け渡す本体 */
export type OAuthStorePayload = Record<string, unknown>;

/** アダプターの依存 */
export interface OAuthStoreAdapterDeps {
  readonly prisma: OAuthStoreDb;
  /** `OAUTH_TOKEN_HMAC_KEY`（64 桁の 16 進） */
  readonly tokenHmacKey: string;
  /** ライブラリの Grant の失効を受け取る処理 */
  readonly onGrantRevoked: TokenReuseHandler;
  /** 現在の要求の送信元 */
  readonly getRequestSource: () => RequestContext;
  readonly now?: () => Date;
}

/**
 * 保存データの操作の失敗。
 * DB の例外の文は問い合わせの値を含みうるので、文にも `cause` にも引き継がない（要件48.8）
 */
export class OAuthStoreError extends Error {
  readonly code?: string;

  constructor(operation: string, code?: string) {
    super(`認可サーバーの保存データの操作に失敗しました（${operation}）`);
    this.name = 'OAuthStoreError';
    this.code = code;
  }
}

function safeErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && PRISMA_ERROR_CODE_PATTERN.test(code) ? code : undefined;
}

/** oidc-provider の 1 つのモデルの保存を受け持つ */
export class OAuthStoreAdapter {
  private readonly now: () => Date;

  constructor(
    private readonly model: string,
    private readonly deps: OAuthStoreAdapterDeps,
    private readonly hmacKey: Buffer,
    /** 進行中の Grant の失効。全モデルのアダプターで共有する */
    private readonly revocations: Map<string, Promise<void>>
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * 行を保存する。再保存で `consumed` が無くても使用済みの記録は戻さない
   *
   * @param id - ライブラリの ID（トークンの種別では値そのもの）
   * @param payload - ライブラリの本体
   * @param expiresIn - 有効期間（秒）。無ければ期限なし
   */
  async upsert(id: string, payload: OAuthStorePayload, expiresIn?: number): Promise<void> {
    await this.guard('upsert', async () => {
      if (expiresIn !== undefined && !Number.isFinite(expiresIn)) {
        throw new OAuthStoreError('upsert');
      }
      const recordId = this.recordId(id);
      const data = this.toColumns(id, payload, expiresIn);
      await this.deps.prisma.oAuthStoreRecord.upsert({
        where: { id: recordId },
        create: { id: recordId, ...data },
        update: data,
      });
    });
  }

  /**
   * 行を読み、ライブラリの形へ戻す。
   * 期限切れの行は返さない。ただし使用済みの認可コードとリフレッシュトークンは再利用の検知のために返す
   *
   * @param id - ライブラリの ID
   */
  async find(id: string): Promise<OAuthStorePayload | undefined> {
    return this.guard('find', async () => {
      const row = await this.deps.prisma.oAuthStoreRecord.findUnique({
        where: { id: this.recordId(id) },
      });
      if (!row || !this.isReadable(row)) {
        return undefined;
      }
      return this.toPayload(row, id);
    });
  }

  /**
   * Session を uid で読む（ライブラリがこの経路を使うのは Session だけ）
   *
   * @param uid - Session の uid
   */
  async findByUid(uid: string): Promise<OAuthStorePayload | undefined> {
    return this.guard('findByUid', async () => {
      const row = await this.deps.prisma.oAuthStoreRecord.findFirst({
        where: {
          kind: this.model,
          uid,
          OR: [{ expiresAt: null }, { expiresAt: { gt: this.now() } }],
        },
        orderBy: { id: 'asc' },
      });
      return row ? this.toPayload(row) : undefined;
    });
  }

  /**
   * 未使用の行を使用済みにする。対象が無ければ失敗にして、トークンを発行させない
   *
   * @param id - ライブラリの ID
   */
  async consume(id: string): Promise<void> {
    await this.guard('consume', async () => {
      const { count } = await this.deps.prisma.oAuthStoreRecord.updateMany({
        where: { id: this.recordId(id), consumedAt: null },
        data: { consumedAt: this.now() },
      });
      if (count === 0) {
        throw new OAuthStoreError('consume');
      }
    });
  }

  /**
   * 行を消す。Grant は進行中の失効の完了を待つ。失効の処理が Grant の行をロックして持ち主を読むため。
   *
   * 使用済みの認可コードとリフレッシュトークンは消さない。ライブラリは再利用の検知で `destroy` と失効を
   * 同時に呼ぶので、消すと失効の失敗の後に再提示を検知できなくなる。これらの行は接続の終了で消える
   *
   * @param id - ライブラリの ID
   */
  async destroy(id: string): Promise<void> {
    await this.guard('destroy', async () => {
      if (this.model === 'Grant') {
        await this.revocations.get(id);
      }
      await this.deps.prisma.oAuthStoreRecord.deleteMany({
        where: {
          id: this.recordId(id),
          ...(REUSE_DETECTED_KINDS.has(this.model) ? { consumedAt: null } : {}),
        },
      });
    });
  }

  /**
   * ライブラリの Grant の失効を注入された処理へ渡す。
   * ライブラリは種別ごとに同時に呼ぶので、進行中の呼び出しは 1 回にまとめる
   *
   * @param grantId - Grant の ID
   */
  revokeByGrantId(grantId: string): Promise<void> {
    const pending = this.revocations.get(grantId);
    if (pending) {
      return pending;
    }
    const running = this.guard('revokeByGrantId', async () => {
      const source = this.deps.getRequestSource();
      await this.deps.onGrantRevoked({
        grantId,
        kind: 'grant_revocation',
        ipAddress: source.ipAddress ?? null,
        userAgent: source.userAgent ?? null,
      });
    }).finally(() => {
      this.revocations.delete(grantId);
    });
    this.revocations.set(grantId, running);
    return running;
  }

  private recordId(id: string): string {
    if (!HMAC_KEYED_KINDS.has(this.model)) {
      return `${this.model}:${id}`;
    }
    const digest = createHmac('sha256', this.hmacKey).update(id).digest('hex');
    return `${this.model}:${digest}`;
  }

  private toColumns(id: string, payload: OAuthStorePayload, expiresIn: number | undefined) {
    const { consumed, ...withoutConsumed } = payload;
    const body: OAuthStorePayload = { ...withoutConsumed };
    if (HMAC_KEYED_KINDS.has(this.model)) {
      delete body.jti;
    }
    return {
      kind: this.model,
      grantId: this.grantIdOf(id, payload),
      uid: this.model === 'Session' && typeof payload.uid === 'string' ? payload.uid : null,
      payload: body as Prisma.InputJsonObject,
      expiresAt: expiresIn === undefined ? null : new Date(this.now().getTime() + expiresIn * 1000),
      ...(typeof consumed === 'number' ? { consumedAt: new Date(consumed * 1000) } : {}),
    };
  }

  /** Grant の行は自身の ID を持つ。接続の失効のロックがこの列で Grant の行を探す */
  private grantIdOf(id: string, payload: OAuthStorePayload): string | null {
    if (this.model === 'Grant') {
      return id;
    }
    return GRANT_BOUND_KINDS.has(this.model) && typeof payload.grantId === 'string'
      ? payload.grantId
      : null;
  }

  private isReadable(row: { expiresAt: Date | null; consumedAt: Date | null }): boolean {
    if (row.expiresAt === null || row.expiresAt > this.now()) {
      return true;
    }
    return row.consumedAt !== null && REUSE_DETECTED_KINDS.has(this.model);
  }

  private toPayload(
    row: { payload: unknown; consumedAt: Date | null },
    presentedValue?: string
  ): OAuthStorePayload {
    if (typeof row.payload !== 'object' || row.payload === null || Array.isArray(row.payload)) {
      throw new OAuthStoreError('read');
    }
    return {
      ...(row.payload as OAuthStorePayload),
      ...(HMAC_KEYED_KINDS.has(this.model) ? { jti: presentedValue } : {}),
      ...(row.consumedAt ? { consumed: Math.floor(row.consumedAt.getTime() / 1000) } : {}),
    };
  }

  private async guard<T>(operation: string, action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof OAuthStoreError) {
        throw error;
      }
      throw new OAuthStoreError(operation, safeErrorCode(error));
    }
  }
}

/**
 * oidc-provider の `adapter` に渡すファクトリーを作る
 *
 * @param deps - 依存
 * @returns モデル名からアダプターを作る関数
 * @throws {OAuthStoreError} 鍵の形が不正なとき（鍵の値は文に含めない）
 */
export function createOAuthStoreAdapterFactory(
  deps: OAuthStoreAdapterDeps
): (model: string) => OAuthStoreAdapter {
  if (!TOKEN_HMAC_KEY_PATTERN.test(deps.tokenHmacKey)) {
    throw new OAuthStoreError('configure');
  }
  const hmacKey = Buffer.from(deps.tokenHmacKey, 'hex');
  const revocations = new Map<string, Promise<void>>();
  return (model) => new OAuthStoreAdapter(model, deps, hmacKey, revocations);
}
