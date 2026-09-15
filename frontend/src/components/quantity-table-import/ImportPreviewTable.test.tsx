/**
 * ImportPreviewTableコンポーネントの単体テスト
 *
 * Task 46.3: 抽出結果プレビューテーブルとフィールドマッピング調整UI
 *
 * 下の一覧は本ファイルの検証が確かめる受入基準だけを挙げる（Task 97.10 で実体に揃えた）。
 * 29.8 は該当の検証に `@requirement` の印を付けてあるため一覧に重ねない。
 * 本ファイルが確かめないもの: 28.5（本部品はマッピング先を各行ではなく列ヘッダーごとに示す。
 * 列ヘッダーのドロップダウンは 32.1 である）、32.2（選択肢の全件を主張していない）。
 *
 * Requirements:
 * - 28.4: 抽出結果をプレビューテーブルとして表示する
 * - 28.7: テキストをユーザーが選択・コピーできる状態で表示する（Excel の抽出結果で確かめる）
 * - 32.1: 各列ヘッダーにマッピング先フィールドのドロップダウンを表示する
 * - 32.3: マッピング変更を呼び出し側へ通知する（表示の更新は呼び出し側の状態が担う）
 * - 32.6: 必須フィールド未マッピング時の警告
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportPreviewTable } from './ImportPreviewTable';
import type {
  ImportExtractionResult,
  ImportFieldMappingConfig,
} from '../../types/quantity-import.types';

const baseResult: ImportExtractionResult = {
  headers: ['工種', '名称', '数量', '単位'],
  rows: [
    { columns: ['土工', '掘削工', '150', 'm3'], sourceRowIndex: 0 },
    { columns: ['土工', '盛土工', '200', 'm3'], sourceRowIndex: 1 },
  ],
  extractionType: 'excel-parse',
};

const fullMapping: ImportFieldMappingConfig = {
  mappings: { 0: 'workType', 1: 'name', 2: 'quantity', 3: 'unit' },
};

describe('ImportPreviewTable', () => {
  it('ヘッダーとデータ行が表示される', () => {
    render(
      <ImportPreviewTable
        extractionResult={baseResult}
        fieldMapping={fullMapping}
        onFieldMappingChange={vi.fn()}
      />
    );

    // ヘッダーのマッピングドロップダウンが表示される
    expect(screen.getByLabelText('工種のマッピング先')).toBeInTheDocument();
    expect(screen.getByLabelText('名称のマッピング先')).toBeInTheDocument();
    // データ行の内容が表示される
    expect(screen.getByText('掘削工')).toBeInTheDocument();
    expect(screen.getByText('盛土工')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('各列ヘッダーにマッピングドロップダウンが表示される', () => {
    render(
      <ImportPreviewTable
        extractionResult={baseResult}
        fieldMapping={fullMapping}
        onFieldMappingChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText('工種のマッピング先')).toBeInTheDocument();
    expect(screen.getByLabelText('名称のマッピング先')).toBeInTheDocument();
    expect(screen.getByLabelText('数量のマッピング先')).toBeInTheDocument();
    expect(screen.getByLabelText('単位のマッピング先')).toBeInTheDocument();
  });

  it('マッピング変更時にonFieldMappingChangeが呼ばれる', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ImportPreviewTable
        extractionResult={baseResult}
        fieldMapping={fullMapping}
        onFieldMappingChange={onChange}
      />
    );

    const select = screen.getByLabelText('工種のマッピング先');
    await user.selectOptions(select, 'specification');

    expect(onChange).toHaveBeenCalledWith(0, 'specification');
  });

  it('必須フィールド未マッピング時に警告が表示される', () => {
    const partialMapping: ImportFieldMappingConfig = {
      mappings: { 0: 'skip', 1: 'skip', 2: 'quantity', 3: 'skip' },
    };

    render(
      <ImportPreviewTable
        extractionResult={baseResult}
        fieldMapping={partialMapping}
        onFieldMappingChange={vi.fn()}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('工種');
    expect(alert).toHaveTextContent('名称');
    expect(alert).toHaveTextContent('単位');
  });

  it('全必須フィールドがマッピング済みの場合は警告が非表示', () => {
    render(
      <ImportPreviewTable
        extractionResult={baseResult}
        fieldMapping={fullMapping}
        onFieldMappingChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('マッピングが未定義の列はskipがデフォルト選択される', () => {
    const sparseMapping: ImportFieldMappingConfig = {
      mappings: { 0: 'workType' },
    };

    render(
      <ImportPreviewTable
        extractionResult={baseResult}
        fieldMapping={sparseMapping}
        onFieldMappingChange={vi.fn()}
      />
    );

    // 列1,2,3はmappings未定義なのでskipがデフォルト
    const nameSelect = screen.getByLabelText('名称のマッピング先') as HTMLSelectElement;
    expect(nameSelect.value).toBe('skip');
  });

  it('50行を超える場合は50行のみ表示し件数メッセージを表示する', () => {
    const manyRows = Array.from({ length: 60 }, (_, i) => ({
      columns: ['工種', `項目${i}`, `${i}`, 'm3'],
      sourceRowIndex: i,
    }));

    const result: ImportExtractionResult = {
      headers: ['工種', '名称', '数量', '単位'],
      rows: manyRows,
      extractionType: 'excel-parse',
    };

    render(
      <ImportPreviewTable
        extractionResult={result}
        fieldMapping={fullMapping}
        onFieldMappingChange={vi.fn()}
      />
    );

    expect(screen.getByText('表示: 50 / 60 行')).toBeInTheDocument();
  });

  it('50行以下の場合は件数メッセージが表示されない', () => {
    render(
      <ImportPreviewTable
        extractionResult={baseResult}
        fieldMapping={fullMapping}
        onFieldMappingChange={vi.fn()}
      />
    );

    expect(screen.queryByText(/表示:/)).not.toBeInTheDocument();
  });

  /**
   * 抽出結果のテキストがユーザーによる選択・コピーが可能な状態で表示されることを
   * この検証が確かめる。
   *
   * @requirement quantity-table-generation/REQ-29.8
   */
  it('テキストが選択可能な状態で表示される (userSelect: text)', () => {
    const { container } = render(
      <ImportPreviewTable
        extractionResult={baseResult}
        fieldMapping={fullMapping}
        onFieldMappingChange={vi.fn()}
      />
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.userSelect).toBe('text');
  });
});
