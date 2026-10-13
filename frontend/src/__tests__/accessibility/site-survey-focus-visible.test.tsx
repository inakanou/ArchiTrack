/**
 * @fileoverview 現場調査の部品・ページのフォーカス表示の単体テスト
 *
 * フォーカス表示は全画面共通の規則（`src/index.css` の `@layer base` の `:focus-visible`）で描く
 * （steering `tech.md` の「フォーカス表示方針」）。部品の側は、その規則を打ち消す `outline: none` を
 * インラインで持たず、背景に対して 3:1 に届かない自前の影の輪（box-shadow）もフォーカスの表示として
 * 重ねないことで規則に乗る（タスク 116.1）。ここでは次を確かめる。
 *   (1) 現場調査の作成・編集のフォーム（SiteSurveyForm）の調査名・調査日・メモの欄が、初期の表示・
 *       フォーカス中・入力の誤りの表示のいずれでも、インラインで outline を打ち消さず、淡い影の輪も
 *       描かないこと。誤りの表示の赤い 2px の枠と文言は残ること
 *   (2) 注釈編集のツールバー（AnnotationToolbar）の道具の釦が、デスクトップ幅とモバイル幅の
 *       いずれでも、どの道具を選んだ状態でも outline を打ち消さないこと。モバイル幅の単段の
 *       ツールバーは横スクロールの箱（overflow-x: auto）であり、箱の縁の近くの項目の外側の輪が
 *       欠けるため、モバイル幅では道具の釦・属性パネル・操作の釦の輪を内側（outline-offset: -2px）へ
 *       描き、青や灰の塗りを持つ項目（選択中の道具・保存）は輪を白にすること。デスクトップ幅は
 *       折り返して横スクロールしないため、輪の位置と色をインラインで指定しないこと
 *   (3) 画像の追加の枠（ImageUploader のドロップゾーン）が、通常・コンパクト・押せない状態の
 *       いずれでも outline を打ち消さないこと
 *   (4) ズーム操作（ZoomControls）の釦が、押せる状態と押せない状態、回転の釦を載せた状態の
 *       いずれでも outline を打ち消さないこと
 *   (5) 現場調査一覧（SiteSurveyListPage）の検索の欄が outline を打ち消さないこと
 *   (6) 画像のエクスポートのダイアログ（ImageExportDialog）が、スクロールの寄せに 4px の余白を
 *       持つこと（ダイアログは高さの上限で縦にスクロールし、フォーカスで下端へ寄せられた
 *       操作の輪が箱の縁で欠けるため）
 *   (7) (5) の一覧の検索の欄以外の部品、(6) のダイアログの部品、注釈編集のツールバーの
 *       属性パネルと操作の釦は、タスク 116.1 の変更の前から outline を打ち消しておらず、
 *       打ち消しの無いことは網羅のための見張りとして置く（(2) の輪の位置と色の主張は見張りではない）
 * 規則そのものの太さとコントラスト比は `focus-visible.test.tsx` が確かめ、実際のブラウザで
 * フォーカス中に表示が出ること・輪が祖先の縁で切り取られないことは
 * e2e/specs/site-surveys/site-survey-focus-visible.spec.ts が主張する
 * （jsdom は :focus-visible の照合も CSS の適用もレイアウトもしない）。
 *
 * Requirements (site-survey):
 * 受け入れ条件にフォーカス表示を定める項は無いため、要件番号は名乗らない。
 * タスク 116.1 は、現場調査の一覧・作成・編集・詳細・画像の閲覧と注釈編集の画面の上で
 * steering の方針の下限へ揃える。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SiteSurveyForm from '../../components/site-surveys/SiteSurveyForm';
import AnnotationToolbar, { type ToolType } from '../../components/site-surveys/AnnotationToolbar';
import ImageUploader from '../../components/site-surveys/ImageUploader';
import ZoomControls from '../../components/site-surveys/ZoomControls';
import ImageExportDialog from '../../components/site-surveys/ImageExportDialog';
import SiteSurveyListPage from '../../pages/SiteSurveyListPage';
import * as projectsApi from '../../api/projects';
import * as siteSurveysApi from '../../api/site-surveys';
import * as useSiteSurveyPermissionModule from '../../hooks/useSiteSurveyPermission';
import useMediaQuery from '../../hooks/useMediaQuery';
import type { SurveyImageInfo } from '../../types/site-survey.types';

vi.mock('../../api/projects');
vi.mock('../../api/site-surveys');
vi.mock('../../hooks/useSiteSurveyPermission');
// isMobile の判定をテストから切り替える（matchMedia を stub しないとデスクトップ幅の分岐だけを見る）
vi.mock('../../hooks/useMediaQuery', () => ({
  default: vi.fn(() => false),
}));

/** 部品の名前と、インラインの outline の打ち消し・影の輪の有無 */
interface ControlStyle {
  name: string;
  outlineSuppressed: boolean;
  boxShadow: string;
}

function describeControl(control: HTMLElement): ControlStyle {
  const labelText =
    (control as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).labels?.[0]
      ?.textContent ?? '';
  return {
    name:
      control.getAttribute('aria-label') ??
      (labelText.replace(/\*/g, '').trim() || (control.textContent ?? '').trim()),
    outlineSuppressed: control.style.outlineStyle === 'none' || control.style.outline === 'none',
    boxShadow: control.style.boxShadow,
  };
}

/** 名前の並びから、いずれも打ち消しと影の輪を持たないときの観測値を作る */
function expectedControls(names: string[]): ControlStyle[] {
  return names.map((name) => ({ name, outlineSuppressed: false, boxShadow: '' }));
}

/** 要素の中の、キーボードで止まりうる部品（文書の並び順） */
function focusableControls(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], input:not([type="hidden"]), select, textarea, button, [tabindex]'
    )
  );
}

/** フォーカスで端へ寄せられた項目の輪（outline-offset 2px + 太さ 2px）が収まるスクロールの余白 */
const RING_SCROLL_PADDING = '4px';

/** 横スクロールの箱の中で、輪を項目の内側へ描く outline-offset */
const INSET_OUTLINE_OFFSET = '-2px';

// ============================================================================
// 作成・編集のフォーム（SiteSurveyForm）
// ============================================================================

describe('現場調査のフォームのフォーカス表示（SiteSurveyForm）', () => {
  const FIELD_NAMES = ['調査名', '調査日', 'メモ'];

  function fields(): HTMLElement[] {
    return [
      screen.getByRole('textbox', { name: '調査名' }),
      screen.getByLabelText('調査日'),
      screen.getByRole('textbox', { name: 'メモ' }),
    ];
  }

  it('初期の表示で、各欄がインラインで outline を打ち消さず影の輪も描かない', () => {
    render(
      <SiteSurveyForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} isSubmitting={false} />
    );

    expect(fields().map(describeControl)).toEqual(expectedControls(FIELD_NAMES));
  });

  it('各欄がフォーカス中も outline を打ち消さず影の輪も描かない（枠の色だけを変える）', () => {
    render(
      <SiteSurveyForm
        mode="edit"
        initialData={{ name: '焦点調査', surveyDate: '2026-04-01', memo: 'メモ' }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        isSubmitting={false}
      />
    );

    const observed = fields().map((field) => {
      fireEvent.focus(field);
      return { ...describeControl(field), borderColor: field.style.borderColor };
    });

    expect(observed).toEqual(
      expectedControls(FIELD_NAMES).map((control) => ({
        ...control,
        borderColor: 'rgb(37, 99, 235)',
      }))
    );
  });

  it('入力の誤りの表示で、各欄が outline を打ち消さず影の輪も描かず、赤い 2px の枠と文言が残る', async () => {
    render(
      <SiteSurveyForm
        mode="edit"
        initialData={{ name: '', surveyDate: '', memo: 'あ'.repeat(2001) }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        isSubmitting={false}
      />
    );

    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(3));
    // 誤りの欄はフォーカス中でも影の輪を描かない
    const observed = fields().map((field) => {
      fireEvent.focus(field);
      return { ...describeControl(field), border: field.style.border };
    });
    expect(observed).toEqual(
      expectedControls(FIELD_NAMES).map((control) => ({
        ...control,
        border: '2px solid rgb(220, 38, 38)',
      }))
    );
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual([
      '調査名は必須です',
      '調査日は必須です',
      'メモは2000文字以内で入力してください',
    ]);
  });
});

// ============================================================================
// 注釈編集のツールバー（AnnotationToolbar）
// ============================================================================

describe('注釈編集のツールバーのフォーカス表示（AnnotationToolbar）', () => {
  const TOOLS: ToolType[] = [
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

  beforeEach(() => {
    vi.mocked(useMediaQuery).mockReturnValue(false);
  });

  function renderToolbar(activeTool: ToolType): HTMLElement {
    render(
      <AnnotationToolbar
        activeTool={activeTool}
        onToolChange={vi.fn()}
        onStyleChange={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onSave={vi.fn()}
        onExport={vi.fn()}
        onRotate={vi.fn()}
        canUndo
        canRedo
      />
    );
    return screen.getByTestId('annotation-toolbar');
  }

  /** 道具の釦と操作の釦の名前のうち、青や灰の塗りを持つもの（選択中の道具と保存） */
  function filledControlNames(activeTool: ToolType, toolbar: HTMLElement): string[] {
    const activeName = within(toolbar)
      .getAllByRole('button', { pressed: true })
      .map((button) => describeControl(button).name);
    expect(activeName, `道具「${activeTool}」が選択中として描かれる`).toHaveLength(1);
    return [...activeName, '保存'];
  }

  for (const isMobile of [false, true]) {
    const width = isMobile ? 'モバイル幅' : 'デスクトップ幅';
    for (const tool of TOOLS) {
      it(`${width}で道具「${tool}」を選んだとき、道具の釦・属性パネル・操作の釦が outline を打ち消さず、輪の位置が幅に合う`, () => {
        vi.mocked(useMediaQuery).mockReturnValue(isMobile);
        const toolbar = renderToolbar(tool);

        const controls = focusableControls(toolbar);
        // 道具の釦（9）と操作の釦（回転・元に戻す・やり直し・保存・エクスポート）が並ぶこと（一つも測らずに緑にしない）
        expect(controls.length).toBeGreaterThanOrEqual(TOOLS.length + 5);
        expect(controls.map(describeControl)).toEqual(
          expectedControls(controls.map((control) => describeControl(control).name))
        );
        // モバイル幅は横スクロールの箱の縁で欠けないよう輪を内側へ描き、塗りのある項目は輪を白にする。
        // デスクトップ幅は折り返して横スクロールしないため、共通の外側の輪のまま（インラインの指定なし）
        const filled = filledControlNames(tool, toolbar);
        expect(
          controls.map((control) => ({
            name: describeControl(control).name,
            outlineOffset: control.style.outlineOffset,
            outlineColor: control.style.outlineColor,
          }))
        ).toEqual(
          controls.map((control) => {
            const name = describeControl(control).name;
            return {
              name,
              outlineOffset: isMobile ? INSET_OUTLINE_OFFSET : '',
              outlineColor: isMobile && filled.includes(name) ? 'rgb(255, 255, 255)' : '',
            };
          })
        );
      });
    }
  }
});

// ============================================================================
// 画像の追加の枠（ImageUploader）
// ============================================================================

describe('画像の追加の枠のフォーカス表示（ImageUploader）', () => {
  const variants: Array<[string, { compact?: boolean; disabled?: boolean }]> = [
    ['通常', {}],
    ['コンパクト', { compact: true }],
    ['押せない', { disabled: true }],
  ];

  for (const [label, props] of variants) {
    it(`${label}の状態で、ドロップゾーンが outline を打ち消さない`, () => {
      render(<ImageUploader onUpload={vi.fn()} {...props} />);

      const uploadArea = screen.getByTestId('upload-area');
      expect(describeControl(uploadArea)).toEqual({
        name: describeControl(uploadArea).name,
        outlineSuppressed: false,
        boxShadow: '',
      });
      expect(uploadArea).toHaveAttribute('role', 'button');
    });
  }
});

// ============================================================================
// ズーム操作（ZoomControls）
// ============================================================================

describe('ズーム操作のフォーカス表示（ZoomControls）', () => {
  it('押せる状態で、回転の釦を含む各釦が outline を打ち消さない', () => {
    render(
      <ZoomControls
        zoom={1}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onFit={vi.fn()}
        onRotate={vi.fn()}
      />
    );

    const buttons = within(screen.getByTestId('zoom-controls')).getAllByRole('button');
    expect(buttons.map(describeControl)).toEqual(
      expectedControls(['ズームアウト', 'ズームイン', '全体表示', '画像を90度回転'])
    );
  });

  it('押せない状態でも、各釦が outline を打ち消さない', () => {
    render(
      <ZoomControls zoom={1} onZoomIn={vi.fn()} onZoomOut={vi.fn()} onFit={vi.fn()} disabled />
    );

    const buttons = within(screen.getByTestId('zoom-controls')).getAllByRole('button');
    expect(buttons.map(describeControl)).toEqual(
      expectedControls(['ズームアウト', 'ズームイン', '全体表示'])
    );
  });
});

// ============================================================================
// 現場調査一覧（SiteSurveyListPage）
// ============================================================================

describe('現場調査一覧のフォーカス表示（SiteSurveyListPage）', () => {
  beforeEach(() => {
    vi.mocked(useMediaQuery).mockReturnValue(false);
    vi.mocked(projectsApi.getProject).mockResolvedValue({
      id: 'project-focus',
      name: 'フォーカス測定プロジェクト',
    } as Awaited<ReturnType<typeof projectsApi.getProject>>);
    vi.mocked(siteSurveysApi.getSiteSurveys).mockResolvedValue({
      data: [
        {
          id: 'survey-focus',
          projectId: 'project-focus',
          name: '焦点調査',
          surveyDate: '2026-04-01',
          memo: null,
          thumbnailUrl: null,
          imageCount: 0,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    } as Awaited<ReturnType<typeof siteSurveysApi.getSiteSurveys>>);
    vi.mocked(useSiteSurveyPermissionModule.useSiteSurveyPermission).mockReturnValue({
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      isLoading: false,
      getPermissionError: vi.fn().mockReturnValue(null),
    } as ReturnType<typeof useSiteSurveyPermissionModule.useSiteSurveyPermission>);
  });

  it('検索の欄と本文の他の部品が outline を打ち消さない', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/project-focus/site-surveys']}>
        <Routes>
          <Route path="/projects/:projectId/site-surveys" element={<SiteSurveyListPage />} />
        </Routes>
      </MemoryRouter>
    );

    const search = await screen.findByRole('searchbox', { name: '検索' });
    expect(describeControl(search)).toEqual(expectedControls(['検索'])[0]);

    // 網羅のための見張り: 本文のその他の部品
    await screen.findByText('焦点調査');
    const controls = focusableControls(screen.getByRole('main'));
    expect(controls.length).toBeGreaterThan(1);
    expect(controls.map(describeControl)).toEqual(
      expectedControls(controls.map((control) => describeControl(control).name))
    );
  });
});

// ============================================================================
// 画像のエクスポートのダイアログ（ImageExportDialog）
// ============================================================================

describe('画像のエクスポートのダイアログのフォーカス表示（ImageExportDialog）', () => {
  const IMAGE: SurveyImageInfo = {
    id: 'image-focus',
    surveyId: 'survey-focus',
    originalPath: 'focus/original.jpg',
    thumbnailPath: 'focus/thumb.jpg',
    fileName: 'focus_first.jpg',
    fileSize: 1024,
    width: 800,
    height: 600,
    displayOrder: 1,
    createdAt: '2026-04-01T00:00:00.000Z',
  } as SurveyImageInfo;

  it('ダイアログがスクロールの寄せに輪の分の余白を持ち、部品が outline を打ち消さない', () => {
    render(
      <ImageExportDialog
        open
        imageInfo={IMAGE}
        onExport={vi.fn()}
        onClose={vi.fn()}
        onDownloadOriginal={vi.fn()}
        onExportAnnotationJson={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog');
    const scrollBox = dialog.firstElementChild as HTMLElement;
    expect(scrollBox.style.overflow).toBe('auto');
    expect(scrollBox.style.scrollPadding).toBe(RING_SCROLL_PADDING);

    // 網羅のための見張り
    const controls = focusableControls(dialog);
    expect(controls.length).toBeGreaterThan(1);
    expect(controls.map(describeControl)).toEqual(
      expectedControls(controls.map((control) => describeControl(control).name))
    );
  });
});
