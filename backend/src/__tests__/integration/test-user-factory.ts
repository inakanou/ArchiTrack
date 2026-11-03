/**
 * @fileoverview 統合テストで利用者を作る共通の部品（タスク47.3）
 *
 * 統合テストは利用者を Prisma で直接作らず、この部品を経由する。既定の状態は、本番で全利用者に求める状態
 * （2FA 登録済み・有効・初回のパスワード変更を要しない）とし、状態を検証するテストだけが引数で変える。
 *
 * - 2FA の秘密鍵は、本番と同じ `TwoFactorService.encryptSecret`（`TWO_FACTOR_ENCRYPTION_KEY` による
 *   AES-256-GCM）で暗号化して保存する。ログインは 47.2 の補助（`auth-login-client.ts`）が復号して TOTP を
 *   計算するので、既定の利用者でもテストはコードを意識せずにログインできる
 * - バックアップコードは作らない。2FA 登録済みの状態は `twoFactorEnabled` と秘密鍵で決まり、本番でも
 *   全てのコードを使い切った利用者はコードを持たない。バックアップコードを検証するテストは自分で作る
 * - 状態の項目（`twoFactorEnabled`・`twoFactorSecret`・`isActive`・`mustChangePassword`）はデータに
 *   書かせず、必ず状態の引数で与える（既定を黙って上書きさせないため）
 * - DB を直接書いたので、作成の後に利用者の状態のキャッシュを本番の無効化の部品
 *   （AuthenticatedUserStateService.invalidate）で消す（タスク47.5）。Redis を初期化していない
 *   テストでは何もしない
 */

import { authenticator } from 'otplib';
import type { Prisma, User } from '../../generated/prisma/client.js';

/** 利用者を作れるクライアント（`PrismaClient` とトランザクションのクライアントの両方を受ける） */
export type TestUserClient = Pick<Prisma.TransactionClient, 'user'>;

/** 状態の項目を除いた利用者のデータ */
export type TestUserData = Omit<
  Prisma.UserCreateInput,
  'twoFactorEnabled' | 'twoFactorSecret' | 'isActive' | 'mustChangePassword'
>;

/** 利用者の状態（省略した項目は既定の状態） */
export interface TestUserState {
  /**
   * 2FA の登録（既定: `true`）
   *
   * - `true`: 無作為の秘密鍵で登録済み
   * - `{ secret }`: 与えた Base32 の秘密鍵で登録済み（テストがコードを自分で計算するとき）
   * - `false`: 未登録（秘密鍵なし）
   */
  twoFactor?: boolean | { secret: string };
  /** 有効か（既定: `true`） */
  isActive?: boolean;
  /** 初回のパスワード変更を要するか（既定: `false`） */
  mustChangePassword?: boolean;
}

/**
 * 本番の `TwoFactorService` で秘密鍵を暗号化する
 *
 * サービスは使う時に読み込む。環境変数を書き換えてからアプリと DB の接続を読み込む統合テスト
 * （DB 接続のタイムアウトの検証など）が、この部品の import でそれより先に読み込ませないため。
 */
async function encryptSecret(plainSecret: string): Promise<string> {
  const { TwoFactorService } = await import('../../services/two-factor.service.js');
  return new TwoFactorService().encryptSecret(plainSecret);
}

/**
 * 利用者の状態のキャッシュを、本番の無効化の部品で消す（タスク47.5）
 *
 * サービスは暗号化と同じ理由で使う時に読み込む。
 */
export async function invalidateUserStateCache(userId: string): Promise<void> {
  const { getSharedAuthenticatedUserStateService } =
    await import('../../services/authenticated-user-state.service.js');
  await getSharedAuthenticatedUserStateService().invalidate(userId);
}

async function stateFields(
  state: TestUserState
): Promise<
  Pick<
    Prisma.UserCreateInput,
    'twoFactorEnabled' | 'twoFactorSecret' | 'isActive' | 'mustChangePassword'
  >
> {
  const twoFactor = state.twoFactor ?? true;
  const plainSecret =
    twoFactor === false
      ? null
      : twoFactor === true
        ? authenticator.generateSecret()
        : twoFactor.secret;
  return {
    twoFactorEnabled: plainSecret !== null,
    twoFactorSecret: plainSecret === null ? null : await encryptSecret(plainSecret),
    isActive: state.isActive ?? true,
    mustChangePassword: state.mustChangePassword ?? false,
  };
}

/**
 * 利用者を一人作る
 *
 * @param client - 作成に使うクライアント（トランザクションの中ではそのクライアント）
 * @param data - 状態の項目を除いた利用者のデータ（入れ子の作成を含められる）
 * @param state - 既定から変える状態
 * @returns 作成した利用者
 */
export async function createTestUser(
  client: TestUserClient,
  data: TestUserData,
  state: TestUserState = {}
): Promise<User> {
  const user = await client.user.create({ data: { ...data, ...(await stateFields(state)) } });
  await invalidateUserStateCache(user.id);
  return user;
}

/**
 * 複数の利用者を、同じ状態で順に作る
 *
 * @param client - 作成に使うクライアント
 * @param data - 各利用者のデータ
 * @param state - 全員に与える状態
 * @returns 作成した利用者（`data` と同じ順）
 */
export async function createTestUsers(
  client: TestUserClient,
  data: readonly TestUserData[],
  state: TestUserState = {}
): Promise<User[]> {
  const users: User[] = [];
  for (const entry of data) {
    users.push(await createTestUser(client, entry, state));
  }
  return users;
}
