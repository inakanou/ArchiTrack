/**
 * @fileoverview 写真選択ダイアログの一括取得の単体テスト
 *
 * Task 75.1: 写真選択ダイアログの取得を一括取得へ置き換える
 *
 * Requirements (quantity-table-generation): 49.9, 49.10
 * - 49.9: 写真選択ダイアログを開くとき、選択可能な写真の一覧を現場調査ごとの個別
 *   リクエストに分割せずまとめて取得する
 * - 49.10: 写真一覧の表示にサムネイル画像（解決済みの `displayUrl`）を用いる
 *
 * あわせて次を固定する。
 * - Requirement 4.3 / 19.2（選択対象は注釈エディタで編集済みの画像）に基づく提示
 *   （切り捨て時／0件時）
 * - Requirement 3.3 / 20.2（注釈の目印は「描画された注釈の有無」で判定する）が
 *   ダイアログ経由の選択でも維持されること
 * - Requirement 49.5（合成済みサムネイルを優先し、注釈を二重に重ねない）
 * - Requirement 49.8（実寸の受け渡し）
 *
 * 共有表示部品 `AnnotatedImageThumbnail` は実体を通したうえで、受け取った prop を
 * 観測用の属性へ書き出す包みを被せている。差し替えで済ませると「合成済みサムネイルを
 * 渡したので再合成が起きない」という不変条件が部品側の実装から切り離され、注釈取得API
 * の呼び出しの有無で検証できなくなるためである。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { triggerAllIntersections } from '../../test-support/intersection-observer';

// useBlocker をモック（データルーターなしでテストするため。Task 62.1 離脱ガード対応）
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useBlocker: vi.fn(() => ({
      state: 'unblocked',
      proceed: vi.fn(),
      reset: vi.fn(),
    })),
  };
});

vi.mock('../../api/quantity-tables', () => ({
  getQuantityTableDetail: vi.fn(),
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

vi.mock('../../api/site-surveys', () => ({
  getSiteSurveys: vi.fn(),
  getSiteSurvey: vi.fn(),
  getProjectSurveyImages: vi.fn(),
}));

// 注釈取得APIは共有表示部品のクライアント側合成の入口である。合成済みサムネイルを
// 受け取ったときに呼ばれないことが、二重合成が起きないことの証拠になる。
vi.mock('../../api/survey-annotations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/survey-annotations')>()),
  getAnnotation: vi.fn(),
}));

vi.mock('../../hooks/useAutocompleteCandidateStore', () => ({
  useAutocompleteCandidateStore: () => ({
    isLoading: false,
    error: null,
    getSuggestions: () => [],
    addCandidateOnBlur: () => {},
  }),
}));

// 共有表示部品は実体を通したうえで、受け取った prop を観測用の属性へ書き出す。
vi.mock('../../components/site-surveys/AnnotatedImageThumbnail', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../components/site-surveys/AnnotatedImageThumbnail')>();
  const Real = actual.AnnotatedImageThumbnail;
  const Probe = (props: Parameters<typeof Real>[0]) => (
    <span
      data-testid="annotated-image-thumbnail"
      data-thumbnail-url={props.image?.thumbnailUrl ?? ''}
      data-annotated-thumbnail-url={props.image?.annotatedThumbnailUrl ?? ''}
      data-original-url={props.image?.originalUrl ?? ''}
      data-width={props.image?.width ?? ''}
      data-height={props.image?.height ?? ''}
      data-alt={props.alt ?? ''}
    >
      <Real {...props} />
    </span>
  );
  return { AnnotatedImageThumbnail: Probe, default: Probe };
});

import QuantityTableEditPage from '../../pages/QuantityTableEditPage';
import * as quantityTablesApi from '../../api/quantity-tables';
import * as siteSurveysApi from '../../api/site-surveys';
import * as surveyAnnotationsApi from '../../api/survey-annotations';

const mockGetQuantityTableDetail = vi.mocked(quantityTablesApi.getQuantityTableDetail);
const mockGetSiteSurveys = vi.mocked(siteSurveysApi.getSiteSurveys);
const mockGetSiteSurvey = vi.mocked(siteSurveysApi.getSiteSurvey);
const mockGetProjectSurveyImages = vi.mocked(siteSurveysApi.getProjectSurveyImages);
const mockGetAnnotation = vi.mocked(surveyAnnotationsApi.getAnnotation);

const PROJECT_ID = 'proj-1';

/** 写真を1枚も紐づけていないグループのみを持つ数量表 */
const tableDetail = {
  id: 'qt-1',
  projectId: PROJECT_ID,
  project: { id: PROJECT_ID, name: 'テストプロジェクト' },
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
};

/**
 * 既に写真を紐づけたグループを併せ持つ数量表
 *
 * 取得に失敗したときに既存の紐づけへ手を触れないこと（設計 Requirement 49 の
 * Error Handling）を確かめるために用いる。
 */
const tableDetailWithLinkedPhoto = {
  ...tableDetail,
  groupCount: 2,
  groups: [
    ...tableDetail.groups,
    {
      id: 'g-2',
      quantityTableId: 'qt-1',
      name: 'グループ2',
      surveyImageId: 'linked-img',
      surveyImage: {
        id: 'linked-img',
        thumbnailUrl: 'https://example.com/linked/thumb.png',
        originalUrl: 'https://example.com/linked/original.png',
        annotatedThumbnailUrl: 'https://example.com/linked/annotated.png',
        fileName: 'linked.png',
        hasAnnotations: true,
        hasDrawnAnnotations: true,
        comment: null,
        width: 1200,
        height: 900,
      },
      displayOrder: 1,
      itemCount: 0,
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

/**
 * プロジェクト写真一覧の応答（注釈エディタで編集済みの写真のみが含まれる）
 *
 * `displayUrl` は注釈付きサムネイル優先でサーバー側が解決済みの1本である。
 * 呼び出し側が注釈の有無で表示元を選び直さないことを固定するため、
 * 原本URLとは別のホストを与えて取り違えを検出できるようにする。
 *
 * - `img-1`: 描画された注釈があり、`displayUrl` は合成済みサムネイル
 * - `img-2`: 描画された注釈があるが合成済みサムネイルが無く、`displayUrl` は通常サムネイル
 * - `img-rotate-only`: 注釈レコードはあるが描画は0件（回転のみの保存）
 */
const projectImages = [
  {
    id: 'img-1',
    surveyId: 'survey-1',
    surveyName: 'テスト調査',
    fileName: 'photo-1.png',
    displayUrl: 'https://example.com/display/annotated-1.png',
    originalUrl: 'https://example.com/original/1.png',
    isDisplayUrlAnnotated: true,
    hasDrawnAnnotations: true,
    comment: '基礎の配筋状況',
    width: 800,
    height: 600,
    displayOrder: 0,
  },
  {
    id: 'img-2',
    surveyId: 'survey-2',
    surveyName: 'テスト調査2',
    fileName: 'photo-2.png',
    displayUrl: 'https://example.com/display/thumb-2.png',
    originalUrl: 'https://example.com/original/2.png',
    isDisplayUrlAnnotated: false,
    hasDrawnAnnotations: true,
    comment: null,
    width: 1024,
    height: 768,
    displayOrder: 1,
  },
  {
    id: 'img-rotate-only',
    surveyId: 'survey-2',
    surveyName: 'テスト調査2',
    fileName: 'photo-rotate-only.png',
    // 回転のみの保存でも合成済みサムネイルは生成される。注釈の目印の判定源にはならない
    displayUrl: 'https://example.com/display/annotated-rotate-only.png',
    originalUrl: 'https://example.com/original/rotate-only.png',
    isDisplayUrlAnnotated: true,
    hasDrawnAnnotations: false,
    comment: null,
    width: 640,
    height: 480,
    displayOrder: 2,
  },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}/quantity-tables/qt-1`]}>
      <Routes>
        <Route
          path="/projects/:projectId/quantity-tables/:id"
          element={<QuantityTableEditPage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

/** プレースホルダーをクリックして写真選択ダイアログを開く */
async function openPhotoDialog(): Promise<HTMLElement> {
  const placeholder = await screen.findByTestId('image-placeholder-g-1', {}, { timeout: 5000 });
  fireEvent.click(placeholder);
  return await screen.findByRole('dialog', { name: /写真を選択/ }, { timeout: 5000 });
}

/** ダイアログから1枚選び、表題部へ反映されるまで待つ */
async function pickPhoto(imageId: string): Promise<void> {
  const photoList = await screen.findByTestId('photo-list', {}, { timeout: 5000 });
  fireEvent.click(within(photoList).getByTestId(`photo-item-${imageId}`));

  await waitFor(() => {
    expect(screen.queryByTestId('image-placeholder-g-1')).not.toBeInTheDocument();
  });
  // 共有表示部品は表示領域へ到達するまで取得も合成も開始しない
  triggerAllIntersections();
}

describe('数量表編集画面 写真選択ダイアログの一括取得 (Requirement 49.9, 49.10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetQuantityTableDetail.mockResolvedValue(tableDetail as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetProjectSurveyImages.mockResolvedValue({ images: projectImages, hasMore: false } as any);
    // 注釈は存在しない（クライアント側合成は元画像をそのまま用いる）
    mockGetAnnotation.mockResolvedValue(null);
  });

  it('ダイアログを開くと写真一覧の取得が1回だけ発生し、現場調査一覧・詳細の取得は発生しない (49.9)', async () => {
    renderPage();
    await openPhotoDialog();

    await screen.findByTestId('photo-list', {}, { timeout: 5000 });

    expect(mockGetProjectSurveyImages).toHaveBeenCalledTimes(1);
    expect(mockGetProjectSurveyImages).toHaveBeenCalledWith(PROJECT_ID);
    // 現場調査ごとの個別リクエストへ分割しない
    expect(mockGetSiteSurveys).not.toHaveBeenCalled();
    expect(mockGetSiteSurvey).not.toHaveBeenCalled();
  });

  it('一覧の表示元は解決済みの表示用URLで、注釈の有無で分岐しない (49.10)', async () => {
    renderPage();
    await openPhotoDialog();

    const photoList = await screen.findByTestId('photo-list', {}, { timeout: 5000 });

    for (const image of projectImages) {
      const img = within(photoList).getByTestId(`photo-item-${image.id}`);
      expect(img).toHaveAttribute('src', image.displayUrl);
      expect(img).not.toHaveAttribute('src', image.originalUrl);
    }
  });

  it('切り捨てが発生した場合は一覧に全件が含まれない旨を提示する (49.9)', async () => {
    mockGetProjectSurveyImages.mockResolvedValue({
      images: projectImages,
      hasMore: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    renderPage();
    const dialog = await openPhotoDialog();

    const notice = await within(dialog).findByTestId(
      'photo-list-truncated-notice',
      {},
      { timeout: 5000 }
    );
    expect(notice).toHaveTextContent(/すべての写真は含まれていません/);
  });

  it('切り捨てが発生していない場合は切り捨ての提示を行わない (49.9)', async () => {
    renderPage();
    const dialog = await openPhotoDialog();
    await screen.findByTestId('photo-list', {}, { timeout: 5000 });

    expect(within(dialog).queryByTestId('photo-list-truncated-notice')).toBeNull();
  });

  it('注釈付き写真が0件の場合は注釈エディタでの編集を促す (Requirement 4.3, 19.2)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetProjectSurveyImages.mockResolvedValue({ images: [], hasMore: false } as any);

    renderPage();
    const dialog = await openPhotoDialog();

    const empty = await within(dialog).findByTestId('photo-list-empty', {}, { timeout: 5000 });
    expect(empty).toHaveTextContent('注釈付きの写真がありません');
    expect(empty).toHaveTextContent(/注釈エディタ/);
    // 取得は成功しているので取得失敗の提示は行わない
    expect(within(dialog).queryByTestId('photo-list-error')).toBeNull();
  });

  it('写真を選択すると表示用URL・原本URL・ファイル名・コメントが保持される (49.9, 49.10)', async () => {
    renderPage();
    await openPhotoDialog();
    await pickPhoto('img-1');

    const probe = screen.getByTestId('annotated-image-thumbnail');
    // 表示用URL（サーバーが解決済みの1本）がサマリへ引き継がれる。合成済みであるため
    // 注釈付きサムネイルの口へ渡り、クライアント側の再合成を経ずに表示される
    expect(probe).toHaveAttribute('data-annotated-thumbnail-url', projectImages[0]!.displayUrl);
    // 原本URLが保持される
    expect(probe).toHaveAttribute('data-original-url', projectImages[0]!.originalUrl);
    // ファイル名が保持される
    expect(probe).toHaveAttribute('data-alt', projectImages[0]!.fileName);
    expect(within(probe).getByAltText(projectImages[0]!.fileName)).toBeInTheDocument();
    // コメントが保持される
    expect(screen.getByTestId('photo-comment-display')).toHaveTextContent('基礎の配筋状況');
  });

  /**
   * ダイアログ経由で選んだ写真の表示は、再読込を挟まずそのまま表題部へ渡る。
   * 保持するサマリが表示に必要な判定を欠くと、注釈の目印が消えたり注釈が二重に
   * 重なったりする。いずれも再読込するまで直らない。
   *
   * Requirements (quantity-table-generation): 3.3, 49.5, 49.8
   * Requirements (site-survey): 20.2
   */
  describe('選択した写真の表示の維持', () => {
    it('注釈付き写真を選ぶと注釈バッジが表示される (Requirement 3.3, 20.2)', async () => {
      renderPage();
      await openPhotoDialog();
      await pickPhoto('img-1');

      expect(screen.getByTestId('annotation-badge-g-1')).toBeInTheDocument();
    });

    it('回転のみの写真（描画0件）を選んでも注釈バッジは表示されない (Requirement 20.2)', async () => {
      renderPage();
      await openPhotoDialog();
      await pickPhoto('img-rotate-only');

      expect(screen.queryByTestId('annotation-badge-g-1')).toBeNull();
    });

    it('合成済みの表示用URLは注釈付きサムネイルとして渡す (49.5)', async () => {
      renderPage();
      await openPhotoDialog();
      await pickPhoto('img-1');

      const probe = screen.getByTestId('annotated-image-thumbnail');
      expect(probe).toHaveAttribute('data-annotated-thumbnail-url', projectImages[0]!.displayUrl);

      // 共有表示部品はサーバー側で合成済みの画像をそのまま表示する
      await waitFor(() => {
        expect(within(probe).getByAltText(projectImages[0]!.fileName)).toHaveAttribute(
          'src',
          projectImages[0]!.displayUrl
        );
      });
    });

    it('合成済みの写真を選んでも注釈取得APIを呼ばない（二重合成の回避） (49.2, 49.5)', async () => {
      renderPage();
      await openPhotoDialog();
      await pickPhoto('img-1');

      // 共有表示部品の描画の効果が走り切るまで待つ。同じ待機で合成済みでない経路の
      // 呼び出しが観測できることは、直後の検証（49.6）が示す。
      const probe = screen.getByTestId('annotated-image-thumbnail');
      await waitFor(() => {
        expect(within(probe).getByAltText(projectImages[0]!.fileName)).toHaveAttribute('src');
      });

      // 注釈の取得もクライアント側の合成も行わない。合成済みの画像へ注釈を重ねると
      // 二重に描かれ、回転補正済みの画像では重ね位置もずれる
      expect(mockGetAnnotation).not.toHaveBeenCalled();
    });

    it('合成済みでない表示用URLはサムネイルとして渡し、注釈の反映を共有部品へ委ねる (49.6)', async () => {
      renderPage();
      await openPhotoDialog();
      await pickPhoto('img-2');

      const probe = screen.getByTestId('annotated-image-thumbnail');
      // 合成済みではないため注釈付きサムネイルの口へは渡さない
      expect(probe).toHaveAttribute('data-annotated-thumbnail-url', '');
      expect(probe).toHaveAttribute('data-thumbnail-url', projectImages[1]!.displayUrl);
      // 共有部品がクライアント側で注釈を反映する経路へ入る
      await waitFor(() => {
        expect(mockGetAnnotation).toHaveBeenCalledWith('img-2');
      });
    });

    it('実寸を引き継ぎ、未読込時の表示領域を確保できるようにする (49.8)', async () => {
      renderPage();
      await openPhotoDialog();
      await pickPhoto('img-1');

      const probe = screen.getByTestId('annotated-image-thumbnail');
      expect(probe).toHaveAttribute('data-width', String(projectImages[0]!.width));
      expect(probe).toHaveAttribute('data-height', String(projectImages[0]!.height));
    });
  });

  /**
   * 取得に失敗したことはダイアログの中で伝える必要がある。
   * ダイアログは画面全体を覆うため、背後の共通エラー表示は利用者へ届かない。
   * 空一覧の案内（注釈エディタでの編集の促し）だけが見えると、取得の失敗を
   * 「注釈付きの写真が無い」と取り違える。
   *
   * Requirements (quantity-table-generation): 49.9
   */
  describe('写真一覧の取得に失敗した場合', () => {
    it('ダイアログの中に取得失敗を提示し、注釈エディタの促しは行わない', async () => {
      mockGetProjectSurveyImages.mockRejectedValue(new Error('network error'));

      renderPage();
      const dialog = await openPhotoDialog();

      const error = await within(dialog).findByTestId('photo-list-error', {}, { timeout: 5000 });
      expect(error).toHaveTextContent('写真の読み込みに失敗しました');
      // 0件時の案内は「取得に成功して0件だった」ときにだけ出す
      expect(within(dialog).queryByTestId('photo-list-empty')).toBeNull();
      expect(within(dialog).queryByTestId('photo-list')).toBeNull();
    });

    it('既存の写真の紐づけを変更しない', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockGetQuantityTableDetail.mockResolvedValue(tableDetailWithLinkedPhoto as any);
      mockGetProjectSurveyImages.mockRejectedValue(new Error('network error'));

      renderPage();
      await openPhotoDialog();
      await screen.findByTestId('photo-list-error', {}, { timeout: 5000 });

      // 未紐づけのグループは未紐づけのまま
      expect(screen.getByTestId('image-placeholder-g-1')).toBeInTheDocument();

      // 既に紐づいている写真の表示元・実寸・注釈の目印はいずれも変わらない
      const linked = screen
        .getAllByTestId('annotated-image-thumbnail')
        .find((el) => el.getAttribute('data-alt') === 'linked.png');
      expect(linked).toBeDefined();
      expect(linked).toHaveAttribute(
        'data-annotated-thumbnail-url',
        'https://example.com/linked/annotated.png'
      );
      expect(linked).toHaveAttribute('data-thumbnail-url', 'https://example.com/linked/thumb.png');
      expect(linked).toHaveAttribute('data-width', '1200');
      expect(screen.getByTestId('annotation-badge-g-2')).toBeInTheDocument();
    });

    it('取得に成功し直した場合は失敗の提示を残さない', async () => {
      mockGetProjectSurveyImages.mockRejectedValueOnce(new Error('network error'));

      renderPage();
      const dialog = await openPhotoDialog();
      await within(dialog).findByTestId('photo-list-error', {}, { timeout: 5000 });

      fireEvent.click(within(dialog).getByRole('button', { name: 'ダイアログを閉じる' }));
      await openPhotoDialog();

      await screen.findByTestId('photo-list', {}, { timeout: 5000 });
      expect(screen.queryByTestId('photo-list-error')).toBeNull();
    });
  });
});
