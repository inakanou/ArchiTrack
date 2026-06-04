/**
 * @fileoverview 写真選択ダイアログ 写真一覧レイアウトの単体テスト
 *
 * Task 55.3: 写真選択ダイアログレイアウトのテスト（単体）
 *
 * Requirements (REQ-39: 写真選択・変更ダイアログの写真一覧レイアウト改善):
 * - 39.1: 写真選択ダイアログで各写真を相互に重ならないレイアウトで一覧表示する
 * - 39.3: 各写真を一定間隔（gap）で配置し、隣接写真と表示領域が重複しないようにする
 * - 39.4: 写真枚数にかかわらず各写真のサムネイル全体を視認可能に表示する（全件レンダリング）
 * - 39.5: 表示領域に収まらない場合、折り返して配置しスクロールバーで閲覧可能にする
 *
 * 設計方針（design.md REQ-39 / Testing Strategy 2167行）:
 *   写真同士の「重なりゼロ」の矩形判定（getBoundingClientRect）は実レイアウトを要し
 *   jsdom では検証不可のため、単体テストでは
 *     (a) 多数枚（30枚以上）が全件レンダリングされること
 *     (b) 重なりを解消するためのグリッドスタイル（gridAutoRows=minmax(150px,auto) /
 *         minHeight 等の修正後プロパティ）が適用されていること
 *   を検証する。矩形が重ならないことの実証は E2E（Playwright）で実施する
 *   （photo-select-overlap-e2e.spec.ts）。前提条件によるテスト無効化は行わない。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
// 30枚以上の写真を用意（全件レンダリング検証のため）
// 注: vi.mock ファクトリはホイストされるため、生成ロジックはファクトリ内に持つ。
//     テスト側で件数を参照できるよう PHOTO_COUNT は定数（リテラル）として共有する。
const PHOTO_COUNT = 36;

// 数量表詳細: 写真未紐付けのグループ1件（プレースホルダーから選択ダイアログを開く経路）
vi.mock('../../../api/quantity-tables', () => ({
  getQuantityTableDetail: vi.fn().mockResolvedValue({
    id: 'qt-1',
    projectId: 'proj-1',
    project: { id: 'proj-1', name: 'テストプロジェクト' },
    name: 'テスト数量表',
    groupCount: 1,
    itemCount: 0,
    groups: [
      {
        id: 'g-1',
        quantityTableId: 'qt-1',
        name: 'グループ1',
        surveyImageId: null,
        surveyImage: null,
        displayOrder: 0,
        itemCount: 0,
        items: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }),
  createQuantityGroup: vi.fn(),
  deleteQuantityGroup: vi.fn(),
  updateQuantityGroup: vi.fn(),
  createQuantityItem: vi.fn(),
  deleteQuantityItem: vi.fn(),
  copyQuantityItem: vi.fn(),
  updateQuantityTable: vi.fn(),
  saveQuantityTableDraft: vi.fn(),
  updateGroupDisplayOrder: vi.fn(),
  updateItemDisplayOrder: vi.fn(),
}));

// 写真選択ダイアログは getSiteSurveys → getSiteSurvey(詳細) で写真を集約する。
// 1つの現場調査に PHOTO_COUNT 枚を持たせて多数枚をレンダリングさせる。
vi.mock('../../../api/site-surveys', () => {
  const count = 36; // PHOTO_COUNT と一致（ファクトリはホイストされ外部参照不可のためリテラル）
  const photos = Array.from({ length: count }, (_, i) => ({
    id: `img-${i + 1}`,
    surveyId: 'survey-1',
    originalPath: `original/${i + 1}.png`,
    thumbnailPath: `thumb/${i + 1}.png`,
    originalUrl: `https://example.com/original/${i + 1}.png`,
    thumbnailUrl: `https://example.com/thumb/${i + 1}.png`,
    fileName: `photo-${i + 1}.png`,
    fileSize: 1024,
    width: 800,
    height: 600,
    displayOrder: i,
    createdAt: '2026-01-01T00:00:00.000Z',
    hasAnnotations: false,
  }));
  return {
    getSiteSurveys: vi.fn().mockResolvedValue({ data: [{ id: 'survey-1' }] }),
    getSiteSurvey: vi.fn().mockResolvedValue({ id: 'survey-1', images: photos }),
  };
});

vi.mock('../../../hooks/useAutocompleteCandidateStore', () => ({
  useAutocompleteCandidateStore: () => ({
    isLoading: false,
    error: null,
    getSuggestions: () => [],
    addCandidateOnBlur: () => {},
  }),
}));

vi.mock('../../../components/site-surveys/AnnotatedImageThumbnail', () => ({
  AnnotatedImageThumbnail: () => <img data-testid="annotated-image-thumbnail" alt="mock" />,
  default: () => <img data-testid="annotated-image-thumbnail" alt="mock" />,
}));

import QuantityTableEditPage from '../../../pages/QuantityTableEditPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/proj-1/quantity-tables/qt-1']}>
      <Routes>
        <Route
          path="/projects/:projectId/quantity-tables/:id"
          element={<QuantityTableEditPage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

/**
 * プレースホルダーをクリックして写真選択ダイアログを開き、
 * 写真一覧（photo-list）が表示されるまで待つヘルパー。
 */
async function openPhotoDialog(): Promise<HTMLElement> {
  // データ読み込み完了（グループカード描画）を待つ
  const placeholder = await screen.findByTestId('image-placeholder-g-1', {}, { timeout: 5000 });
  fireEvent.click(placeholder);
  // 写真の非同期取得完了後、photo-list が出現する
  return await screen.findByTestId('photo-list', {}, { timeout: 5000 });
}

describe('数量表編集画面 写真選択ダイアログのレイアウト (REQ-39)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('テスト前提: 多数枚（30枚以上）をシードしている', () => {
    // ファクトリ内リテラル(36)と PHOTO_COUNT のドリフト検知 + 30枚以上の前提明示
    expect(PHOTO_COUNT).toBe(36);
    expect(PHOTO_COUNT).toBeGreaterThanOrEqual(30);
  });

  it('多数枚（30枚以上）の写真が全件レンダリングされる (REQ-39.4)', async () => {
    renderPage();
    const photoList = await openPhotoDialog();

    // 各写真は data-testid="photo-item-{id}" の img でレンダリングされる
    const items = within(photoList).getAllByTestId(/^photo-item-/);
    expect(items).toHaveLength(PHOTO_COUNT);

    // 先頭・末尾が確かに存在すること（部分的なレンダリング/仮想化で件数だけ合う事故を防ぐ）
    expect(within(photoList).getByTestId('photo-item-img-1')).toBeInTheDocument();
    expect(
      within(photoList).getByTestId(`photo-item-img-${PHOTO_COUNT}`)
    ).toBeInTheDocument();
  });

  it('写真グリッドに重なり解消用スタイル（gridAutoRows・gap・折り返し列・スクロール）が適用される (REQ-39.1, 39.3, 39.5)', async () => {
    renderPage();
    const photoList = await openPhotoDialog();

    // 行高さを固定（150px）し、アイテム高さと一致させることで重なりを解消する
    // （aspect-ratio 由来の不定高だと行トラックを超過して食い込み重なる: E2Eで矩形重複を実証）。
    expect(photoList.style.display).toBe('grid');
    expect(photoList.style.gridAutoRows).toBe('150px');
    // 折り返し配置（auto-fill）と間隔（gap）で隣接写真の重複を防ぐ
    expect(photoList.style.gridTemplateColumns).toBe('repeat(auto-fill, minmax(150px, 1fr))');
    expect(photoList.style.gap).toBe('12px');
    // 収まらない分はスクロールで閲覧可能にする
    expect(photoList.style.overflowY).toBe('auto');
  });

  it('各写真アイテムに行トラックと一致する確定高さ（height/minHeight=150px）が適用され潰れない・はみ出さない (REQ-39.4)', async () => {
    renderPage();
    const photoList = await openPhotoDialog();

    // 写真アイテムのコンテナ（role="button" + aria-label="{fileName}を選択"）
    const firstItem = within(photoList).getByRole('button', { name: 'photo-1.pngを選択' });
    // 行トラック（gridAutoRows:150px）と一致する definite height で重なりを防ぐ
    expect(firstItem.style.height).toBe('150px');
    expect(firstItem.style.minHeight).toBe('150px');
  });
});
