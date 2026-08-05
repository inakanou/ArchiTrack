/**
 * @fileoverview 帳票出力サービスの動的読み込みの単体テスト（Task 56.6）
 *
 * 「サービスを動的読み込みとし、初期表示時にフォント資産を読み込まない」は
 * **静的 import グラフ**で機械的に確かめられる。バンドラは静的 import を辿って
 * 初期チャンクへ畳み込むため、`EstimatePdfExportService` へ到達する静的な辺が1本でも
 * 残っていれば 2.25MB のフォント資産が初期表示に載る。
 *
 * 本ファイルは `frontend/src` 配下のソースを実際に読み、
 * (1) 読み込み口から**サービスへ静的に到達できないこと**、
 * (2) サービスからは**フォント資産へ静的に到達できること**（＝(1) の否定側アサーションが
 *     空振りでないこと）、
 * (3) サービスを静的 import しているモジュールがテスト以外に存在しないこと、
 * を突き合わせる。
 *
 * Requirements: 10.1（帳票出力の起動経路）
 * Design: design.md `##### EstimatePdfExportService`「**動的 import で読み込む**。
 * フォント資産（2.25MB）を含むため初期ロードから切り離す」
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  SRC_ROOT,
  allSourceFiles,
  isTestFile,
  staticImportsOf,
  staticReachableFrom,
} from './__tests__/staticImportGraph';

// 動的読み込みの実行検証で実物のフォント資産（約3MB）を読み込まないための軽量ダブル。
// 静的グラフの検証はディスク上のソースを直接読むため、これらのモックの影響を受けない。
vi.mock('jspdf', () => {
  function MockJsPDF() {
    return {};
  }
  return { jsPDF: MockJsPDF };
});
vi.mock('./PdfFontService', () => ({
  PdfFontService: class {
    initialize(): void {}
    isLoaded(): boolean {
      return true;
    }
  },
  PDF_FONT_FAMILY: 'NotoSansJP',
}));
vi.mock('./PdfExportService', () => ({ downloadPdf: (): void => {} }));

import { loadEstimatePdfExportService } from './loadEstimatePdfExportService';

// ============================================================================
// 静的 import グラフ
// ============================================================================

// 走査そのもの（相対指定子と `@/…` エイリアスの解決を含む）は
// `__tests__/staticImportGraph.ts` に切り出し、フォント資産の分離を検査する
// `__tests__/fontAssetIsolation.test.ts`（Task 56.13）と実装を共有する。
const LOADER = path.join(SRC_ROOT, 'services/export/loadEstimatePdfExportService.ts');
const SERVICE = path.join(SRC_ROOT, 'services/export/EstimatePdfExportService.ts');
const FONT_ASSET = path.join(SRC_ROOT, 'services/export/fonts/noto-sans-jp-base64.ts');

// ============================================================================

describe('帳票出力サービスの動的読み込み', () => {
  it('読み込み口は動的 import でサービスを取り込む', () => {
    const source = readFileSync(LOADER, 'utf8');

    expect(source).toMatch(/await import\(\s*'\.\/EstimatePdfExportService'\s*\)/);
  });

  it('読み込み口からサービスとフォント資産へ静的に到達しない', () => {
    const reachable = staticReachableFrom(LOADER);

    expect([...reachable]).not.toContain(SERVICE);
    expect([...reachable]).not.toContain(FONT_ASSET);
  });

  it('サービスからはフォント資産へ静的に到達する（上の否定側が空振りでないことの裏取り）', () => {
    // サービス → PdfFontService → fonts/noto-sans-jp-base64 の静的な鎖が実在するので、
    // 動的境界を1本でも静的 import に変えれば上のテストは必ず落ちる。
    const reachable = staticReachableFrom(SERVICE);

    expect([...reachable]).toContain(FONT_ASSET);
  });

  it('テスト以外のモジュールはサービスを静的 import しない', () => {
    const importers = allSourceFiles(SRC_ROOT)
      .filter((file) => file !== SERVICE && !isTestFile(file))
      .filter((file) => staticImportsOf(file).includes(SERVICE));

    expect(importers).toEqual([]);
  });

  it('読み込み口はサービスの実体を返す', async () => {
    const service = await loadEstimatePdfExportService();

    expect(typeof service.generate).toBe('function');
    expect(typeof service.downloadFiles).toBe('function');
    expect(typeof service.generateAndDownload).toBe('function');
  });
});
