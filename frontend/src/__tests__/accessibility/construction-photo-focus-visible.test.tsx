/**
 * @fileoverview 工事写真の一覧画面の部品のフォーカス表示の単体テスト
 *
 * フォーカス表示は全画面共通の規則（`src/index.css` の `@layer base` の `:focus-visible`）で描く
 * （steering `tech.md` の「フォーカス表示方針」）。部品が共通の outline を `focus:outline-none` で消して
 * 自前の輪（Tailwind の ring）を描く場合は、太さ 2px 以上・隣接色に対して 3:1 以上にする（タスク 28.1）。
 * ここでは (1) 検索フィルタの「フィルタをクリア」が 3:1 に届かない gray-400 でなく blue-500 の輪で示すこと、
 * (2) 一覧画面の部品（検索フィルタ・表・カード）のフォーカスを受ける要素のどれもが、共通の outline を
 * 消したまま代わりの輪を描かない形や、色を指定しない輪（既定の currentColor で描かれ、白の文字の釦では
 * 見えない）を持たないこと、(3) モバイル幅のカードの詳細を開く釦が共通の outline を消さないこと、を確かめる。
 * 実際のブラウザでの太さとコントラスト比、フォーカスが離れたら消えることは
 * e2e/specs/construction-photos/construction-photo-focus-visible.spec.ts が主張する
 * （jsdom は :focus-visible の照合も CSS の適用もしない）。
 *
 * Requirements (construction-photo):
 * 受け入れ条件にフォーカス表示を定める項は無いため、要件番号は名乗らない。
 * タスク 28.1 は、要件 3 の一覧画面の上で steering の方針の下限へ揃える。
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConstructionPhotoSearchFilter from '../../components/construction-photos/ConstructionPhotoSearchFilter';
import ConstructionPhotoListTable, {
  type ConstructionPhotoAlbumListItem,
} from '../../components/construction-photos/ConstructionPhotoListTable';
import ConstructionPhotoListCard from '../../components/construction-photos/ConstructionPhotoListCard';

const albums: ConstructionPhotoAlbumListItem[] = [
  {
    id: 'album-1',
    projectId: 'project-1',
    name: '基礎工事アルバム',
    memo: 'メモ1',
    thumbnailUrl: null,
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-16T00:00:00.000Z',
  },
];

/** キーボードでフォーカスを受ける要素 */
const FOCUSABLE_SELECTOR =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** 要素の Tailwind のクラスの一覧 */
function classesOf(element: Element): string[] {
  return (element.getAttribute('class') ?? '').split(/\s+/).filter((token) => token.length > 0);
}

/**
 * 自前のフォーカスの輪の指定の欠けを述べる（無ければ null）。
 * - `focus:outline-none` で共通の outline を消すなら、太さと色を指定した輪を代わりに描くこと
 * - 輪の太さを指定するなら、色も指定すること（色の無い輪は既定の currentColor で描かれる）
 */
function describeRingDefect(element: Element): string | null {
  const classes = classesOf(element);
  const outlineNone = classes.includes('focus:outline-none');
  const ringWidth = classes.some((token) => /^focus:ring(-\d+)?$/.test(token));
  const ringColor = classes.some((token) =>
    /^focus:ring-(?!\d+$|inset$|offset)[a-z]+-\d+/.test(token)
  );
  const name = element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '';
  if (outlineNone && !(ringWidth && ringColor)) {
    return `${element.tagName.toLowerCase()} "${name}": 共通の outline を消したまま、太さと色を指定した輪を描かない`;
  }
  if (ringWidth && !ringColor) {
    return `${element.tagName.toLowerCase()} "${name}": 輪の色を指定しない（currentColor で描かれる）`;
  }
  return null;
}

/** 描画した範囲のフォーカスを受ける要素の、輪の指定の欠けの一覧（空なら満たす） */
function collectRingDefects(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).flatMap((element) => {
    const defect = describeRingDefect(element);
    return defect ? [defect] : [];
  });
}

describe('工事写真の一覧の検索フィルタの「フィルタをクリア」のフォーカスの輪', () => {
  /**
   * クリアボタンは共通の outline を `focus:outline-none` で消し、自前の輪（Tailwind の ring）で示す。
   * steering の下限（2px 以上・隣接色に対して 3:1 以上）を満たすよう、輪は一覧画面の他の部品
   * （検索ボタン・ソートの見出し）と同じ blue-500 で描く（タスク 28.1。trading-partner-management の
   * タスク 33.4 と同じ）。gray-400 の輪は白の背景に対して 3:1 に届かない。
   */
  it('2px の blue-500 の輪で示し、3:1 に届かない gray-400 の輪を描かない', () => {
    render(
      <ConstructionPhotoSearchFilter
        filter={{}}
        sortField="createdAt"
        sortOrder="desc"
        onFilterChange={vi.fn()}
        onSortChange={vi.fn()}
      />
    );

    const classes = classesOf(screen.getByRole('button', { name: 'フィルタをクリア' }));

    expect({
      outlineNone: classes.includes('focus:outline-none'),
      ringWidth: classes.includes('focus:ring-2'),
      ringBlue500: classes.includes('focus:ring-blue-500'),
      ringGray400: classes.includes('focus:ring-gray-400'),
    }).toEqual({ outlineNone: true, ringWidth: true, ringBlue500: true, ringGray400: false });
  });
});

describe('工事写真の一覧画面の部品のフォーカスを受ける要素の輪の指定', () => {
  it('検索フィルタのどの要素も、輪を描かずに outline を消す形や色の無い輪を持たない', () => {
    const { container } = render(
      <ConstructionPhotoSearchFilter
        filter={{ search: '基礎' }}
        sortField="createdAt"
        sortOrder="desc"
        onFilterChange={vi.fn()}
        onSortChange={vi.fn()}
      />
    );

    expect(container.querySelectorAll(FOCUSABLE_SELECTOR)).toHaveLength(5);
    expect(collectRingDefects(container)).toEqual([]);
  });

  it('表のどの要素（ソートの見出し・行・編集・削除）も、輪を描かずに outline を消す形や色の無い輪を持たない', () => {
    const { container } = render(
      <ConstructionPhotoListTable
        albums={albums}
        sortField="createdAt"
        sortOrder="desc"
        onSort={vi.fn()}
        onRowClick={vi.fn()}
        onEditAlbum={vi.fn()}
        onDeleteAlbum={vi.fn()}
      />
    );

    expect(container.querySelectorAll(FOCUSABLE_SELECTOR)).toHaveLength(5);
    expect(collectRingDefects(container)).toEqual([]);
  });

  /**
   * モバイル幅のカードは、カード全面を覆う詳細を開く釦（stretched button）がフォーカスを受ける。
   * この釦が共通の outline を消すと、フォーカスを受けた要素そのものには表示が無く、
   * 外側のカードの focus-within の輪だけが残る（タスク 28.1 の E2E で実測）。釦は共通の outline に乗る。
   */
  it('カードのどの要素（詳細を開く釦・編集・削除）も、輪を描かずに outline を消す形や色の無い輪を持たない', () => {
    const { container } = render(
      <ConstructionPhotoListCard
        albums={albums}
        onCardClick={vi.fn()}
        onEditAlbum={vi.fn()}
        onDeleteAlbum={vi.fn()}
      />
    );

    expect(container.querySelectorAll(FOCUSABLE_SELECTOR)).toHaveLength(3);
    expect(collectRingDefects(container)).toEqual([]);
    const openButton = screen.getByRole('button', { name: '基礎工事アルバムの詳細を表示' });
    expect(classesOf(openButton)).not.toContain('focus:outline-none');
    expect(openButton.style.outline).toBe('');
  });
});
