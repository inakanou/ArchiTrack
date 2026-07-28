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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ConstructionPhotoDetailPage from './ConstructionPhotoDetailPage';
import * as albumsApi from '../api/construction-photos';
import * as imagesApi from '../api/construction-photo-images';
import * as projectsApi from '../api/projects';
import * as siteSurveysApi from '../api/site-surveys';
import * as signboardsApi from '../api/construction-signboards';
import * as ledgerExportApi from '../services/export/ConstructionPhotoLedgerExportService';
import type {
  ConstructionPhotoAlbum,
  ConstructionPhotoWithUrls,
  ConstructionSignboard,
  SignboardPlacement,
} from '../types/construction-photo.types';
import type { ProjectDetail } from '../types/project.types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'album-1' }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../api/construction-photos');
vi.mock('../api/construction-photo-images');
vi.mock('../api/projects');
vi.mock('../api/site-surveys');
vi.mock('../api/construction-signboards');
vi.mock('../services/export/ConstructionPhotoLedgerExportService');

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
    vi.mocked(albumsApi.getConstructionPhotoAlbum).mockResolvedValue(mockAlbum);
    vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
    vi.mocked(imagesApi.getConstructionPhotos).mockResolvedValue([
      makePhoto({ id: 'photo-1', displayOrder: 1, fileName: 'a.jpg' }),
      makePhoto({ id: 'photo-2', displayOrder: 2, fileName: 'b.jpg' }),
    ]);
    vi.mocked(signboardsApi.getConstructionSignboards).mockResolvedValue([mockSignboard]);
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
});
