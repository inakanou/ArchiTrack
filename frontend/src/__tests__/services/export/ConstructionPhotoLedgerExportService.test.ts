/**
 * ConstructionPhotoLedgerExportService - 工事写真台帳PDF出力オーケストレーションのテスト
 *
 * Task 8.2: PDF出力結線（印字画像・看板重畳・0件通知）
 *
 * 検証観点:
 * - (a) 印刷対象(includeInReport=true)のみが対象になり、印刷対象外の印字画像は取得しない (要件10.1)
 * - (b) 印字画像の取得順＝保存表示順(displayOrder 昇順) (要件10.12)
 * - (c) 印刷対象0件時はPDFを生成せず通知（doc.save 未呼び出し・レンダラ未呼び出し） (要件10.13)
 * - (d) レンダラ(buildConstructionPhotoLedger)に工事名＋工事施工者＋印字画像dataUrl配列が渡る
 * - 看板重畳はサーバの印字画像エンドポイントに委譲（クライアントで合成しない） (要件10.3)
 *
 * @see design.md - System Flows（PDF出力時オンデマンド）, ConstructionPhotoLedgerService
 * @see requirements.md - 要件10.1, 10.3, 10.12, 10.13
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConstructionPhotoWithUrls } from '../../../types/construction-photo.types';
import type { CompanyInfo } from '../../../types/company-info.types';

// 印字画像取得・会社情報取得APIをモック
vi.mock('../../../api/construction-photo-images');
vi.mock('../../../api/company-info');

// 8.1 のレンダラ（版組）はモックし、渡される引数のみを検証する（8.1は変更しない）
vi.mock('../../../services/export/ConstructionPhotoLedgerService', () => ({
  buildConstructionPhotoLedger: vi.fn(),
}));

// jsPDF をモックして doc.save の呼び出しを検証する
const { mockSave, mockJsPDFConstructor } = vi.hoisted(() => {
  const save = vi.fn();
  // new で呼ばれるため、通常関数（コンストラクタ可能）を実装に用いる
  const ctor = vi.fn(function (this: { save: typeof save }) {
    this.save = save;
  });
  return { mockSave: save, mockJsPDFConstructor: ctor };
});
vi.mock('jspdf', () => ({
  jsPDF: mockJsPDFConstructor,
}));

import { exportConstructionPhotoLedger } from '../../../services/export/ConstructionPhotoLedgerExportService';
import * as imagesApi from '../../../api/construction-photo-images';
import * as companyApi from '../../../api/company-info';
import { buildConstructionPhotoLedger } from '../../../services/export/ConstructionPhotoLedgerService';

function makePhoto(overrides: Partial<ConstructionPhotoWithUrls> = {}): ConstructionPhotoWithUrls {
  return {
    id: 'photo-1',
    albumId: 'album-1',
    fileName: 'photo-1.jpg',
    fileSize: 1000,
    width: 1920,
    height: 1080,
    displayOrder: 1,
    comment: null,
    includeInReport: true,
    signboardId: null,
    signboardPlacement: null,
    thumbnailUrl: 'https://example.com/thumb-1.jpg',
    printImageUrl: 'https://example.com/print-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const mockCompanyInfo: CompanyInfo = {
  id: 'company-1',
  companyName: '株式会社テスト建設',
  address: '東京都渋谷区1-1-1',
  representative: '代表 太郎',
  phone: null,
  fax: null,
  email: null,
  invoiceRegistrationNumber: null,
  version: 1,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

describe('exportConstructionPhotoLedger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(companyApi.getCompanyInfo).mockResolvedValue(mockCompanyInfo);
    // 印字画像は id をボディに持つ image/jpeg Blob として返す（看板重畳済み前提）
    vi.mocked(imagesApi.getConstructionPhotoPrintImage).mockImplementation(async (id: string) =>
      new Blob([id], { type: 'image/jpeg' })
    );
  });

  // (a) 印刷対象のみが対象・印字画像取得
  it('印刷対象(includeInReport=true)のみ印字画像を取得し、対象外は取得しない (要件10.1)', async () => {
    const photos = [
      makePhoto({ id: 'p1', displayOrder: 1, includeInReport: true }),
      makePhoto({ id: 'p2', displayOrder: 2, includeInReport: false }),
      makePhoto({ id: 'p3', displayOrder: 3, includeInReport: true }),
    ];

    const result = await exportConstructionPhotoLedger({ photos, workName: '工事A' });

    expect(result.generated).toBe(true);
    expect(imagesApi.getConstructionPhotoPrintImage).toHaveBeenCalledTimes(2);
    expect(imagesApi.getConstructionPhotoPrintImage).toHaveBeenCalledWith('p1');
    expect(imagesApi.getConstructionPhotoPrintImage).toHaveBeenCalledWith('p3');
    expect(imagesApi.getConstructionPhotoPrintImage).not.toHaveBeenCalledWith('p2');
  });

  // (b) 取得順＝保存表示順
  it('印字画像を保存表示順(displayOrder 昇順)で取得する (要件10.12)', async () => {
    const photos = [
      makePhoto({ id: 'p3', displayOrder: 3, includeInReport: true }),
      makePhoto({ id: 'p1', displayOrder: 1, includeInReport: true }),
      makePhoto({ id: 'p2', displayOrder: 2, includeInReport: true }),
    ];

    await exportConstructionPhotoLedger({ photos, workName: '工事A' });

    const calledIds = vi.mocked(imagesApi.getConstructionPhotoPrintImage).mock.calls.map(
      (c) => c[0]
    );
    expect(calledIds).toEqual(['p1', 'p2', 'p3']);
  });

  // (c) 0件通知（非実行）
  it('印刷対象が0件のときはPDFを生成せず通知する（doc.save・レンダラ未呼び出し） (要件10.13)', async () => {
    const photos = [
      makePhoto({ id: 'p1', displayOrder: 1, includeInReport: false }),
      makePhoto({ id: 'p2', displayOrder: 2, includeInReport: false }),
    ];

    const result = await exportConstructionPhotoLedger({ photos, workName: '工事A' });

    expect(result).toEqual({ generated: false, reason: 'no-printable' });
    expect(imagesApi.getConstructionPhotoPrintImage).not.toHaveBeenCalled();
    expect(buildConstructionPhotoLedger).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  // (d) レンダラへ工事名＋施工者＋dataUrl配列を渡す
  it('レンダラに工事名・工事施工者・印字画像dataUrl配列を渡してPDFを保存する', async () => {
    const photos = [
      makePhoto({ id: 'p1', displayOrder: 1, includeInReport: true, comment: '配筋検査' }),
      makePhoto({ id: 'p2', displayOrder: 2, includeInReport: true, comment: null }),
    ];

    await exportConstructionPhotoLedger({ photos, workName: 'テスト工事案件A' });

    expect(buildConstructionPhotoLedger).toHaveBeenCalledTimes(1);
    const [, input] = vi.mocked(buildConstructionPhotoLedger).mock.calls[0]!;
    expect(input.workName).toBe('テスト工事案件A');
    expect(input.contractorName).toBe('株式会社テスト建設');
    expect(input.items).toHaveLength(2);
    expect(input.items[0]!.dataUrl).toMatch(/^data:image\/jpeg/);
    expect(input.items[0]!.comment).toBe('配筋検査');
    expect(input.items[1]!.comment).toBeNull();

    // PDFが保存される
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('会社情報が未登録（空オブジェクト）の場合は工事施工者を空文字にする', async () => {
    vi.mocked(companyApi.getCompanyInfo).mockResolvedValue({});
    const photos = [makePhoto({ id: 'p1', displayOrder: 1, includeInReport: true })];

    await exportConstructionPhotoLedger({ photos, workName: '工事A' });

    const [, input] = vi.mocked(buildConstructionPhotoLedger).mock.calls[0]!;
    expect(input.contractorName).toBe('');
  });
});
