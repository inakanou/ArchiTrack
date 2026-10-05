/**
 * @fileoverview 共通ヘッダー（AppHeader）のスタイルシートと、ブレークポイントの定数の突き合わせ
 *
 * Task 40.1: タブレット幅で共通ヘッダが崩れる状態を扱う
 *
 * CSS の @media は TS の定数を読めないため、リンクと管理メニューの文言を隠す幅の上限は
 * `utils/responsive.ts` の `APP_HEADER_ICON_ONLY_MAX_WIDTH` と AppHeader.css の同値で二重に持つ。
 * 本検証は両者が一致し、文言を隠す規則がその @media の中にあることを主張する。
 * 表示そのもの（折り返し・はみ出し・到達性）は E2E（e2e/specs/navigation/app-header.spec.ts の
 * 「タブレット幅の表示」）が実ブラウザで判定する。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP_HEADER_ICON_ONLY_MAX_WIDTH } from '../../utils/responsive';

/** @media の条件に続く波括弧の中身（入れ子の括弧を数えて取り出す） */
function extractMediaBlock(css: string, condition: string): string {
  const head = `@media ${condition}`;
  const start = css.indexOf(head);
  if (start < 0) {
    throw new Error(`AppHeader.css に ${head} が無い`);
  }
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`${head} の括弧が閉じていない`);
}

/** ブロックの中から、セレクタに続く宣言の本文を取り出す */
function declarationsOf(block: string, selector: string): string {
  const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const matched = block.match(pattern);
  return matched?.[1] ?? '';
}

describe('AppHeader.css のアイコンのみの表示の幅（タスク40.1）', () => {
  // npm はスクリプトを frontend パッケージルートで実行するため cwd 基準で解決する
  const css = readFileSync(
    resolve(process.cwd(), 'src/components/Navigation/AppHeader.css'),
    'utf8'
  );

  it('文言を隠す幅の上限は 1199px である（1200px 以上は文言を出す）', () => {
    // 是正前の実測で、管理者の長い表示名の文言が一行に収まるのは 1148px 以上だった。
    // 余裕を取って 1200px から文言を出す
    expect(APP_HEADER_ICON_ONLY_MAX_WIDTH).toBe(1199);
  });

  it('リンクと管理メニューの文言を隠す規則が、定数と同じ上限の @media の中にある', () => {
    const block = extractMediaBlock(css, `(max-width: ${APP_HEADER_ICON_ONLY_MAX_WIDTH}px)`);

    expect(declarationsOf(block, '.app-header-nav-link span')).toMatch(/display:\s*none/);
    expect(declarationsOf(block, '.app-header-admin-trigger span')).toMatch(/display:\s*none/);
  });

  it('タブレット幅ではユーザー名を隠さない（省略表示で出す）', () => {
    const block = extractMediaBlock(css, `(max-width: ${APP_HEADER_ICON_ONLY_MAX_WIDTH}px)`);
    expect(block).not.toContain('.app-header-user-name');

    // 省略表示の指定は全幅に効く規則にある
    const base = declarationsOf(css, '.app-header-user-name');
    expect(base).toMatch(/text-overflow:\s*ellipsis/);
    expect(base).toMatch(/overflow:\s*hidden/);
    expect(base).toMatch(/white-space:\s*nowrap/);
    expect(base).toMatch(/max-width:\s*\d+px/);
  });
});
