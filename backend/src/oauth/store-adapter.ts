/**
 * @fileoverview 認可サーバー（oidc-provider）の保存アダプター（user-authentication タスク 73.1）
 *
 * アクセストークン・リフレッシュトークン・認可コードは、キーを HMAC にして本体から値を除き、
 * DB の値だけではトークンを復元できない形で保存する（要件48.7、48.8）。読み出しでは提示された値を
 * `jti` に戻す。接続のサービスは参照せず、Grant の失効は注入された処理へ渡す。
 *
 * 使用済みの値の再提示（タスク 73.3、要件47.10、48.6、48.11）:
 * - ライブラリは期限・Grant・PKCE を確かめた後に `consumed` を見るので、`find` の時点で検知する。
 *   `find` はクライアント認証の後の `/oauth/token` の処理からだけ呼ばれ、かつ認証したアプリが行の持ち主の
 *   ときだけ判定する。認証に失敗した要求と別のアプリの要求は、猶予にも失効にも進まない
 * - リフレッシュトークンの消費は、後継の保存と同じトランザクションで行う。後継を保存できなければ消費も戻る
 * - トークンの行の書き込みは、先に Grant の行をロックする（順序は Grant の行 → トークンの行）
 *
 * Design: Requirements 46-51 > OAuthStoreAdapter
 *
 * @module oauth/store-adapter
 */

import { AsyncLocalStorage } from 'async_hooks';
import { createHmac } from 'crypto';
import Provider, { errors, type OidcContext } from 'oidc-provider';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { RequestContext } from '../types/auth.types.js';
import type { RefreshGraceHandler, TokenReuseEvent, TokenReuseHandler } from './oauth.types.js';

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

/** 置き換えの後に同じトークンの再提示を猶予する時間（要件48.11） */
const REFRESH_GRACE_MS = 30_000;
/** 複数のインスタンスの時計のずれとして許す、未来の置き換えの日時の上限 */
const REFRESH_GRACE_CLOCK_SKEW_MS = 5_000;
/** Grant の行のロックを待つトランザクションの上限 */
const GRANT_LOCK_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const;
const TOKEN_ROUTE = 'token';
const REFRESH_GRANT_TYPE = 'refresh_token';

/** アダプターが使う DB の範囲 */
export type OAuthStoreDb = Pick<PrismaClient, 'oAuthStoreRecord' | '$transaction'>;

type StoreRow = NonNullable<Awaited<ReturnType<PrismaClient['oAuthStoreRecord']['findUnique']>>>;
type StoreReader = Pick<Prisma.TransactionClient, 'oAuthStoreRecord'>;

/** リフレッシュトークンの置き換えの記録。後継は HMAC の ID で持ち、値を持たない */
interface RotationRecord {
  readonly replacedAt: number;
  readonly successorId: string;
}

type RotationOutcome = 'rotated' | 'grace' | 'reuse';

/** ライブラリと受け渡す本体 */
export type OAuthStorePayload = Record<string, unknown>;

/** アダプターの依存 */
export interface OAuthStoreAdapterDeps {
  readonly prisma: OAuthStoreDb;
  /** `OAUTH_TOKEN_HMAC_KEY`（64 桁の 16 進） */
  readonly tokenHmacKey: string;
  /** ライブラリの Grant の失効を受け取る処理 */
  readonly onGrantRevoked: TokenReuseHandler;
  /** 更新の猶予を適用したときの監査の処理（判定はタスク73.3） */
  readonly onRefreshGraceApplied: RefreshGraceHandler;
  /** 現在の要求の送信元 */
  readonly getRequestSource: () => RequestContext;
  /**
   * 認可コードを消費する前の要求の検証。ライブラリは `resource` をコードの消費の後に検証するので、
   * 誤った `resource` の要求でコードを使用済みにしないためにここで拒否する
   */
  readonly assertCodeExchangeRequest?: (ctx: OidcContext) => void;
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

/** 申し込み（Interaction）の読み書きに使うトランザクション。`active` は文脈の終了で false になる */
interface InteractionTransactionScope {
  readonly tx: StoreReader;
  active: boolean;
}

const interactionTransaction = new AsyncLocalStorage<InteractionTransactionScope>();

/**
 * `run` の中の Interaction の `find` と `upsert` だけを、呼び出し元のトランザクションで行う
 *
 * 同意の結果を接続の作成と同じトランザクションで確定させ、未確定の結果を再開の要求から読めなくする。
 * 他のモデルの経路は変えない。`run` の終了後に残った処理は、終わった `tx` を使わず失敗する。
 *
 * @param tx - 呼び出し元のトランザクション
 * @param run - 同じトランザクションで申し込みを読み書きする処理
 * @returns `run` の結果
 */
export async function withInteractionTransaction<T>(
  tx: Prisma.TransactionClient,
  run: () => Promise<T>
): Promise<T> {
  const scope: InteractionTransactionScope = { tx, active: true };
  try {
    return await interactionTransaction.run(scope, run);
  } finally {
    scope.active = false;
  }
}

function safeErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && PRISMA_ERROR_CODE_PATTERN.test(code) ? code : undefined;
}

function readRotation(payload: unknown): RotationRecord | null {
  const rotation = (payload as { rotation?: Partial<RotationRecord> } | null)?.rotation;
  return typeof rotation?.replacedAt === 'number' && typeof rotation.successorId === 'string'
    ? { replacedAt: rotation.replacedAt, successorId: rotation.successorId }
    : null;
}

function withRotation(payload: unknown, rotation: RotationRecord): Prisma.InputJsonObject {
  return { ...(payload as Prisma.JsonObject), rotation: { ...rotation } };
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
      const { grantId } = data;
      if (grantId === null || this.model === 'Grant') {
        await this.recordClient().oAuthStoreRecord.upsert({
          where: { id: recordId },
          create: { id: recordId, ...data },
          update: data,
        });
        return;
      }

      const rotatedId = this.rotatedRecordId(id);
      const outcome = await this.deps.prisma.$transaction(async (tx) => {
        await this.lockExistingGrant(tx, grantId);
        const rotation = rotatedId
          ? await this.applyRotation(tx, grantId, rotatedId, recordId)
          : null;
        if (rotation !== 'reuse') {
          await tx.oAuthStoreRecord.upsert({
            where: { id: recordId },
            create: { id: recordId, ...data },
            update: data,
          });
        }
        return rotation;
      }, GRANT_LOCK_TRANSACTION_OPTIONS);

      if (outcome === 'reuse') {
        await this.runRevocation(grantId, 'refresh_token');
        throw new errors.InvalidGrant('refresh token already used');
      }
      if (outcome === 'grace') {
        const source = this.deps.getRequestSource();
        await this.deps.onRefreshGraceApplied({
          grantId,
          ipAddress: source.ipAddress ?? null,
          userAgent: source.userAgent ?? null,
        });
      }
    });
  }

  /**
   * 行を読み、ライブラリの形へ戻す。
   * 期限切れの行は返さない。ただし使用済みの認可コードとリフレッシュトークンは再利用の検知のために読む。
   * トークンの窓口で持ち主のアプリが提示した使用済みの値は、ここで猶予か再利用かを決める
   *
   * @param id - ライブラリの ID
   */
  async find(id: string): Promise<OAuthStorePayload | undefined> {
    return this.guard('find', async () => {
      const row = await this.recordClient().oAuthStoreRecord.findUnique({
        where: { id: this.recordId(id) },
      });
      if (!row || !this.isReadable(row)) {
        return undefined;
      }
      if (row.consumedAt !== null && this.isPresentedByOwner(row)) {
        return this.resolveConsumedPresentation(row, id);
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
   * 未使用の行を条件付きの更新で使用済みにする。競合に負けた要求は再利用として扱う。
   *
   * トークンの窓口の更新では、ここでは書き込まず、後継の保存（`upsert`）と同じトランザクションで消費する。
   * ライブラリはこの直後に必ず後継を保存するので、後継を保存できなければ消費も残らない
   *
   * @param id - ライブラリの ID
   */
  async consume(id: string): Promise<void> {
    await this.guard('consume', async () => {
      const ctx = Provider.ctx;
      if (this.model === 'RefreshToken' && this.isRefreshRequest(ctx)) {
        return;
      }
      if (this.model === 'AuthorizationCode' && ctx?.oidc.route === TOKEN_ROUTE) {
        this.deps.assertCodeExchangeRequest?.(ctx);
      }

      const recordId = this.recordId(id);
      const row = await this.deps.prisma.oAuthStoreRecord.findUnique({ where: { id: recordId } });
      if (!row) {
        throw new errors.InvalidGrant('token not found');
      }
      const consumedAt = this.now();
      const { grantId } = row;
      const count =
        grantId === null
          ? (
              await this.deps.prisma.oAuthStoreRecord.updateMany({
                where: { id: recordId, consumedAt: null },
                data: { consumedAt },
              })
            ).count
          : await this.deps.prisma.$transaction(async (tx) => {
              await this.lockExistingGrant(tx, grantId);
              const updated = await tx.oAuthStoreRecord.updateMany({
                where: { id: recordId, consumedAt: null },
                data: { consumedAt },
              });
              return updated.count;
            }, GRANT_LOCK_TRANSACTION_OPTIONS);
      if (count > 0) {
        return;
      }
      if (grantId !== null) {
        await this.runRevocation(grantId, this.reuseKind());
      }
      throw new errors.InvalidGrant('token already used');
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
    return this.runRevocation(grantId, 'grant_revocation');
  }

  /** 再利用の処理を実行する。進行中の同じ Grant の処理にはまとめる。失敗は呼び出し元へ伝える */
  private runRevocation(grantId: string, kind: TokenReuseEvent['kind']): Promise<void> {
    const pending = this.revocations.get(grantId);
    if (pending) {
      return pending;
    }
    const running = this.guard('revokeByGrantId', async () => {
      const source = this.deps.getRequestSource();
      await this.deps.onGrantRevoked({
        grantId,
        kind,
        ipAddress: source.ipAddress ?? null,
        userAgent: source.userAgent ?? null,
      });
    }).finally(() => {
      this.revocations.delete(grantId);
    });
    this.revocations.set(grantId, running);
    return running;
  }

  private reuseKind(): TokenReuseEvent['kind'] {
    return this.model === 'AuthorizationCode' ? 'authorization_code' : 'refresh_token';
  }

  /** Grant の行をロックし、無ければトークンを発行させない */
  private async lockExistingGrant(tx: Prisma.TransactionClient, grantId: string): Promise<void> {
    if (!(await this.lockGrantRow(tx, grantId))) {
      throw new errors.InvalidGrant('grant not found');
    }
  }

  /** Grant の行をトランザクションの終わりまでロックする。行があれば true */
  private async lockGrantRow(tx: Prisma.TransactionClient, grantId: string): Promise<boolean> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "oauth_store_records"
      WHERE "grant_id" = ${grantId} AND "kind" = 'Grant'
      FOR UPDATE`;
    return locked.length > 0;
  }

  private isRefreshRequest(ctx: OidcContext | undefined): boolean {
    return ctx?.oidc.route === TOKEN_ROUTE && ctx.oidc.params?.grant_type === REFRESH_GRANT_TYPE;
  }

  /**
   * トークンの窓口で、認証したアプリが行の持ち主か。
   * ライブラリは `ctx.oidc.client` をクライアント認証の中で置くが、この保存の読み出しは認証の後の
   * 交換の処理からだけ呼ばれる。持ち主でないアプリの提示で他のアプリの接続を失効させない
   */
  private isPresentedByOwner(row: StoreRow): boolean {
    if (!REUSE_DETECTED_KINDS.has(this.model)) {
      return false;
    }
    const ctx = Provider.ctx;
    const clientId = ctx?.oidc.route === TOKEN_ROUTE ? ctx.oidc.client?.clientId : undefined;
    return (
      clientId !== undefined &&
      (row.payload as { clientId?: unknown } | null)?.clientId === clientId
    );
  }

  /** 使用済みの値の提示を、猶予（未使用の形で返す）か再利用（失効して `invalid_grant`）に振り分ける */
  private async resolveConsumedPresentation(
    row: StoreRow,
    presentedValue: string
  ): Promise<OAuthStorePayload> {
    const { grantId } = row;
    if (grantId === null) {
      throw new errors.InvalidGrant('token already used');
    }
    if (this.model === 'RefreshToken') {
      // 付け替えの途中を読むと未使用の後継を見誤るので、Grant の行をロックして読み直す
      const eligible = await this.deps.prisma.$transaction(async (tx) => {
        if (!(await this.lockGrantRow(tx, grantId))) {
          return null;
        }
        const current = await tx.oAuthStoreRecord.findUnique({ where: { id: row.id } });
        return current && (await this.findUnusedSuccessor(tx, current)) ? current : null;
      }, GRANT_LOCK_TRANSACTION_OPTIONS);
      if (eligible) {
        return this.toGracePayload(eligible, presentedValue);
      }
    }
    await this.runRevocation(grantId, this.reuseKind());
    throw new errors.InvalidGrant('token already used');
  }

  /** 48.11 の時間の条件と、後継が未使用であることを満たすときだけ後継の行を返す */
  private async findUnusedSuccessor(db: StoreReader, row: StoreRow): Promise<StoreRow | null> {
    const rotation = readRotation(row.payload);
    if (row.consumedAt === null || rotation === null) {
      return null;
    }
    // 時計のずれで直後の再試行を失効させないよう、上限までの負の経過だけを猶予の内とする
    const elapsed = this.now().getTime() - rotation.replacedAt;
    if (elapsed > REFRESH_GRACE_MS || elapsed < -REFRESH_GRACE_CLOCK_SKEW_MS) {
      return null;
    }
    const successor = await db.oAuthStoreRecord.findUnique({ where: { id: rotation.successorId } });
    return successor?.grantId === row.grantId && successor.consumedAt === null ? successor : null;
  }

  /** 更新の要求で今回置き換えるトークンの行の ID。ライブラリが消費の直後に文脈へ置く */
  private rotatedRecordId(id: string): string | null {
    if (this.model !== 'RefreshToken') {
      return null;
    }
    const ctx = Provider.ctx;
    const rotated = this.isRefreshRequest(ctx) ? ctx?.oidc.entities.RotatedRefreshToken : undefined;
    return rotated && rotated.jti !== id ? this.recordId(rotated.jti) : null;
  }

  /**
   * Grant の行のロックの中で置き換えを確定する。
   * 未使用なら条件付きで消費する。使用済みなら猶予を判定し直し、当たれば未使用の後継を置き換え済みにして、
   * 後継を指していた同じ Grant の全ての行を新しいトークンへ付け替える
   */
  private async applyRotation(
    tx: Prisma.TransactionClient,
    grantId: string,
    rotatedId: string,
    newId: string
  ): Promise<RotationOutcome> {
    const rotated = await tx.oAuthStoreRecord.findUnique({ where: { id: rotatedId } });
    if (rotated?.grantId !== grantId) {
      throw new errors.InvalidGrant('refresh token not found');
    }
    const now = this.now();
    const rotation: RotationRecord = { replacedAt: now.getTime(), successorId: newId };
    if (rotated.consumedAt === null) {
      const { count } = await tx.oAuthStoreRecord.updateMany({
        where: { id: rotatedId, consumedAt: null },
        data: { consumedAt: now, payload: withRotation(rotated.payload, rotation) },
      });
      return count === 1 ? 'rotated' : 'reuse';
    }

    const successor = await this.findUnusedSuccessor(tx, rotated);
    if (successor === null) {
      return 'reuse';
    }
    await tx.$executeRaw`
      UPDATE "oauth_store_records"
      SET "payload" = jsonb_set("payload", '{rotation,successorId}', to_jsonb(${newId}::text))
      WHERE "grant_id" = ${grantId}
        AND "kind" = 'RefreshToken'
        AND "payload" #>> '{rotation,successorId}' = ${successor.id}`;
    const { count } = await tx.oAuthStoreRecord.updateMany({
      where: { id: successor.id, consumedAt: null },
      data: { consumedAt: now, payload: withRotation(successor.payload, rotation) },
    });
    return count === 1 ? 'grace' : 'reuse';
  }

  /** 行を読み書きする接続。文脈の中の Interaction だけが呼び出し元のトランザクションを使う */
  private recordClient(): StoreReader {
    const scope = this.model === 'Interaction' ? interactionTransaction.getStore() : undefined;
    if (!scope) {
      return this.deps.prisma;
    }
    if (!scope.active) {
      throw new OAuthStoreError('interaction transaction ended');
    }
    return scope.tx;
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
    const { rotation: _rotation, ...body } = row.payload as OAuthStorePayload;
    return {
      ...body,
      ...(HMAC_KEYED_KINDS.has(this.model) ? { jti: presentedValue } : {}),
      ...(row.consumedAt ? { consumed: Math.floor(row.consumedAt.getTime() / 1000) } : {}),
    };
  }

  /**
   * 猶予に当たるトークンを未使用の形で返す。
   * 猶予の間に元の期限を過ぎていても再発行できるよう、期限を猶予の終わりまで延ばして返す（行は変えない）
   */
  private toGracePayload(row: StoreRow, presentedValue: string): OAuthStorePayload {
    const { consumed: _consumed, ...payload } = this.toPayload(row, presentedValue);
    const rotation = readRotation(row.payload);
    if (rotation !== null && typeof payload.exp === 'number') {
      payload.exp = Math.max(
        payload.exp,
        Math.ceil((rotation.replacedAt + REFRESH_GRACE_MS) / 1000)
      );
    }
    return payload;
  }

  private async guard<T>(operation: string, action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof OAuthStoreError || error instanceof errors.OIDCProviderError) {
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
