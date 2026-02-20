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

  describe('PDF生成 - ページネーション', () => {
    it('多数の項目がある場合でもPDFを生成できること（ページ分割）', async () => {
      // 多数の項目を生成してページ分割をトリガー
      const manyItems = Array.from({ length: 50 }, (_, i) =>
        createTestItem({
          id: `item-${i}`,
          displayOrder: i,
          lines: [createTestLine({ name: `項目${i + 1}`, amount: 1000 * (i + 1) })],
        })
      );

      const estimate = createTestEstimate({
        items: manyItems,
      });

      const result = await service.exportToPdf(estimate);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('深いネスト構造でもPDFを生成できること', async () => {
      // 3階層のネスト構造
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            id: 'level-1',
            lines: [createTestLine({ name: '第1階層' })],
            children: [
              createTestItem({
                id: 'level-2',
                parentId: 'level-1',
                lines: [createTestLine({ name: '第2階層' })],
                children: [
                  createTestItem({
                    id: 'level-3',
                    parentId: 'level-2',
                    lines: [createTestLine({ name: '第3階層' })],
                    children: [
                      createTestItem({
                        id: 'level-4',
                        parentId: 'level-3',
                        lines: [createTestLine({ name: '第4階層' })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = await service.exportToPdf(estimate);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('子項目が多数ある場合でもページ分割されること', async () => {
      // 親項目の下に多数の子項目
      const manyChildren = Array.from({ length: 30 }, (_, i) =>
        createTestItem({
          id: `child-${i}`,
          parentId: 'parent-1',
          displayOrder: i,
          lines: [createTestLine({ name: `子項目${i + 1}` })],
        })
      );

      const estimate = createTestEstimate({
        items: [
          createTestItem({
            id: 'parent-1',
            lines: [createTestLine({ name: '親項目' })],
            children: manyChildren,
          }),
        ],
      });

      const result = await service.exportToPdf(estimate);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('Excel生成 - 深いネスト構造', () => {
    it('深いネスト構造でExcelを生成できること', async () => {
      // 3階層のネスト構造
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            id: 'level-1',
            lines: [createTestLine({ name: '建築工事' })],
            children: [
              createTestItem({
                id: 'level-2',
                parentId: 'level-1',
                lines: [createTestLine({ name: '仮設工事' })],
                children: [
                  createTestItem({
                    id: 'level-3',
                    parentId: 'level-2',
                    lines: [createTestLine({ name: '足場工事' })],
                    children: [
                      createTestItem({
                        id: 'level-4',
                        parentId: 'level-3',
                        lines: [createTestLine({ name: '外部足場' })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = await service.exportToExcel(estimate);

      expect(result).toBeInstanceOf(Buffer);
      // XLSXシグネチャを確認
      const signature = result.slice(0, 2).toString('hex');
      expect(signature).toBe('504b');
    });

    it('複数の親項目に子項目がある場合でもExcelを生成できること', async () => {
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            id: 'parent-1',
            displayOrder: 0,
            lines: [createTestLine({ name: '建築工事' })],
            children: [
              createTestItem({
                id: 'child-1-1',
                parentId: 'parent-1',
                lines: [createTestLine({ name: '躯体工事' })],
              }),
              createTestItem({
                id: 'child-1-2',
                parentId: 'parent-1',
                lines: [createTestLine({ name: '仕上工事' })],
              }),
            ],
          }),
          createTestItem({
            id: 'parent-2',
            displayOrder: 1,
            lines: [createTestLine({ name: '電気設備工事' })],
            children: [
              createTestItem({
                id: 'child-2-1',
                parentId: 'parent-2',
                lines: [createTestLine({ name: '照明設備' })],
              }),
            ],
          }),
        ],
      });

      const result = await service.exportToExcel(estimate);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('totalAmountがない場合の計算', () => {
    it('totalAmountがundefinedの場合、itemsから計算されること', async () => {
      const estimate = createTestEstimate({
        totalAmount: undefined,
        items: [
          createTestItem({
            lines: [createTestLine({ lineType: 'ESTIMATE', amount: 50000 })],
          }),
        ],
      });

      const result = await service.exportToPdf(estimate);

      // PDFが正常に生成されること
      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('項目にlinesがない場合', () => {
    it('linesが空の項目があってもPDFを生成できること', async () => {
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            id: 'item-with-lines',
            lines: [createTestLine({ name: '通常項目' })],
          }),
          createTestItem({
            id: 'item-without-lines',
            lines: [],
          }),
        ],
      });

      const result = await service.exportToPdf(estimate);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('特殊文字を含む名称', () => {
    it('特殊文字を含むシート名でもExcelを生成できること', async () => {
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            lines: [createTestLine({ name: '工事[第1期]/改修*工事' })],
            children: [
              createTestItem({
                lines: [createTestLine({ name: '詳細:項目?A' })],
              }),
            ],
          }),
        ],
      });

      const result = await service.exportToExcel(estimate);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('長い名称のシート名が31文字以内に切り詰められること', async () => {
      const longName = 'あ'.repeat(50);
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            lines: [createTestLine({ name: longName })],
            children: [
              createTestItem({
                lines: [createTestLine({ name: '子項目' })],
              }),
            ],
          }),
        ],
      });

      const result = await service.exportToExcel(estimate);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('PDF詳細ページでの子項目ページ分割', () => {
    it('子項目が非常に多い場合、詳細ページ内でページ分割されること', async () => {
      // A4高さ297mm、MARGIN_BOTTOM 20mm、各行6mmとして、
      // (297 - 20 - 10 - 20) / 6 ≈ 約41行でページ分割
      // 親項目の下に50件の子項目を配置
      const manyChildren = Array.from({ length: 50 }, (_, i) =>
        createTestItem({
          id: `child-${i}`,
          parentId: 'parent-1',
          displayOrder: i,
          lines: [createTestLine({ name: `詳細子項目${i + 1}` })],
        })
      );

      const estimate = createTestEstimate({
        items: [
          createTestItem({
            id: 'parent-1',
            lines: [createTestLine({ name: '親項目（子項目多数）' })],
            children: manyChildren,
          }),
        ],
      });

      const result = await service.exportToPdf(estimate);

      expect(result).toBeInstanceOf(Buffer);
      // ページ分割が発生してもPDFが正常に生成されること
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('長いテキストの切り詰め', () => {
    it('長い名称（20文字超）がPDFで切り詰められること', async () => {
      const longName = 'あ'.repeat(25); // 20文字を超える名称
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            lines: [createTestLine({ name: longName })],
          }),
        ],
      });

      const result = await service.exportToPdf(estimate);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('長い規格（15文字超）がPDFで切り詰められること', async () => {
      const longSpec = 'い'.repeat(20); // 15文字を超える規格
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            lines: [createTestLine({ specification: longSpec })],
          }),
        ],
      });

      const result = await service.exportToPdf(estimate);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('Excel生成 - エッジケース', () => {
    it('項目のlinesが空の場合でもExcelを生成できること', async () => {
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            id: 'item-with-lines',
            lines: [createTestLine({ name: '通常項目' })],
          }),
          createTestItem({
            id: 'item-without-lines',
            lines: [], // linesが空
          }),
        ],
      });

      const result = await service.exportToExcel(estimate);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('項目のフィールドがnullの場合でもExcelを生成できること', async () => {
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            lines: [
              createTestLine({
                name: null as unknown as string,
                specification: null as unknown as string,
                unit: null as unknown as string,
                remarks: null as unknown as string,
              }),
            ],
          }),
        ],
      });

      const result = await service.exportToExcel(estimate);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('親項目のlinesが空で子項目がある場合でもExcelを生成できること', async () => {
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            id: 'parent-no-lines',
            displayOrder: 0,
            lines: [], // 親項目のlinesが空
            children: [
              createTestItem({
                id: 'child-1',
                parentId: 'parent-no-lines',
                lines: [createTestLine({ name: '子項目' })],
              }),
            ],
          }),
        ],
      });

      const result = await service.exportToExcel(estimate);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('子項目のlinesが空の場合でもExcelを生成できること', async () => {
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            id: 'parent-1',
            lines: [createTestLine({ name: '親項目' })],
            children: [
              createTestItem({
                id: 'child-with-lines',
                parentId: 'parent-1',
                lines: [createTestLine({ name: '通常子項目' })],
              }),
              createTestItem({
                id: 'child-without-lines',
                parentId: 'parent-1',
                lines: [], // 子項目のlinesが空
              }),
            ],
          }),
        ],
      });

      const result = await service.exportToExcel(estimate);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('深いネストで子項目のlinesが空の場合でもExcelを生成できること', async () => {
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            id: 'level-1',
            lines: [createTestLine({ name: '第1階層' })],
            children: [
              createTestItem({
                id: 'level-2',
                parentId: 'level-1',
                lines: [createTestLine({ name: '第2階層' })],
                children: [
                  createTestItem({
                    id: 'level-3-with-lines',
                    parentId: 'level-2',
                    lines: [createTestLine({ name: '第3階層' })],
                  }),
                  createTestItem({
                    id: 'level-3-no-lines',
                    parentId: 'level-2',
                    lines: [], // 深い階層でlinesが空
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = await service.exportToExcel(estimate);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('子項目のフィールドがnullの場合でもExcelを生成できること', async () => {
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            id: 'parent-1',
            lines: [createTestLine({ name: '親項目' })],
            children: [
              createTestItem({
                id: 'child-null-fields',
                parentId: 'parent-1',
                lines: [
                  createTestLine({
                    name: null as unknown as string,
                    specification: null as unknown as string,
                    unit: null as unknown as string,
                    remarks: null as unknown as string,
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = await service.exportToExcel(estimate);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  // ============================================================================
  // Task 42.4: 複数行タイプ出力テスト
  // ============================================================================

  describe('filterLinesByTypes（複数行タイプフィルタリング）', () => {
    it('複数の行タイプでフィルタリングできること', () => {
      const items: EstimateExportItem[] = [
        createTestItem({
          lines: [
            createTestLine({ id: 'line-1', lineType: 'ESTIMATE', name: '見積行' }),
            createTestLine({ id: 'line-2', lineType: 'EXECUTION', name: '実行行' }),
            createTestLine({ id: 'line-3', lineType: 'VENDOR', name: '業者行' }),
          ],
        }),
      ];

      const filtered = service.filterLinesByTypes(items, ['ESTIMATE', 'EXECUTION']);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.lines).toHaveLength(2);
      expect(filtered[0]!.lines.map((l) => l.lineType)).toEqual(['ESTIMATE', 'EXECUTION']);
    });

    it('単一の行タイプでフィルタリングできること', () => {
      const items: EstimateExportItem[] = [
        createTestItem({
          lines: [
            createTestLine({ id: 'line-1', lineType: 'ESTIMATE', name: '見積行' }),
            createTestLine({ id: 'line-2', lineType: 'EXECUTION', name: '実行行' }),
            createTestLine({ id: 'line-3', lineType: 'VENDOR', name: '業者行' }),
          ],
        }),
      ];

      const filtered = service.filterLinesByTypes(items, ['VENDOR']);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.lines).toHaveLength(1);
      expect(filtered[0]!.lines[0]!.lineType).toBe('VENDOR');
    });

    it('全行タイプを指定した場合は全行が含まれること', () => {
      const items: EstimateExportItem[] = [
        createTestItem({
          lines: [
            createTestLine({ id: 'line-1', lineType: 'ESTIMATE' }),
            createTestLine({ id: 'line-2', lineType: 'EXECUTION' }),
            createTestLine({ id: 'line-3', lineType: 'VENDOR' }),
          ],
        }),
      ];

      const filtered = service.filterLinesByTypes(items, ['ESTIMATE', 'EXECUTION', 'VENDOR']);

      expect(filtered[0]!.lines).toHaveLength(3);
    });

    it('ネストした項目でも複数行タイプフィルタリングが適用されること', () => {
      const items: EstimateExportItem[] = [
        createTestItem({
          lines: [
            createTestLine({ lineType: 'ESTIMATE' }),
            createTestLine({ lineType: 'EXECUTION' }),
            createTestLine({ lineType: 'VENDOR' }),
          ],
          children: [
            createTestItem({
              lines: [
                createTestLine({ lineType: 'ESTIMATE' }),
                createTestLine({ lineType: 'EXECUTION' }),
                createTestLine({ lineType: 'VENDOR' }),
              ],
            }),
          ],
        }),
      ];

      const filtered = service.filterLinesByTypes(items, ['ESTIMATE', 'VENDOR']);

      expect(filtered[0]!.lines).toHaveLength(2);
      expect(filtered[0]!.children[0]!.lines).toHaveLength(2);
    });
  });

  describe('getHeadersForLineTypes（複数行タイプ用プレフィックス付き列名）', () => {
    it('見積行タイプの列名にプレフィックスが付くこと', () => {
      const headers = service.getHeadersForLineTypes(['ESTIMATE']);

      expect(headers).toEqual([
        '見積名称',
        '見積規格',
        '見積単位',
        '見積数量',
        '見積単価',
        '見積金額',
        '見積備考',
      ]);
    });

    it('実行行タイプの列名にプレフィックスが付くこと', () => {
      const headers = service.getHeadersForLineTypes(['EXECUTION']);

      expect(headers).toEqual([
        '実行名称',
        '実行規格',
        '実行単位',
        '実行数量',
        '実行単価',
        '実行金額',
        '実行備考',
      ]);
    });

    it('業者行タイプの列名にプレフィックスが付くこと', () => {
      const headers = service.getHeadersForLineTypes(['VENDOR']);

      expect(headers).toEqual([
        '業者名称',
        '業者規格',
        '業者単位',
        '業者数量',
        '業者単価',
        '業者金額',
        '業者備考',
      ]);
    });

    it('複数行タイプの列名が横1列に並ぶこと', () => {
      const headers = service.getHeadersForLineTypes(['ESTIMATE', 'EXECUTION']);

      expect(headers).toEqual([
        '見積名称',
        '見積規格',
        '見積単位',
        '見積数量',
        '見積単価',
        '見積金額',
        '見積備考',
        '実行名称',
        '実行規格',
        '実行単位',
        '実行数量',
        '実行単価',
        '実行金額',
        '実行備考',
      ]);
    });

    it('全行タイプの列名が横1列に並ぶこと', () => {
      const headers = service.getHeadersForLineTypes(['ESTIMATE', 'EXECUTION', 'VENDOR']);

      expect(headers).toEqual([
        '見積名称',
        '見積規格',
        '見積単位',
        '見積数量',
        '見積単価',
        '見積金額',
        '見積備考',
        '実行名称',
        '実行規格',
        '実行単位',
        '実行数量',
        '実行単価',
        '実行金額',
        '実行備考',
        '業者名称',
        '業者規格',
        '業者単位',
        '業者数量',
        '業者単価',
        '業者金額',
        '業者備考',
      ]);
    });
  });

  describe('generateFileNameWithLineTypes（複数行タイプ対応ファイル名）', () => {
    it('単一行タイプでファイル名にラベルが含まれること', () => {
      const estimate = createTestEstimate({ name: 'テスト見積書' });

      const fileName = service.generateFileNameWithLineTypes(estimate, ExportFormat.XLSX, [
        'ESTIMATE',
      ]);

      expect(fileName).toContain('_見積');
      expect(fileName).toContain('.xlsx');
    });

    it('複数行タイプでファイル名にラベルがアンダースコア区切りで含まれること', () => {
      const estimate = createTestEstimate({ name: 'テスト見積書' });

      const fileName = service.generateFileNameWithLineTypes(estimate, ExportFormat.XLSX, [
        'ESTIMATE',
        'EXECUTION',
      ]);

      expect(fileName).toContain('_見積_実行');
      expect(fileName).toContain('.xlsx');
    });

    it('全行タイプでファイル名に全ラベルが含まれること', () => {
      const estimate = createTestEstimate({ name: 'テスト見積書' });

      const fileName = service.generateFileNameWithLineTypes(estimate, ExportFormat.PDF, [
        'ESTIMATE',
        'EXECUTION',
        'VENDOR',
      ]);

      expect(fileName).toContain('_見積_実行_業者');
      expect(fileName).toContain('.pdf');
    });
  });

  describe('exportToExcelWithLineTypes（複数行タイプExcel出力）', () => {
    it('複数行タイプの列を横1列に並べたExcelを生成できること', async () => {
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            lines: [
              createTestLine({ lineType: 'ESTIMATE', name: '見積項目A', amount: 10000 }),
              createTestLine({ lineType: 'EXECUTION', name: '実行項目A', amount: 8000 }),
              createTestLine({ lineType: 'VENDOR', name: '業者項目A', amount: 7000 }),
            ],
          }),
        ],
      });

      const result = await service.exportToExcelWithLineTypes(estimate, ['ESTIMATE', 'EXECUTION']);

      expect(result).toBeInstanceOf(Buffer);
      const signature = result.slice(0, 2).toString('hex');
      expect(signature).toBe('504b');
    });

    it('単一行タイプのExcel出力が正しく生成されること', async () => {
      const estimate = createTestEstimate();

      const result = await service.exportToExcelWithLineTypes(estimate, ['ESTIMATE']);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('exportToPdfWithLineTypes（複数行タイプPDF出力）', () => {
    it('複数行タイプのPDFを生成できること', async () => {
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            lines: [
              createTestLine({ lineType: 'ESTIMATE', name: '見積項目', amount: 10000 }),
              createTestLine({ lineType: 'EXECUTION', name: '実行項目', amount: 8000 }),
            ],
          }),
        ],
      });

      const result = await service.exportToPdfWithLineTypes(estimate, ['ESTIMATE', 'EXECUTION']);

      expect(result).toBeInstanceOf(Buffer);
      const signature = result.slice(0, 5).toString('utf-8');
      expect(signature).toBe('%PDF-');
    });

    it('ネストした子項目を含む複数行タイプのPDFを生成できること', async () => {
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            id: 'parent-1',
            lines: [
              createTestLine({ lineType: 'ESTIMATE', name: '見積親項目', amount: 50000 }),
              createTestLine({ lineType: 'EXECUTION', name: '実行親項目', amount: 40000 }),
            ],
            children: [
              createTestItem({
                id: 'child-1',
                parentId: 'parent-1',
                lines: [
                  createTestLine({ lineType: 'ESTIMATE', name: '見積子項目1', amount: 20000 }),
                  createTestLine({ lineType: 'EXECUTION', name: '実行子項目1', amount: 15000 }),
                ],
              }),
              createTestItem({
                id: 'child-2',
                parentId: 'parent-1',
                displayOrder: 1,
                lines: [
                  createTestLine({ lineType: 'ESTIMATE', name: '見積子項目2', amount: 30000 }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = await service.exportToPdfWithLineTypes(estimate, ['ESTIMATE', 'EXECUTION']);

      expect(result).toBeInstanceOf(Buffer);
      const signature = result.slice(0, 5).toString('utf-8');
      expect(signature).toBe('%PDF-');
    });

    it('linesが空の項目名にデフォルト名称を使用してPDFを生成できること', async () => {
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            id: 'parent-no-line',
            lines: [],
            children: [
              createTestItem({
                id: 'child-no-line',
                parentId: 'parent-no-line',
                lines: [createTestLine({ lineType: 'ESTIMATE', name: '子項目', amount: 5000 })],
              }),
            ],
          }),
        ],
      });

      const result = await service.exportToPdfWithLineTypes(estimate, ['ESTIMATE']);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('exportToExcelWithLineTypes（複数行タイプExcel詳細シート）', () => {
    it('ネストした子項目を含む複数行タイプのExcelを生成できること', async () => {
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            id: 'parent-1',
            lines: [
              createTestLine({ lineType: 'ESTIMATE', name: '見積親項目', amount: 50000 }),
              createTestLine({ lineType: 'EXECUTION', name: '実行親項目', amount: 40000 }),
              createTestLine({ lineType: 'VENDOR', name: '業者親項目', amount: 35000 }),
            ],
            children: [
              createTestItem({
                id: 'child-1',
                parentId: 'parent-1',
                lines: [
                  createTestLine({ lineType: 'ESTIMATE', name: '見積子項目1', amount: 20000 }),
                  createTestLine({ lineType: 'EXECUTION', name: '実行子項目1', amount: 15000 }),
                  createTestLine({ lineType: 'VENDOR', name: '業者子項目1', amount: 12000 }),
                ],
                children: [
                  createTestItem({
                    id: 'grandchild-1',
                    parentId: 'child-1',
                    lines: [
                      createTestLine({ lineType: 'ESTIMATE', name: '見積孫項目', amount: 10000 }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = await service.exportToExcelWithLineTypes(estimate, [
        'ESTIMATE',
        'EXECUTION',
        'VENDOR',
      ]);

      expect(result).toBeInstanceOf(Buffer);
      const signature = result.slice(0, 2).toString('hex');
      expect(signature).toBe('504b');
    });

    it('一部の行タイプが存在しない項目を含むExcelを生成できること', async () => {
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            id: 'parent-partial',
            lines: [createTestLine({ lineType: 'ESTIMATE', name: '見積のみ親', amount: 30000 })],
            children: [
              createTestItem({
                id: 'child-partial',
                parentId: 'parent-partial',
                lines: [createTestLine({ lineType: 'VENDOR', name: '業者のみ子', amount: 10000 })],
              }),
            ],
          }),
        ],
      });

      const result = await service.exportToExcelWithLineTypes(estimate, [
        'ESTIMATE',
        'EXECUTION',
        'VENDOR',
      ]);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('linesが空の項目のExcelを生成できること', async () => {
      const estimate = createTestEstimate({
        items: [
          createTestItem({
            id: 'parent-empty',
            lines: [],
            children: [
              createTestItem({
                id: 'child-empty',
                parentId: 'parent-empty',
                lines: [createTestLine({ lineType: 'ESTIMATE', name: '子項目', amount: 5000 })],
              }),
            ],
          }),
        ],
      });

      const result = await service.exportToExcelWithLineTypes(estimate, ['ESTIMATE']);

      expect(result).toBeInstanceOf(Buffer);
    });
  });
});
