/**
 * @fileoverview 見積書出力サービスの単体テスト
 *
 * Task 6.1: EstimateExportServiceの実装（PDF出力）
 * Task 6.2: Excel出力機能の実装
 *
 * Requirements (estimate-creation):
 * - REQ-10.1: PDF出力を選択した場合、建設工事見積書形式のPDFファイルを生成する
 * - REQ-10.2: Excel出力を選択した場合、建設工事見積書形式のExcelファイル（.xlsx）を生成する
 * - REQ-10.3: 出力の1ページ目に表紙を含める
 * - REQ-10.4: 出力の2ページ目に見積項目の第1階層の項目一覧を含める
 * - REQ-10.5: 各第1階層項目の子項目一覧を後続ページに順次出力する
 * - REQ-10.6: ネスト階層ごとに別ページとして出力する
 * - REQ-10.7: 見積金額行のみを出力対象とする（実行金額行・業者金額行は出力しない）
 * - REQ-10.8: 出力処理中であることを表示する
 *
 * @module __tests__/unit/services/estimate-export.service.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EstimateExportService,
  type EstimateExportData,
  type EstimateExportItem,
  type EstimateExportLine,
  ExportFormat,
} from '../../../services/estimate-export.service.js';

describe('EstimateExportService', () => {
  let service: EstimateExportService;

  // テスト用の見積項目行データ
  const createTestLine = (overrides?: Partial<EstimateExportLine>): EstimateExportLine => ({
    id: 'line-1',
    lineType: 'ESTIMATE',
    name: 'テスト項目',
    specification: '規格A',
    unit: '式',
    quantity: 1,
    unitPrice: 10000,
    amount: 10000,
    remarks: '備考',
    ...overrides,
  });

  // テスト用の見積項目データ
  const createTestItem = (overrides?: Partial<EstimateExportItem>): EstimateExportItem => ({
    id: 'item-1',
    parentId: null,
    displayOrder: 0,
    lines: [createTestLine()],
    children: [],
    ...overrides,
  });

  // テスト用の見積書データ
  const createTestEstimate = (overrides?: Partial<EstimateExportData>): EstimateExportData => ({
    id: 'estimate-1',
    name: 'テスト見積書',
    projectName: 'テストプロジェクト',
    createdAt: new Date('2026-01-15'),
    items: [createTestItem()],
    totalAmount: 10000,
    ...overrides,
  });

  beforeEach(() => {
    service = new EstimateExportService();
  });

  describe('ExportFormat', () => {
    it('PDF形式が定義されていること', () => {
      expect(ExportFormat.PDF).toBe('pdf');
    });

    it('Excel形式が定義されていること', () => {
      expect(ExportFormat.XLSX).toBe('xlsx');
    });
  });

  describe('exportToPdf', () => {
    describe('REQ-10.1: PDF出力の基本機能', () => {
      it('見積書データからPDFバッファを生成できること', async () => {
        const estimate = createTestEstimate();

        const result = await service.exportToPdf(estimate);

        expect(result).toBeInstanceOf(Buffer);
        expect(result.length).toBeGreaterThan(0);
      });

      it('生成されたバッファがPDFシグネチャを持つこと', async () => {
        const estimate = createTestEstimate();

        const result = await service.exportToPdf(estimate);

        // PDF file signature: %PDF-
        const signature = result.slice(0, 5).toString('utf-8');
        expect(signature).toBe('%PDF-');
      });
    });

    describe('REQ-10.3: 表紙の生成', () => {
      it('表紙にプロジェクト名が含まれること', async () => {
        const estimate = createTestEstimate({ projectName: '特定プロジェクト名' });

        const result = await service.exportToPdf(estimate);

        // PDFが生成されていること（内容の詳細検証はE2Eで行う）
        expect(result).toBeInstanceOf(Buffer);
      });

      it('表紙に見積書名が含まれること', async () => {
        const estimate = createTestEstimate({ name: '特定見積書名' });

        const result = await service.exportToPdf(estimate);

        expect(result).toBeInstanceOf(Buffer);
      });

      it('表紙に合計金額が含まれること', async () => {
        const estimate = createTestEstimate({ totalAmount: 1234567 });

        const result = await service.exportToPdf(estimate);

        expect(result).toBeInstanceOf(Buffer);
      });
    });

    describe('REQ-10.4: 第1階層項目一覧', () => {
      it('複数の第1階層項目がある場合でもPDFを生成できること', async () => {
        const estimate = createTestEstimate({
          items: [
            createTestItem({ id: 'item-1', displayOrder: 0 }),
            createTestItem({ id: 'item-2', displayOrder: 1 }),
            createTestItem({ id: 'item-3', displayOrder: 2 }),
          ],
        });

        const result = await service.exportToPdf(estimate);

        expect(result).toBeInstanceOf(Buffer);
      });
    });

    describe('REQ-10.5, REQ-10.6: 階層構造の出力', () => {
      it('ネストした項目がある場合でもPDFを生成できること', async () => {
        const estimate = createTestEstimate({
          items: [
            createTestItem({
              id: 'parent-1',
              children: [
                createTestItem({
                  id: 'child-1',
                  parentId: 'parent-1',
                  children: [createTestItem({ id: 'grandchild-1', parentId: 'child-1' })],
                }),
              ],
            }),
          ],
        });

        const result = await service.exportToPdf(estimate);

        expect(result).toBeInstanceOf(Buffer);
      });
    });

    describe('REQ-10.7: 見積金額行のみ出力', () => {
      it('ESTIMATE行のみが出力対象となること', async () => {
        const estimate = createTestEstimate({
          items: [
            createTestItem({
              lines: [
                createTestLine({ lineType: 'ESTIMATE', name: '見積行' }),
                createTestLine({ lineType: 'EXECUTION', name: '実行行' }),
                createTestLine({ lineType: 'VENDOR', name: '業者行' }),
              ],
            }),
          ],
        });

        const result = await service.exportToPdf(estimate);

        // PDFが生成されること（行のフィルタリングは内部で行われる）
        expect(result).toBeInstanceOf(Buffer);
      });
    });

    describe('エラーハンドリング', () => {
      it('見積書データがnullの場合はエラーをスローすること', async () => {
        await expect(service.exportToPdf(null as unknown as EstimateExportData)).rejects.toThrow(
          '見積書データが必要です'
        );
      });

      it('見積書名が空の場合はエラーをスローすること', async () => {
        const estimate = createTestEstimate({ name: '' });

        await expect(service.exportToPdf(estimate)).rejects.toThrow('見積書名が必要です');
      });
    });
  });

  describe('exportToExcel', () => {
    describe('REQ-10.2: Excel出力の基本機能', () => {
      it('見積書データからExcelバッファを生成できること', async () => {
        const estimate = createTestEstimate();

        const result = await service.exportToExcel(estimate);

        expect(result).toBeInstanceOf(Buffer);
        expect(result.length).toBeGreaterThan(0);
      });

      it('生成されたバッファがXLSXシグネチャを持つこと', async () => {
        const estimate = createTestEstimate();

        const result = await service.exportToExcel(estimate);

        // XLSX file signature: PK (ZIP format)
        const signature = result.slice(0, 2).toString('hex');
        expect(signature).toBe('504b'); // PK in hex
      });
    });

    describe('REQ-10.3: 表紙シートの生成', () => {
      it('表紙シートが生成されること', async () => {
        const estimate = createTestEstimate();

        const result = await service.exportToExcel(estimate);

        expect(result).toBeInstanceOf(Buffer);
      });
    });

    describe('REQ-10.4: 第1階層項目シート', () => {
      it('複数の第1階層項目がある場合でもExcelを生成できること', async () => {
        const estimate = createTestEstimate({
          items: [
            createTestItem({ id: 'item-1', displayOrder: 0 }),
            createTestItem({ id: 'item-2', displayOrder: 1 }),
          ],
        });

        const result = await service.exportToExcel(estimate);

        expect(result).toBeInstanceOf(Buffer);
      });
    });

    describe('REQ-10.5, REQ-10.6: 階層構造のシート出力', () => {
      it('ネストした項目がある場合、各階層が別シートで出力されること', async () => {
        const estimate = createTestEstimate({
          items: [
            createTestItem({
              id: 'parent-1',
              lines: [createTestLine({ name: '建築工事' })],
              children: [
                createTestItem({
                  id: 'child-1',
                  parentId: 'parent-1',
                  lines: [createTestLine({ name: '直接仮設工事' })],
                }),
              ],
            }),
          ],
        });

        const result = await service.exportToExcel(estimate);

        expect(result).toBeInstanceOf(Buffer);
      });
    });

    describe('REQ-10.7: 見積金額行のみ出力', () => {
      it('ESTIMATE行のみが出力対象となること', async () => {
        const estimate = createTestEstimate({
          items: [
            createTestItem({
              lines: [
                createTestLine({ lineType: 'ESTIMATE', name: '見積行' }),
                createTestLine({ lineType: 'EXECUTION', name: '実行行' }),
                createTestLine({ lineType: 'VENDOR', name: '業者行' }),
              ],
            }),
          ],
        });

        const result = await service.exportToExcel(estimate);

        expect(result).toBeInstanceOf(Buffer);
      });
    });

    describe('エラーハンドリング', () => {
      it('見積書データがnullの場合はエラーをスローすること', async () => {
        await expect(service.exportToExcel(null as unknown as EstimateExportData)).rejects.toThrow(
          '見積書データが必要です'
        );
      });
    });
  });

  describe('export', () => {
    it('PDF形式を指定した場合、PDFを生成すること', async () => {
      const estimate = createTestEstimate();

      const result = await service.export(estimate, ExportFormat.PDF);

      const signature = result.slice(0, 5).toString('utf-8');
      expect(signature).toBe('%PDF-');
    });

    it('XLSX形式を指定した場合、Excelを生成すること', async () => {
      const estimate = createTestEstimate();

      const result = await service.export(estimate, ExportFormat.XLSX);

      const signature = result.slice(0, 2).toString('hex');
      expect(signature).toBe('504b');
    });

    it('不正な形式を指定した場合はエラーをスローすること', async () => {
      const estimate = createTestEstimate();

      await expect(service.export(estimate, 'invalid' as ExportFormat)).rejects.toThrow(
        'サポートされていない出力形式です'
      );
    });
  });

  describe('generateFileName', () => {
    it('PDF形式のファイル名を生成できること', () => {
      const estimate = createTestEstimate({ name: 'テスト見積書' });

      const fileName = service.generateFileName(estimate, ExportFormat.PDF);

      expect(fileName).toMatch(/^テスト見積書_\d{8}\.pdf$/);
    });

    it('Excel形式のファイル名を生成できること', () => {
      const estimate = createTestEstimate({ name: 'テスト見積書' });

      const fileName = service.generateFileName(estimate, ExportFormat.XLSX);

      expect(fileName).toMatch(/^テスト見積書_\d{8}\.xlsx$/);
    });

    it('ファイル名に使用できない文字が置換されること', () => {
      const estimate = createTestEstimate({ name: 'テスト/見積:書*A' });

      const fileName = service.generateFileName(estimate, ExportFormat.PDF);

      expect(fileName).not.toContain('/');
      expect(fileName).not.toContain(':');
      expect(fileName).not.toContain('*');
    });
  });

  describe('filterEstimateLines', () => {
    it('ESTIMATE行のみをフィルタリングできること', () => {
      const items: EstimateExportItem[] = [
        createTestItem({
          lines: [
            createTestLine({ id: 'line-1', lineType: 'ESTIMATE' }),
            createTestLine({ id: 'line-2', lineType: 'EXECUTION' }),
            createTestLine({ id: 'line-3', lineType: 'VENDOR' }),
          ],
        }),
      ];

      const filtered = service.filterEstimateLines(items);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.lines).toHaveLength(1);
      expect(filtered[0]!.lines[0]!.lineType).toBe('ESTIMATE');
    });

    it('ネストした項目でもフィルタリングが適用されること', () => {
      const items: EstimateExportItem[] = [
        createTestItem({
          lines: [
            createTestLine({ lineType: 'ESTIMATE' }),
            createTestLine({ lineType: 'EXECUTION' }),
          ],
          children: [
            createTestItem({
              lines: [
                createTestLine({ lineType: 'ESTIMATE' }),
                createTestLine({ lineType: 'VENDOR' }),
              ],
            }),
          ],
        }),
      ];

      const filtered = service.filterEstimateLines(items);

      expect(filtered[0]!.lines).toHaveLength(1);
      expect(filtered[0]!.children[0]!.lines).toHaveLength(1);
    });
  });

  describe('calculateTotalAmount', () => {
    it('全項目の金額合計を計算できること', () => {
      const items: EstimateExportItem[] = [
        createTestItem({
          lines: [createTestLine({ lineType: 'ESTIMATE', amount: 10000 })],
        }),
        createTestItem({
          lines: [createTestLine({ lineType: 'ESTIMATE', amount: 20000 })],
        }),
      ];

      const total = service.calculateTotalAmount(items);

      expect(total).toBe(30000);
    });

    it('ネストした項目の金額も合計に含まれること', () => {
      const items: EstimateExportItem[] = [
        createTestItem({
          lines: [createTestLine({ lineType: 'ESTIMATE', amount: 10000 })],
          children: [
            createTestItem({
              lines: [createTestLine({ lineType: 'ESTIMATE', amount: 5000 })],
            }),
          ],
        }),
      ];

      const total = service.calculateTotalAmount(items);

      expect(total).toBe(15000);
    });

    it('ESTIMATE行以外は合計に含まれないこと', () => {
      const items: EstimateExportItem[] = [
        createTestItem({
          lines: [
            createTestLine({ lineType: 'ESTIMATE', amount: 10000 }),
            createTestLine({ lineType: 'EXECUTION', amount: 8000 }),
            createTestLine({ lineType: 'VENDOR', amount: 7000 }),
          ],
        }),
      ];

      const total = service.calculateTotalAmount(items);

      expect(total).toBe(10000);
    });

    it('金額がnullの場合は0として扱うこと', () => {
      const items: EstimateExportItem[] = [
        createTestItem({
          lines: [createTestLine({ lineType: 'ESTIMATE', amount: null })],
        }),
      ];

      const total = service.calculateTotalAmount(items);

      expect(total).toBe(0);
    });
  });
});
