/**
 * @fileoverview estimateKeymapText - キー割当の画面表記
 *
 * Task 54.10: ツールバーへの範囲選択・モード切替・取り消しの統合
 *
 * キー割当（`estimateKeymap`）を**画面に出す語彙**へ変換する規則だけを持ちます。
 * キーの組み合わせそのものは一切持たず、常に単一定義から受け取ります。
 *
 * 表記の利用者は2つあり、どちらも同じ規則を使うことで表示が食い違いません。
 * - キー割当一覧（`EstimateKeymapHelp` / 47.3）
 * - ツールバー各ボタンの説明（`EstimateItemToolbar` / 23.11）
 *
 * 54.7 の時点では `EstimateKeymapHelp.tsx` が唯一の利用者だったため同居していましたが、
 * 54.10 でツールバーが2人目の利用者になったので分離しました
 * （コンポーネントのファイルから関数を公開すると Fast Refresh が効かなくなるため）。
 *
 * @module components/estimate/estimateKeymapText
 */

import { ESTIMATE_KEYMAP } from '../../domain/estimate/estimateKeymap';
import type {
  EstimateCommand,
  KeymapEntry,
  KeymapModifier,
} from '../../domain/estimate/estimateKeymap';

/** 修飾キーの表記 */
const MODIFIER_TEXT: Record<KeymapModifier, string> = {
  ctrl: 'Ctrl',
  meta: '⌘',
  alt: 'Alt',
  shift: 'Shift',
};

/** 修飾キーの表記順（押す順に近い並び） */
const MODIFIER_SEQUENCE: readonly KeymapModifier[] = ['ctrl', 'meta', 'alt', 'shift'];

/** 読みやすい記号へ置き換えるキー（未収載のキーは `key` をそのまま出す） */
const KEY_TEXT: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
};

/** 割当1件のキー表記（例: `Alt+Shift+→`） */
export function formatKeymapKey(entry: KeymapEntry): string {
  const modifiers = MODIFIER_SEQUENCE.filter((modifier) => entry.modifiers.includes(modifier)).map(
    (modifier) => MODIFIER_TEXT[modifier]
  );
  const key = KEY_TEXT[entry.key] ?? (entry.key.length === 1 ? entry.key.toUpperCase() : entry.key);
  return [...modifiers, key].join('+');
}

/**
 * コマンドに対応するキー表記（23.11）
 *
 * ツールバーの各ボタンが「対応するキーボード操作」を自分の説明に載せるために使う。
 * 同じコマンドに複数の割当がある場合（取り消しの `Ctrl+Z` と `⌘Z` など）は
 * 定義の先頭を代表として示す。割当が無いコマンドは `null`。
 */
export function formatCommandKeyHint(command: EstimateCommand): string | null {
  const entry = ESTIMATE_KEYMAP.entries.find((candidate) => candidate.command === command);
  return entry === undefined ? null : formatKeymapKey(entry);
}
