/**
 * @fileoverview 利用者の棚卸しの一覧と絞り込み（user-authentication タスク49.5）
 *
 * Requirements (user-authentication):
 * - REQ-36.10: 全利用者の表示名・メールアドレス・ロール・状態・2FA 登録の有無・最終ログイン日時・作成日時・招待者を返す
 * - REQ-36.11: 状態と最終ログインからの経過日数で絞り込む
 * - REQ-36.12: 一般ユーザーには返さない（権限 user:read は経路が確かめる。要件38.4 で一般ユーザーは持たない）
 *
 * 責任と境界:
 * - 読み取りだけを行い、秘密の値（パスワードのハッシュ・2FA の秘密鍵など）は選択しない
 * - 招待者は利用者の属性 `users.invited_by_id` から引く（招待の行には依存しない）
 * - 最終ログインからの経過日数は、ログインの実績が無い利用者では作成日時から数える（要件36.8 の
 *   自動無効化の起点と同じく、作成をログインの代わりの起点とする）
 * - 並び順は、ログインの実績が無い利用者を先に、続いて最終ログインの古い順、同じなら作成日時の古い順、
 *   ID の順（棚卸しで長く使われていない利用者から確かめるため。決定的な順にする）
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';

/** 1 日のミリ秒 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** 利用者の状態（有効・無効） */
export type UserInventoryStatus = 'active' | 'inactive';

/** 棚卸しの絞り込みとページ */
export interface UserInventoryQuery {
  status?: UserInventoryStatus;
  /** 最終ログイン（実績が無ければ作成日時）からの経過日数がこの値以上の利用者に絞る */
  inactiveDaysAtLeast?: number;
  page: number;
  limit: number;
}

/** 棚卸しの一行 */
export interface UserInventoryItem {
  id: string;
  displayName: string;
  email: string;
  roles: string[];
  status: UserInventoryStatus;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  invitedBy: { id: string; displayName: string } | null;
}

/** ページ情報（他の一覧の API と同じ形） */
export interface UserInventoryPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface UserInventoryPage {
  data: UserInventoryItem[];
  pagination: UserInventoryPagination;
}

/**
 * 絞り込みの条件を作る
 *
 * @param filter - 状態と経過日数
 * @param now - 経過日数の基準の日時
 */
export function buildUserInventoryWhere(
  filter: Pick<UserInventoryQuery, 'status' | 'inactiveDaysAtLeast'>,
  now: Date
): Prisma.UserWhereInput {
  const conditions: Prisma.UserWhereInput[] = [];

  if (filter.status !== undefined) {
    conditions.push({ isActive: filter.status === 'active' });
  }

  if (filter.inactiveDaysAtLeast !== undefined) {
    const cutoff = new Date(now.getTime() - filter.inactiveDaysAtLeast * DAY_MS);
    conditions.push({
      OR: [{ lastLoginAt: { lte: cutoff } }, { lastLoginAt: null, createdAt: { lte: cutoff } }],
    });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

/** 棚卸しの並び順（ログインの実績が無い利用者を先に、最終ログインの古い順） */
export const USER_INVENTORY_ORDER_BY: Prisma.UserOrderByWithRelationInput[] = [
  { lastLoginAt: { sort: 'asc', nulls: 'first' } },
  { createdAt: 'asc' },
  { id: 'asc' },
];

/** 棚卸しで読む列（秘密の値を含めない） */
const userInventorySelect = {
  id: true,
  displayName: true,
  email: true,
  isActive: true,
  twoFactorEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  invitedBy: { select: { id: true, displayName: true } },
  userRoles: { select: { role: { select: { name: true, priority: true } } } },
} satisfies Prisma.UserSelect;

type UserInventoryRow = Prisma.UserGetPayload<{ select: typeof userInventorySelect }>;

/** ロール名を優先度の高い順、同じなら名前の順に並べる */
function roleNames(row: UserInventoryRow): string[] {
  return row.userRoles
    .map((userRole) => userRole.role)
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))
    .map((role) => role.name);
}

function toItem(row: UserInventoryRow): UserInventoryItem {
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    roles: roleNames(row),
    status: row.isActive ? 'active' : 'inactive',
    twoFactorEnabled: row.twoFactorEnabled,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    invitedBy: row.invitedBy
      ? { id: row.invitedBy.id, displayName: row.invitedBy.displayName }
      : null,
  };
}

export interface UserInventoryServiceDeps {
  prisma: Pick<PrismaClient, 'user'>;
  /** 経過日数の基準の日時（既定は現在） */
  now?: () => Date;
}

export class UserInventoryService {
  private readonly prisma: Pick<PrismaClient, 'user'>;
  private readonly now: () => Date;

  constructor(deps: UserInventoryServiceDeps) {
    this.prisma = deps.prisma;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * 棚卸しの一覧を返す
   *
   * @param query - 絞り込みとページ
   */
  async list(query: UserInventoryQuery): Promise<UserInventoryPage> {
    const where = buildUserInventoryWhere(query, this.now());

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: userInventorySelect,
        orderBy: USER_INVENTORY_ORDER_BY,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: rows.map(toItem),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
