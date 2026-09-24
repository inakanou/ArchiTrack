/**
 * @fileoverview 現場調査詳細ページ: 捕捉した誤りの監視送出テスト
 *
 * Task 115.84: 画面が捕捉した誤りを監視基盤（Sentry）へ送る
 *
 * 要件16.8 は「エラー発生時に適切なエラーメッセージを表示し、Sentryにログを送信する」の
 * 2点を求める。表示側は出荷済みだが、詳細画面の捕捉処理（`catch`）は状態を設定するだけで
 * 記録を送っていなかった。全画面共通の `ErrorBoundary` は描画時の未捕捉例外しか拾わないため、
 * 捕捉済みの通信誤りは監視へ届かない。
 *
 * 本テストは `utils/sentry` を境界として差し替え、画面 → `logger.exception` →
 * `captureException` の出荷経路が実際に通ることを検証する。`logger` 自体は差し替えないため、
 * 機密情報のマスキングを含む本番の実装を通過する。
 *
 * Requirements:
 * - 16.8: エラー発生時に適切なエラーメッセージを表示し、Sentryにログを送信する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SiteSurveyDetailPage from '../../pages/SiteSurveyDetailPage';
import * as siteSurveysApi from '../../api/site-surveys';
import * as surveyImagesApi from '../../api/survey-images';
import * as sentry from '../../utils/sentry';
import * as useSiteSurveyPermissionModule from '../../hooks/useSiteSurveyPermission';
import useMediaQuery from '../../hooks/useMediaQuery';
import type { SiteSurveyDetail, SurveyImageInfo } from '../../types/site-survey.types';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'survey-123' }),
    useNavigate: () => mockNavigate,
    useLocation: () => ({
      key: 'default',
      pathname: '/site-surveys/survey-123',
      search: '',
      hash: '',
      state: null,
    }),
  };
});

vi.mock('../../api/site-surveys');
vi.mock('../../api/survey-images');
vi.mock('../../hooks/useSiteSurveyPermission');
vi.mock('../../hooks/useMediaQuery', () => ({
  default: vi.fn(() => false),
}));

// 監視基盤への送出境界のみを差し替える（logger は本番実装をそのまま通す）
vi.mock('../../utils/sentry', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

// 一括エクスポート経路が読み込む重量サービスを差し替える（本テストの対象外）
vi.mock('../../services/export/PdfExportService', () => ({
  exportAndDownloadPdf: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/export/AnnotationRendererService', () => ({
  renderImagesWithAnnotations: vi.fn().mockResolvedValue([]),
  AnnotationRendererService: class {
    async renderImage() {
      return { dataUrl: 'data:image/jpeg;base64,', width: 0, height: 0 };
    }
    dispose() {}
  },
}));

const mockPermission = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  isLoading: false,
  getPermissionError: vi.fn().mockReturnValue(null),
};

const mockImages: SurveyImageInfo[] = [
  {
    id: 'img-1',
    surveyId: 'survey-123',
    originalPath: '/uploads/original/img1.jpg',
    thumbnailPath: '/uploads/thumbnails/img1.jpg',
    originalUrl: 'https://example.com/uploads/original/img1.jpg',
    thumbnailUrl: 'https://example.com/uploads/thumbnails/img1.jpg',
    mediumUrl: '/uploads/medium/img1.jpg',
    fileName: 'image1.jpg',
    fileSize: 1024000,
    width: 1920,
    height: 1080,
    displayOrder: 1,
    includeInReport: true,
    comment: '施工箇所A',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
];

const mockSurveyDetail: SiteSurveyDetail = {
  id: 'survey-123',
  projectId: 'project-456',
  name: 'テスト現場調査',
  surveyDate: '2025-01-15',
  memo: '調査メモです',
  thumbnailUrl: '/uploads/thumbnails/img1.jpg',
  imageCount: 1,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
  project: {
    id: 'project-456',
    name: 'テストプロジェクト',
  },
  images: mockImages,
};

const renderComponent = () =>
  render(
    <BrowserRouter>
      <SiteSurveyDetailPage />
    </BrowserRouter>
  );

/** 詳細の読み込み完了を待つ */
async function waitForLoaded() {
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'テスト現場調査' })).toBeInTheDocument();
  });
}

/** 監視基盤へ送出された最新の1件を取り出す */
function lastCapturedCall(): [Error, Record<string, unknown>] {
  const calls = vi.mocked(sentry.captureException).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1] as [Error, Record<string, unknown>];
}

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue(mockPermission);
  vi.mocked(useMediaQuery).mockReturnValue(false);
  vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
  // jsdom は ObjectURL API を実装しないためスタブへ差し替える（AI運用第3原則: 無効化しない）
  URL.createObjectURL = vi.fn(() => 'blob:mock/1');
  URL.revokeObjectURL = vi.fn();
  // logger は開発環境で console.error へも出力するため、出力を抑えて内容だけ検証可能にする
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  consoleErrorSpy.mockRestore();
});

describe('SiteSurveyDetailPage の誤り送出 (Task 115.84, Requirement 16.8)', () => {
  /**
   * 詳細取得の失敗。表示（`role="alert"`）と送出の双方を同一の失敗から確認する。
   * @requirement site-survey/REQ-16.8
   */
  it('詳細取得に失敗したとき、エラー表示に加えて監視基盤へ例外を送出する', async () => {
    const failure = new Error('現場調査が見つかりません');
    vi.mocked(siteSurveysApi.getSiteSurvey).mockRejectedValue(failure);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(sentry.captureException).toHaveBeenCalledTimes(1);
    });

    const [sentError, sentContext] = lastCapturedCall();
    expect(sentError).toBe(failure);
    // 送出内容は画面と操作の特定に必要な最小限に限る（資格情報・個人情報を含めない）
    expect(sentContext).toEqual({
      screen: 'SiteSurveyDetailPage',
      operation: 'fetchSiteSurveyDetail',
      surveyId: 'survey-123',
    });
  });

  /**
   * Error 以外がスローされた場合も Error へ正規化して監視へ届ける。
   * @requirement site-survey/REQ-16.8
   */
  it('Error 以外がスローされた場合も Error へ正規化して監視基盤へ送出する', async () => {
    vi.mocked(siteSurveysApi.getSiteSurvey).mockRejectedValue('文字列エラー');

    renderComponent();

    await waitFor(() => {
      expect(sentry.captureException).toHaveBeenCalledTimes(1);
    });

    const [sentError] = lastCapturedCall();
    expect(sentError).toBeInstanceOf(Error);
    expect(sentError.message).toContain('文字列エラー');
  });

  /**
   * 現場調査の削除失敗。
   * @requirement site-survey/REQ-16.8
   */
  it('現場調査の削除に失敗したとき、監視基盤へ例外を送出する', async () => {
    const failure = new Error('削除に失敗しました');
    vi.mocked(siteSurveysApi.deleteSiteSurvey).mockRejectedValue(failure);

    renderComponent();
    await waitForLoaded();

    fireEvent.click(screen.getByRole('button', { name: '削除' }));

    await waitFor(() => {
      expect(screen.getByText('現場調査を削除しますか？')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '削除する' }));

    await waitFor(() => {
      expect(sentry.captureException).toHaveBeenCalled();
    });

    const [sentError, sentContext] = lastCapturedCall();
    expect(sentError).toBe(failure);
    expect(sentContext).toEqual({
      screen: 'SiteSurveyDetailPage',
      operation: 'deleteSiteSurvey',
      surveyId: 'survey-123',
    });
  });

  /**
   * 画像削除の失敗。捕捉後に再スローされる経路でも送出は行われる。
   * @requirement site-survey/REQ-16.8
   */
  it('画像削除に失敗したとき、監視基盤へ例外を送出する', async () => {
    const failure = new Error('画像の削除に失敗しました');
    vi.mocked(surveyImagesApi.deleteSurveyImage).mockRejectedValue(failure);

    renderComponent();
    await waitForLoaded();

    await waitFor(() => {
      expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /画像を削除: image1\.jpg/i }));

    await waitFor(() => {
      expect(screen.getByText(/この画像を削除しますか？/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /削除する/i }));

    await waitFor(() => {
      expect(sentry.captureException).toHaveBeenCalled();
    });

    const [sentError, sentContext] = lastCapturedCall();
    expect(sentError).toBe(failure);
    expect(sentContext).toEqual({
      screen: 'SiteSurveyDetailPage',
      operation: 'deleteSurveyImage',
      imageId: 'img-1',
    });
  });

  /**
   * メタデータ一括保存の失敗。
   * @requirement site-survey/REQ-16.8
   */
  it('メタデータの保存に失敗したとき、監視基盤へ例外を送出する', async () => {
    const failure = new Error('メタデータの保存に失敗しました');
    vi.mocked(surveyImagesApi.updateImageMetadataBatch).mockRejectedValue(failure);

    renderComponent();
    await waitForLoaded();

    await waitFor(() => {
      expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
    });

    // 報告書に含めるチェックを切り替えて保存対象の変更を作る
    const checkbox = screen.getAllByRole('checkbox', { name: '報告書に含める' })[0];
    fireEvent.click(checkbox as HTMLElement);

    fireEvent.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(sentry.captureException).toHaveBeenCalled();
    });

    const [sentError, sentContext] = lastCapturedCall();
    expect(sentError).toBe(failure);
    expect(sentContext).toEqual({
      screen: 'SiteSurveyDetailPage',
      operation: 'saveImageMetadata',
      surveyId: 'survey-123',
    });
  });

  /**
   * 誤りが起きていないときに送出してはならない（監視のノイズ化を防ぐ）。
   * @requirement site-survey/REQ-16.8
   */
  it('詳細取得が成功したときは監視基盤へ送出しない', async () => {
    renderComponent();
    await waitForLoaded();

    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});

/**
 * Task 115.122: 画像アップロードの失敗を監視基盤へ送る
 *
 * 要件16.8 の「表示するが送らない」状態がアップロード経路に二つ残っていた。
 * - 詳細画面の失敗分岐: API 層（`uploadSurveyImages`）が集約した失敗の一覧を受け、
 *   誤りを表示するだけで送出しない。捕捉処理ではないため Task 115.84 の境界外だった。
 * - 共有部品の捕捉処理: `ImageUploader` の `catch` は誤りを表示し `onError` へ渡すが、
 *   詳細画面がその口を受け取っていなかったため送出に至らなかった。
 *
 * 二経路は独立に検証する。送出内容は許可列挙・識別子・件数に限り、ファイル名や
 * サーバーの失敗文言（利用者由来の文字列）が混入しないことを否定形でも主張する。
 */
describe('画像アップロード失敗の誤り送出 (Task 115.122, Requirement 16.8)', () => {
  /** 成功したアップロード結果として返す画像（`mockImages` は空でないため添字取得を型で確定させる） */
  const uploadedImage: SurveyImageInfo = {
    ...(mockImages[0] as SurveyImageInfo),
    id: 'img-2',
    displayOrder: 2,
  };

  /** ファイル選択を発火し、アップロード呼び出しの完了まで待つ */
  async function selectFiles(files: File[]): Promise<void> {
    renderComponent();
    await waitForLoaded();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    Object.defineProperty(fileInput, 'files', { value: files, configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(surveyImagesApi.uploadSurveyImages).toHaveBeenCalled();
    });
  }

  /** 監視基盤へ送出された全引数を文字列化する（漏洩検査用） */
  function serializeCapturedCalls(): string {
    return vi
      .mocked(sentry.captureException)
      .mock.calls.map(([error, context]) => {
        const err = error as Error;
        return `${err.name}|${err.message}|${JSON.stringify(context)}`;
      })
      .join('\n');
  }

  // ==========================================================================
  // 経路1: 詳細画面の失敗分岐（API 層が集約した失敗の一覧）
  // ==========================================================================

  /**
   * @requirement site-survey/REQ-16.8
   */
  it('個別ファイルの失敗が集約されたとき、表示に加えて監視基盤へ送出する', async () => {
    const permanentFile = new File(['a'], 'ng-format.jpg', { type: 'image/jpeg' });
    const retriableFile = new File(['b'], 'ng-server.jpg', { type: 'image/jpeg' });
    vi.mocked(surveyImagesApi.uploadSurveyImages).mockResolvedValue({
      results: [],
      errors: [
        {
          index: 0,
          fileName: 'ng-format.jpg',
          error: 'サポートされていないファイル形式です',
          file: permanentFile,
          kind: 'permanent',
        },
        {
          index: 1,
          fileName: 'ng-server.jpg',
          error: 'サーバーエラーが発生しました',
          file: retriableFile,
          kind: 'retriable',
        },
      ],
    });

    await selectFiles([permanentFile, retriableFile]);

    // 表示（要件16.8 の前半）が従来どおり行われること
    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    });

    // 送出（要件16.8 の後半）
    await waitFor(() => {
      expect(sentry.captureException).toHaveBeenCalledTimes(1);
    });

    const [sentError, sentContext] = lastCapturedCall();
    expect(sentError).toBeInstanceOf(Error);
    expect(sentContext).toEqual({
      screen: 'SiteSurveyDetailPage',
      operation: 'uploadSurveyImages',
      surveyId: 'survey-123',
      failureScope: 'perFile',
      failureKinds: 'permanent,retriable',
      failedCount: 2,
      succeededCount: 0,
    });
  });

  /**
   * 部分成功でも送出し、成功件数を伴うこと。
   * @requirement site-survey/REQ-16.8
   */
  it('部分成功のときも失敗分を監視基盤へ送出し、件数を伴う', async () => {
    const failedFile = new File(['a'], 'ng-partial.jpg', { type: 'image/jpeg' });
    vi.mocked(surveyImagesApi.uploadSurveyImages).mockResolvedValue({
      results: [uploadedImage],
      errors: [
        {
          index: 1,
          fileName: 'ng-partial.jpg',
          error: 'サーバーエラーが発生しました',
          file: failedFile,
          kind: 'retriable',
        },
      ],
    });

    await selectFiles([failedFile]);

    await waitFor(() => {
      expect(sentry.captureException).toHaveBeenCalledTimes(1);
    });

    const [, sentContext] = lastCapturedCall();
    expect(sentContext).toMatchObject({
      failureScope: 'perFile',
      failureKinds: 'retriable',
      failedCount: 1,
      succeededCount: 1,
    });
  });

  /**
   * 経路1 の漏洩検査。ファイル名とサーバー文言が送出内容に現れてはならない。
   * @requirement site-survey/REQ-16.8
   */
  it('集約された失敗の送出にファイル名・サーバー文言を含めない', async () => {
    const secretFile = new File(['a'], 'PRIVATE-USER-PHOTO-9f3a.jpg', { type: 'image/jpeg' });
    vi.mocked(surveyImagesApi.uploadSurveyImages).mockResolvedValue({
      results: [],
      errors: [
        {
          index: 0,
          fileName: 'PRIVATE-USER-PHOTO-9f3a.jpg',
          error: 'SERVER-DETAIL-LEAK-7c21 が原因で保存できません',
          file: secretFile,
          kind: 'retriable',
        },
      ],
    });

    await selectFiles([secretFile]);

    await waitFor(() => {
      expect(sentry.captureException).toHaveBeenCalledTimes(1);
    });

    const serialized = serializeCapturedCalls();
    expect(serialized).not.toContain('PRIVATE-USER-PHOTO-9f3a');
    expect(serialized).not.toContain('SERVER-DETAIL-LEAK-7c21');
  });

  // ==========================================================================
  // 経路2: 共有部品（ImageUploader）の捕捉処理
  // ==========================================================================

  /**
   * 送信そのものが例外で終わる経路。`ImageUploader` の `catch` が `onError` へ渡し、
   * 詳細画面がそれを受けて送出する。経路1 の分岐は実行されない。
   * @requirement site-survey/REQ-16.8
   */
  it('送信が例外で終わったとき、共有部品の捕捉処理を経て監視基盤へ送出する', async () => {
    const failure = new Error('ネットワークに接続できません');
    vi.mocked(surveyImagesApi.uploadSurveyImages).mockRejectedValue(failure);

    await selectFiles([new File(['a'], 'net-fail.jpg', { type: 'image/jpeg' })]);

    await waitFor(() => {
      expect(sentry.captureException).toHaveBeenCalledTimes(1);
    });

    const [sentError, sentContext] = lastCapturedCall();
    expect(sentError).toBe(failure);
    expect(sentContext).toEqual({
      screen: 'SiteSurveyDetailPage',
      operation: 'uploadSurveyImages',
      surveyId: 'survey-123',
      failureScope: 'request',
    });
  });

  /**
   * 経路2 の漏洩検査。
   *
   * 送出の主題である例外そのものは Task 115.84 と同じくそのまま渡すが、
   * 付帯情報は許可列挙と識別子に限る。例外の文言が利用者由来の文字列
   * （ここではファイル名）を含んでいても、それが付帯情報へ写ってはならない。
   * @requirement site-survey/REQ-16.8
   */
  it('例外で終わった送信の付帯情報に試行ファイル名・例外文言を含めない', async () => {
    vi.mocked(surveyImagesApi.uploadSurveyImages).mockRejectedValue(
      new Error('PRIVATE-CAMERA-ROLL-4e88.jpg の送信中に LEAKED-DETAIL-1b55 で切断されました')
    );

    await selectFiles([new File(['a'], 'PRIVATE-CAMERA-ROLL-4e88.jpg', { type: 'image/jpeg' })]);

    await waitFor(() => {
      expect(sentry.captureException).toHaveBeenCalledTimes(1);
    });

    const [, sentContext] = lastCapturedCall();
    const serializedContext = JSON.stringify(sentContext);
    expect(serializedContext).not.toContain('PRIVATE-CAMERA-ROLL-4e88');
    expect(serializedContext).not.toContain('LEAKED-DETAIL-1b55');
  });

  /**
   * 全件成功のときは送出しない（監視のノイズ化を防ぐ）。
   * @requirement site-survey/REQ-16.8
   */
  it('アップロードが全件成功したときは監視基盤へ送出しない', async () => {
    vi.mocked(surveyImagesApi.uploadSurveyImages).mockResolvedValue({
      results: [uploadedImage],
      errors: [],
    });

    await selectFiles([new File(['a'], 'ok.jpg', { type: 'image/jpeg' })]);

    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});
