/**
 * @fileoverview AnnotationGuide コンポーネントのテスト
 *
 * Task 69.1: ツール選択後の簡易ガイドオーバーレイを新規作成する
 *
 * Requirements:
 * - 29.7: ツール選択後一定時間内に描画操作を開始しない場合、選択中ツールに対する
 *         簡易ガイド（例: 「ドラッグで描画」「タップでテキスト入力」）を画像領域に
 *         非侵襲的に提示する
 * - 29.8: 視覚フィードバック要素（ハイライト・カーソル・プレビュー・ハンドル・
 *         ツールヒント・簡易ガイド）がコンテキストメニュー表示中および
 *         マルチタッチ入力中でも互いに競合しないよう制御する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  AnnotationGuide,
  type AnnotationGuideProps,
  type GuideToolKind,
} from '../../../components/site-surveys/AnnotationGuide';

describe('AnnotationGuide', () => {
  const mockOnDismiss = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('可視性制御 (Req 29.7)', () => {
    it('visible=false の場合は何もレンダリングしない', () => {
      const { container } = render(
        <AnnotationGuide visible={false} toolKind="arrow" onDismiss={mockOnDismiss} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('visible=true かつ toolKind 指定があれば非侵襲的オーバーレイをレンダリングする', () => {
      render(<AnnotationGuide visible toolKind="arrow" onDismiss={mockOnDismiss} />);

      expect(screen.getByTestId('annotation-guide')).toBeInTheDocument();
    });
  });

  describe('ツール種別ごとのガイド文言 (Req 29.7)', () => {
    it('toolKind="arrow" のとき「ドラッグで描画」を表示する', () => {
      render(<AnnotationGuide visible toolKind="arrow" onDismiss={mockOnDismiss} />);

      expect(screen.getByText('ドラッグで描画')).toBeInTheDocument();
    });

    it('toolKind="text" のとき「タップでテキスト入力」を表示する', () => {
      render(<AnnotationGuide visible toolKind="text" onDismiss={mockOnDismiss} />);

      expect(screen.getByText('タップでテキスト入力')).toBeInTheDocument();
    });

    it('toolKind="dimension" のとき「2点クリックで寸法線」を表示する', () => {
      render(<AnnotationGuide visible toolKind="dimension" onDismiss={mockOnDismiss} />);

      expect(screen.getByText('2点クリックで寸法線')).toBeInTheDocument();
    });

    it('toolKind="circle" のとき「ドラッグで描画」を表示する', () => {
      render(<AnnotationGuide visible toolKind="circle" onDismiss={mockOnDismiss} />);

      expect(screen.getByText('ドラッグで描画')).toBeInTheDocument();
    });

    it('toolKind="rectangle" のとき「ドラッグで描画」を表示する', () => {
      render(<AnnotationGuide visible toolKind="rectangle" onDismiss={mockOnDismiss} />);

      expect(screen.getByText('ドラッグで描画')).toBeInTheDocument();
    });

    it('toolKind="polygon" のとき「クリックで頂点追加」を表示する', () => {
      render(<AnnotationGuide visible toolKind="polygon" onDismiss={mockOnDismiss} />);

      expect(screen.getByText('クリックで頂点追加')).toBeInTheDocument();
    });

    it('toolKind="polyline" のとき「クリックで頂点追加」を表示する', () => {
      render(<AnnotationGuide visible toolKind="polyline" onDismiss={mockOnDismiss} />);

      expect(screen.getByText('クリックで頂点追加')).toBeInTheDocument();
    });

    it('toolKind="freehand" のとき「ドラッグで描画」を表示する', () => {
      render(<AnnotationGuide visible toolKind="freehand" onDismiss={mockOnDismiss} />);

      expect(screen.getByText('ドラッグで描画')).toBeInTheDocument();
    });

    it('toolKind="select" のとき「タップで選択」を表示する', () => {
      render(<AnnotationGuide visible toolKind="select" onDismiss={mockOnDismiss} />);

      expect(screen.getByText('タップで選択')).toBeInTheDocument();
    });
  });

  describe('dismiss 操作 (Req 29.7)', () => {
    it('ガイドをクリックすると onDismiss が1回呼ばれる', () => {
      render(<AnnotationGuide visible toolKind="arrow" onDismiss={mockOnDismiss} />);

      const guide = screen.getByTestId('annotation-guide');
      fireEvent.click(guide);

      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('非侵襲的オーバーレイ (Req 29.8)', () => {
    it('ガイドコンテナは画像領域上に絶対配置される (position: absolute)', () => {
      render(<AnnotationGuide visible toolKind="arrow" onDismiss={mockOnDismiss} />);

      const guide = screen.getByTestId('annotation-guide') as HTMLElement;
      // 非侵襲的オーバーレイとして画像領域上に重ねるため、親に相対配置される絶対位置指定を使用する。
      expect(guide.style.position).toBe('absolute');
    });

    it('ガイドはアクセシビリティのため role="status" を持つ', () => {
      render(<AnnotationGuide visible toolKind="arrow" onDismiss={mockOnDismiss} />);

      // 非侵襲的かつ即時性のない補助情報であることを表すため role=status を使用する。
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('Props 型 (Task 69.1)', () => {
    it('AnnotationGuideProps 型が visible/toolKind/onDismiss を持つ', () => {
      // 型レベルのコンパイルチェック
      const props: AnnotationGuideProps = {
        visible: true,
        toolKind: 'arrow',
        onDismiss: () => {
          /* noop */
        },
      };
      expect(props.visible).toBe(true);
      expect(props.toolKind).toBe('arrow');
    });

    it('GuideToolKind 型はツール種別を網羅する', () => {
      const kinds: GuideToolKind[] = [
        'select',
        'dimension',
        'arrow',
        'circle',
        'rectangle',
        'polygon',
        'polyline',
        'freehand',
        'text',
      ];
      expect(kinds).toHaveLength(9);
    });
  });
});
