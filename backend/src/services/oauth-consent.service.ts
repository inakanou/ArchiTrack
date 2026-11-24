/**
 * @fileoverview 外部アプリの接続の同意の手続き（user-authentication タスク 74.2）
 *
 * 申し込みの確認、同意専用の 2FA の通過の印、同意、拒否を扱う。HTTP の API はタスク74.3 が持つ。
 *
 * - 失効の世代は、権限と状態の確認より前に読んで Redis で申し込みと利用者に結び付ける。
 *   クライアントの値を使わないので、確認の後に失効が進むと `createOrReplace` が衝突として拒む
 * - 通過の印はログインの資格（`2fa:challenge:`）と別の鍵に置き、申し込みと利用者を鍵に含める。
 *   5 分で切れ、`GETDEL` で 1 回だけ消費する。値は結び付けた世代で、資格の文字列を持たない
 * - 認可サーバーのセッションの Cookie を外しているので（タスク73.2）、実際の申し込みの prompt は
 *   `login` になる。`login` と `consent` のどちらも同じ手続きで受け、結果に両方を書く
 * - ログへ要求の値・コード・トークンを渡さない（要件48.8）
 *
 * Design: Requirements 46-51 > ConsentInteractionService
 *
 * @requirement user-authentication/REQ-46.2
 * @requirement user-authentication/REQ-46.3
 * @requirement user-authentication/REQ-46.7
 * @requirement user-authentication/REQ-47.1
 * @requirement user-authentication/REQ-47.2
 * @requirement user-authentication/REQ-47.4
 * @requirement user-authentication/REQ-47.6
 * @requirement user-authentication/REQ-47.7
 * @requirement user-authentication/REQ-47.8
 * @requirement user-authentication/REQ-51.7
 *
 * @module services/oauth-consent
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type Redis from 'ioredis';
import type Provider from 'oidc-provider';
import type { OidcGrant, OidcInteraction } from 'oidc-provider';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { AllowedExternalApp, ExternalAppClientRegistry } from '../oauth/client-registry.js';
import type { ConnectionAuditEvent, ExternalAppScope } from '../oauth/oauth.types.js';
import { withInteractionTransaction } from '../oauth/store-adapter.js';
import type { RequestContext } from '../types/auth.types.js';
import { Err, Ok, type Result } from '../types/result.js';
import logger from '../utils/logger.js';
import {
  ConnectionRevocationConflictError,
  type ExternalAppConnectionService,
} from './external-app-connection.service.js';
import { permissionCovers } from './privilege-ceiling.js';
import type { SecondFactorCode, SecondFactorVerifier } from './second-factor-verifier.service.js';

/** 同意の 2FA の通過の印の有効期間（秒）。5 分 */
export const CONSENT_PASS_TTL_SECONDS = 300;

const OFFLINE_ACCESS_SCOPE = 'offline_access';
const SELECTABLE_SCOPES: readonly ExternalAppScope[] = ['read', 'write'];
const CONNECT_PERMISSION = { resource: 'external_app', action: 'connect' } as const;
/** セッションを使わない構成では `login`、セッションがあれば `consent` で届く */
const CONSENT_PROMPTS: ReadonlySet<string> = new Set(['login', 'consent']);
const GENERATION_PATTERN = /^(0|[1-9]\d{0,14})$/;

/**
 * 通過の印の Redis の鍵。ログインの資格とは別の用途の鍵で、申し込みと利用者に結び付ける
 *
 * @param uid - 申し込みの ID
 * @param userId - 利用者の ID
 * @returns Redis の鍵
 */
export function consentPassKey(uid: string, userId: string): string {
  return `oauth:consent:2fa-pass:${uid}:${userId}`;
}

function generationBindingKey(uid: string, userId: string): string {
  return `oauth:consent:generation:${uid}:${userId}`;
}

function finishClaimKey(uid: string): string {
  return `oauth:consent:finish:${uid}`;
}

/** 同意の手続きの文脈。`uid` は URL の値で、手続きの Cookie の申し込みと一致しなければ扱わない */
export interface InteractionContext {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly uid: string;
  readonly source?: RequestContext;
}

export type ConsentRestriction = 'PASSWORD_CHANGE_REQUIRED' | 'TWO_FACTOR_SETUP_REQUIRED';

/**
 * 同意の手続きの失敗。design.md の 5 種別に、74.3 が応答を分けるために要る種別を足した
 *
 * - `ACCOUNT_RESTRICTED`: 要件46.7 の制限中
 * - `SECOND_FACTOR_LOCKED`: 要件47.3 のロック（解除の時刻を応答に使う）
 * - `SCOPE_NOT_REQUESTED`: 要求に無い範囲の選択（範囲を広げない）
 * - `RECONNECT_REQUIRED`: 開始の後に失効が進んだ。アプリから接続し直す
 * - `SERVICE_UNAVAILABLE`: DB・Redis の失敗（503 相当）
 */
export type ConsentError =
  | { readonly type: 'INTERACTION_NOT_FOUND' }
  | { readonly type: 'PERMISSION_REQUIRED' }
  | { readonly type: 'ACCOUNT_RESTRICTED'; readonly restriction: ConsentRestriction }
  | { readonly type: 'SECOND_FACTOR_REQUIRED' }
  | { readonly type: 'SECOND_FACTOR_FAILED' }
  | { readonly type: 'SECOND_FACTOR_LOCKED'; readonly unlockAt: Date }
  | { readonly type: 'READ_SCOPE_REQUIRED' }
  | { readonly type: 'SCOPE_NOT_REQUESTED' }
  | { readonly type: 'RECONNECT_REQUIRED' }
  | { readonly type: 'SERVICE_UNAVAILABLE' };

export interface ConsentInteractionView {
  readonly appName: string;
  readonly redirectHost: string;
  readonly account: { readonly displayName: string; readonly email: string };
  readonly requestedScopes: readonly ExternalAppScope[];
  readonly idleDays: 30;
  readonly absoluteDays: 90;
  readonly secondFactorVerified: boolean;
}

export interface ConsentInteractionServiceDependencies {
  readonly prisma: PrismaClient;
  readonly provider: Provider;
  readonly connectionService: Pick<ExternalAppConnectionService, 'createOrReplace' | 'recordEvent'>;
  readonly secondFactorVerifier: Pick<SecondFactorVerifier, 'verify'>;
  readonly clientRegistry: Pick<ExternalAppClientRegistry, 'loadAllowedClients'>;
  readonly resourceUrl: string;
  /** Redis のクライアントを呼び出しの時点で返す（起動後に接続されるため） */
  readonly getRedis: () => Redis | null;
}

/** 確かめた申し込み */
interface LoadedInteraction {
  readonly interaction: OidcInteraction;
  readonly client: AllowedExternalApp;
  /** 要求された全ての範囲（重複なし） */
  readonly requested: ReadonlySet<string>;
  /** 要求のうち利用者が選べる範囲 */
  readonly selectable: readonly ExternalAppScope[];
}

function epochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

function parseGeneration(stored: string | null): number | null {
  return stored !== null && GENERATION_PATTERN.test(stored) ? Number(stored) : null;
}

/** 選ばれた範囲を検証する。要求に無い範囲へ広げず、`read` を必須とする（要件47.5） */
function resolveGrantedScopes(
  loaded: LoadedInteraction,
  selected: readonly string[]
): Result<ExternalAppScope[], ConsentError> {
  if (!loaded.selectable.includes('read')) {
    return Err({ type: 'READ_SCOPE_REQUIRED' });
  }
  const allowed: ReadonlySet<string> = new Set(loaded.selectable);
  if (selected.some((scope) => !allowed.has(scope))) {
    return Err({ type: 'SCOPE_NOT_REQUESTED' });
  }
  if (!selected.includes('read')) {
    return Err({ type: 'READ_SCOPE_REQUIRED' });
  }
  return Ok(SELECTABLE_SCOPES.filter((scope) => selected.includes(scope)));
}

export class ConsentInteractionService {
  constructor(private readonly deps: ConsentInteractionServiceDependencies) {}

  /**
   * 申し込みの内容を返す。最初に失効の世代を結び付けてから権限と状態を確かめる（要件46.2、46.3、46.7、47.4）
   *
   * @param ctx - 手続きの文脈
   * @param userId - ログイン中の利用者
   * @returns 同意画面の内容
   */
  async getInteraction(
    ctx: InteractionContext,
    userId: string
  ): Promise<Result<ConsentInteractionView, ConsentError>> {
    return this.guarded('getInteraction', async () => {
      const loaded = await this.loadInteraction(ctx, userId);
      if (!loaded) {
        return Err({ type: 'INTERACTION_NOT_FOUND' });
      }
      const generation = await this.bindGeneration(loaded.interaction, userId);
      if (generation === null) {
        return Err({ type: 'INTERACTION_NOT_FOUND' });
      }
      const refused = await this.checkEligibility(userId);
      if (refused) {
        return Err(refused);
      }
      if (!loaded.selectable.includes('read')) {
        return Err({ type: 'READ_SCOPE_REQUIRED' });
      }
      const account = await this.deps.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true, email: true },
      });
      if (!account) {
        return Err({ type: 'INTERACTION_NOT_FOUND' });
      }
      const passed = await this.readyRedis().exists(consentPassKey(ctx.uid, userId));
      return Ok({
        appName: loaded.client.displayName,
        redirectHost: new URL(String(loaded.interaction.params.redirect_uri)).hostname,
        account,
        requestedScopes: loaded.selectable,
        idleDays: 30,
        absoluteDays: 90,
        secondFactorVerified: passed === 1,
      });
    });
  }

  /**
   * 2FA を検証し、申し込みと利用者に結び付いた通過の印を記録する（要件47.2）
   *
   * 2FA 未登録の利用者は状態の確認で止まり、`verify` に届かない（届くと失敗が数えられる）。
   * 結び付けた世代が無ければ照合せず `RECONNECT_REQUIRED` を返し、コードを使用済みにしない。
   * Redis が使えないときは照合の前に止め、コードを使用済みにしない。
   *
   * @param ctx - 手続きの文脈
   * @param userId - ログイン中の利用者
   * @param code - TOTP またはバックアップコード
   * @returns 検証の結果
   */
  async verifySecondFactor(
    ctx: InteractionContext,
    userId: string,
    code: SecondFactorCode
  ): Promise<Result<void, ConsentError>> {
    return this.guarded('verifySecondFactor', async () => {
      const loaded = await this.loadInteraction(ctx, userId);
      if (!loaded) {
        return Err({ type: 'INTERACTION_NOT_FOUND' });
      }
      // 世代を新しく結び付けるのは getInteraction だけ。鍵が消えたら開始後の失効を判定できない
      const generation = parseGeneration(
        await this.readyRedis().get(generationBindingKey(ctx.uid, userId))
      );
      if (generation === null) {
        return Err({ type: 'RECONNECT_REQUIRED' });
      }
      const refused = await this.checkEligibility(userId);
      if (refused) {
        return Err(refused);
      }
      if (!loaded.selectable.includes('read')) {
        return Err({ type: 'READ_SCOPE_REQUIRED' });
      }
      const redis = this.readyRedis();
      const verified = await this.deps.secondFactorVerifier.verify(
        userId,
        code,
        'oauth_consent',
        ctx.source ?? {}
      );
      if (!verified.ok) {
        return verified.error.type === 'ACCOUNT_LOCKED'
          ? Err({ type: 'SECOND_FACTOR_LOCKED', unlockAt: verified.error.unlockAt })
          : Err({ type: 'SECOND_FACTOR_FAILED' });
      }
      await redis.set(
        consentPassKey(ctx.uid, userId),
        String(generation),
        'EX',
        CONSENT_PASS_TTL_SECONDS
      );
      return Ok(undefined);
    });
  }

  /**
   * 同意する。Grant を保存してから接続と監査を 1 つのトランザクションで作る（要件47.6、47.8）
   *
   * Grant を接続の `consentedAt` より先に作るので、トークンが接続より長く生きない。
   * 途中で失敗したら保存した Grant を消し、Grant・接続・トークンを残さない。
   *
   * @param ctx - 手続きの文脈
   * @param userId - ログイン中の利用者
   * @param scopes - 利用者が選んだ範囲
   * @returns 再開の URL
   */
  async approve(
    ctx: InteractionContext,
    userId: string,
    scopes: readonly ExternalAppScope[]
  ): Promise<Result<{ redirectTo: string }, ConsentError>> {
    return this.guarded('approve', async () => {
      const loaded = await this.loadInteraction(ctx, userId);
      if (!loaded) {
        return Err({ type: 'INTERACTION_NOT_FOUND' });
      }
      const granted = resolveGrantedScopes(loaded, scopes);
      if (!granted.ok) {
        return granted;
      }
      // 開始の時点だけでなく、確定の時点の DB の値で権限と状態を確かめる
      const refused = await this.checkEligibility(userId);
      if (refused) {
        return Err(refused);
      }

      const redis = this.readyRedis();
      const generation = parseGeneration(await redis.getdel(consentPassKey(ctx.uid, userId)));
      if (generation === null) {
        return Err({ type: 'SECOND_FACTOR_REQUIRED' });
      }
      if (!(await this.claimFinish(redis, loaded.interaction))) {
        return Err({ type: 'INTERACTION_NOT_FOUND' });
      }

      try {
        return await this.createConnection(ctx, userId, loaded, granted.value, generation);
      } catch (error) {
        await this.releaseFinish(ctx.uid);
        throw error;
      }
    });
  }

  /**
   * 拒否する。接続もトークンも作らず、監査に残して `access_denied` を戻り先へ返す（要件47.7）
   *
   * 権限のない利用者や制限中の利用者もアプリへ戻せるよう、権限と状態を確かめない。
   *
   * @param ctx - 手続きの文脈
   * @param userId - ログイン中の利用者
   * @returns 再開の URL
   */
  async deny(
    ctx: InteractionContext,
    userId: string
  ): Promise<Result<{ redirectTo: string }, ConsentError>> {
    return this.guarded('deny', async () => {
      const loaded = await this.loadInteraction(ctx, userId);
      if (!loaded) {
        return Err({ type: 'INTERACTION_NOT_FOUND' });
      }
      const user = await this.deps.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        return Err({ type: 'INTERACTION_NOT_FOUND' });
      }
      const redis = this.readyRedis();
      if (!(await this.claimFinish(redis, loaded.interaction))) {
        return Err({ type: 'INTERACTION_NOT_FOUND' });
      }

      try {
        const event = this.auditEvent(
          'CONSENT_DENIED',
          ctx,
          userId,
          loaded.client.clientId,
          loaded.selectable,
          new Date()
        );
        // 監査と申し込みの結果を同じトランザクションで確定する（拒否だけが届いて監査が欠けない）
        const redirectTo = await this.deps.prisma.$transaction(
          async (tx) => {
            await this.deps.connectionService.recordEvent(event, tx);
            return withInteractionTransaction(tx, () =>
              this.deps.provider.interactionResult(ctx.req, ctx.res, {
                error: 'access_denied',
                error_description: 'The user denied the connection',
              })
            );
          },
          { isolationLevel: 'ReadCommitted' }
        );
        return Ok({ redirectTo });
      } catch (error) {
        await this.releaseFinish(ctx.uid);
        throw error;
      }
    });
  }

  /** Grant の保存 → 接続と監査のトランザクション → 申し込みへの結果の書き込み */
  private async createConnection(
    ctx: InteractionContext,
    userId: string,
    loaded: LoadedInteraction,
    granted: readonly ExternalAppScope[],
    generation: number
  ): Promise<Result<{ redirectTo: string }, ConsentError>> {
    const { clientId } = loaded.client;
    const grant = this.buildGrant(userId, clientId, loaded.requested, granted);
    const grantId = await grant.save();

    try {
      // Grant の保存より後の時刻にし、接続の期限が Grant の期限より前にならないようにする
      const consentedAt = new Date();
      // 申し込みの結果を接続と監査と同じトランザクションで確定する。失敗すれば全て戻り、
      // 再開はコードを出さず同意の手続きへ戻る。コミットの前の結果は再開の要求から読めない
      const redirectTo = await this.deps.prisma.$transaction(
        async (tx) => {
          await this.deps.connectionService.createOrReplace(
            {
              userId,
              clientId,
              grantId,
              scopes: granted,
              consentedAt,
              expectedRevocationGeneration: generation,
              source: ctx.source,
            },
            tx
          );
          await this.deps.connectionService.recordEvent(
            this.auditEvent('CONSENT_GRANTED', ctx, userId, clientId, granted, consentedAt),
            tx
          );
          return withInteractionTransaction(tx, () =>
            this.deps.provider.interactionResult(ctx.req, ctx.res, {
              login: { accountId: userId },
              consent: { grantId },
            })
          );
        },
        { isolationLevel: 'ReadCommitted' }
      );
      return Ok({ redirectTo });
    } catch (error) {
      await this.destroyGrant(grant);
      if (error instanceof ConnectionRevocationConflictError) {
        await this.releaseFinish(ctx.uid);
        return Err({ type: 'RECONNECT_REQUIRED' });
      }
      throw error;
    }
  }

  /** 再度の同意でも常に新しい Grant を作る。同意した範囲はリソース側へ付ける */
  private buildGrant(
    userId: string,
    clientId: string,
    requested: ReadonlySet<string>,
    granted: readonly ExternalAppScope[]
  ): OidcGrant {
    const { resourceUrl } = this.deps;
    const grant = new this.deps.provider.Grant({ accountId: userId, clientId });
    grant.addResourceScope(resourceUrl, granted.join(' '));
    const grantedSet: ReadonlySet<string> = new Set(granted);
    const rejected = [...requested].filter(
      (scope) => scope !== OFFLINE_ACCESS_SCOPE && !grantedSet.has(scope)
    );
    if (rejected.length > 0) {
      grant.rejectResourceScope(resourceUrl, rejected.join(' '));
    }
    if (requested.has(OFFLINE_ACCESS_SCOPE)) {
      grant.addOIDCScope(OFFLINE_ACCESS_SCOPE);
    }
    return grant;
  }

  /** 保存した Grant を消す。消せなくても元の失敗を呼び出し元へ返す */
  private async destroyGrant(grant: OidcGrant): Promise<void> {
    try {
      await grant.destroy();
    } catch (error) {
      logger.error({ errorName: errorName(error) }, 'Failed to remove OAuth grant after failure');
    }
  }

  /**
   * 申し込みを読み、この利用者が扱える状態かを確かめる
   *
   * @returns 扱えないとき（無い・期限切れ・済んだ・別の URL・別の利用者・許可外のアプリ）は null
   */
  private async loadInteraction(
    ctx: InteractionContext,
    userId: string
  ): Promise<LoadedInteraction | null> {
    let interaction: OidcInteraction;
    try {
      interaction = await this.deps.provider.interactionDetails(ctx.req, ctx.res);
    } catch (error) {
      if (errorName(error) === 'SessionNotFound') {
        return null;
      }
      throw error;
    }
    if (
      interaction.uid !== ctx.uid ||
      interaction.result !== undefined ||
      interaction.exp <= epochSeconds() ||
      !CONSENT_PROMPTS.has(interaction.prompt.name)
    ) {
      return null;
    }
    const sessionAccount = interaction.session?.accountId;
    if (sessionAccount !== undefined && sessionAccount !== userId) {
      return null;
    }
    const client = this.deps.clientRegistry
      .loadAllowedClients()
      .find((candidate) => candidate.clientId === interaction.params.client_id);
    if (!client) {
      return null;
    }
    const rawScope = interaction.params.scope;
    const requested = new Set(
      (typeof rawScope === 'string' ? rawScope : '').split(' ').filter((scope) => scope !== '')
    );
    return {
      interaction,
      client,
      requested,
      selectable: SELECTABLE_SCOPES.filter((scope) => requested.has(scope)),
    };
  }

  /**
   * 失効の世代を申し込みと利用者に結び付ける。最初の 1 回の値を保ち、後から新しい世代へ変えない
   *
   * @returns 結び付いた世代。利用者がいなければ null
   */
  private async bindGeneration(
    interaction: OidcInteraction,
    userId: string
  ): Promise<number | null> {
    const redis = this.readyRedis();
    const key = generationBindingKey(interaction.uid, userId);
    const existing = parseGeneration(await redis.get(key));
    if (existing !== null) {
      return existing;
    }
    const owner = await this.deps.prisma.user.findUnique({
      where: { id: userId },
      select: { externalAppRevocationGeneration: true },
    });
    if (!owner) {
      return null;
    }
    const ttl = Math.max(1, interaction.exp - epochSeconds());
    const value = String(owner.externalAppRevocationGeneration);
    if ((await redis.set(key, value, 'EX', ttl, 'NX')) === 'OK') {
      return owner.externalAppRevocationGeneration;
    }
    return parseGeneration(await redis.get(key));
  }

  /** 現在の DB の値で状態と権限を確かめる。権限のキャッシュは失効の後も残りうるので使わない */
  private async checkEligibility(userId: string): Promise<ConsentError | null> {
    const user = await this.deps.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true, mustChangePassword: true, twoFactorEnabled: true },
    });
    if (!user?.isActive) {
      return { type: 'PERMISSION_REQUIRED' };
    }
    const assignments = await this.deps.prisma.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            rolePermissions: {
              select: { permission: { select: { resource: true, action: true } } },
            },
          },
        },
      },
    });
    const permitted = assignments.some((assignment) =>
      assignment.role.rolePermissions.some(({ permission }) =>
        permissionCovers(permission, CONNECT_PERMISSION)
      )
    );
    if (!permitted) {
      return { type: 'PERMISSION_REQUIRED' };
    }
    if (user.mustChangePassword) {
      return { type: 'ACCOUNT_RESTRICTED', restriction: 'PASSWORD_CHANGE_REQUIRED' };
    }
    if (!user.twoFactorEnabled) {
      return { type: 'ACCOUNT_RESTRICTED', restriction: 'TWO_FACTOR_SETUP_REQUIRED' };
    }
    return null;
  }

  /** 同意と拒否のどちらか 1 つだけが申し込みを終えられるようにする */
  private async claimFinish(redis: Redis, interaction: OidcInteraction): Promise<boolean> {
    const ttl = Math.max(1, interaction.exp - epochSeconds());
    const claimed = await redis.set(finishClaimKey(interaction.uid), '1', 'EX', ttl, 'NX');
    return claimed === 'OK';
  }

  /** 失敗した手続きの占有を解く。解けなくても期限で消える */
  private async releaseFinish(uid: string): Promise<void> {
    try {
      await this.deps.getRedis()?.del(finishClaimKey(uid));
    } catch (error) {
      logger.warn({ errorName: errorName(error) }, 'Failed to release OAuth consent claim');
    }
  }

  private auditEvent(
    kind: 'CONSENT_GRANTED' | 'CONSENT_DENIED',
    ctx: InteractionContext,
    userId: string,
    clientId: string,
    scopes: readonly ExternalAppScope[],
    occurredAt: Date
  ): ConnectionAuditEvent {
    return {
      kind,
      actorUserId: userId,
      targetUserId: userId,
      clientId,
      scopes,
      reason: null,
      occurredAt,
      ipAddress: ctx.source?.ipAddress ?? null,
      userAgent: ctx.source?.userAgent ?? null,
    };
  }

  /** 使える Redis を返す。使えなければ例外にし、印なしで先へ進ませない */
  private readyRedis(): Redis {
    const client = this.deps.getRedis();
    if (!client || client.status !== 'ready') {
      throw new Error('Redis is not ready');
    }
    return client;
  }

  /** DB・Redis の例外を 503 相当の失敗へ写す。例外の文は要求の値を含みうるので名前だけを記録する */
  private async guarded<T>(
    operation: string,
    run: () => Promise<Result<T, ConsentError>>
  ): Promise<Result<T, ConsentError>> {
    try {
      return await run();
    } catch (error) {
      logger.error({ errorName: errorName(error), operation }, 'OAuth consent operation failed');
      return Err({ type: 'SERVICE_UNAVAILABLE' });
    }
  }
}
