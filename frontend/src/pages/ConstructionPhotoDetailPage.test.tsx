/**
 * @fileoverview 工事写真詳細ページのテスト
 *
 * Task 6.3: 詳細画面：写真項目管理＋3系統アップロード
 *
 * - 詳細1リクエストで写真項目＋署名URLを取得しサムネ優先表示 (R7.8, R11.2, R11.3)
 * - 3系統（ローカル/カメラ/現調）で写真項目を追加 (R4, R5, R6)
 * - コメント＋印刷対象＋並び替えを1保存操作でメタバッチ＋順序の計2リクエストで確定 (R7.6, R11.4)
 *
 * Requirements: 4.1, 4.2, 5.1, 6.1, 7.1, 7.3, 7.4, 7.5, 7.6, 7.8, 11.3, 11.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ConstructionPhotoDetailPage from './ConstructionPhotoDetailPage';
import * as albumsApi from '../api/construction-photos';
import * as imagesApi from '../api/construction-photo-images';
import * as projectsApi from '../api/projects';
import * as siteSurveysApi from '../api/site-surveys';
import * as signboardsApi from '../api/construction-signboards';
import * as ledgerExportApi from '../services/export/ConstructionPhotoLedgerExportService';
import { constructionPhotoBulkExportService } from '../services/export/ConstructionPhotoBulkExportService';
import { ApiError } from '../api/client';
import useMediaQuery from '../hooks/useMediaQuery';
import type {
  ConstructionPhotoAlbum,
  ConstructionPhotoWithUrls,
  ConstructionSignboard,
  SignboardPlacement,
} from '../types/construction-photo.types';
import type { ProjectDetail } from '../types/project.types';

const mockNavigate = vi.fn();

// useBlocker のモック（Task 12.5: 未保存離脱警告の結線, R18.2）
// QuantityTableEditPage/CompanyInfoPage/ItemizedStatementDetailPage の確立済みパターンに
// 準拠。jsdomにはデータルーター連携の実遷移ブロックが無いため、useBlockerをモックして
// 「isDirtyに応じた呼び出し引数」と「blocked状態でのダイアログ結線」を検証する。
const mockProceed = vi.fn();
const mockReset = vi.fn();
const mockUseBlocker = vi.fn((_shouldBlock?: boolean) => ({
  state: 'unblocked' as 'unblocked' | 'blocked' | 'proceeding',
  proceed: mockProceed,
  reset: mockReset,
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'album-1' }),
    useNavigate: () => mockNavigate,
    useBlocker: (shouldBlock?: boolean) => mockUseBlocker(shouldBlock),
  };
});

vi.mock('../api/construction-photos');
vi.mock('../api/construction-photo-images');
vi.mock('../api/projects');
vi.mock('../api/site-surveys');
vi.mock('../api/construction-signboards');
// useMediaQueryのモック（デフォルトはデスクトップ幅=false, Task 12.6, Requirement 19）
// isMobile 判定をテストごとに切り替えられるようにする。
vi.mock('../hooks/useMediaQuery', () => ({
  default: vi.fn(() => false),
}));
vi.mock('../services/export/ConstructionPhotoLedgerExportService');
vi.mock('../services/export/ConstructionPhotoBulkExportService', () => ({
  constructionPhotoBulkExportService: { export: vi.fn() },
}));

// 工事写真権限フックのモック（Task 12.4: 権限に基づくUI表示制御, R17）
// 既定はフル権限（既存テストの回帰なし）。個別テストで mockReturnValue を上書きする。
const mockUseConstructionPhotoPermission = vi.fn();
vi.mock('../hooks/useConstructionPhotoPermission', () => ({
  useConstructionPhotoPermission: () => mockUseConstructionPhotoPermission(),
}));

// 未保存離脱警告フックのモック（Task 12.5: 未保存離脱警告の結線, R18）
// quantity-table-generation の Task 100.24 でフックは未保存判定 `isDirty` を受け取るだけの形へ
// 一本化され、戻り値を持たない（未保存判定は画面が持つ）。画面がフックへ渡した `isDirty` を
// 記録し、結線（変更で真・保存で偽・編集権限が無ければ偽）のみ検証する
// （beforeunload実登録の検証は useUnsavedChanges 自体の単体テストで担保済み）。
const mockUseUnsavedChanges = vi.fn((_options: { isDirty: boolean; message?: string }) => {});
/** 直近の描画で画面がフックへ渡した isDirty */
const lastUnsavedDirty = (): boolean | undefined =>
  mockUseUnsavedChanges.mock.calls[mockUseUnsavedChanges.mock.calls.length - 1]?.[0].isDirty;
vi.mock('../hooks/useUnsavedChanges', () => ({
  useUnsavedChanges: (options: { isDirty: boolean; message?: string }) =>
    mockUseUnsavedChanges(options),
}));

// UnsavedChangesDialog のモック（CompanyInfoPage のテスト作法を参考に簡易DOMへ差し替え）
vi.mock('../components/common/UnsavedChangesDialog', () => ({
  default: ({
    isOpen,
    onLeave,
    onStay,
  }: {
    isOpen: boolean;
    onLeave: () => void;
    onStay: () => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label="変更が保存されていません" data-testid="unsaved-changes-dialog">
        <button type="button" onClick={onLeave}>
          ページを離れる
        </button>
        <button type="button" onClick={onStay}>
          このページにとどまる
        </button>
      </div>
    ) : null,
}));

const fullPermission = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  canViewSignboards: true,
  isLoading: false,
  getPermissionError: () => null,
};

// fabric を含む配置エディタはスタブ化し、看板選択＋保存の結線契約のみを検証する。
// 「配置を保存」が渡す配置は既定で { left: 1, top: 2, width: 3, height: 4 }。テストが
// mockEditorPlacement.current を差し替えると、その配置を渡す（タスク 24.5 の配置だけの変更）。
const mockEditorPlacement = vi.hoisted(() => ({
  current: { left: 1, top: 2, width: 3, height: 4 },
}));
vi.mock('../components/construction-photos/SignboardPlacementEditor', () => ({
  default: ({
    signboard,
    onSave,
  }: {
    signboard: ConstructionSignboard | null;
    onSave?: (placement: SignboardPlacement | null) => void;
  }) => (
    <div data-testid="signboard-placement-editor">
      <span data-testid="editor-signboard-id">{signboard ? signboard.id : 'none'}</span>
      <button
        type="button"
        onClick={() => onSave?.(signboard ? { ...mockEditorPlacement.current } : null)}
      >
        配置を保存
      </button>
    </div>
  ),
}));

const mockAlbum: ConstructionPhotoAlbum = {
  id: 'album-1',
  projectId: 'project-1',
  name: '基礎工事アルバム',
  memo: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const mockProject: ProjectDetail = {
  id: 'project-1',
  name: 'テストプロジェクト',
  description: '説明',
  status: 'CONSTRUCTING',
  statusLabel: '施工',
  siteAddress: '東京都渋谷区',
  tradingPartnerId: 'partner-1',
  tradingPartner: { id: 'partner-1', name: 'テスト取引先', nameKana: 'テスト' },
  salesPerson: { id: 'user-1', displayName: '担当' },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const mockSignboard: ConstructionSignboard = {
  id: 'sb-1',
  projectId: 'project-1',
  workName: '基礎配筋工事',
  workLocation: '東京都渋谷区',
  freeItems: [],
  footerText: null,
  inUseCount: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

function makePhoto(overrides: Partial<ConstructionPhotoWithUrls> = {}): ConstructionPhotoWithUrls {
  return {
    id: 'photo-1',
    albumId: 'album-1',
    fileName: 'photo-1.jpg',
    fileSize: 1000,
    width: 800,
    height: 600,
    displayOrder: 1,
    comment: null,
    includeInReport: false,
    signboardId: null,
    signboardPlacement: null,
    thumbnailUrl: 'https://example.com/thumb-1.jpg',
    printImageUrl: 'https://example.com/print-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <BrowserRouter>
      <ConstructionPhotoDetailPage />
    </BrowserRouter>
  );
}

describe('ConstructionPhotoDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEditorPlacement.current = { left: 1, top: 2, width: 3, height: 4 };
    mockUseBlocker.mockReturnValue({ state: 'unblocked', proceed: mockProceed, reset: mockReset });
    mockUseConstructionPhotoPermission.mockReturnValue(fullPermission);
    vi.mocked(useMediaQuery).mockReturnValue(false);
    vi.mocked(albumsApi.getConstructionPhotoAlbum).mockResolvedValue(mockAlbum);
    vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
    vi.mocked(imagesApi.getConstructionPhotos).mockResolvedValue([
      makePhoto({ id: 'photo-1', displayOrder: 1, fileName: 'a.jpg' }),
      makePhoto({ id: 'photo-2', displayOrder: 2, fileName: 'b.jpg' }),
    ]);
    vi.mocked(signboardsApi.getConstructionSignboards).mockResolvedValue([mockSignboard]);
    // jsdom は URL.createObjectURL/revokeObjectURL 未実装のため、ダウンロード起動の
    // 呼び出し検証のためにスタブする（R15.1）。
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('詳細1リクエストで写真項目を取得しサムネイルを表示する (R7.8, R11.2, R11.3)', async () => {
    renderPage();

    await waitFor(() => {
      expect(imagesApi.getConstructionPhotos).toHaveBeenCalledWith('album-1');
    });
    expect(imagesApi.getConstructionPhotos).toHaveBeenCalledTimes(1);

    const img = await screen.findByRole('img', { name: /a\.jpg/ });
    expect(img).toHaveAttribute('src', 'https://example.com/thumb-1.jpg');
  });

  it('写真項目のサムネイルをクリックするとビューアへ遷移する (R14.1)', async () => {
    renderPage();
    await screen.findByRole('img', { name: /a\.jpg/ });

    const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
    fireEvent.click(within(firstItem).getByTestId('construction-photo-image-button'));

    expect(mockNavigate).toHaveBeenCalledWith('/construction-photos/album-1/photos/photo-1');
  });

  it('ローカルアップロードで写真項目が追加される (R4.1)', async () => {
    vi.mocked(imagesApi.uploadConstructionPhotos).mockResolvedValue({
      successful: [makePhoto({ id: 'photo-3', displayOrder: 3, fileName: 'c.jpg' })],
      failed: [],
    });

    renderPage();
    await screen.findByRole('img', { name: /a\.jpg/ });

    const fileInput = screen.getByTestId('file-input');
    await act(async () => {
      fireEvent.change(fileInput, {
        target: { files: [new File(['x'], 'c.jpg', { type: 'image/jpeg' })] },
      });
    });

    expect(await screen.findByRole('img', { name: /c\.jpg/ })).toBeInTheDocument();
  });

  it('現調写真選択で from-surveys API により写真項目が追加される (R6.1)', async () => {
    vi.mocked(siteSurveysApi.getSiteSurveys).mockResolvedValue({
      data: [
        {
          id: 'survey-1',
          projectId: 'project-1',
          name: '一次調査',
          surveyDate: '2025-01-01T00:00:00.000Z',
          memo: null,
          thumbnailUrl: null,
          imageCount: 1,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
    vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue({
      id: 'survey-1',
      projectId: 'project-1',
      name: '一次調査',
      surveyDate: '2025-01-01T00:00:00.000Z',
      memo: null,
      thumbnailUrl: null,
      imageCount: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      project: { id: 'project-1', name: 'テストプロジェクト' },
      images: [
        {
          id: 'survey-image-1',
          surveyId: 'survey-1',
          originalPath: 'orig/1',
          thumbnailPath: 'thumb/1',
          thumbnailUrl: 'https://example.com/s1.jpg',
          fileName: 's1.jpg',
          fileSize: 100,
          width: 800,
          height: 600,
          displayOrder: 1,
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ],
    });
    vi.mocked(imagesApi.addConstructionPhotosFromSurveys).mockResolvedValue({
      successful: [makePhoto({ id: 'photo-copy', displayOrder: 3, fileName: 'copied.jpg' })],
      failed: [],
    });

    renderPage();
    await screen.findByRole('img', { name: /a\.jpg/ });

    fireEvent.click(screen.getByRole('button', { name: /現場調査写真から選択/ }));
    fireEvent.click(await screen.findByText('一次調査'));
    fireEvent.click(await screen.findByLabelText('s1.jpg を選択'));
    fireEvent.click(screen.getByRole('button', { name: /追加/ }));

    await waitFor(() => {
      expect(imagesApi.addConstructionPhotosFromSurveys).toHaveBeenCalledWith('album-1', [
        'survey-image-1',
      ]);
    });
    expect(await screen.findByRole('img', { name: /copied\.jpg/ })).toBeInTheDocument();
  });

  it('コメント＋印刷対象＋並び替えを1保存でメタバッチ＋順序の計2リクエストで確定する (R7.6, R11.4)', async () => {
    vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockResolvedValue([]);
    vi.mocked(imagesApi.updateConstructionPhotoOrder).mockResolvedValue(undefined);

    renderPage();
    const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;

    // コメント編集（blur で確定）
    const textarea = within(firstItem).getByLabelText('コメント');
    fireEvent.change(textarea, { target: { value: '配筋検査' } });
    fireEvent.blur(textarea);

    // 印刷対象トグル
    fireEvent.click(within(firstItem).getByLabelText('印刷対象に含める'));

    // 並び替え（先頭を下へ）
    fireEvent.click(within(firstItem).getByRole('button', { name: '下へ移動' }));

    // 保存
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(imagesApi.updateConstructionPhotoMetadataBatch).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(imagesApi.updateConstructionPhotoOrder).toHaveBeenCalledTimes(1);
    });

    // メタバッチ: photo-1 のコメント＋印刷対象が1項目にまとまっている
    const batchArg = vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mock.calls[0]![0];
    const photo1Update = batchArg.find((u) => u.id === 'photo-1');
    expect(photo1Update).toMatchObject({ comment: '配筋検査', includeInReport: true });

    // 順序: 相対順序で photo-1 が末尾へ
    const orderArg = vi.mocked(imagesApi.updateConstructionPhotoOrder).mock.calls[0]!;
    expect(orderArg[0]).toBe('album-1');
    expect(orderArg[1]).toEqual([
      { id: 'photo-2', order: 1 },
      { id: 'photo-1', order: 2 },
    ]);
  });

  it('PDF出力ボタン押下で台帳PDF出力オーケストレーションが写真項目・工事名で呼ばれる (R10.1)', async () => {
    vi.mocked(ledgerExportApi.exportConstructionPhotoLedger).mockResolvedValue({
      generated: true,
      itemCount: 2,
    });

    renderPage();
    await screen.findByRole('img', { name: /a\.jpg/ });

    fireEvent.click(screen.getByRole('button', { name: 'PDF出力' }));

    await waitFor(() => {
      expect(ledgerExportApi.exportConstructionPhotoLedger).toHaveBeenCalledTimes(1);
    });
    const arg = vi.mocked(ledgerExportApi.exportConstructionPhotoLedger).mock.calls[0]![0];
    // 工事名はプロジェクト名（なければアルバム名）
    expect(arg.workName).toBe('テストプロジェクト');
    // 全写真項目を渡す（印刷対象フィルタ・順序はサービス側で正規化）
    expect(arg.photos).toHaveLength(2);
  });

  it('印刷対象0件のときは通知を表示しPDFを生成しない (R10.13)', async () => {
    vi.mocked(ledgerExportApi.exportConstructionPhotoLedger).mockResolvedValue({
      generated: false,
      reason: 'no-printable',
    });

    renderPage();
    await screen.findByRole('img', { name: /a\.jpg/ });

    fireEvent.click(screen.getByRole('button', { name: 'PDF出力' }));

    expect(await screen.findByText(/印刷対象の写真がありません/)).toBeInTheDocument();
  });

  // タスク 23.2: 看板が0件のプロジェクトで「看板を配置」を開くと、案内と看板マスタへのリンクが出る。
  // リンクは看板の閲覧の権限（canViewSignboards）を持つときだけ出し、行き先は当該アルバムの
  // プロジェクトの看板マスタである。押すと配置のダイアログは閉じる（遷移は useBlocker の確認を経る）
  describe('看板の配置のダイアログから看板マスタへの導線（タスク 23.2）', () => {
    it('看板が0件なら、ダイアログに案内と当該プロジェクトの看板マスタへのリンクを示す', async () => {
      vi.mocked(signboardsApi.getConstructionSignboards).mockResolvedValue([]);

      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      fireEvent.click(within(firstItem).getByRole('button', { name: /看板を配置/ }));

      const dialog = await screen.findByRole('dialog', { name: /看板を配置/ });
      expect(
        within(dialog).getByText(/このプロジェクトには工事看板が登録されていません/)
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('link', { name: '工事看板マスタを開く' })).toHaveAttribute(
        'href',
        '/projects/project-1/construction-signboards'
      );
    });

    it('看板の閲覧の権限が無ければ、看板の一覧を取得せず、0件とは述べずに権限が無い旨を示し、リンクも出さない', async () => {
      mockUseConstructionPhotoPermission.mockReturnValue({
        ...fullPermission,
        canViewSignboards: false,
      });

      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      fireEvent.click(within(firstItem).getByRole('button', { name: /看板を配置/ }));

      const dialog = await screen.findByRole('dialog', { name: /看板を配置/ });
      // 403 になる取得を送らない（403 は「0件」ではない）
      expect(signboardsApi.getConstructionSignboards).not.toHaveBeenCalled();
      expect(
        within(dialog).queryByText(/このプロジェクトには工事看板が登録されていません/)
      ).not.toBeInTheDocument();
      expect(
        within(dialog).getByText('工事看板を閲覧する権限が無いため、看板を選択できません。')
      ).toBeInTheDocument();
      expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
    });

    it('看板の閲覧の権限が無くても、写真項目の「看板あり」の表示は写真項目の指定から出る', async () => {
      mockUseConstructionPhotoPermission.mockReturnValue({
        ...fullPermission,
        canViewSignboards: false,
      });
      vi.mocked(imagesApi.getConstructionPhotos).mockResolvedValue([
        makePhoto({
          id: 'photo-1',
          displayOrder: 1,
          fileName: 'a.jpg',
          signboardId: 'sb-1',
          signboardPlacement: { left: 1, top: 2, width: 3, height: 4 },
        }),
      ]);

      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;

      expect(within(firstItem).getByTestId('signboard-indicator')).toHaveTextContent('看板あり');
      expect(signboardsApi.getConstructionSignboards).not.toHaveBeenCalled();
    });

    it('看板の一覧の取得中は、看板の指定と配置を持つ写真項目のダイアログで指定を変える操作を出さず、未保存にもならない（是正 2 巡目）', async () => {
      // 取得を終わらせない（取得中の窓を作る）
      vi.mocked(signboardsApi.getConstructionSignboards).mockReturnValue(new Promise(() => {}));
      vi.mocked(imagesApi.getConstructionPhotos).mockResolvedValue([
        makePhoto({
          id: 'photo-1',
          displayOrder: 1,
          fileName: 'a.jpg',
          signboardId: 'sb-1',
          signboardPlacement: { left: 10, top: 20, width: 200, height: 150 },
        }),
      ]);

      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      fireEvent.click(within(firstItem).getByRole('button', { name: /看板を配置/ }));

      const dialog = await screen.findByRole('dialog', { name: /看板を配置/ });
      expect(within(dialog).getByLabelText('看板を選択')).toBeDisabled();
      expect(within(dialog).queryByTestId('signboard-placement-editor')).not.toBeInTheDocument();
      expect(within(dialog).getByRole('status')).toHaveTextContent('工事看板を読み込んでいます');

      fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: /看板を配置/ })).not.toBeInTheDocument()
      );
      expect(lastUnsavedDirty()).toBe(false);
      expect(within(firstItem).getByTestId('signboard-indicator')).toHaveTextContent('看板あり');
    });

    it('看板の一覧の取得に失敗したら、看板が登録済みでも0件とは述べず、失敗の文言を role=alert で示す', async () => {
      vi.mocked(signboardsApi.getConstructionSignboards).mockRejectedValue(
        new ApiError(500, 'Internal Server Error')
      );

      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      await waitFor(() => {
        expect(signboardsApi.getConstructionSignboards).toHaveBeenCalledWith('project-1');
      });
      fireEvent.click(within(firstItem).getByRole('button', { name: /看板を配置/ }));

      const dialog = await screen.findByRole('dialog', { name: /看板を配置/ });
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        '工事看板を読み込めませんでした。時間をおいて再度お試しください。'
      );
      expect(
        within(dialog).queryByText(/このプロジェクトには工事看板が登録されていません/)
      ).not.toBeInTheDocument();
    });

    it('リンクを押すと配置のダイアログが閉じ、未保存の変更は保たれたまま遷移の確認（useBlocker）へ委ねる', async () => {
      vi.mocked(signboardsApi.getConstructionSignboards).mockResolvedValue([]);

      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      // 未保存の変更を作る
      fireEvent.click(within(firstItem).getByLabelText('印刷対象に含める'));
      await waitFor(() => {
        expect(lastUnsavedDirty()).toBe(true);
      });

      fireEvent.click(within(firstItem).getByRole('button', { name: /看板を配置/ }));
      const dialog = await screen.findByRole('dialog', { name: /看板を配置/ });
      fireEvent.click(within(dialog).getByRole('link', { name: '工事看板マスタを開く' }));

      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: /看板を配置/ })).not.toBeInTheDocument()
      );
      // 画面の遷移の判定は useBlocker が未保存の状態で受け持つ（実際の遮断は E2E で確かめる）
      expect(mockUseBlocker.mock.calls[mockUseBlocker.mock.calls.length - 1]?.[0]).toBe(true);
      expect(lastUnsavedDirty()).toBe(true);
    });
  });

  it('写真項目の「看板を配置」導線でダイアログが開き看板選択と配置エディタが表示される (R9.1)', async () => {
    renderPage();
    const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;

    fireEvent.click(within(firstItem).getByRole('button', { name: /看板を配置/ }));

    const dialog = await screen.findByRole('dialog', { name: /看板を配置/ });
    expect(within(dialog).getByTestId('signboard-placement-editor')).toBeInTheDocument();
    // プロジェクトの看板一覧が選択肢として並ぶ（未指定を含む）
    expect(within(dialog).getByRole('option', { name: '未指定' })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: /基礎配筋工事/ })).toBeInTheDocument();
  });

  it('看板を選択し配置を保存すると保存でメタバッチに signboardId と placement が含まれる (R9.1, R9.5)', async () => {
    vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockResolvedValue([]);

    renderPage();
    const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
    fireEvent.click(within(firstItem).getByRole('button', { name: /看板を配置/ }));

    const dialog = await screen.findByRole('dialog', { name: /看板を配置/ });
    fireEvent.change(within(dialog).getByLabelText('看板を選択'), { target: { value: 'sb-1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '配置を保存' }));

    // ダイアログが閉じ、未保存状態になる
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /看板を配置/ })).not.toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(imagesApi.updateConstructionPhotoMetadataBatch).toHaveBeenCalledTimes(1);
    });
    const batchArg = vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mock.calls[0]![0];
    const update = batchArg.find((u) => u.id === 'photo-1');
    expect(update).toMatchObject({
      signboardId: 'sb-1',
      signboardPlacement: { left: 1, top: 2, width: 3, height: 4 },
    });
  });

  it('未指定(None)を選択して保存すると signboardId=null・placement=null で確定する (R9.2)', async () => {
    vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockResolvedValue([]);
    vi.mocked(imagesApi.getConstructionPhotos).mockResolvedValue([
      makePhoto({
        id: 'photo-1',
        displayOrder: 1,
        fileName: 'a.jpg',
        signboardId: 'sb-1',
        signboardPlacement: { left: 10, top: 10, width: 20, height: 20 },
      }),
    ]);

    renderPage();
    const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
    fireEvent.click(within(firstItem).getByRole('button', { name: /看板を配置/ }));

    const dialog = await screen.findByRole('dialog', { name: /看板を配置/ });
    // 割当済み→未指定へ変更
    fireEvent.change(within(dialog).getByLabelText('看板を選択'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '配置を保存' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /看板を配置/ })).not.toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(imagesApi.updateConstructionPhotoMetadataBatch).toHaveBeenCalledTimes(1);
    });
    const batchArg = vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mock.calls[0]![0];
    const update = batchArg.find((u) => u.id === 'photo-1');
    expect(update).toMatchObject({ signboardId: null, signboardPlacement: null });
  });

  // ==========================================================================
  // Task 12.2: 詳細画面にZIP一括エクスポートを結線 (R15.1, R15.5, R15.6, R15.7, R15.8, R15.9, R15.11)
  // ==========================================================================

  describe('ZIP一括エクスポート結線 (R15)', () => {
    it('全件エクスポート起動→設定選択→開始でservice.exportが全写真項目で呼ばれダウンロードされる (R15.1, R15.5)', async () => {
      const blob = new Blob(['zip']);
      vi.mocked(constructionPhotoBulkExportService.export).mockResolvedValue({
        blob,
        failed: [],
      });

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      fireEvent.click(screen.getByRole('button', { name: '全件エクスポート' }));
      const dialog = await screen.findByRole('dialog', { name: /全件一括エクスポート/ });
      fireEvent.click(within(dialog).getByRole('button', { name: '開始' }));

      await waitFor(() => {
        expect(constructionPhotoBulkExportService.export).toHaveBeenCalledTimes(1);
      });
      const [targets, settings] = vi.mocked(constructionPhotoBulkExportService.export).mock
        .calls[0]!;
      expect(targets).toHaveLength(2);
      expect(settings).toMatchObject({
        format: 'jpeg',
        resolution: 'medium',
        signboardMode: 'composited',
      });

      // ダウンロード確定（URL.createObjectURL経由でBlobを取得）
      await waitFor(() => {
        expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
      });
    });

    it('写真項目を選択してから選択エクスポートすると選択済みのみが対象になる (R15.6)', async () => {
      vi.mocked(constructionPhotoBulkExportService.export).mockResolvedValue({
        blob: new Blob(['zip']),
        failed: [],
      });

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      const items = await screen.findAllByTestId('construction-photo-item');
      const firstItem = items[0]!;
      fireEvent.click(within(firstItem).getByLabelText('エクスポート対象に含める'));

      const selectedButton = screen.getByRole('button', { name: /選択エクスポート/ });
      expect(selectedButton).not.toBeDisabled();
      fireEvent.click(selectedButton);

      const dialog = await screen.findByRole('dialog', { name: /選択画像エクスポート/ });
      fireEvent.click(within(dialog).getByRole('button', { name: '開始' }));

      await waitFor(() => {
        expect(constructionPhotoBulkExportService.export).toHaveBeenCalledTimes(1);
      });
      const [targets] = vi.mocked(constructionPhotoBulkExportService.export).mock.calls[0]!;
      expect(targets).toHaveLength(1);
      expect(targets[0]).toMatchObject({ id: 'photo-1' });
    });

    it('写真項目を1件も選択していない間は選択エクスポートの実行手段が無効化される (R15.7)', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      const selectedButton = screen.getByRole('button', { name: /選択エクスポート/ });
      expect(selectedButton).toBeDisabled();
    });

    it('エクスポート進行中は進捗（完了件数・総件数）が表示される (R15.8)', async () => {
      let resolveExport: (value: { blob: Blob; failed: string[] }) => void = () => {};
      vi.mocked(constructionPhotoBulkExportService.export).mockImplementation(
        (_photos, _settings, handlers) =>
          new Promise((resolve) => {
            resolveExport = resolve;
            handlers.onProgress({ completed: 1, total: 2, failed: 0 });
          })
      );

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      fireEvent.click(screen.getByRole('button', { name: '全件エクスポート' }));
      const settingsDialog = await screen.findByRole('dialog', { name: /全件一括エクスポート/ });
      fireEvent.click(within(settingsDialog).getByRole('button', { name: '開始' }));

      const progressDialog = await screen.findByRole('dialog', {
        name: /一括エクスポート処理中/,
      });
      expect(within(progressDialog).getByText('1 / 2 件')).toBeInTheDocument();

      await act(async () => {
        resolveExport({ blob: new Blob(['zip']), failed: [] });
      });
    });

    it('中断ボタン押下でAbortされ処理が中断する (R15.9)', async () => {
      let capturedSignal: AbortSignal | null = null;
      vi.mocked(constructionPhotoBulkExportService.export).mockImplementation(
        (_photos, _settings, handlers) => {
          capturedSignal = handlers.signal;
          return new Promise((_resolve, reject) => {
            handlers.signal.addEventListener('abort', () => {
              reject(new DOMException('The export was aborted', 'AbortError'));
            });
          });
        }
      );

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      fireEvent.click(screen.getByRole('button', { name: '全件エクスポート' }));
      const settingsDialog = await screen.findByRole('dialog', { name: /全件一括エクスポート/ });
      fireEvent.click(within(settingsDialog).getByRole('button', { name: '開始' }));

      const progressDialog = await screen.findByRole('dialog', {
        name: /一括エクスポート処理中/,
      });
      fireEvent.click(within(progressDialog).getByRole('button', { name: '中断' }));

      await waitFor(() => {
        expect(capturedSignal?.aborted).toBe(true);
      });
      // 中断確定後は「完了」表示（isRunning=false）へ遷移し、ダウンロードは実行されない
      await screen.findByRole('dialog', { name: /一括エクスポート完了/ });
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('エクスポート対象の写真項目が0件のときは実行せず通知する (R15.11)', async () => {
      vi.mocked(imagesApi.getConstructionPhotos).mockResolvedValue([]);

      renderPage();
      await waitFor(() => {
        expect(imagesApi.getConstructionPhotos).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByRole('button', { name: '全件エクスポート' }));

      const dialog = await screen.findByRole('dialog', { name: /全件一括エクスポート/ });
      expect(within(dialog).getByRole('status')).toHaveTextContent(
        'エクスポート対象の写真項目がありません。'
      );
      expect(constructionPhotoBulkExportService.export).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Task 12.3: 詳細画面にアルバム編集・削除導線を結線 (R16.1, R16.2, R16.3, R16.4, R16.5)
  // ==========================================================================

  describe('アルバム編集・削除導線 (R16)', () => {
    beforeEach(() => {
      vi.mocked(albumsApi.deleteConstructionPhotoAlbum).mockResolvedValue(undefined);
    });

    it('編集ボタン押下でアルバム編集画面へ遷移する (R16.1, R16.2)', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      fireEvent.click(screen.getByRole('button', { name: '編集' }));

      expect(mockNavigate).toHaveBeenCalledWith('/construction-photos/album-1/edit');
    });

    it('削除ボタン押下で削除確認ダイアログが表示される (R16.3, R16.4)', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      fireEvent.click(screen.getByRole('button', { name: '削除' }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/基礎工事アルバム/)).toBeInTheDocument();
      expect(albumsApi.deleteConstructionPhotoAlbum).not.toHaveBeenCalled();
    });

    it('削除確認を承認するとAPIが呼ばれ工事写真一覧へ遷移する (R16.5)', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: '削除' }));

      await waitFor(() => {
        expect(albumsApi.deleteConstructionPhotoAlbum).toHaveBeenCalledWith('album-1');
      });
      expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1/construction-photos');
    });

    it('削除確認ダイアログでキャンセルすると削除APIは呼ばれずダイアログが閉じる (R16.4)', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(albumsApi.deleteConstructionPhotoAlbum).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalledWith('/projects/project-1/construction-photos');
    });
  });

  // ==========================================================================
  // Task 12.4: 権限に基づくUI表示制御を結線 (R17.1, R17.2, R17.3, R17.4, R17.5)
  // ==========================================================================

  describe('権限に基づくUI表示制御 (R17)', () => {
    it('編集権限なし(user想定)ではアップローダ・アルバム編集・保存・並び替え・看板配置の導線が非表示になる (R17.1, R17.3)', async () => {
      mockUseConstructionPhotoPermission.mockReturnValue({
        ...fullPermission,
        canEdit: false,
      });

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      // アルバム編集導線が非表示（削除は権限ありのため表示のまま）
      expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();

      // 3系統アップローダが非表示
      expect(screen.queryByTestId('file-input')).not.toBeInTheDocument();

      // 写真項目パネルが読み取り専用: 保存ボタン・並び替えボタン・看板配置導線が非表示
      expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '上へ移動' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '下へ移動' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /看板を配置/ })).not.toBeInTheDocument();

      // コメント・印刷対象は読み取り専用として無効化される
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      expect(within(firstItem).getByLabelText('コメント')).toHaveAttribute('readonly');
      expect(within(firstItem).getByLabelText('印刷対象に含める')).toBeDisabled();
    });

    it('編集権限なしでは写真項目削除の導線も非表示になる (R17.1)', async () => {
      mockUseConstructionPhotoPermission.mockReturnValue({
        ...fullPermission,
        canEdit: false,
      });

      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;

      expect(
        within(firstItem).queryByRole('button', { name: /写真項目を削除/ })
      ).not.toBeInTheDocument();
    });

    it('削除権限なし(user想定)ではアルバム削除・写真項目削除の導線が非表示になり、編集系導線は表示のまま (R17.2)', async () => {
      mockUseConstructionPhotoPermission.mockReturnValue({
        ...fullPermission,
        canDelete: false,
      });

      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;

      // アルバム削除導線が非表示（編集は権限ありのため表示のまま）
      expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();

      // 写真項目削除の導線が非表示
      expect(
        within(firstItem).queryByRole('button', { name: /写真項目を削除/ })
      ).not.toBeInTheDocument();

      // 編集系（保存・並び替え・アップローダ）は表示のまま
      expect(screen.getByTestId('file-input')).toBeInTheDocument();
      expect(within(firstItem).getByRole('button', { name: '下へ移動' })).toBeInTheDocument();
    });

    it('権限ロード中は安全側で編集系・削除系の操作手段をすべて非表示にする (R17.5)', async () => {
      mockUseConstructionPhotoPermission.mockReturnValue({
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        isLoading: true,
        getPermissionError: () => null,
      });

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
      expect(screen.queryByTestId('file-input')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument();

      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      expect(
        within(firstItem).queryByRole('button', { name: /写真項目を削除/ })
      ).not.toBeInTheDocument();
      expect(
        within(firstItem).queryByRole('button', { name: /看板を配置/ })
      ).not.toBeInTheDocument();
    });

    it('編集権限がある場合はアップローダ・保存・並び替え・看板配置の導線が表示される（回帰）', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      expect(screen.getByTestId('file-input')).toBeInTheDocument();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      expect(within(firstItem).getByRole('button', { name: /看板を配置/ })).toBeInTheDocument();
      expect(within(firstItem).getByRole('button', { name: /写真項目を削除/ })).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 12.5: 未保存離脱警告を結線（独自isDirty stateをuseUnsavedChangesへ置換, R18）
  // ==========================================================================

  describe('未保存離脱警告の結線 (R18)', () => {
    it('編集権限がある場合、変更で useUnsavedChanges へ isDirty=true が渡る (R18.4)', async () => {
      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;

      // 変更前は未保存でない
      expect(lastUnsavedDirty()).toBe(false);

      fireEvent.click(within(firstItem).getByLabelText('印刷対象に含める'));

      await waitFor(() => {
        expect(lastUnsavedDirty()).toBe(true);
      });
    });

    it('編集権限が無い場合、useUnsavedChanges へは常に isDirty=false が渡り離脱警告が無効化される (R18.4)', async () => {
      mockUseConstructionPhotoPermission.mockReturnValue({ ...fullPermission, canEdit: false });

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      expect(mockUseUnsavedChanges).toHaveBeenCalled();
      expect(mockUseUnsavedChanges.mock.calls.every(([options]) => options.isDirty === false)).toBe(
        true
      );
    });

    it('コメント変更で未保存状態になる (R18.1)', async () => {
      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;

      const textarea = within(firstItem).getByLabelText('コメント');
      fireEvent.change(textarea, { target: { value: '配筋検査' } });
      fireEvent.blur(textarea);

      await waitFor(() => {
        expect(lastUnsavedDirty()).toBe(true);
      });
    });

    it('印刷対象トグルで未保存状態になる (R18.1)', async () => {
      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;

      fireEvent.click(within(firstItem).getByLabelText('印刷対象に含める'));

      await waitFor(() => {
        expect(lastUnsavedDirty()).toBe(true);
      });
    });

    it('並び替えで未保存状態になる (R18.1)', async () => {
      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;

      fireEvent.click(within(firstItem).getByRole('button', { name: '下へ移動' }));

      await waitFor(() => {
        expect(lastUnsavedDirty()).toBe(true);
      });
    });

    it('看板配置の保存で未保存状態になる (R18.1)', async () => {
      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      fireEvent.click(within(firstItem).getByRole('button', { name: /看板を配置/ }));

      const dialog = await screen.findByRole('dialog', { name: /看板を配置/ });
      fireEvent.change(within(dialog).getByLabelText('看板を選択'), { target: { value: 'sb-1' } });
      fireEvent.click(within(dialog).getByRole('button', { name: '配置を保存' }));

      await waitFor(() => {
        expect(lastUnsavedDirty()).toBe(true);
      });
    });

    it('保存成功で未保存状態が解消する (R18.3)', async () => {
      vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockResolvedValue([]);

      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      fireEvent.click(within(firstItem).getByLabelText('印刷対象に含める'));
      await waitFor(() => {
        expect(lastUnsavedDirty()).toBe(true);
      });

      fireEvent.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(imagesApi.updateConstructionPhotoMetadataBatch).toHaveBeenCalled();
        expect(lastUnsavedDirty()).toBe(false);
      });
    });

    // --------------------------------------------------------------------
    // タスク 23.6: 写真項目の削除の成功の後の未保存の状態
    // 未保存の状態は、保留中の変更（写真項目ごとのメタ変更と順序の変更）が一つでも残っている
    // ときに限る。削除で保留が空になれば未保存を解消し、他の保留が残れば未保存のまま保つ。
    // 削除の失敗で未保存の状態が変わらないことは、21.3 の「失敗しても未保存の状態と未保存の
    // 変更は変わらない」が主張する。
    // --------------------------------------------------------------------
    describe('写真項目の削除の成功の後の未保存の状態（タスク 23.6）', () => {
      /** 直近の描画で画面が useBlocker へ渡した遮断の要否 */
      const lastBlockerArg = (): boolean | undefined =>
        mockUseBlocker.mock.calls[mockUseBlocker.mock.calls.length - 1]?.[0];

      /** 指定の写真項目のコメントを編集する（入力の後に確定する） */
      const editComment = (item: HTMLElement, value: string): void => {
        const textarea = within(item).getByLabelText('コメント');
        fireEvent.change(textarea, { target: { value } });
        fireEvent.blur(textarea);
      };

      /** 指定のファイル名の写真項目を削除する（確認ダイアログで「削除する」を押し、閉じるまで待つ） */
      const deletePhoto = async (fileName: string): Promise<void> => {
        fireEvent.click(screen.getByRole('button', { name: `写真項目を削除: ${fileName}` }));
        const dialog = await screen.findByRole('dialog', { name: '写真項目を削除' });
        fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }));
        await waitFor(() => {
          expect(screen.queryByRole('dialog', { name: '写真項目を削除' })).not.toBeInTheDocument();
        });
      };

      beforeEach(() => {
        vi.mocked(imagesApi.deleteConstructionPhoto).mockResolvedValue(undefined);
        vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockResolvedValue([]);
        vi.mocked(imagesApi.updateConstructionPhotoOrder).mockResolvedValue(undefined);
      });

      it('コメントを編集した写真項目を取り除き、保留が空になると、未保存の状態が解消する（表示・保存・離脱の確認） (R18.3)', async () => {
        renderPage();
        const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
        editComment(firstItem, '配筋検査');
        // 前提: 未保存である
        await waitFor(() => expect(lastUnsavedDirty()).toBe(true));
        expect(screen.getByText('未保存の変更があります')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();

        await deletePhoto('a.jpg');

        await waitFor(() => {
          expect(screen.getAllByTestId('construction-photo-item')).toHaveLength(1);
        });
        await waitFor(() => expect(lastUnsavedDirty()).toBe(false));
        expect(lastBlockerArg()).toBe(false);
        expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument();
        // 送るものが無いため、保存は押せない（押して未保存のまま残る状態にならない）
        expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
        expect(imagesApi.updateConstructionPhotoMetadataBatch).not.toHaveBeenCalled();
        expect(imagesApi.updateConstructionPhotoOrder).not.toHaveBeenCalled();
      });

      it('他の写真項目の編集が残るときは未保存のままで、保存はその編集だけを送る', async () => {
        renderPage();
        const [firstItem, secondItem] = await screen.findAllByTestId('construction-photo-item');
        editComment(firstItem!, '取り除く写真の編集');
        editComment(secondItem!, '残る写真の編集');
        await waitFor(() => expect(lastUnsavedDirty()).toBe(true));

        await deletePhoto('a.jpg');

        await waitFor(() => {
          expect(screen.getAllByTestId('construction-photo-item')).toHaveLength(1);
        });
        expect(lastUnsavedDirty()).toBe(true);
        expect(lastBlockerArg()).toBe(true);
        expect(screen.getByText('未保存の変更があります')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        await waitFor(() => {
          expect(imagesApi.updateConstructionPhotoMetadataBatch).toHaveBeenCalledWith([
            { id: 'photo-2', comment: '残る写真の編集' },
          ]);
        });
        await waitFor(() => expect(lastUnsavedDirty()).toBe(false));
        expect(imagesApi.updateConstructionPhotoOrder).not.toHaveBeenCalled();
      });

      it('順序の変更が残るときは、メタ変更の保留が空になっても未保存のままで、保存は順序だけを送る', async () => {
        vi.mocked(imagesApi.getConstructionPhotos).mockResolvedValue([
          makePhoto({ id: 'photo-1', displayOrder: 1, fileName: 'a.jpg' }),
          makePhoto({ id: 'photo-2', displayOrder: 2, fileName: 'b.jpg' }),
          makePhoto({ id: 'photo-3', displayOrder: 3, fileName: 'c.jpg' }),
        ]);

        renderPage();
        const items = await screen.findAllByTestId('construction-photo-item');
        expect(items).toHaveLength(3);
        // c.jpg を一つ上へ（a, c, b）。その後に a.jpg のコメントを編集する
        fireEvent.click(within(items[2]!).getByRole('button', { name: '上へ移動' }));
        editComment(screen.getAllByTestId('construction-photo-item')[0]!, '取り除く写真の編集');
        await waitFor(() => expect(lastUnsavedDirty()).toBe(true));

        await deletePhoto('a.jpg');

        await waitFor(() => {
          expect(screen.getAllByTestId('construction-photo-item')).toHaveLength(2);
        });
        expect(lastUnsavedDirty()).toBe(true);
        expect(lastBlockerArg()).toBe(true);
        expect(screen.getByText('未保存の変更があります')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        await waitFor(() => {
          expect(imagesApi.updateConstructionPhotoOrder).toHaveBeenCalledWith('album-1', [
            { id: 'photo-3', order: 1 },
            { id: 'photo-2', order: 2 },
          ]);
        });
        await waitFor(() => expect(lastUnsavedDirty()).toBe(false));
        expect(imagesApi.updateConstructionPhotoMetadataBatch).not.toHaveBeenCalled();
      });

      it('並び替えた写真項目をすべて取り除き、順序の保留に写真項目が残らなくなると、未保存の状態が解消する', async () => {
        renderPage();
        const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
        fireEvent.click(within(firstItem).getByRole('button', { name: '下へ移動' }));
        await waitFor(() => expect(lastUnsavedDirty()).toBe(true));

        await deletePhoto('a.jpg');
        await deletePhoto('b.jpg');

        await waitFor(() => {
          expect(screen.queryAllByTestId('construction-photo-item')).toHaveLength(0);
        });
        await waitFor(() => expect(lastUnsavedDirty()).toBe(false));
        expect(lastBlockerArg()).toBe(false);
        expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument();
        expect(imagesApi.updateConstructionPhotoOrder).not.toHaveBeenCalled();
      });
    });

    // --------------------------------------------------------------------
    // タスク 24.5: 保存の実行中の編集と、保存の成功の後の保留の消去
    // 保存は開始時に送る保留を取り出し、成功の後は送ったものだけを保留から消す。実行中の編集は
    // 送った内容と比べ、違えば未保存として残し、次の保存で送る。送った内容と同じ値へ戻した編集は
    // サーバーの値と表示が一致するため消す。失敗のときは送った保留も実行中の編集も残す。
    // --------------------------------------------------------------------
    describe('保存の実行中の編集（タスク 24.5）', () => {
      /** 直近の描画で画面が useBlocker へ渡した遮断の要否 */
      const lastBlockerArg = (): boolean | undefined =>
        mockUseBlocker.mock.calls[mockUseBlocker.mock.calls.length - 1]?.[0];

      /** 指定の写真項目のコメントを編集する（入力の後に確定する） */
      const editComment = (item: HTMLElement, value: string): void => {
        const textarea = within(item).getByLabelText('コメント');
        fireEvent.change(textarea, { target: { value } });
        fireEvent.blur(textarea);
      };

      /** 応答を手元で決める保存の要求（メタバッチ）。呼ばれた順に resolve/reject を積む */
      const holdMetadataBatch = () => {
        const settlers: Array<{ resolve: () => void; reject: (err: unknown) => void }> = [];
        vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockImplementation(
          () =>
            new Promise((resolve, reject) => {
              settlers.push({ resolve: () => resolve([]), reject });
            })
        );
        return settlers;
      };

      /** 保存を押し、要求の実行中（「保存中...」）になるまで待つ */
      const startSave = async (): Promise<void> => {
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        await screen.findByRole('button', { name: '保存中...' });
      };

      beforeEach(() => {
        vi.mocked(imagesApi.updateConstructionPhotoOrder).mockResolvedValue(undefined);
      });

      it('実行中に同じ写真項目のコメントを編集すると、成功の後も未保存のままで、次の保存でその編集を送る (R18.1, R18.3)', async () => {
        const settlers = holdMetadataBatch();
        renderPage();
        const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
        editComment(firstItem, '一回目');
        await waitFor(() => expect(lastUnsavedDirty()).toBe(true));

        await startSave();
        expect(imagesApi.updateConstructionPhotoMetadataBatch).toHaveBeenLastCalledWith([
          { id: 'photo-1', comment: '一回目' },
        ]);
        editComment(screen.getAllByTestId('construction-photo-item')[0]!, '二回目');

        await act(async () => {
          settlers[0]!.resolve();
        });
        await screen.findByRole('button', { name: '保存' });

        expect(lastUnsavedDirty()).toBe(true);
        expect(lastBlockerArg()).toBe(true);
        expect(screen.getByText('未保存の変更があります')).toBeInTheDocument();
        expect(
          within(screen.getAllByTestId('construction-photo-item')[0]!).getByLabelText('コメント')
        ).toHaveValue('二回目');

        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        await waitFor(() => expect(settlers).toHaveLength(2));
        expect(imagesApi.updateConstructionPhotoMetadataBatch).toHaveBeenLastCalledWith([
          { id: 'photo-1', comment: '二回目' },
        ]);
        await act(async () => {
          settlers[1]!.resolve();
        });
        await waitFor(() => expect(lastUnsavedDirty()).toBe(false));
        expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument();
      });

      it('実行中に別の写真項目のコメントを編集すると、成功の後も未保存のままで、次の保存はその編集だけを送る (R18.1, R18.3)', async () => {
        const settlers = holdMetadataBatch();
        renderPage();
        const [firstItem] = await screen.findAllByTestId('construction-photo-item');
        editComment(firstItem!, '送った編集');
        await waitFor(() => expect(lastUnsavedDirty()).toBe(true));

        await startSave();
        editComment(screen.getAllByTestId('construction-photo-item')[1]!, '実行中の編集');

        await act(async () => {
          settlers[0]!.resolve();
        });
        await screen.findByRole('button', { name: '保存' });

        expect(lastUnsavedDirty()).toBe(true);
        expect(lastBlockerArg()).toBe(true);
        expect(screen.getByText('未保存の変更があります')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        await waitFor(() => expect(settlers).toHaveLength(2));
        expect(imagesApi.updateConstructionPhotoMetadataBatch).toHaveBeenLastCalledWith([
          { id: 'photo-2', comment: '実行中の編集' },
        ]);
        await act(async () => {
          settlers[1]!.resolve();
        });
        await waitFor(() => expect(lastUnsavedDirty()).toBe(false));
      });

      it('実行中に送った値から編集し、送った値と同じ値へ戻すと、成功の後に未保存を解消する (R18.3)', async () => {
        const settlers = holdMetadataBatch();
        renderPage();
        const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
        editComment(firstItem, '送った値');
        await waitFor(() => expect(lastUnsavedDirty()).toBe(true));

        await startSave();
        editComment(screen.getAllByTestId('construction-photo-item')[0]!, '途中の値');
        editComment(screen.getAllByTestId('construction-photo-item')[0]!, '送った値');

        await act(async () => {
          settlers[0]!.resolve();
        });
        await screen.findByRole('button', { name: '保存' });

        await waitFor(() => expect(lastUnsavedDirty()).toBe(false));
        expect(lastBlockerArg()).toBe(false);
        expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
      });

      it('実行中に並び替えると、成功の後も未保存のままで、次の保存でその順序を送る (R18.1, R18.3)', async () => {
        const settlers = holdMetadataBatch();
        renderPage();
        const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
        editComment(firstItem, '送った編集');
        await waitFor(() => expect(lastUnsavedDirty()).toBe(true));

        await startSave();
        fireEvent.click(
          within(screen.getAllByTestId('construction-photo-item')[0]!).getByRole('button', {
            name: '下へ移動',
          })
        );

        await act(async () => {
          settlers[0]!.resolve();
        });
        await screen.findByRole('button', { name: '保存' });

        // 開始時に順序の保留は無かったため、この保存では順序を送らない
        expect(imagesApi.updateConstructionPhotoOrder).not.toHaveBeenCalled();
        expect(lastUnsavedDirty()).toBe(true);
        expect(screen.getByText('未保存の変更があります')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        await waitFor(() => {
          expect(imagesApi.updateConstructionPhotoOrder).toHaveBeenCalledWith('album-1', [
            { id: 'photo-2', order: 1 },
            { id: 'photo-1', order: 2 },
          ]);
        });
        await waitFor(() => expect(lastUnsavedDirty()).toBe(false));
        // メタ変更は先の保存で確定したため、二度目は送らない
        expect(settlers).toHaveLength(1);
      });

      it('開始時に順序の保留があり、実行中にもう一度並び替えると、成功の後も未保存のままで、次の保存で新しい順序を送る (R18.1, R18.3)', async () => {
        // 順序の保存の要求を手元で止める
        const orderSettlers: Array<() => void> = [];
        vi.mocked(imagesApi.updateConstructionPhotoOrder).mockImplementation(
          () =>
            new Promise<void>((resolve) => {
              orderSettlers.push(() => resolve());
            })
        );
        renderPage();
        const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
        // a, b → b, a（開始時の順序の保留）
        fireEvent.click(within(firstItem).getByRole('button', { name: '下へ移動' }));
        await waitFor(() => expect(lastUnsavedDirty()).toBe(true));

        await startSave();
        expect(imagesApi.updateConstructionPhotoOrder).toHaveBeenLastCalledWith('album-1', [
          { id: 'photo-2', order: 1 },
          { id: 'photo-1', order: 2 },
        ]);
        // 実行中に b, a → a, b
        fireEvent.click(
          within(screen.getAllByTestId('construction-photo-item')[0]!).getByRole('button', {
            name: '下へ移動',
          })
        );

        await act(async () => {
          orderSettlers[0]!();
        });
        await screen.findByRole('button', { name: '保存' });

        expect(lastUnsavedDirty()).toBe(true);
        expect(lastBlockerArg()).toBe(true);
        expect(screen.getByText('未保存の変更があります')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        await waitFor(() => expect(orderSettlers).toHaveLength(2));
        expect(imagesApi.updateConstructionPhotoOrder).toHaveBeenLastCalledWith('album-1', [
          { id: 'photo-1', order: 1 },
          { id: 'photo-2', order: 2 },
        ]);
        await act(async () => {
          orderSettlers[1]!();
        });
        await waitFor(() => expect(lastUnsavedDirty()).toBe(false));
        // メタ変更は無いため送らない
        expect(imagesApi.updateConstructionPhotoMetadataBatch).not.toHaveBeenCalled();
      });

      it('コメントだけを送った写真項目で、実行中に印刷対象を切り替えると、成功の後も未保存のままで、次の保存で送る (R18.1, R18.3)', async () => {
        const settlers = holdMetadataBatch();
        renderPage();
        const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
        editComment(firstItem, '送った編集');
        await waitFor(() => expect(lastUnsavedDirty()).toBe(true));

        await startSave();
        expect(imagesApi.updateConstructionPhotoMetadataBatch).toHaveBeenLastCalledWith([
          { id: 'photo-1', comment: '送った編集' },
        ]);
        fireEvent.click(
          within(screen.getAllByTestId('construction-photo-item')[0]!).getByLabelText(
            '印刷対象に含める'
          )
        );

        await act(async () => {
          settlers[0]!.resolve();
        });
        await screen.findByRole('button', { name: '保存' });

        expect(lastUnsavedDirty()).toBe(true);
        expect(lastBlockerArg()).toBe(true);
        expect(screen.getByText('未保存の変更があります')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        await waitFor(() => expect(settlers).toHaveLength(2));
        expect(imagesApi.updateConstructionPhotoMetadataBatch).toHaveBeenLastCalledWith([
          { id: 'photo-1', comment: '送った編集', includeInReport: true },
        ]);
        await act(async () => {
          settlers[1]!.resolve();
        });
        await waitFor(() => expect(lastUnsavedDirty()).toBe(false));
      });

      it('同じ看板のまま、実行中に配置だけを変えると、成功の後も未保存のままで、次の保存で新しい配置を送る (R18.1, R18.3)', async () => {
        const settlers = holdMetadataBatch();
        /** 写真項目の看板の配置のダイアログを開き、看板を選んで配置を保存する */
        const placeSignboard = async (item: HTMLElement): Promise<void> => {
          fireEvent.click(within(item).getByRole('button', { name: /看板を(配置|変更)/ }));
          const dialog = await screen.findByRole('dialog', { name: /看板を配置/ });
          fireEvent.change(within(dialog).getByLabelText('看板を選択'), {
            target: { value: 'sb-1' },
          });
          fireEvent.click(within(dialog).getByRole('button', { name: '配置を保存' }));
          await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: /看板を配置/ })).not.toBeInTheDocument();
          });
        };

        renderPage();
        const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
        await placeSignboard(firstItem);
        await waitFor(() => expect(lastUnsavedDirty()).toBe(true));

        await startSave();
        expect(imagesApi.updateConstructionPhotoMetadataBatch).toHaveBeenLastCalledWith([
          {
            id: 'photo-1',
            signboardId: 'sb-1',
            signboardPlacement: { left: 1, top: 2, width: 3, height: 4 },
          },
        ]);
        // 実行中に、同じ看板のまま配置のジオメトリだけを変える
        mockEditorPlacement.current = { left: 10, top: 20, width: 30, height: 40 };
        await placeSignboard(screen.getAllByTestId('construction-photo-item')[0]!);

        await act(async () => {
          settlers[0]!.resolve();
        });
        await screen.findByRole('button', { name: '保存' });

        expect(lastUnsavedDirty()).toBe(true);
        expect(lastBlockerArg()).toBe(true);
        expect(screen.getByText('未保存の変更があります')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        await waitFor(() => expect(settlers).toHaveLength(2));
        expect(imagesApi.updateConstructionPhotoMetadataBatch).toHaveBeenLastCalledWith([
          {
            id: 'photo-1',
            signboardId: 'sb-1',
            signboardPlacement: { left: 10, top: 20, width: 30, height: 40 },
          },
        ]);
        await act(async () => {
          settlers[1]!.resolve();
        });
        await waitFor(() => expect(lastUnsavedDirty()).toBe(false));
      });

      it('保存が失敗したときは、送った保留も実行中の編集も残り、次の保存で両方を送る (R18.1)', async () => {
        const settlers = holdMetadataBatch();
        renderPage();
        const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
        editComment(firstItem, '送った編集');
        await waitFor(() => expect(lastUnsavedDirty()).toBe(true));

        await startSave();
        editComment(screen.getAllByTestId('construction-photo-item')[1]!, '実行中の編集');

        await act(async () => {
          settlers[0]!.reject(new Error('network'));
        });
        await screen.findByRole('button', { name: '保存' });

        expect(lastUnsavedDirty()).toBe(true);
        expect(screen.getByText('未保存の変更があります')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        await waitFor(() => expect(settlers).toHaveLength(2));
        expect(imagesApi.updateConstructionPhotoMetadataBatch).toHaveBeenLastCalledWith([
          { id: 'photo-1', comment: '送った編集' },
          { id: 'photo-2', comment: '実行中の編集' },
        ]);
      });
    });

    // --------------------------------------------------------------------
    // R18.2: アプリ内遷移全般（Breadcrumbのリンククリック含む）のガードは
    // useBlocker(isDirty) が担う。jsdom にはデータルーター連携の実遷移
    // ブロックが無いため、QuantityTableEditPage/CompanyInfoPage/
    // ItemizedStatementDetailPage の確立済みパターンに倣い useBlocker を
    // モックし、(a) isDirtyに応じた呼び出し引数、(b) blocked状態でのダイアログ
    // 結線（leave→proceed / stay→reset）を検証する。
    // --------------------------------------------------------------------

    it('未保存変更が無い場合、useBlockerがfalseで呼ばれガードしない (R18.2)', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      const calls = mockUseBlocker.mock.calls;
      expect(calls[calls.length - 1]?.[0]).toBe(false);
    });

    it('未保存変更（印刷対象トグル）があると、useBlockerがtrueで呼ばれる (R18.2)', async () => {
      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;

      fireEvent.click(within(firstItem).getByLabelText('印刷対象に含める'));

      await waitFor(() => {
        const calls = mockUseBlocker.mock.calls;
        expect(calls[calls.length - 1]?.[0]).toBe(true);
      });
    });

    it('blocker.state==="blocked"のとき確認ダイアログ（UnsavedChangesDialog）が表示される (R18.2)', async () => {
      mockUseBlocker.mockReturnValue({ state: 'blocked', proceed: mockProceed, reset: mockReset });

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      expect(
        await screen.findByRole('dialog', { name: '変更が保存されていません' })
      ).toBeInTheDocument();
    });

    it('確認ダイアログで「ページを離れる」を選ぶとblocker.proceed()が呼ばれる (R18.2)', async () => {
      mockUseBlocker.mockReturnValue({ state: 'blocked', proceed: mockProceed, reset: mockReset });

      renderPage();
      const dialog = await screen.findByRole('dialog', { name: '変更が保存されていません' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'ページを離れる' }));

      expect(mockProceed).toHaveBeenCalledTimes(1);
      expect(mockReset).not.toHaveBeenCalled();
    });

    it('確認ダイアログで「このページにとどまる」を選ぶとblocker.reset()が呼ばれる (R18.2)', async () => {
      mockUseBlocker.mockReturnValue({ state: 'blocked', proceed: mockProceed, reset: mockReset });

      renderPage();
      const dialog = await screen.findByRole('dialog', { name: '変更が保存されていません' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'このページにとどまる' }));

      expect(mockReset).toHaveBeenCalledTimes(1);
      expect(mockProceed).not.toHaveBeenCalled();
    });

    it('blocker.state==="unblocked"では確認ダイアログが表示されない（回帰）', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      expect(
        screen.queryByRole('dialog', { name: '変更が保存されていません' })
      ).not.toBeInTheDocument();
    });

    it('写真項目クリック・アルバム編集ボタンは素のnavigateを呼ぶ（useBlockerが遷移全般を汎用ガードするため, 回帰）', async () => {
      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;

      fireEvent.click(within(firstItem).getByTestId('construction-photo-image-button'));
      expect(mockNavigate).toHaveBeenCalledWith('/construction-photos/album-1/photos/photo-1');

      fireEvent.click(screen.getByRole('button', { name: '編集' }));
      expect(mockNavigate).toHaveBeenCalledWith('/construction-photos/album-1/edit');
    });
  });

  // ==========================================================================
  // Task 12.6: モバイルレイアウト対応（Requirement 19）
  // site-survey SiteSurveyDetailPage（Task 100.2）と同一パターン
  // ==========================================================================
  describe('モバイルレイアウト対応 (Task 12.6, Requirement 19)', () => {
    it('R19.1: モバイル幅ではページコンテナが固定maxWidth:1200pxに縛られず画面幅にフィットする', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(true);
      vi.mocked(albumsApi.getConstructionPhotoAlbum).mockResolvedValue({
        ...mockAlbum,
        memo: '基礎配筋の記録',
      });

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      const main = screen.getByRole('main');
      expect(main.style.maxWidth).not.toBe('1200px');
      expect(main.style.maxWidth).toBe('100%');
      // 区切りの無い長いアルバム名・メモも折り返して幅に収める（タスク 20.1）
      expect(screen.getByRole('heading', { level: 1 }).style.overflowWrap).toBe('anywhere');
      expect(screen.getByText('基礎配筋の記録').style.overflowWrap).toBe('anywhere');
    });

    it('R19.1: デスクトップ幅では既存のmaxWidth:1200pxレイアウトを維持する（回帰）', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      const main = screen.getByRole('main');
      expect(main.style.maxWidth).toBe('1200px');
      expect(main.style.margin).toBe('0px auto');
    });

    it('R19.4: ブレッドクラムラッパは水平あふれを収容するためoverflow-x:autoを付与する', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(true);

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      const breadcrumbNav = screen.getByRole('navigation', { name: 'パンくずナビゲーション' });
      const breadcrumbWrapper = breadcrumbNav.parentElement;
      expect(breadcrumbWrapper).not.toBeNull();
      expect(breadcrumbWrapper!.style.overflowX).toBe('auto');
      // 区切りの無い長い語も折り返して幅に収める（タスク 19.2）
      expect(breadcrumbWrapper!.style.overflowWrap).toBe('anywhere');
    });

    it('R19.2/19.3/19.5: モバイル幅では写真項目パネルが縦積み・タップ領域確保・16px入力で描画される', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(true);

      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;

      // PhotoItemPanel 自身が useMediaQuery を参照してモバイルスタイルへ分岐する
      // （本ページ側は isMobile を PhotoItemPanel へ委譲する。DetailPage のモバイル対応は
      //   コンテナ幅/パンくずの水平収めに閉じる）
      expect(firstItem.style.flexDirection).toBe('column');

      const textarea = within(firstItem).getByLabelText('コメント') as HTMLElement;
      expect(parseFloat(textarea.style.fontSize)).toBeGreaterThanOrEqual(16);
    });
  });

  // ==========================================================================
  // 例外系・削除・エクスポート補助導線のカバレッジ補完
  // ==========================================================================
  describe('例外系・補助導線のカバレッジ補完', () => {
    it('アルバム取得失敗時はエラー画面を表示し再試行で再取得する', async () => {
      vi.mocked(albumsApi.getConstructionPhotoAlbum)
        .mockRejectedValueOnce(new Error('load fail'))
        .mockResolvedValue(mockAlbum);

      renderPage();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('工事写真アルバムの取得に失敗しました');

      // 再試行で再取得（2回目は成功しページ本体が描画される）
      fireEvent.click(screen.getByRole('button', { name: '再試行' }));
      expect(await screen.findByRole('img', { name: /a\.jpg/ })).toBeInTheDocument();
    });

    it('写真項目一覧の取得失敗時は本体を描画しつつ取得失敗を通知する', async () => {
      vi.mocked(imagesApi.getConstructionPhotos).mockRejectedValue(new Error('photos fail'));

      renderPage();

      // アルバムは取得済みのため本体は描画され、通知にエラーメッセージが出る
      expect(await screen.findByText('工事写真アルバムの取得に失敗しました')).toBeInTheDocument();
    });

    it('ローカルアップロードが全件失敗すると失敗通知が表示される (R4.1)', async () => {
      vi.mocked(imagesApi.uploadConstructionPhotos).mockResolvedValue({
        successful: [],
        failed: [{ fileName: 'ng.jpg', error: 'アップロード失敗' }],
      });

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      const fileInput = screen.getByTestId('file-input');
      await act(async () => {
        fireEvent.change(fileInput, {
          target: { files: [new File(['x'], 'ng.jpg', { type: 'image/jpeg' })] },
        });
      });

      expect(await screen.findByText(/全1件の追加に失敗しました/)).toBeInTheDocument();
    });

    it('写真項目削除フロー：選択・並び替え済みでも削除APIが呼ばれ一覧から除去される (R7.7)', async () => {
      vi.mocked(imagesApi.deleteConstructionPhoto).mockResolvedValue(undefined);

      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;

      // 選択集合に含める（削除時の選択集合更新分岐を通す）
      fireEvent.click(within(firstItem).getByLabelText('エクスポート対象に含める'));
      // 並び替え済みにする（削除時の未保存順序の再採番分岐を通す）
      fireEvent.click(within(firstItem).getByRole('button', { name: '下へ移動' }));

      // 削除導線 → 確認ダイアログ → 削除する
      fireEvent.click(screen.getByRole('button', { name: /写真項目を削除: a\.jpg/ }));
      const deleteDialog = await screen.findByRole('dialog', { name: '写真項目を削除' });
      fireEvent.click(within(deleteDialog).getByRole('button', { name: '削除する' }));

      await waitFor(() => {
        expect(imagesApi.deleteConstructionPhoto).toHaveBeenCalledWith('photo-1');
      });
      await waitFor(() => {
        expect(screen.queryByRole('img', { name: /a\.jpg/ })).not.toBeInTheDocument();
      });
    });

    // ------------------------------------------------------------------------
    // 写真項目の削除が失敗したときの表示（タスク 21.3、23.9）
    // 受入基準 7.7 は失敗時の表示を定めていない。タスク 21.3 は利用者の判断（2026-10-02）により
    // 失敗を詳細画面の上部の通知の枠へ出して画面をそこへ送った。タスク 23.9 の利用者の判断
    // （2026-10-03）により、失敗は取り除こうとした写真項目の中（その写真項目の操作の近く）に
    // role=alert で出し、上部の通知の枠と失敗の状態（`error`）には載せず、画面も送らない。
    // 文言の規則（サーバーの理由、無ければ既定の文言）と、セッション切れを区別しないことは
    // 21.3 のまま保つ。
    // ------------------------------------------------------------------------
    describe('写真項目の削除の失敗の表示（タスク 21.3、23.9）', () => {
      const DELETE_FAILED = '写真項目の削除に失敗しました';

      /** 指定のファイル名の写真項目（article。名前はファイル名の見出し）を返す。 */
      const photoItem = (fileName: string): HTMLElement =>
        screen.getByRole('article', { name: fileName });

      /**
       * 写真項目の外にある role=alert（上部の通知の枠）を返す。削除の失敗はここに出てはならない。
       */
      const noticeFrameAlerts = (): HTMLElement[] =>
        screen
          .queryAllByRole('alert')
          .filter((el) => el.closest('[data-testid="construction-photo-item"]') === null);

      /** 指定の写真項目の削除導線から確認ダイアログを開き、「削除する」を押す。 */
      const confirmDeleteOf = async (fileName: string): Promise<void> => {
        fireEvent.click(screen.getByRole('button', { name: `写真項目を削除: ${fileName}` }));
        const dialog = await screen.findByRole('dialog', { name: '写真項目を削除' });
        fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }));
      };

      /** 写真項目 a.jpg の削除導線から確認ダイアログを開き、「削除する」を押す。 */
      const confirmDeleteOfFirstPhoto = (): Promise<void> => confirmDeleteOf('a.jpg');

      /** 削除APIの呼び出しが済み、確認ダイアログが閉じるまで待つ。 */
      const waitForDeleteSettled = async (calls: number): Promise<void> => {
        await waitFor(() => {
          expect(imagesApi.deleteConstructionPhoto).toHaveBeenCalledTimes(calls);
        });
        await waitFor(() => {
          expect(screen.queryByRole('dialog', { name: '写真項目を削除' })).not.toBeInTheDocument();
        });
      };

      // 21.3 の版は、失敗を上部の通知の枠（写真項目の外の role=alert）に出すことを主張していた。
      // 23.9 では、取り除こうとした写真項目の中に出し、通知の枠には出さないことを主張する
      it('削除APIが失敗すると、その写真項目の中に失敗を表示し、確認ダイアログを閉じ、写真項目を一覧に残す（上部の通知の枠には出さない）', async () => {
        vi.mocked(imagesApi.deleteConstructionPhoto).mockRejectedValue(new Error('boom'));

        renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        // 前提: 失敗の前に失敗の表示は出ていない
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        await confirmDeleteOfFirstPhoto();

        const alert = await within(photoItem('a.jpg')).findByRole('alert');
        expect(alert).toHaveTextContent(DELETE_FAILED);
        await waitForDeleteSettled(1);
        expect(imagesApi.deleteConstructionPhoto).toHaveBeenCalledWith('photo-1');
        // 失敗の表示は取り除こうとした写真項目の中の一つだけで、通知の枠と他の写真項目には出ない
        expect(screen.getAllByRole('alert')).toEqual([alert]);
        expect(noticeFrameAlerts()).toHaveLength(0);
        expect(within(photoItem('b.jpg')).queryByRole('alert')).not.toBeInTheDocument();
        // 写真項目は 2 件とも残り、その場の削除の操作手段からやり直せる
        expect(screen.getAllByTestId('construction-photo-item')).toHaveLength(2);
        expect(
          within(photoItem('a.jpg')).getByRole('button', { name: '写真項目を削除: a.jpg' })
        ).toBeEnabled();
      });

      // 21.3 の版は通知の枠の文言を主張していた。23.9 では写真項目の中の文言を主張する（規則は同じ）
      it('サーバーが理由を返した失敗では、その理由を写真項目の中に表示する（21.3 の文言の規則）', async () => {
        vi.mocked(imagesApi.deleteConstructionPhoto).mockRejectedValue(
          new ApiError(500, 'サーバー内部エラーが発生しました')
        );

        renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        await confirmDeleteOfFirstPhoto();

        const alert = await within(photoItem('a.jpg')).findByRole('alert');
        expect(alert).toHaveTextContent('サーバー内部エラーが発生しました');
        expect(alert).not.toHaveTextContent(DELETE_FAILED);
        expect(noticeFrameAlerts()).toHaveLength(0);
      });

      it('サーバーが理由を返さない失敗では、既定の文言を写真項目の中に表示する（21.3 の文言の規則）', async () => {
        vi.mocked(imagesApi.deleteConstructionPhoto).mockRejectedValue(new ApiError(500, ''));

        renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        await confirmDeleteOfFirstPhoto();

        expect(await within(photoItem('a.jpg')).findByRole('alert')).toHaveTextContent(
          DELETE_FAILED
        );
        expect(noticeFrameAlerts()).toHaveLength(0);
      });

      // 21.3 の版は「やり直しの成功で通知の枠の古い失敗が消える」を主張していた。23.9 では
      // 写真項目の中の失敗が写真項目ごと消え、画面のどこにも失敗の表示が残らないことを主張する
      it('失敗の後にやり直した削除が成功すると、写真項目が失敗の表示ごと一覧から除かれ、失敗の表示はどこにも残らない', async () => {
        vi.mocked(imagesApi.deleteConstructionPhoto)
          .mockRejectedValueOnce(new Error('boom'))
          .mockResolvedValue(undefined);

        renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        await confirmDeleteOfFirstPhoto();
        // 前提: 1 回目は失敗し、写真項目の中に失敗が出ている
        expect(await within(photoItem('a.jpg')).findByRole('alert')).toHaveTextContent(
          DELETE_FAILED
        );
        await waitForDeleteSettled(1);

        await confirmDeleteOfFirstPhoto();
        await waitForDeleteSettled(2);

        await waitFor(() => {
          expect(screen.queryByRole('img', { name: /a\.jpg/ })).not.toBeInTheDocument();
        });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getAllByTestId('construction-photo-item')).toHaveLength(1);
      });

      it('やり直しを始めると、その写真項目の古い失敗の表示は削除の応答を待たずに消える', async () => {
        let resolveRetry: () => void = () => {};
        vi.mocked(imagesApi.deleteConstructionPhoto)
          .mockRejectedValueOnce(new Error('boom'))
          .mockImplementationOnce(
            () =>
              new Promise<void>((resolve) => {
                resolveRetry = resolve;
              })
          );

        renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        await confirmDeleteOfFirstPhoto();
        expect(await within(photoItem('a.jpg')).findByRole('alert')).toHaveTextContent(
          DELETE_FAILED
        );
        await waitForDeleteSettled(1);

        // やり直し: 応答はまだ返らない（確認ダイアログは「削除中...」）
        await confirmDeleteOfFirstPhoto();
        await waitFor(() => {
          expect(imagesApi.deleteConstructionPhoto).toHaveBeenCalledTimes(2);
        });
        expect(screen.getByRole('button', { name: '削除中...' })).toBeDisabled();
        expect(within(photoItem('a.jpg')).queryByRole('alert')).not.toBeInTheDocument();

        await act(async () => {
          resolveRetry();
        });
        await waitFor(() => {
          expect(screen.getAllByTestId('construction-photo-item')).toHaveLength(1);
        });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });

      it('複数の写真項目で削除が失敗すると、それぞれの写真項目の中に、それぞれの失敗が表示される', async () => {
        vi.mocked(imagesApi.deleteConstructionPhoto).mockImplementation(async (photoId) => {
          throw new ApiError(500, `削除できませんでした: ${photoId}`);
        });

        renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        await confirmDeleteOf('a.jpg');
        await waitForDeleteSettled(1);
        await confirmDeleteOf('b.jpg');
        await waitForDeleteSettled(2);

        const alerts = screen.getAllByRole('alert');
        expect(alerts).toHaveLength(2);
        expect(within(photoItem('a.jpg')).getByRole('alert')).toHaveTextContent(
          '削除できませんでした: photo-1'
        );
        expect(within(photoItem('b.jpg')).getByRole('alert')).toHaveTextContent(
          '削除できませんでした: photo-2'
        );
        expect(noticeFrameAlerts()).toHaveLength(0);
        expect(screen.getAllByTestId('construction-photo-item')).toHaveLength(2);
      });

      // 21.3 の版は通知の枠に出ることを主張していた。23.9 では写真項目の中に出し、通知の枠には
      // 出さないことを主張する（セッション切れを区別しない点は同じ）
      it('セッション切れ（401）の失敗でも、他の失敗と同じく写真項目の中に表示する（21.3 と同じく区別しない）', async () => {
        // 共通のセッション切れの表示は API クライアントが別に出す。この画面は操作を保持して再送
        // しないため、再ログインの後に何が起きたかを写真項目の中に残す
        vi.mocked(imagesApi.deleteConstructionPhoto).mockRejectedValue(
          new ApiError(401, '認証の有効期限が切れました')
        );

        renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        await confirmDeleteOfFirstPhoto();

        expect(await within(photoItem('a.jpg')).findByRole('alert')).toHaveTextContent(
          '認証の有効期限が切れました'
        );
        await waitForDeleteSettled(1);
        expect(noticeFrameAlerts()).toHaveLength(0);
        // 写真項目は残る
        expect(screen.getAllByTestId('construction-photo-item')).toHaveLength(2);
      });

      // 21.3 の版は、削除の失敗が `error` に載ることを前提に「後の保存の失敗が通知の枠で古い削除の
      // 失敗を置き換える」を主張していた。23.9 では削除の失敗は `error` に載らないため、
      // 「保存の失敗は通知の枠に出て、削除の失敗とは別の要素で並び、互いに隠さない」を主張する。
      // 保存の対象の変更は他の写真項目（b.jpg）に加える（a.jpg への操作は a.jpg の失敗を消すため）
      it('削除の失敗の後に保存が別の理由で失敗すると、保存の失敗は通知の枠に表示され、削除の失敗は写真項目の中に残る（互いに隠さない）', async () => {
        vi.mocked(imagesApi.deleteConstructionPhoto).mockRejectedValue(
          new ApiError(500, '削除の処理でエラーが発生しました')
        );
        vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockRejectedValue(
          new ApiError(409, '他の利用者が先に更新しました')
        );

        renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        await confirmDeleteOfFirstPhoto();
        // 前提: 削除の失敗が写真項目の中に表示されている
        expect(await within(photoItem('a.jpg')).findByRole('alert')).toHaveTextContent(
          '削除の処理でエラーが発生しました'
        );
        await waitForDeleteSettled(1);

        fireEvent.click(within(photoItem('b.jpg')).getByLabelText('印刷対象に含める'));
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        await waitFor(() => {
          expect(imagesApi.updateConstructionPhotoMetadataBatch).toHaveBeenCalledTimes(1);
        });

        await waitFor(() => {
          expect(noticeFrameAlerts()).toHaveLength(1);
        });
        const [frame] = noticeFrameAlerts();
        expect(frame).toHaveTextContent('他の利用者が先に更新しました');
        expect(frame).not.toHaveTextContent('削除の処理でエラーが発生しました');
        expect(within(photoItem('a.jpg')).getByRole('alert')).toHaveTextContent(
          '削除の処理でエラーが発生しました'
        );
      });

      // 21.3 の版は「保存の成功で通知の枠の古い削除の失敗が消える」を主張していた。23.9 では削除の
      // 失敗は通知の枠に載らないため、「保存が成功しても通知の枠に何も出ない」ことと、保存は
      // a.jpg への操作ではないため a.jpg の失敗の表示は残る（消える契機は a.jpg への操作・やり直し・
      // 画面の離脱である）ことを主張する
      it('削除の失敗の後に他の写真項目の変更の保存が成功すると、通知の枠には何も出ず、削除の失敗は写真項目の中に残る', async () => {
        vi.mocked(imagesApi.deleteConstructionPhoto).mockRejectedValue(new Error('boom'));
        vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockResolvedValue([]);

        renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        await confirmDeleteOfFirstPhoto();
        // 前提: 削除の失敗が写真項目の中に表示されている
        expect(await within(photoItem('a.jpg')).findByRole('alert')).toHaveTextContent(
          DELETE_FAILED
        );
        await waitForDeleteSettled(1);

        fireEvent.click(within(photoItem('b.jpg')).getByLabelText('印刷対象に含める'));
        await waitFor(() => expect(lastUnsavedDirty()).toBe(true));
        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        // 保存が成功し（未保存の状態が解消し）、通知の枠には何も出ない
        await waitFor(() => expect(lastUnsavedDirty()).toBe(false));
        expect(imagesApi.updateConstructionPhotoMetadataBatch).toHaveBeenCalledWith([
          { id: 'photo-2', includeInReport: true },
        ]);
        expect(noticeFrameAlerts()).toHaveLength(0);
        expect(within(photoItem('a.jpg')).getByRole('alert')).toHaveTextContent(DELETE_FAILED);
      });

      // 21.3 の版は、削除の開始が先の通知（アップロードの失敗）を消し、通知の枠が削除の失敗に
      // 置き換わることを主張していた。消していたのは削除の失敗を通知の枠で隠さないためで、23.9 で
      // 削除の失敗が通知の枠を使わなくなったため理由が無くなった。23.9 では、先の通知は残り、
      // 削除の失敗は写真項目の中に別に出ることを主張する
      it('アップロードの失敗の通知が出ている状態で削除が失敗すると、通知は残り、削除の失敗は写真項目の中に別に表示される', async () => {
        vi.mocked(imagesApi.uploadConstructionPhotos).mockResolvedValue({
          successful: [],
          failed: [{ fileName: 'ng.jpg', error: 'アップロード失敗' }],
        });
        vi.mocked(imagesApi.deleteConstructionPhoto).mockRejectedValue(new Error('boom'));

        renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        await act(async () => {
          fireEvent.change(screen.getByTestId('file-input'), {
            target: { files: [new File(['x'], 'ng.jpg', { type: 'image/jpeg' })] },
          });
        });
        // 前提: アップロードの失敗の通知（Requirement 20 の通知）が出ている
        expect(await screen.findByText(/全1件の追加に失敗しました/)).toBeInTheDocument();

        await confirmDeleteOfFirstPhoto();
        await waitForDeleteSettled(1);

        expect(await within(photoItem('a.jpg')).findByRole('alert')).toHaveTextContent(
          DELETE_FAILED
        );
        // 先の通知は消えず、削除の失敗とは別の要素である
        expect(screen.getByText(/全1件の追加に失敗しました/)).toBeInTheDocument();
        const deleteFailures = screen
          .getAllByRole('alert')
          .filter((el) => el.textContent?.includes(DELETE_FAILED));
        expect(deleteFailures).toHaveLength(1);
        expect(deleteFailures[0]).not.toHaveTextContent(/全1件の追加に失敗しました/);
        expect(
          noticeFrameAlerts().filter((el) => el.textContent?.includes(DELETE_FAILED))
        ).toHaveLength(0);
      });

      // 21.3 の版は、失敗時に上部の通知の枠へ scrollIntoView({ block: 'center' }) が 1 回呼ばれる
      // ことを主張していた。23.9 では、上部の通知の枠へは送らず、写真項目の中の失敗の表示だけに
      // scrollIntoView({ block: 'nearest' }) を 1 回呼ぶ（表示が既に画面内なら画面は動かず、画面の
      // 外なら最小の量だけ動く。利用者の判断（2026-10-04）「文言の分だけ動かす」）ことを主張する
      it('失敗しても上部の通知の枠へは送らず、写真項目の中の失敗の表示だけを最小の移動（block: nearest）で画面内へ入れる', async () => {
        // jsdom は scrollIntoView を実装していないため、呼び出しを観測できる形で差し込む
        const scrollIntoView = vi.fn();
        const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
          configurable: true,
          writable: true,
          value: scrollIntoView,
        });
        try {
          vi.mocked(imagesApi.deleteConstructionPhoto).mockRejectedValue(new Error('boom'));

          renderPage();
          await screen.findByRole('img', { name: /a\.jpg/ });
          await confirmDeleteOfFirstPhoto();

          const alert = await within(photoItem('a.jpg')).findByRole('alert');
          await waitForDeleteSettled(1);
          expect(alert).toHaveTextContent(DELETE_FAILED);
          // 呼ぶのは写真項目の中の失敗の表示に対する 1 回だけで、中央・上端へ寄せる指定ではない
          expect(scrollIntoView).toHaveBeenCalledTimes(1);
          expect(scrollIntoView.mock.contexts[0]).toBe(alert);
          expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
          expect(noticeFrameAlerts()).toHaveLength(0);
          // フォーカスは操作した写真項目の削除ボタンへ戻る（その場でやり直せる。タスク 23.9 の是正 1 巡目）
          expect(document.activeElement).toBe(
            within(photoItem('a.jpg')).getByRole('button', { name: '写真項目を削除: a.jpg' })
          );
        } finally {
          if (original) {
            Object.defineProperty(Element.prototype, 'scrollIntoView', original);
          } else {
            delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
          }
        }
      });

      // 23.6 の未保存の状態の導出に対する回帰の番。主張は 21.3 の版と同じで、失敗の表示の場所だけを
      // 写真項目の中へ改めた
      it('失敗しても未保存の状態と未保存の変更は変わらない (R18.1, R18.3)', async () => {
        vi.mocked(imagesApi.deleteConstructionPhoto).mockRejectedValue(new Error('boom'));
        vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockResolvedValue([]);

        renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        // 前提: 変更の無い状態では未保存ではない
        expect(lastUnsavedDirty()).toBe(false);

        // 変更の無い状態で失敗しても、未保存にならない
        await confirmDeleteOfFirstPhoto();
        expect(await within(photoItem('a.jpg')).findByRole('alert')).toHaveTextContent(
          DELETE_FAILED
        );
        await waitForDeleteSettled(1);
        expect(lastUnsavedDirty()).toBe(false);

        // 未保存の変更がある状態で失敗しても、未保存のままで、変更は保存の対象に残る
        fireEvent.click(within(photoItem('a.jpg')).getByLabelText('印刷対象に含める'));
        await waitFor(() => expect(lastUnsavedDirty()).toBe(true));
        await confirmDeleteOfFirstPhoto();
        await waitForDeleteSettled(2);
        expect(await within(photoItem('a.jpg')).findByRole('alert')).toHaveTextContent(
          DELETE_FAILED
        );
        expect(lastUnsavedDirty()).toBe(true);
        expect(screen.getByText('未保存の変更があります')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        await waitFor(() => {
          expect(imagesApi.updateConstructionPhotoMetadataBatch).toHaveBeenCalledWith([
            { id: 'photo-1', includeInReport: true },
          ]);
        });
        await waitFor(() => expect(lastUnsavedDirty()).toBe(false));
      });
    });

    it('エクスポート対象の選択チェックを二度押しすると選択が解除される (R15.6)', async () => {
      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      const checkbox = within(firstItem).getByLabelText('エクスポート対象に含める');

      // 選択 → 選択エクスポートが有効化
      fireEvent.click(checkbox);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /選択エクスポート/ })).not.toBeDisabled()
      );

      // 再度押下で選択解除 → 選択エクスポートが無効化
      fireEvent.click(checkbox);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /選択エクスポート/ })).toBeDisabled()
      );
    });

    it('PDF出力が失敗すると失敗通知を表示する (R10.1)', async () => {
      vi.mocked(ledgerExportApi.exportConstructionPhotoLedger).mockRejectedValue(new Error('boom'));

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      fireEvent.click(screen.getByRole('button', { name: 'PDF出力' }));

      expect(await screen.findByText('PDF出力に失敗しました')).toBeInTheDocument();
    });

    it('保存APIが失敗するとエラー通知を表示する (R7.6)', async () => {
      vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockRejectedValue(
        new Error('save boom')
      );

      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      fireEvent.click(within(firstItem).getByLabelText('印刷対象に含める'));

      fireEvent.click(screen.getByRole('button', { name: '保存' }));

      expect(await screen.findAllByText('保存に失敗しました')).toHaveLength(2);
    });

    it('アルバム削除APIが失敗するとエラー通知を表示しダイアログを閉じる (R16.5)', async () => {
      vi.mocked(albumsApi.deleteConstructionPhotoAlbum).mockRejectedValue(new Error('del fail'));

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: '削除' }));

      expect(await screen.findByText('アルバムの削除に失敗しました')).toBeInTheDocument();
    });

    it('看板配置ダイアログをキャンセルすると閉じる (R9.1)', async () => {
      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      fireEvent.click(within(firstItem).getByRole('button', { name: /看板を配置/ }));

      const dialog = await screen.findByRole('dialog', { name: /看板を配置/ });
      fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));

      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: /看板を配置/ })).not.toBeInTheDocument()
      );
    });

    it('エクスポート設定ダイアログをキャンセルすると閉じる (R15.5)', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      fireEvent.click(screen.getByRole('button', { name: '全件エクスポート' }));
      const dialog = await screen.findByRole('dialog', { name: /全件一括エクスポート/ });
      fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));

      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: /全件一括エクスポート/ })
        ).not.toBeInTheDocument()
      );
    });

    /**
     * タスク 23.4: 一部失敗・全件失敗のときは自動ではダウンロードせず、失敗した写真項目を示して
     * 利用者に選ばせる（利用者の判断（2026-10-03））。
     *
     * @requirement construction-photo/REQ-15.10
     */
    describe('一部失敗時の継続の選択 (R15.10)', () => {
      const startExportAll = async () => {
        fireEvent.click(screen.getByRole('button', { name: '全件エクスポート' }));
        const settingsDialog = await screen.findByRole('dialog', { name: /全件一括エクスポート/ });
        fireEvent.click(within(settingsDialog).getByRole('button', { name: '開始' }));
      };
      const partialDialogName = '一部の写真項目をエクスポートできませんでした';

      it('一部失敗では自動でダウンロードせず、失敗した写真項目のファイル名を示して選択を求める', async () => {
        vi.mocked(constructionPhotoBulkExportService.export).mockResolvedValue({
          blob: new Blob(['zip']),
          failed: ['photo-2'],
        });

        renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        await startExportAll();

        const dialog = await screen.findByRole('dialog', { name: partialDialogName });
        const items = within(
          within(dialog).getByRole('list', { name: 'エクスポートに失敗した写真項目' })
        ).getAllByRole('listitem');
        expect(items).toHaveLength(1);
        expect(items[0]).toHaveTextContent('b.jpg');
        expect(items[0]).toHaveTextContent('2番目');
        expect(
          within(dialog).getByText('成功した1件の写真項目だけでZIPをダウンロードしますか？')
        ).toBeInTheDocument();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
        expect(
          screen.queryByText(/一部の写真項目（1件）のエクスポートに失敗しました/)
        ).not.toBeInTheDocument();
      });

      it('「成功した項目だけでダウンロードする」で成功分のZIPを1回だけダウンロードし、ダイアログを閉じて通知する', async () => {
        const blob = new Blob(['zip']);
        vi.mocked(constructionPhotoBulkExportService.export).mockResolvedValue({
          blob,
          failed: ['photo-2'],
        });
        const clickSpy = vi
          .spyOn(HTMLAnchorElement.prototype, 'click')
          .mockImplementation(() => {});

        renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        await startExportAll();

        const dialog = await screen.findByRole('dialog', { name: partialDialogName });
        fireEvent.click(
          within(dialog).getByRole('button', { name: '成功した項目だけでダウンロードする' })
        );

        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
        expect(clickSpy).toHaveBeenCalledTimes(1);
        const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
        expect(anchor.download).toMatch(/^基礎工事アルバム_\d{8}_\d{6}\.zip$/);
        // 作ったオブジェクトURLはその場で解放する
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
        await waitFor(() =>
          expect(screen.queryByRole('dialog', { name: partialDialogName })).not.toBeInTheDocument()
        );
        expect(
          screen.getByText(
            '一部の写真項目（1件）のエクスポートに失敗しました。成功した項目のみでZIPをダウンロードしました。'
          )
        ).toBeInTheDocument();
        clickSpy.mockRestore();
      });

      it('「ダウンロードしない」でダウンロードせずにダイアログを閉じ、次のエクスポートは前の結果を持ち越さない', async () => {
        const firstBlob = new Blob(['first']);
        const secondBlob = new Blob(['second']);
        vi.mocked(constructionPhotoBulkExportService.export)
          .mockResolvedValueOnce({ blob: firstBlob, failed: ['photo-2'] })
          .mockResolvedValueOnce({ blob: secondBlob, failed: [] });

        renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        await startExportAll();

        const dialog = await screen.findByRole('dialog', { name: partialDialogName });
        fireEvent.click(within(dialog).getByRole('button', { name: 'ダウンロードしない' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(URL.createObjectURL).not.toHaveBeenCalled();
        expect(screen.queryByText(/ZIPをダウンロードしました/)).not.toBeInTheDocument();

        // 新しいエクスポートを始められ、全件成功ならその結果だけが即座にダウンロードされる
        await startExportAll();
        await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
        expect(URL.createObjectURL).toHaveBeenCalledWith(secondBlob);
        expect(screen.queryByRole('dialog', { name: partialDialogName })).not.toBeInTheDocument();
      });

      it('選択の段で Escape を押すとダウンロードせずにダイアログを閉じる', async () => {
        vi.mocked(constructionPhotoBulkExportService.export).mockResolvedValue({
          blob: new Blob(['zip']),
          failed: ['photo-2'],
        });

        renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        await startExportAll();

        const dialog = await screen.findByRole('dialog', { name: partialDialogName });
        fireEvent.keyDown(dialog, { key: 'Escape' });

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(URL.createObjectURL).not.toHaveBeenCalled();
      });

      it('全件失敗ではダウンロードせず、失敗した写真項目を示し、続ける操作を出さない', async () => {
        vi.mocked(constructionPhotoBulkExportService.export).mockResolvedValue({
          blob: new Blob([]),
          failed: ['photo-1', 'photo-2'],
        });

        renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        await startExportAll();

        const dialog = await screen.findByRole('dialog', {
          name: '写真項目をエクスポートできませんでした',
        });
        const items = within(
          within(dialog).getByRole('list', { name: 'エクスポートに失敗した写真項目' })
        ).getAllByRole('listitem');
        expect(items).toHaveLength(2);
        expect(items[0]).toHaveTextContent('a.jpg');
        expect(items[1]).toHaveTextContent('b.jpg');
        expect(
          within(dialog).queryByRole('button', { name: '成功した項目だけでダウンロードする' })
        ).not.toBeInTheDocument();
        expect(URL.createObjectURL).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole('button', { name: '閉じる' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(URL.createObjectURL).not.toHaveBeenCalled();
        expect(
          screen.getByText(
            'すべての写真項目（2件）のエクスポートに失敗しました。ZIPはダウンロードしていません。'
          )
        ).toBeInTheDocument();
      });

      it('エクスポートの実行中に画面を離れると、処理を中断する', async () => {
        let capturedSignal: AbortSignal | null = null;
        vi.mocked(constructionPhotoBulkExportService.export).mockImplementation(
          (_photos, _settings, handlers) => {
            capturedSignal = handlers.signal;
            return new Promise(() => {});
          }
        );

        const { unmount } = renderPage();
        await screen.findByRole('img', { name: /a\.jpg/ });
        await startExportAll();
        await screen.findByRole('dialog', { name: /一括エクスポート処理中/ });
        expect(capturedSignal).not.toBeNull();
        expect(capturedSignal!.aborted).toBe(false);

        unmount();

        expect(capturedSignal!.aborted).toBe(true);
      });
    });

    it('エクスポート処理が失敗（非中断）すると失敗通知を表示する', async () => {
      vi.mocked(constructionPhotoBulkExportService.export).mockRejectedValue(new Error('zip fail'));

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      fireEvent.click(screen.getByRole('button', { name: '全件エクスポート' }));
      const settingsDialog = await screen.findByRole('dialog', { name: /全件一括エクスポート/ });
      fireEvent.click(within(settingsDialog).getByRole('button', { name: '開始' }));

      expect(await screen.findByText('エクスポートに失敗しました')).toBeInTheDocument();
    });
  });

  // タスク 22.1: 利用者の判断（2026-10-04）で、通知の枠の通知（PDF・ZIP・アップロード）と失敗
  // （保存・アルバムの削除・写真項目一覧の取得）を一つの状態にまとめ、後から出たものが前のものを
  // 置き換える。消えた後に古いものが再び現れない。消去はその種類のものだけを消す（変更前と同じ契機）
  describe('通知の枠の通知と失敗の置き換え（タスク 22.1）', () => {
    /**
     * 画面の role=alert の一覧（上部の枠と、保存の失敗の間の保存ボタンの近くの表示）。保存の失敗の
     * 間は上部の枠が role を持たないため、読み上げられる表示の数を数える（タスク 22.2）
     */
    const announcedAlerts = () => screen.queryAllByRole('alert');

    async function failSave(message: string) {
      vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockRejectedValueOnce(
        new ApiError(500, message)
      );
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      fireEvent.click(within(firstItem).getByLabelText('印刷対象に含める'));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
      });
    }

    async function showNoPrintableNotice() {
      vi.mocked(ledgerExportApi.exportConstructionPhotoLedger).mockResolvedValueOnce({
        generated: false,
        reason: 'no-printable',
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'PDF出力' }));
      });
      await screen.findByText(/印刷対象の写真がありません/);
    }

    it('通知が出ている間に保存が失敗すると、保存の失敗が見え、通知は置き換えられる', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      await showNoPrintableNotice();
      await failSave('保存の失敗の理由');

      expect(await screen.findAllByText('保存の失敗の理由')).toHaveLength(2);
      expect(screen.queryByText(/印刷対象の写真がありません/)).not.toBeInTheDocument();
      expect(announcedAlerts()).toHaveLength(1);
    });

    it('保存の失敗が出ている間に通知が出ると、通知が見え、保存の失敗は置き換えられる', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      await failSave('保存の失敗の理由');
      expect(await screen.findAllByText('保存の失敗の理由')).toHaveLength(2);

      await showNoPrintableNotice();

      expect(screen.queryAllByText('保存の失敗の理由')).toHaveLength(0);
      expect(announcedAlerts()).toHaveLength(1);
    });

    it('保存の失敗を置き換えた通知が消えても、古い保存の失敗は再び現れない', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      await failSave('保存の失敗の理由');
      await showNoPrintableNotice();

      // PDF 出力の開始は通知を消す。生成に成功すれば新しい通知は出ない
      vi.mocked(ledgerExportApi.exportConstructionPhotoLedger).mockResolvedValueOnce({
        generated: true,
        itemCount: 1,
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'PDF出力' }));
      });
      await waitFor(() => {
        expect(screen.queryByText(/印刷対象の写真がありません/)).not.toBeInTheDocument();
      });

      expect(screen.queryAllByText('保存の失敗の理由')).toHaveLength(0);
      expect(announcedAlerts()).toHaveLength(0);
    });

    it('通知を置き換えた保存の失敗が、やり直しの保存で消えても、古い通知は再び現れない', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      await showNoPrintableNotice();
      await failSave('保存の失敗の理由');
      expect(await screen.findAllByText('保存の失敗の理由')).toHaveLength(2);

      // 未保存の変更は残っているため、保存をやり直せる。開始で失敗は消える
      vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockResolvedValueOnce(
        undefined as never
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
      });
      await waitFor(() => {
        expect(screen.queryAllByText('保存の失敗の理由')).toHaveLength(0);
      });

      expect(screen.queryByText(/印刷対象の写真がありません/)).not.toBeInTheDocument();
      expect(announcedAlerts()).toHaveLength(0);
    });

    it('アップロードの失敗の通知が出ている間にアルバムの削除が失敗すると、削除の失敗が見える', async () => {
      vi.mocked(imagesApi.uploadConstructionPhotos).mockResolvedValue({
        successful: [],
        failed: [{ fileName: 'ng.jpg', error: 'アップロード失敗' }],
      });
      vi.mocked(albumsApi.deleteConstructionPhotoAlbum).mockRejectedValue(new Error('del fail'));

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      await act(async () => {
        fireEvent.change(screen.getByTestId('file-input'), {
          target: { files: [new File(['x'], 'ng.jpg', { type: 'image/jpeg' })] },
        });
      });
      expect(await screen.findByText(/全1件の追加に失敗しました/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      const dialog = await screen.findByRole('dialog');
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: '削除' }));
      });

      expect(await screen.findByText('アルバムの削除に失敗しました')).toBeInTheDocument();
      expect(screen.queryByText(/全1件の追加に失敗しました/)).not.toBeInTheDocument();
      expect(announcedAlerts()).toHaveLength(1);
    });

    it('ZIP の失敗の通知が出ている間に保存が失敗すると、保存の失敗が見える', async () => {
      vi.mocked(constructionPhotoBulkExportService.export).mockRejectedValue(new Error('zip fail'));

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      fireEvent.click(screen.getByRole('button', { name: '全件エクスポート' }));
      const settingsDialog = await screen.findByRole('dialog', { name: /全件一括エクスポート/ });
      await act(async () => {
        fireEvent.click(within(settingsDialog).getByRole('button', { name: '開始' }));
      });
      expect(await screen.findByText('エクスポートに失敗しました')).toBeInTheDocument();
      // 進捗ダイアログを閉じてから保存する
      const progressDialog = screen.getByRole('dialog');
      fireEvent.click(within(progressDialog).getByRole('button', { name: '閉じる' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await failSave('保存の失敗の理由');

      expect(await screen.findAllByText('保存の失敗の理由')).toHaveLength(2);
      expect(screen.queryByText('エクスポートに失敗しました')).not.toBeInTheDocument();
    });

    it('消去はその種類のものだけを消す: 写真項目の追加（通知の消去）は保存の失敗を消さない', async () => {
      vi.mocked(imagesApi.uploadConstructionPhotos).mockResolvedValue({
        successful: [makePhoto({ id: 'photo-3', displayOrder: 3, fileName: 'c.jpg' })],
        failed: [],
      });

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      await failSave('保存の失敗の理由');
      expect(await screen.findAllByText('保存の失敗の理由')).toHaveLength(2);

      await act(async () => {
        fireEvent.change(screen.getByTestId('file-input'), {
          target: { files: [new File(['x'], 'c.jpg', { type: 'image/jpeg' })] },
        });
      });
      expect(await screen.findByRole('img', { name: /c\.jpg/ })).toBeInTheDocument();

      expect(screen.getAllByText('保存の失敗の理由')).toHaveLength(2);
    });

    it('消去はその種類のものだけを消す: 保存の開始（失敗の消去）は表示中の通知を消さない', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      await showNoPrintableNotice();

      vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockResolvedValueOnce(
        undefined as never
      );
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      fireEvent.click(within(firstItem).getByLabelText('印刷対象に含める'));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
      });
      await waitFor(() => {
        expect(lastUnsavedDirty()).toBe(false);
      });

      expect(screen.getByText(/印刷対象の写真がありません/)).toBeInTheDocument();
    });
  });

  // タスク 22.2: 利用者の判断（2026-10-04）で、保存の失敗を保存ボタンの近くにも表示する。上部の
  // 通知の枠の表示は 22.1 の形のまま残す。読み上げが二重にならないよう、保存の失敗のときは保存
  // ボタンの近くの表示だけを role=alert にし、上部の枠は同じ文言を role を持たずに描く。近くの表示は
  // 上部の枠と同じ一つの状態（pageMessage）から描くため、消える契機と置き換えは上部の枠と揃う
  describe('保存の失敗の保存ボタンの近くの表示（タスク 22.2）', () => {
    const SAVE_FAILED = '保存の失敗の理由';
    const panel = () => screen.getByRole('region', { name: '写真項目管理パネル' });

    async function failSave(message: string) {
      vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockRejectedValueOnce(
        new ApiError(500, message)
      );
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      fireEvent.click(within(firstItem).getByLabelText('印刷対象に含める'));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
      });
    }

    it('保存が失敗すると、同じ文言が上部の枠と保存ボタンの近くに出て、role=alert は保存ボタンの近くの一つだけ', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      await failSave(SAVE_FAILED);

      const shown = await screen.findAllByText(SAVE_FAILED);
      expect(shown).toHaveLength(2);
      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(1);
      const [nearAlert] = alerts;
      // 保存ボタンの近く（写真項目管理パネルの中、写真項目の外）にあり、保存ボタンが指す
      expect(within(panel()).getByRole('alert')).toBe(nearAlert);
      expect(nearAlert!.closest('[data-testid="construction-photo-item"]')).toBeNull();
      expect(nearAlert).toHaveTextContent(SAVE_FAILED);
      expect(screen.getByRole('button', { name: '保存' })).toHaveAttribute(
        'aria-describedby',
        nearAlert!.id
      );
      // 上部の枠はパネルの外に同じ文言で残る（role は持たない）
      const frame = shown.find((el) => !panel().contains(el));
      expect(frame).toBeDefined();
      expect(frame).not.toHaveAttribute('role');
    });

    it('保存のやり直しが成功すると、上部の枠と保存ボタンの近くの両方が消える', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      await failSave(SAVE_FAILED);
      expect(await screen.findAllByText(SAVE_FAILED)).toHaveLength(2);

      vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockResolvedValueOnce(
        undefined as never
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
      });
      await waitFor(() => {
        expect(screen.queryAllByText(SAVE_FAILED)).toHaveLength(0);
      });
      expect(screen.queryAllByRole('alert')).toHaveLength(0);
      expect(screen.getByRole('button', { name: '保存' })).not.toHaveAttribute('aria-describedby');
    });

    it('保存の失敗が後の通知に置き換わると、保存ボタンの近くの表示も消え、通知は上部の枠に role=alert で出る', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      await failSave(SAVE_FAILED);
      expect(await screen.findAllByText(SAVE_FAILED)).toHaveLength(2);

      vi.mocked(ledgerExportApi.exportConstructionPhotoLedger).mockResolvedValueOnce({
        generated: false,
        reason: 'no-printable',
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'PDF出力' }));
      });
      await screen.findByText(/印刷対象の写真がありません/);

      expect(screen.queryAllByText(SAVE_FAILED)).toHaveLength(0);
      expect(within(panel()).queryAllByRole('alert')).toHaveLength(0);
      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toHaveTextContent(/印刷対象の写真がありません/);
    });

    /** 上部の枠（写真項目管理パネルの外にある、指定の文言の要素）を返す */
    const topFrameWith = (text: string | RegExp): HTMLElement => {
      const found = screen.getAllByText(text).filter((el) => !panel().contains(el));
      expect(found).toHaveLength(1);
      return found[0]!;
    };

    it('保存の失敗の後の通知は、新しく挿入された role=alert の枠で出る（role を後から付け直さない）', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      await failSave(SAVE_FAILED);
      expect(await screen.findAllByText(SAVE_FAILED)).toHaveLength(2);
      const frameDuringSaveFailure = topFrameWith(SAVE_FAILED);
      expect(frameDuringSaveFailure).not.toHaveAttribute('role');

      vi.mocked(ledgerExportApi.exportConstructionPhotoLedger).mockResolvedValueOnce({
        generated: false,
        reason: 'no-printable',
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'PDF出力' }));
      });
      await screen.findByText(/印刷対象の写真がありません/);

      const [noticeFrame] = screen.getAllByRole('alert');
      expect(noticeFrame).toHaveTextContent(/印刷対象の写真がありません/);
      // 保存の失敗の間の枠の要素は外れ、通知は別の要素として挿入されている
      expect(noticeFrame).not.toBe(frameDuringSaveFailure);
      expect(frameDuringSaveFailure.isConnected).toBe(false);
    });

    it('写真項目を 0 件まで取り除くと（保存ボタンが描かれない）、上部の枠は新しく挿入された role=alert の枠で保存の失敗を示す', async () => {
      vi.mocked(imagesApi.deleteConstructionPhoto).mockResolvedValue(undefined as never);

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      await failSave(SAVE_FAILED);
      expect(await screen.findAllByText(SAVE_FAILED)).toHaveLength(2);
      const frameDuringSaveFailure = topFrameWith(SAVE_FAILED);

      for (const fileName of ['a.jpg', 'b.jpg']) {
        fireEvent.click(screen.getByRole('button', { name: `写真項目を削除: ${fileName}` }));
        const dialog = await screen.findByRole('dialog', { name: '写真項目を削除' });
        await act(async () => {
          fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }));
        });
        await waitFor(() => {
          expect(screen.queryByRole('dialog', { name: '写真項目を削除' })).not.toBeInTheDocument();
        });
      }
      expect(await screen.findByText('写真項目がありません')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument();

      // 保存ボタンの近くの表示が無いため、上部の枠が role=alert で示す（読み上げを失わない）
      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toHaveTextContent(SAVE_FAILED);
      expect(screen.getAllByText(SAVE_FAILED)).toHaveLength(1);
      expect(alerts[0]).not.toBe(frameDuringSaveFailure);
      expect(frameDuringSaveFailure.isConnected).toBe(false);
    });

    it('編集権限が無くなると（保存ボタンが描かれない）、上部の枠が role=alert で保存の失敗を示す', async () => {
      const { rerender } = renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      await failSave(SAVE_FAILED);
      expect(await screen.findAllByText(SAVE_FAILED)).toHaveLength(2);

      mockUseConstructionPhotoPermission.mockReturnValue({
        ...fullPermission,
        canEdit: false,
        canDelete: false,
      });
      rerender(
        <BrowserRouter>
          <ConstructionPhotoDetailPage />
        </BrowserRouter>
      );

      expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument();
      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toHaveTextContent(SAVE_FAILED);
      expect(panel().contains(alerts[0]!)).toBe(false);
    });

    it('保存でない失敗（アルバムの削除の失敗）は上部の枠に role=alert で出て、保存ボタンの近くには出ない', async () => {
      vi.mocked(albumsApi.deleteConstructionPhotoAlbum).mockRejectedValue(new Error('del fail'));

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      const dialog = await screen.findByRole('dialog');
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: '削除' }));
      });

      expect(await screen.findAllByText('アルバムの削除に失敗しました')).toHaveLength(1);
      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toHaveTextContent('アルバムの削除に失敗しました');
      expect(panel().contains(alerts[0]!)).toBe(false);
      expect(screen.getByRole('button', { name: '保存' })).not.toHaveAttribute('aria-describedby');
    });
  });

  describe('取り除かれた看板を指定した保存の失敗の文言（タスク 24.2）', () => {
    const panel = () => screen.getByRole('region', { name: '写真項目管理パネル' });
    const REMOVED_ID = 'sb-1';
    const ENGLISH = `Signboard not found in the album's project: ${REMOVED_ID}`;
    /** バックエンドが取り除かれた看板の指定に返す 404 の応答 */
    const removedSignboardError = () =>
      new ApiError(404, ENGLISH, {
        status: 404,
        code: 'SIGNBOARD_NOT_ALLOWED',
        detail: ENGLISH,
        message: ENGLISH,
      });

    /** 指定の写真項目の看板の配置のダイアログで看板を選び、配置を保存して閉じる */
    async function assignSignboard(item: HTMLElement, signboardId: string) {
      fireEvent.click(within(item).getByRole('button', { name: /看板を配置/ }));
      const dialog = await screen.findByRole('dialog', { name: /看板を配置/ });
      fireEvent.change(within(dialog).getByLabelText('看板を選択'), {
        target: { value: signboardId },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: '配置を保存' }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: /看板を配置/ })).not.toBeInTheDocument()
      );
    }

    async function clickSave() {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
      });
    }

    it('送った看板が一つなら、その看板の名前と、取り除かれていること・選び直すか読み込み直すことを日本語で示し、英語の文言と ID を出さない', async () => {
      vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockRejectedValueOnce(
        removedSignboardError()
      );
      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      await assignSignboard(firstItem, REMOVED_ID);

      await clickSave();

      const expected =
        '工事看板「基礎配筋工事」は取り除かれています。看板を選び直すか、画面を読み込み直してください。';
      // 22.1/22.2 の経路のまま、上部の枠と保存ボタンの近くの両方に出る
      expect(await screen.findAllByText(expected)).toHaveLength(2);
      expect(within(panel()).getByRole('alert')).toHaveTextContent(expected);
      expect(screen.queryByText(/Signboard not found/)).not.toBeInTheDocument();
      expect(document.body.textContent).not.toContain(ENGLISH);
      // 失敗のときは保留を消さない（R18）
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    });

    it('送った看板が二つ以上なら、どの看板かを言わない一般的な日本語の文言を出す', async () => {
      vi.mocked(signboardsApi.getConstructionSignboards).mockResolvedValue([
        mockSignboard,
        { ...mockSignboard, id: 'sb-2', workName: '外構工事' },
      ]);
      vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockRejectedValueOnce(
        removedSignboardError()
      );
      renderPage();
      const items = await screen.findAllByTestId('construction-photo-item');
      await assignSignboard(items[0]!, 'sb-1');
      await assignSignboard(items[1]!, 'sb-2');

      await clickSave();

      const expected =
        '選択した工事看板は取り除かれています。看板を選び直すか、画面を読み込み直してください。';
      expect(await screen.findAllByText(expected)).toHaveLength(2);
      expect(screen.queryByText(/基礎配筋工事|外構工事/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Signboard not found/)).not.toBeInTheDocument();
    });

    it('送った看板の名前が一覧で分からないときは、一般的な日本語の文言を出す', async () => {
      vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockRejectedValueOnce(
        removedSignboardError()
      );
      renderPage();
      // 看板に触れない変更だけを送る（送った看板が無いため名前は分からない）
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      fireEvent.click(within(firstItem).getByLabelText('印刷対象に含める'));

      await clickSave();

      expect(
        await screen.findAllByText(
          '選択した工事看板は取り除かれています。看板を選び直すか、画面を読み込み直してください。'
        )
      ).toHaveLength(2);
    });

    it('同じ 404 でも写真項目が見つからない失敗（CONSTRUCTION_PHOTO_NOT_FOUND）は看板の文言に置き換えない', async () => {
      const photoNotFound = 'Construction photo not found: photo-1';
      vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockRejectedValueOnce(
        new ApiError(404, photoNotFound, {
          status: 404,
          code: 'CONSTRUCTION_PHOTO_NOT_FOUND',
          detail: photoNotFound,
        })
      );
      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      await assignSignboard(firstItem, REMOVED_ID);

      await clickSave();

      expect(await screen.findAllByText(photoNotFound)).toHaveLength(2);
      expect(screen.queryByText(/取り除かれています/)).not.toBeInTheDocument();
    });

    it('符号が SIGNBOARD_NOT_ALLOWED でも 404 でない失敗は看板の文言に置き換えない', async () => {
      vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockRejectedValueOnce(
        new ApiError(500, 'サーバーの失敗', { code: 'SIGNBOARD_NOT_ALLOWED' })
      );
      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      await assignSignboard(firstItem, REMOVED_ID);

      await clickSave();

      expect(await screen.findAllByText('サーバーの失敗')).toHaveLength(2);
      expect(screen.queryByText(/取り除かれています/)).not.toBeInTheDocument();
    });
  });
});

/**
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * 各IDは本ファイル内の対応テストが検証する受入基準（監査でエビデンス確認済み）。
 * @requirement construction-photo/REQ-1.2
 * @requirement construction-photo/REQ-11.2
 * @requirement construction-photo/REQ-17.3
 * @requirement construction-photo/REQ-17.5
 * @requirement construction-photo/REQ-18.4
 */
