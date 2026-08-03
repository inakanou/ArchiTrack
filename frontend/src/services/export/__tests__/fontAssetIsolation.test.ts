/**
 * @fileoverview 日本語フォント資産が初期チャンクへ載らないことの単体テスト（Task 56.13）
 *
 * 日本語フォント資産（`fonts/noto-sans-jp-base64.ts`、base64 リテラルで約3MB）は
 * PDF 出力の4サービス（見積帳票・現場調査報告書・数量表・工事写真台帳）が共有する。
 * これらのサービスを画面が**値として静的 import** すると、画面は `routes.tsx` から
 * 静的に登録されているため、バンドラがフォント資産を初期表示のチャンクへ畳み込む。
 * 実測では `dist/assets/index-*.js` が 5.86MB になり、うち 3.0MB が base64 リテラルだった。
 *
 * 「初期チャンクに載らない」は**静的 import グラフ**で機械的に確かめられる。
 * 本ファイルは `frontend/src` 配下のソースを実際に読み、
 * (1) アプリのエントリ（`main.tsx`）から**フォント資産へ静的に到達しないこと**、
 * (2) 各サービスからは**フォント資産へ静的に到達すること**（＝(1) の否定側アサーションが
 *     空振りでないこと。境界を1本でも静的 import に戻せば (1) は必ず落ちる）、
 * (3) エントリから各**読み込み口（loader）と出力画面には到達すること**（＝走査が
 *     途中で止まったせいで (1) が真になっているのではないこと）、
 * (4) フォント資産を静的 import してよいのは `PdfFontService` だけであること
 *     （`services/export/index.ts` のような再エクスポートの再発防止）、
 * を突き合わせる。
 *
 * Requirements: 10.1（帳票出力の起動経路）
 * Design: design.md `##### EstimatePdfExportService`「**動的 import で読み込む**。
 * フォント資産（2.25MB）を含むため初期ロードから切り離す」／
 * design.md `### パフォーマンス`「帳票サービスは動的 import で初期ロードから切り離す」
 */

import path from 'node:path';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  SRC_ROOT,
  allSourceFiles,
  isTestFile,
  staticImportsOf,
  staticReachableFrom,
} from './staticImportGraph';

const src = (relative: string): string => path.join(SRC_ROOT, relative);
const rel = (absolute: string): string => path.relative(SRC_ROOT, absolute);

/** アプリのエントリ（`index.html` から読み込まれる唯一の入口＝初期チャンクの根） */
const ENTRY = src('main.tsx');

/** 日本語フォント資産（base64 リテラル約3MB） */
const FONT_ASSET = src('services/export/fonts/noto-sans-jp-base64.ts');

/** フォント資産を直接 import してよい唯一のモジュール */
const FONT_OWNER = src('services/export/PdfFontService.ts');

/**
 * 動的 import の境界（読み込み口 → 切り離すサービス → そのサービスを使う画面）
 *
 * 同じ組を「読み込み口は到達する／サービスは到達しない／サービスからフォントへは到達する」
 * の3方向で検査するため、パスの取り違えは肯定側の検査で必ず露見する。
 */
const DYNAMIC_BOUNDARIES = [
  {
    name: '見積帳票',
    loader: src('services/export/loadEstimatePdfExportService.ts'),
    service: src('services/export/EstimatePdfExportService.ts'),
    dynamicSpecifier: './EstimatePdfExportService',
    screens: [src('components/estimate/EstimateExportDialog.tsx')],
  },
  {
    name: '現場調査報告書',
    loader: src('services/export/loadPdfExportService.ts'),
    service: src('services/export/PdfExportService.ts'),
    dynamicSpecifier: './PdfExportService',
    screens: [
      src('components/site-surveys/SiteSurveyDetailInfo.tsx'),
      src('pages/EstimateRequestDetailPage.tsx'),
      src('pages/QuantityTableEditPage.tsx'),
    ],
  },
  {
    name: '数量表',
    loader: src('services/export/loadQuantityTablePdfExportService.ts'),
    service: src('services/export/QuantityTablePdfExportService.ts'),
    dynamicSpecifier: './QuantityTablePdfExportService',
    screens: [src('pages/QuantityTableEditPage.tsx')],
  },
  {
    name: '工事写真台帳',
    loader: src('services/export/loadConstructionPhotoLedgerExportService.ts'),
    service: src('services/export/ConstructionPhotoLedgerExportService.ts'),
    dynamicSpecifier: './ConstructionPhotoLedgerExportService',
    screens: [src('pages/ConstructionPhotoDetailPage.tsx')],
  },
] as const;

describe('日本語フォント資産の初期チャンクからの分離', () => {
  it('アプリのエントリからフォント資産へ静的に到達しない', () => {
    const reachable = staticReachableFrom(ENTRY);

    expect([...reachable].map(rel)).not.toContain(rel(FONT_ASSET));
  });

  it.each(DYNAMIC_BOUNDARIES)(
    '$name: サービスからはフォント資産へ静的に到達する（否定側が空振りでないことの裏取り）',
    ({ service }) => {
      // サービス → …→ PdfFontService → fonts/noto-sans-jp-base64 の静的な鎖が実在するので、
      // 動的境界を1本でも静的 import に変えればエントリからの到達検査は必ず落ちる。
      const reachable = staticReachableFrom(service);

      expect([...reachable].map(rel)).toContain(rel(FONT_ASSET));
    }
  );

  it.each(DYNAMIC_BOUNDARIES)(
    '$name: エントリから読み込み口と出力画面には到達し、サービスには到達しない',
    ({ loader, service, screens }) => {
      const reachable = [...staticReachableFrom(ENTRY)].map(rel);

      // 走査がエントリから出力画面まで届いていること（届いていなければ上の否定側は無意味）
      for (const screen of screens) {
        expect(reachable).toContain(rel(screen));
      }
      expect(reachable).toContain(rel(loader));
      // 境界の向こう側（フォント資産を抱えるサービス）だけが初期チャンクから外れる
      expect(reachable).not.toContain(rel(service));
    }
  );

  it.each(DYNAMIC_BOUNDARIES)(
    '$name: 読み込み口は動的 import でサービスを取り込む',
    ({ loader, service, dynamicSpecifier }) => {
      const source = readFileSync(loader, 'utf8');

      expect(source).toContain(`import('${dynamicSpecifier}')`);
      // 読み込み口自身が値として静的 import していないこと（`import type` は消えるので辺にならない）
      expect(staticImportsOf(loader).map(rel)).not.toContain(rel(service));
    }
  );

  it('フォント資産を静的 import する本番モジュールは PdfFontService だけである', () => {
    // `services/export/index.ts` はフォント資産を再エクスポートしており、
    // その barrel を1画面が import しているだけでフォントが初期チャンクへ載っていた（56.13）。
    const importers = allSourceFiles(SRC_ROOT)
      .filter((file) => !isTestFile(file))
      .filter((file) => staticImportsOf(file).includes(FONT_ASSET))
      .map(rel);

    expect(importers).toEqual([rel(FONT_OWNER)]);
  });
});
