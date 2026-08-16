/**
 * @fileoverview 数量グループ名前インライン編集のテスト
 *
 * Task 35.2: 数量グループ名前変更の単体テストを実装する
 *
 * Requirements:
 * - 22.1: グループ名クリック時に編集モードに遷移
 * - 22.2: 編集確定時にAPIが正しい引数で呼ばれる
 * - 22.3: 空白名前でのエラーメッセージ表示
 * - 22.4: 文字数制限バリデーション（全角25/半角50）
 * - 22.5: 最大文字数超過入力防止
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuantityGroupCard from '../../../components/quantity-table/QuantityGroupCard';
import type { QuantityGroupDetail } from '../../../types/quantity-table.types';
import { calculateStringWidth } from '../../../utils/field-validation';

// AnnotatedImageThumbnailをモックして、Fabric.jsの依存関係を回避する
vi.mock('../../../components/site-surveys/AnnotatedImageThumbnail', () => ({
  AnnotatedImageThumbnail: ({
    image,
    alt,
    style,
  }: {
    image: { id: string; originalUrl?: string | null };
    alt: string;
    style?: React.CSSProperties;
  }) => (
    <img
      src={image.originalUrl || ''}
      alt={alt}
      style={style}
      data-testid="annotated-image-thumbnail"
    />
  ),
  default: ({
    image,
    alt,
    style,
  }: {
    image: { id: string; originalUrl?: string | null };
    alt: string;
    style?: React.CSSProperties;
  }) => (
    <img
      src={image.originalUrl || ''}
      alt={alt}
      style={style}
      data-testid="annotated-image-thumbnail"
    />
  ),
}));

const createMockGroup = (overrides?: Partial<QuantityGroupDetail>): QuantityGroupDetail => ({
  id: 'group-1',
  quantityTableId: 'qt-123',
  name: 'テストグループ',
  surveyImageId: null,
  surveyImage: null,
  displayOrder: 0,
  itemCount: 0,
  items: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('QuantityGroupCard インライン編集', () => {
  let mockOnRenameGroup: (groupId: string, newName: string) => void;

  beforeEach(() => {
    mockOnRenameGroup = vi.fn();
  });

  it('グループ名クリック時に編集モードに遷移する（REQ-22.1）', async () => {
    const user = userEvent.setup();
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        onRenameGroup={mockOnRenameGroup}
      />
    );

    // グループ名テキストをクリック
    const groupName = screen.getByText('テストグループ');
    await user.click(groupName);

    // input要素が表示される
    const input = screen.getByRole('textbox', { name: /グループ名を編集/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('テストグループ');
  });

  it('編集確定時にonRenameGroupが正しい引数で呼ばれる（REQ-22.2）', async () => {
    const user = userEvent.setup();
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        onRenameGroup={mockOnRenameGroup}
      />
    );

    // グループ名クリック -> 編集モード
    const groupName = screen.getByText('テストグループ');
    await user.click(groupName);

    // 入力値を変更
    const input = screen.getByRole('textbox', { name: /グループ名を編集/i });
    await user.clear(input);
    await user.type(input, '変更後のグループ名');

    // Enter押下で確定
    await user.keyboard('{Enter}');

    expect(mockOnRenameGroup).toHaveBeenCalledWith('group-1', '変更後のグループ名');
  });

  it('blurイベントで編集が確定される（REQ-22.2）', async () => {
    const user = userEvent.setup();
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        onRenameGroup={mockOnRenameGroup}
      />
    );

    const groupName = screen.getByText('テストグループ');
    await user.click(groupName);

    const input = screen.getByRole('textbox', { name: /グループ名を編集/i });
    await user.clear(input);
    await user.type(input, '新しい名前');

    // blurで確定
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockOnRenameGroup).toHaveBeenCalledWith('group-1', '新しい名前');
    });
  });

  it('空白名前でエラーメッセージが表示される（REQ-22.3）', async () => {
    const user = userEvent.setup();
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        onRenameGroup={mockOnRenameGroup}
      />
    );

    const groupName = screen.getByText('テストグループ');
    await user.click(groupName);

    const input = screen.getByRole('textbox', { name: /グループ名を編集/i });
    await user.clear(input);

    // Enter押下で確定を試行
    await user.keyboard('{Enter}');

    // エラーメッセージが表示される
    await waitFor(() => {
      expect(screen.getByText('グループ名を入力してください')).toBeInTheDocument();
    });

    // APIは呼ばれない
    expect(mockOnRenameGroup).not.toHaveBeenCalled();
  });

  it('Escapeキーで編集がキャンセルされる', async () => {
    const user = userEvent.setup();
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        onRenameGroup={mockOnRenameGroup}
      />
    );

    const groupName = screen.getByText('テストグループ');
    await user.click(groupName);

    const input = screen.getByRole('textbox', { name: /グループ名を編集/i });
    await user.clear(input);
    await user.type(input, '変更中の値');

    // Escで元に戻す
    await user.keyboard('{Escape}');

    // 元の名前が表示される
    expect(screen.getByText('テストグループ')).toBeInTheDocument();

    // APIは呼ばれない
    expect(mockOnRenameGroup).not.toHaveBeenCalled();
  });

  it('名前が変更されていない場合はAPIを呼ばない', async () => {
    const user = userEvent.setup();
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        onRenameGroup={mockOnRenameGroup}
      />
    );

    const groupName = screen.getByText('テストグループ');
    await user.click(groupName);

    // 変更なしでEnter
    screen.getByRole('textbox', { name: /グループ名を編集/i });
    await user.keyboard('{Enter}');

    expect(mockOnRenameGroup).not.toHaveBeenCalled();
  });

  it('isEditable=falseの場合はクリックしても編集モードにならない', async () => {
    const user = userEvent.setup();
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={false}
      />
    );

    const groupName = screen.getByText('テストグループ');
    await user.click(groupName);

    // input要素が表示されない
    expect(screen.queryByRole('textbox', { name: /グループ名を編集/i })).not.toBeInTheDocument();
  });
});

/**
 * グループ名の入力時点での上限超過防止（REQ-22.5）
 *
 * Task 115.34 (site-survey)
 *
 * 上限は全角25文字（半角換算50）。日本語入力（IME）の変換中は幅の判定を行わず、
 * 確定時に評価して超過時のみ変換開始直前の値へ戻す。変換中の読みは確定語より長くなるため、
 * 変換中に幅で拒否すると正当な語を確定できなくなる。
 */
describe('QuantityGroupCard グループ名の上限超過防止 (REQ-22.5)', () => {
  /** グループ名の最大文字幅（半角換算）。権威は QuantityGroupCard の GROUP_NAME_MAX_WIDTH */
  const GROUP_NAME_MAX_WIDTH = 50;
  /** 上限ちょうどとなる全角文字数 */
  const ZENKAKU_AT_LIMIT = 25;

  /**
   * 編集モードを開き、グループ名の入力欄を返す。
   */
  async function openNameEditor(displayName: string) {
    const user = userEvent.setup();
    render(
      <QuantityGroupCard
        group={createMockGroup({ name: displayName })}
        groupDisplayName={displayName}
        isEditable={true}
        onRenameGroup={vi.fn()}
      />
    );
    await user.click(screen.getByText(displayName));
    return screen.getByRole('textbox', { name: /グループ名を編集/i });
  }

  it('全角で上限ちょうどの入力は受け付ける', async () => {
    const input = await openNameEditor('テストグループ');

    const atLimit = 'あ'.repeat(ZENKAKU_AT_LIMIT);
    fireEvent.change(input, { target: { value: atLimit } });

    expect(input).toHaveValue(atLimit);
    expect(calculateStringWidth((input as HTMLInputElement).value)).toBe(GROUP_NAME_MAX_WIDTH);
  });

  it('全角で上限を1文字超える入力は受け付けない', async () => {
    const input = await openNameEditor('テストグループ');

    const atLimit = 'あ'.repeat(ZENKAKU_AT_LIMIT);
    fireEvent.change(input, { target: { value: atLimit } });
    fireEvent.change(input, { target: { value: 'あ'.repeat(ZENKAKU_AT_LIMIT + 1) } });

    expect(input).toHaveValue(atLimit);
    expect(calculateStringWidth((input as HTMLInputElement).value)).toBeLessThanOrEqual(
      GROUP_NAME_MAX_WIDTH
    );
  });

  it('半角で上限ちょうどを受け付け、1文字超過は受け付けない', async () => {
    const input = await openNameEditor('テストグループ');

    const atLimit = 'a'.repeat(GROUP_NAME_MAX_WIDTH);
    fireEvent.change(input, { target: { value: atLimit } });
    expect(input).toHaveValue(atLimit);

    fireEvent.change(input, { target: { value: 'a'.repeat(GROUP_NAME_MAX_WIDTH + 1) } });
    expect(input).toHaveValue(atLimit);
  });

  /**
   * 実ブラウザと同じイベント順序（compositionstart → 変換中の input → compositionend）で
   * 読みの幅が上限を超える語を確定できることを確かめる。
   * 一括投入では変換中の状態を再現できないため、この欠陥は構造的に検出できない。
   */
  it('読みが上限を超えても変換を経て確定できる', async () => {
    // 現場名と工種を含む命名。読みは上限超過、確定語は上限以内
    const reading = 'こくどうよんじゅうごごうせんどうろどこうこうじいっしき';
    const word = '国道四十五号線道路土工工事一式';
    expect(calculateStringWidth(reading)).toBeGreaterThan(GROUP_NAME_MAX_WIDTH);
    expect(calculateStringWidth(word)).toBeLessThanOrEqual(GROUP_NAME_MAX_WIDTH);

    const input = await openNameEditor('テストグループ');
    fireEvent.change(input, { target: { value: '' } });

    fireEvent.compositionStart(input);
    // かなを1文字ずつ入力していく（変換中）
    for (let i = 1; i <= reading.length; i += 1) {
      fireEvent.change(input, { target: { value: reading.slice(0, i) } });
    }
    // 読みが途中で切り捨てられていないこと（変換途中のかなが残らないこと）
    expect(input).toHaveValue(reading);

    // 変換候補を選び確定する
    fireEvent.change(input, { target: { value: word } });
    fireEvent.compositionEnd(input, { data: word });

    expect(input).toHaveValue(word);
  });

  it('変換終了後は再び入力時点で幅を判定する', async () => {
    const input = await openNameEditor('テストグループ');

    const committed = 'あ'.repeat(ZENKAKU_AT_LIMIT);
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: committed } });
    fireEvent.compositionEnd(input, { data: committed });
    expect(input).toHaveValue(committed);

    fireEvent.change(input, { target: { value: 'あ'.repeat(ZENKAKU_AT_LIMIT + 1) } });
    expect(input).toHaveValue(committed);
  });

  it('変換の確定値が上限を超える場合は変換開始直前の値へ戻す', async () => {
    const before = 'テストグループ';
    const input = await openNameEditor(before);

    const reading = 'あ'.repeat(ZENKAKU_AT_LIMIT + 3);
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: reading } });
    // 変換せずそのまま確定した（＝確定値が上限超過）
    fireEvent.compositionEnd(input, { data: reading });

    expect(input).toHaveValue(before);
    expect(calculateStringWidth((input as HTMLInputElement).value)).toBeLessThanOrEqual(
      GROUP_NAME_MAX_WIDTH
    );
  });

  /**
   * 変換中の確定・取消キーは IME のものであり、名前編集の確定・取消として扱ってはならない。
   *
   * 変換中は幅を判定しない（上限超過の読みを保持する）ため、変換中の Enter を素通しすると
   * 上限を超えた名前がそのまま確定されてしまう。実ブラウザでは幅 80 のグループ名が確定し
   * 見出しに表示された。
   *
   * 変換中の現れ方は環境によって異なるため、手掛かりごとに個別のケースを用意する。
   */
  /**
   * 編集モードを開き、入力欄と onRenameGroup のモックを返す。
   */
  async function openNameEditorWithMock(displayName: string) {
    const user = userEvent.setup();
    const onRenameGroup = vi.fn();
    render(
      <QuantityGroupCard
        group={createMockGroup({ name: displayName })}
        groupDisplayName={displayName}
        isEditable={true}
        onRenameGroup={onRenameGroup}
      />
    );
    await user.click(screen.getByText(displayName));
    return {
      input: screen.getByRole('textbox', { name: /グループ名を編集/i }),
      onRenameGroup,
    };
  }

  /** 上限超過（幅 80）の読みを変換中の入力欄へ投入する */
  function typeOverLimitReadingWhileComposing(input: HTMLElement) {
    const overLimit = 'あ'.repeat(40); // 幅 80（上限 50 を超過）
    expect(calculateStringWidth(overLimit)).toBe(80);
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: overLimit } });
    // 変換中なので切り詰められず保持されている
    expect(input).toHaveValue(overLimit);
    return overLimit;
  }

  it('変換中のEnterでは上限超過の名前が確定されない', async () => {
    const { input, onRenameGroup } = await openNameEditorWithMock('テストグループ');
    typeOverLimitReadingWhileComposing(input);

    // 変換を確定する Enter。ここでは compositionstart/end の追跡だけが手掛かりとなる
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRenameGroup).not.toHaveBeenCalled();
  });

  it('変換中のEnterでは名前の編集欄が閉じない', async () => {
    const { input } = await openNameEditorWithMock('テストグループ');
    typeOverLimitReadingWhileComposing(input);

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('textbox', { name: /グループ名を編集/i })).toBeInTheDocument();
  });

  it('変換中のEscapeでは名前の編集欄が閉じない', async () => {
    const { input } = await openNameEditorWithMock('テストグループ');
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'こうじ' } });

    // 変換を取り消す Escape。取り消すのは変換であって名前の編集ではない
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.getByRole('textbox', { name: /グループ名を編集/i })).toBeInTheDocument();
  });

  it('確定が先に届く環境でも変換中を示すkeyCodeのEnterでは編集欄が閉じない', async () => {
    // compositionend が keydown より先に届く環境では compositionstart/end の追跡だけでは
    // 変換中と判定できない。keyCode 229 を手掛かりに抑止する必要がある。
    const { input } = await openNameEditorWithMock('テストグループ');
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'こうじ' } });
    fireEvent.compositionEnd(input, { data: '工事' });

    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });

    expect(screen.getByRole('textbox', { name: /グループ名を編集/i })).toBeInTheDocument();
  });

  it('keyCodeを持たない環境でもisComposingのEnterでは編集欄が閉じない', async () => {
    // keyCode を提供しない環境では KeyboardEvent.isComposing が唯一の手掛かりになる
    const { input } = await openNameEditorWithMock('テストグループ');
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'こうじ' } });
    fireEvent.compositionEnd(input, { data: '工事' });

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

    expect(screen.getByRole('textbox', { name: /グループ名を編集/i })).toBeInTheDocument();
  });

  it('上限を超えた名前は短くする編集を受け付ける', async () => {
    // 幅の検証を持たない経路で作られた既存データを想定する
    const overLimit = 'a'.repeat(GROUP_NAME_MAX_WIDTH + 5);
    const input = await openNameEditor(overLimit);
    expect(input).toHaveValue(overLimit);

    // まだ上限を超えているが、短くなる編集は受け付ける（編集不能にしない）
    const shorter = 'a'.repeat(GROUP_NAME_MAX_WIDTH + 2);
    fireEvent.change(input, { target: { value: shorter } });
    expect(input).toHaveValue(shorter);

    // 幅が変わらない編集は上限を超えたままなので受け付けない
    fireEvent.change(input, { target: { value: 'b'.repeat(GROUP_NAME_MAX_WIDTH + 2) } });
    expect(input).toHaveValue(shorter);
  });
});
