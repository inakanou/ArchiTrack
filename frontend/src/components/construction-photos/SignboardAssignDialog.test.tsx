/**
 * @fileoverview 看板配置ダイアログのテスト
 *
 * タスク 23.2: 看板マスタの画面へ画面の操作だけで到達できるようにする。
 *
 * 看板を指定する場面（このダイアログ）で看板が1件も無いと、選択肢は「未指定」だけになり、
 * 利用者は看板を登録する場所を知る手掛かりを持たない。ダイアログは、看板が0件のときに
 * その旨の案内を出し、看板マスタへのリンクを示す。リンクは親が看板マスタの経路を渡したとき
 * （＝利用者が看板の閲覧の権限を持つとき）だけ出す。リンクを押すとダイアログは閉じ、
 * 遷移は親の画面の未保存の変更の確認（useBlocker）を経る（R18.2）。
 *
 * モバイル幅では、リンクのタップ領域を横断ルールの下限（44×44 論理ピクセル）以上にする。
 * 検証側は 44 を自前で綴る（実装から独立した立会人として測るため。タスク 16 の切り分け）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SignboardAssignDialog } from './SignboardAssignDialog';
import type { SignboardsLoadStatus } from './SignboardAssignDialog';
import type {
  ConstructionPhotoWithUrls,
  ConstructionSignboard,
  SignboardPlacement,
} from '../../types/construction-photo.types';

vi.mock('../../hooks/useMediaQuery', () => ({
  default: vi.fn(() => false),
}));

// fabric を含む配置エディタはスタブ化する。実物と同じく、看板が無ければ placement=null を、
// 看板があれば初期配置を「保存」で返す（実物の handleSave の契約）
vi.mock('./SignboardPlacementEditor', () => ({
  default: ({
    signboard,
    initialPlacement,
    onSave,
  }: {
    signboard: ConstructionSignboard | null;
    initialPlacement?: SignboardPlacement | null;
    onSave?: (placement: SignboardPlacement | null) => void;
  }) => (
    <div data-testid="signboard-placement-editor">
      <span data-testid="editor-signboard-id">{signboard ? signboard.id : 'none'}</span>
      <button type="button" onClick={() => onSave?.(signboard ? (initialPlacement ?? null) : null)}>
        保存
      </button>
    </div>
  ),
}));

import useMediaQuery from '../../hooks/useMediaQuery';

/** インラインスタイルの寸法値（px）を数値化する */
const pxValue = (raw: string): number => {
  const parsed = parseFloat(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** 要素の有効な最小タップ領域（min-width/width, min-height/height の大きい方）を返す */
const tapWidth = (el: HTMLElement): number =>
  Math.max(pxValue(el.style.minWidth), pxValue(el.style.width));
const tapHeight = (el: HTMLElement): number =>
  Math.max(pxValue(el.style.minHeight), pxValue(el.style.height));

const MASTER_PATH = '/projects/project-1/construction-signboards';
const EMPTY_GUIDANCE = 'このプロジェクトには工事看板が登録されていません';
const LOAD_FAILED_MESSAGE = '工事看板を読み込めませんでした。時間をおいて再度お試しください。';
const NOT_PERMITTED_MESSAGE = '工事看板を閲覧する権限が無いため、看板を選択できません。';

const photo: ConstructionPhotoWithUrls = {
  id: 'photo-1',
  albumId: 'album-1',
  fileName: 'photo-1.jpg',
  fileSize: 1000,
  width: 800,
  height: 600,
  displayOrder: 1,
  comment: null,
  includeInReport: false,
  signboardId: null,
  signboardPlacement: null,
  thumbnailUrl: 'https://example.com/thumb-1.jpg',
  printImageUrl: 'https://example.com/print-1',
  createdAt: '2025-01-01T00:00:00.000Z',
};

const signboard: ConstructionSignboard = {
  id: 'sb-1',
  projectId: 'project-1',
  workName: '基礎配筋工事',
  workLocation: '東京都渋谷区',
  freeItems: [],
  footerText: null,
  inUseCount: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const onSave = vi.fn();
const onClose = vi.fn();

function dialogElement(props: {
  signboards: ConstructionSignboard[];
  signboardMasterPath?: string;
  signboardsStatus?: SignboardsLoadStatus;
  photo?: ConstructionPhotoWithUrls;
}) {
  return (
    <MemoryRouter initialEntries={['/construction-photos/album-1']}>
      <Routes>
        <Route
          path="/construction-photos/:id"
          element={
            <SignboardAssignDialog
              photo={props.photo ?? photo}
              signboards={props.signboards}
              signboardMasterPath={props.signboardMasterPath}
              signboardsStatus={props.signboardsStatus}
              onSave={onSave}
              onClose={onClose}
            />
          }
        />
        <Route
          path="/projects/:projectId/construction-signboards"
          element={<h1>看板マスタの画面の代役</h1>}
        />
      </Routes>
    </MemoryRouter>
  );
}

function renderDialog(props: Parameters<typeof dialogElement>[0]) {
  return render(dialogElement(props));
}

describe('SignboardAssignDialog の看板マスタへの導線（タスク 23.2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMediaQuery).mockReturnValue(false);
  });

  it('看板が0件のとき、選択肢は「未指定」だけで、看板が無い旨の案内と看板マスタへのリンクを示す', () => {
    renderDialog({ signboards: [], signboardMasterPath: MASTER_PATH });

    const dialog = screen.getByRole('dialog', { name: '看板を配置' });
    const options = within(within(dialog).getByLabelText('看板を選択')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['未指定']);
    expect(within(dialog).getByText(new RegExp(EMPTY_GUIDANCE))).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '工事看板マスタを開く' })).toHaveAttribute(
      'href',
      MASTER_PATH
    );
  });

  it('看板が0件でも看板マスタの経路が渡されない（看板の閲覧の権限が無い）ときは、案内だけを示しリンクを出さない', () => {
    renderDialog({ signboards: [] });

    const dialog = screen.getByRole('dialog', { name: '看板を配置' });
    expect(within(dialog).getByText(new RegExp(EMPTY_GUIDANCE))).toBeInTheDocument();
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
  });

  it('看板があるときは0件の案内を出さず、看板マスタへのリンクは示す（別の看板を足す場面）', () => {
    renderDialog({ signboards: [signboard], signboardMasterPath: MASTER_PATH });

    const dialog = screen.getByRole('dialog', { name: '看板を配置' });
    expect(within(dialog).queryByText(new RegExp(EMPTY_GUIDANCE))).not.toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '工事看板マスタを開く' })).toHaveAttribute(
      'href',
      MASTER_PATH
    );
  });

  it('リンクを押すとダイアログを閉じる要求を出し、看板マスタの画面へ遷移する', async () => {
    renderDialog({ signboards: [], signboardMasterPath: MASTER_PATH });

    fireEvent.click(screen.getByRole('link', { name: '工事看板マスタを開く' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('heading', { name: '看板マスタの画面の代役' })
    ).toBeInTheDocument();
  });

  it('モバイル幅ではリンクのタップ領域が 44×44 以上になる (R19)', () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    renderDialog({ signboards: [], signboardMasterPath: MASTER_PATH });

    const link = screen.getByRole('link', { name: '工事看板マスタを開く' });
    expect(tapWidth(link)).toBeGreaterThanOrEqual(44);
    expect(tapHeight(link)).toBeGreaterThanOrEqual(44);
  });

  // 是正 1 巡目: 「登録されていません」は、看板の一覧の取得が成功して0件だったときだけ述べる。
  // 取得の失敗・閲覧の権限の欠如・取得中を「0件」と取り違えて偽の案内を出さない
  describe('看板の一覧の取得の状態（「登録されていません」は取得に成功して0件のときだけ）', () => {
    it('取得に失敗したときは、0件の案内を出さず、失敗の文言を role=alert で示す', () => {
      renderDialog({
        signboards: [],
        signboardMasterPath: MASTER_PATH,
        signboardsStatus: 'failed',
      });

      const dialog = screen.getByRole('dialog', { name: '看板を配置' });
      expect(within(dialog).queryByText(new RegExp(EMPTY_GUIDANCE))).not.toBeInTheDocument();
      expect(within(dialog).getByRole('alert')).toHaveTextContent(LOAD_FAILED_MESSAGE);
      // 看板マスタは独立に一覧を取得するため、確かめる手段としてリンクは残す
      expect(within(dialog).getByRole('link', { name: '工事看板マスタを開く' })).toHaveAttribute(
        'href',
        MASTER_PATH
      );
    });

    it('看板の閲覧の権限が無いときは、0件の案内を出さず、権限が無い旨を示す', () => {
      renderDialog({ signboards: [], signboardsStatus: 'not-permitted' });

      const dialog = screen.getByRole('dialog', { name: '看板を配置' });
      expect(within(dialog).queryByText(new RegExp(EMPTY_GUIDANCE))).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
      expect(within(dialog).getByText(NOT_PERMITTED_MESSAGE)).toBeInTheDocument();
      expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
    });

    it('取得中は、0件の案内も失敗の文言も出さず、読み込み中である旨を role=status で示す', () => {
      renderDialog({
        signboards: [],
        signboardMasterPath: MASTER_PATH,
        signboardsStatus: 'loading',
      });

      const dialog = screen.getByRole('dialog', { name: '看板を配置' });
      expect(within(dialog).queryByText(new RegExp(EMPTY_GUIDANCE))).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
      expect(within(dialog).getByRole('status')).toHaveTextContent('工事看板を読み込んでいます');
    });

    it('取得に成功して0件のときは、0件の案内を出し、失敗の文言は出さない', () => {
      renderDialog({
        signboards: [],
        signboardMasterPath: MASTER_PATH,
        signboardsStatus: 'loaded',
      });

      const dialog = screen.getByRole('dialog', { name: '看板を配置' });
      expect(within(dialog).getByText(new RegExp(EMPTY_GUIDANCE))).toBeInTheDocument();
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  // 是正 2 巡目: 看板の一覧が取得済み（loaded）でない間、または写真項目の看板が取得済みの一覧に
  // 見当たらない間は、写真項目の看板の指定を変える・解除する操作を出さない。是正前は、看板の
  // 指定と配置を持つ写真項目で一覧の取得中・失敗中に「保存」すると (看板ID, null) が返り、
  // 利用者が触れていない配置が消えた（検証が DB で実測）
  describe('看板の一覧が使えない間は看板の指定を変える操作を出さない（是正 2 巡目）', () => {
    const placement: SignboardPlacement = { left: 10, top: 20, width: 200, height: 150 };
    const assignedPhoto: ConstructionPhotoWithUrls = {
      ...photo,
      signboardId: 'sb-1',
      signboardPlacement: placement,
    };

    it.each(['loading', 'failed', 'not-permitted'] as const)(
      '状態が %s のとき、選択は操作できず、配置エディタ（その「保存」）を出さず、キャンセルは押せる',
      (status) => {
        renderDialog({ signboards: [], signboardsStatus: status, photo: assignedPhoto });

        const dialog = screen.getByRole('dialog', { name: '看板を配置' });
        expect(within(dialog).getByLabelText('看板を選択')).toBeDisabled();
        expect(within(dialog).queryByTestId('signboard-placement-editor')).not.toBeInTheDocument();
        expect(within(dialog).queryByRole('button', { name: '保存' })).not.toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: 'キャンセル' })).toBeEnabled();
        // 選択は「未指定」を装わず、写真項目の現在の看板を指している
        expect(within(dialog).getByLabelText('看板を選択')).toHaveValue('sb-1');

        fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSave).not.toHaveBeenCalled();
      }
    );

    it('取得中に開いたダイアログは、一覧が届くと写真項目の現在の看板を選んだ状態で操作できるようになり、保存は配置を保つ', () => {
      const { rerender } = renderDialog({
        signboards: [],
        signboardsStatus: 'loading',
        photo: assignedPhoto,
      });
      expect(screen.getByLabelText('看板を選択')).toBeDisabled();

      rerender(
        dialogElement({
          signboards: [signboard],
          signboardsStatus: 'loaded',
          photo: assignedPhoto,
        })
      );

      const dialog = screen.getByRole('dialog', { name: '看板を配置' });
      const select = within(dialog).getByLabelText('看板を選択');
      expect(select).toBeEnabled();
      expect(select).toHaveValue('sb-1');
      expect(within(dialog).getByTestId('editor-signboard-id')).toHaveTextContent('sb-1');

      fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith('sb-1', placement);
    });

    it('取得済みの一覧に写真項目の看板が見当たらないときは、黙って解除せず、その旨を示して別の看板か「未指定」を選ばせる', () => {
      const otherSignboard: ConstructionSignboard = {
        ...signboard,
        id: 'sb-2',
        workName: '別の看板',
      };
      renderDialog({
        signboards: [otherSignboard],
        signboardsStatus: 'loaded',
        photo: assignedPhoto,
      });

      const dialog = screen.getByRole('dialog', { name: '看板を配置' });
      const select = within(dialog).getByLabelText('看板を選択');
      expect(select).toBeEnabled();
      expect(select).toHaveValue('sb-1');
      expect(
        within(dialog).getByText(/現在の看板は工事看板の一覧にありません/)
      ).toBeInTheDocument();
      expect(within(dialog).queryByTestId('signboard-placement-editor')).not.toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();

      // 明示的に「未指定」を選べば、従来どおり解除できる
      fireEvent.change(select, { target: { value: '' } });
      fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
      expect(onSave).toHaveBeenCalledWith(null, null);
    });

    it('取得済みの一覧で明示的に「未指定」を選んで保存すると、従来どおり (null, null) で解除する（回帰の防止）', () => {
      renderDialog({ signboards: [signboard], signboardsStatus: 'loaded', photo: assignedPhoto });

      const dialog = screen.getByRole('dialog', { name: '看板を配置' });
      fireEvent.change(within(dialog).getByLabelText('看板を選択'), { target: { value: '' } });
      expect(within(dialog).getByTestId('editor-signboard-id')).toHaveTextContent('none');
      fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith(null, null);
    });
  });
});
