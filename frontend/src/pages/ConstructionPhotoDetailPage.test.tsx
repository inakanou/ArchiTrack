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
// SiteSurveyDetailPage のテスト作法に倣い、markAsChanged/markAsSaved で
// isDirty を書き換える簡易実装で結線（isDirty のトグル）のみ検証する
// （beforeunload実登録の検証は useUnsavedChanges 自体の単体テストで担保済み）。
// 既定はフル機能（isDirty=false から開始、markAsChanged/markAsSavedでトグル）で
// 既存テスト（保存フロー等）の回帰を防ぐ。
const unsavedChangesRuntime: { dirty: boolean } = { dirty: false };
const mockMarkAsChanged = vi.fn(() => {
  unsavedChangesRuntime.dirty = true;
});
const mockMarkAsSaved = vi.fn(() => {
  unsavedChangesRuntime.dirty = false;
});
const mockUseUnsavedChanges = vi.fn((options: { enabled?: boolean } = {}) => ({
  isDirty: unsavedChangesRuntime.dirty,
  setDirty: (v: boolean) => {
    unsavedChangesRuntime.dirty = v;
  },
  markAsChanged: mockMarkAsChanged,
  markAsSaved: mockMarkAsSaved,
  reset: () => {
    unsavedChangesRuntime.dirty = false;
  },
  confirmNavigation: () => true,
  __options: options,
}));
vi.mock('../hooks/useUnsavedChanges', () => ({
  useUnsavedChanges: (options: { enabled?: boolean }) => mockUseUnsavedChanges(options),
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
  isLoading: false,
  getPermissionError: () => null,
};

// fabric を含む配置エディタはスタブ化し、看板選択＋保存の結線契約のみを検証する。
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
        onClick={() => onSave?.(signboard ? { left: 1, top: 2, width: 3, height: 4 } : null)}
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
    unsavedChangesRuntime.dirty = false;
    mockUseBlocker.mockReturnValue({ state: 'unblocked', proceed: mockProceed, reset: mockReset });
    mockUseConstructionPhotoPermission.mockReturnValue(fullPermission);
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
    it('編集権限がある場合、useUnsavedChangesがenabled:trueで呼ばれる (R18.4)', async () => {
      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      expect(mockUseUnsavedChanges).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
    });

    it('編集権限が無い場合、useUnsavedChangesがenabled:falseで呼ばれ未保存追跡が無効化される (R18.4)', async () => {
      mockUseConstructionPhotoPermission.mockReturnValue({ ...fullPermission, canEdit: false });

      renderPage();
      await screen.findByRole('img', { name: /a\.jpg/ });

      expect(mockUseUnsavedChanges).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
    });

    it('コメント変更でmarkAsChangedが呼ばれる (R18.1)', async () => {
      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;

      const textarea = within(firstItem).getByLabelText('コメント');
      fireEvent.change(textarea, { target: { value: '配筋検査' } });
      fireEvent.blur(textarea);

      await waitFor(() => {
        expect(mockMarkAsChanged).toHaveBeenCalled();
      });
    });

    it('印刷対象トグルでmarkAsChangedが呼ばれる (R18.1)', async () => {
      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;

      fireEvent.click(within(firstItem).getByLabelText('印刷対象に含める'));

      await waitFor(() => {
        expect(mockMarkAsChanged).toHaveBeenCalled();
      });
    });

    it('並び替えでmarkAsChangedが呼ばれる (R18.1)', async () => {
      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;

      fireEvent.click(within(firstItem).getByRole('button', { name: '下へ移動' }));

      await waitFor(() => {
        expect(mockMarkAsChanged).toHaveBeenCalled();
      });
    });

    it('看板配置の保存でmarkAsChangedが呼ばれる (R18.1)', async () => {
      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      fireEvent.click(within(firstItem).getByRole('button', { name: /看板を配置/ }));

      const dialog = await screen.findByRole('dialog', { name: /看板を配置/ });
      fireEvent.change(within(dialog).getByLabelText('看板を選択'), { target: { value: 'sb-1' } });
      fireEvent.click(within(dialog).getByRole('button', { name: '配置を保存' }));

      await waitFor(() => {
        expect(mockMarkAsChanged).toHaveBeenCalled();
      });
    });

    it('保存成功でmarkAsSavedが呼ばれ未保存状態が解消する (R18.3)', async () => {
      vi.mocked(imagesApi.updateConstructionPhotoMetadataBatch).mockResolvedValue([]);

      renderPage();
      const firstItem = (await screen.findAllByTestId('construction-photo-item'))[0]!;
      fireEvent.click(within(firstItem).getByLabelText('印刷対象に含める'));

      fireEvent.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(mockMarkAsSaved).toHaveBeenCalled();
      });
    });

    // --------------------------------------------------------------------
    // R18.2: アプリ内遷移全般（Breadcrumbのリンククリック含む）のガードは
    // useBlocker(uc.isDirty) が担う。jsdom にはデータルーター連携の実遷移
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
});
