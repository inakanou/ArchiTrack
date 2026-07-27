/**
 * @fileoverview 工事写真機能の共有型（DTO / 配置ジオメトリ / 自由項目）
 *
 * 依存方向: Types はドメインの最下層。他レイヤ（Prisma/Infra/Service/Route/UI）から
 * import されるのみで、上位レイヤを import しない。
 *
 * Requirements:
 * - 7.2: 写真項目のコメント（最大2000）
 * - 8.3: 工事看板の自由項目（ラベルと値の組）
 * - 9.1: 写真項目への工事看板の位置・大きさの指定（signboardPlacement）
 *
 * @module types/construction-photo
 */

/**
 * 看板の配置ジオメトリ（画像ピクセル座標系）
 *
 * 写真項目（`ConstructionPhoto`）が所有する配置情報。看板本体は配置情報を持たない。
 * 画像内に収まる非負矩形であること（left/top >= 0、width/height > 0）。
 */
export interface SignboardPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 工事看板の自由項目（ラベルと値の組）
 *
 * Requirements: 8.3
 */
export interface SignboardFreeItem {
  label: string;
  value: string;
}

/**
 * 工事写真アルバムDTO
 */
export interface ConstructionPhotoAlbumDto {
  id: string;
  projectId: string;
  name: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 工事看板DTO（プロジェクト単位マスタ）
 */
export interface ConstructionSignboardDto {
  id: string;
  projectId: string;
  /** 工事件名の値 */
  workName: string;
  /** 工事場所の値 */
  workLocation: string;
  /** 自由項目（ラベルと値の組の配列、既定 []） */
  freeItems: SignboardFreeItem[];
  /** 下部記入欄の固定テキスト（複数行可） */
  footerText: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 画像リストDTO（署名付きURL同梱、写真項目ごとの個別リクエスト不要）
 *
 * Requirements: 11.2, 11.3
 */
export interface ConstructionPhotoWithUrls {
  id: string;
  albumId: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  displayOrder: number;
  comment: string | null;
  includeInReport: boolean;
  signboardId: string | null;
  signboardPlacement: SignboardPlacement | null;
  /** 一覧・詳細のサムネ優先表示（未生成時 null） */
  thumbnailUrl: string | null;
  /** PDF用: 印字画像取得エンドポイント。看板ありはサーバでオンデマンド合成、なしは原本 */
  printImageUrl: string;
  createdAt: string;
}
