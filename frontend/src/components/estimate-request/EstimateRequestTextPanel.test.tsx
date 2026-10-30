/**
 * @fileoverview EstimateRequestTextPanelコンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 5.5: EstimateRequestTextPanelコンポーネントを実装する
 *
 * Requirements:
 * - 6.1: 見積依頼文を表示するパネルを提供する
 * - 6.2: 宛先（メールアドレスまたはFAX番号）を表示する
 * - 6.3: 表題を表示する
 * - 6.4: 本文を表示する
 * - 6.5: メールアドレス未登録時のエラー表示
 * - 6.6: FAX番号未登録時のエラー表示
 * - 6.7: 各項目にクリップボードコピーボタンを表示する
 *
 * Task 107.1: 宛先・表題・本文のコピーと「メールで開く」「Gmailで開く」を出力の記録の成功の後にだけ行う
 *   （Requirement 42.13〜42.16。user-authentication の要件40.9〜40.11）。記録の要求
 *   （`POST /api/v1/audit-logs/exports`）は API クライアントの `post` を差し替えて模擬し、既定は成功とする。
 *   コピーの書き込みは上流の `runRecordedClipboardWrite` の実物が行う（jsdom には `ClipboardItem` が
 *   無いため、記録の成功を待ってから `writeText` で書く）。mailto の起動（`openMailClient`）だけを差し替える。
 *
 * Task 108.1: 「Gmailで開く」で空のタブを開けない（ポップアップが止められた）ときは記録を要求せずに
 *   ポップアップの許可を促す文言を、記録の成功の後に作成画面へ移せない（タブの文書へ触れられない）ときは
 *   タブを閉じて再操作を促す文言を、パネルの `role="alert"` の欄に表示する（Requirement 42.17・42.18）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { EstimateRequestTextPanel } from './EstimateRequestTextPanel';
import type { EstimateRequestText } from '../../types/estimate-request.types';
import { apiClient } from '../../api/client';
import * as mailLauncher from '../../utils/mail-launcher';

// mailto の起動（ページの遷移）だけを差し替える。URL の組み立てとタブの操作は実物を使う
vi.mock('../../utils/mail-launcher', async () => {
  const actual = await vi.importActual<typeof import('../../utils/mail-launcher')>(
    '../../utils/mail-launcher'
  );
  return {
    ...actual,
    openMailClient: vi.fn(),
  };
});

/** 見積依頼と案件の ID（出力の記録の入力に使う。Requirement 42.13・42.15） */
const ids = { estimateRequestId: 'er-1', projectId: 'project-1' };

/** 記録の失敗の文言（Requirement 42.14・42.16） */
const RECORD_FAILED_EXACT = /^出力を記録できなかったため中止しました$/;

/** ポップアップが止められたときの文言（Requirement 42.17） */
const POPUP_BLOCKED_EXACT =
  /^ポップアップがブロックされたため Gmail を開けませんでした。ブラウザの設定でこのサイトのポップアップを許可してください。$/;

/** 記録の成功の後に作成画面へ移せないときの文言（Requirement 42.18） */
const COMPOSE_OPEN_FAILED_EXACT = /^Gmail の作成画面を開けませんでした。もう一度お試しください。$/;

/** 解決を外から決める記録の要求 */
function holdRecord() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const pending = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { pending, resolve, reject };
}

/**
 * `window.open('', '_blank')` が返す空のタブの模擬
 *
 * 文書は jsdom の別の文書で、タブの中のリンクのクリックで移る先の URL と rel を記録する。
 */
function fakeBlankTab() {
  const doc = document.implementation.createHTMLDocument('');
  const navigations: Array<{ href: string; rel: string }> = [];
  doc.addEventListener('click', (event) => {
    const target = event.target as HTMLAnchorElement;
    if (target.tagName === 'A') {
      navigations.push({ href: target.href, rel: target.rel });
      event.preventDefault();
    }
  });
  const tab = {
    document: doc,
    opener: window as Window | null,
    closed: false,
    close: vi.fn(() => {
      tab.closed = true;
    }),
  };
  return { tab, navigations };
}

/**
 * 開いた後に文書へ触れられなくなった空のタブの模擬（利用者に閉じられた・別の文書へ移された）
 *
 * `document` の読み出しが例外になり、作成画面へ移す処理（`navigateMailTab`）が失敗する。
 */
function fakeUnreachableTab() {
  const tab = {
    opener: window as Window | null,
    closed: false,
    close: vi.fn(() => {
      tab.closed = true;
    }),
    get document(): Document {
      throw new DOMException(
        'Blocked a frame from accessing a cross-origin frame.',
        'SecurityError'
      );
    },
  };
  return tab;
}

describe('EstimateRequestTextPanel', () => {
  const mockText: EstimateRequestText = {
    recipient: 'test@example.com',
    subject: '[プロジェクト名] 御見積依頼',
    body: `株式会社テスト 御中

いつもお世話になっております。
下記の件について、御見積をお願いいたします。

【現場名】テスト現場
【住所】東京都千代田区1-1-1

ご検討のほど、よろしくお願いいたします。`,
  };

  const mockTextWithError: EstimateRequestText = {
    recipient: '',
    subject: '[プロジェクト名] 御見積依頼',
    body: '本文',
    recipientError: 'メールアドレスが登録されていません',
  };

  const mockTextFaxError: EstimateRequestText = {
    recipient: '',
    subject: '[プロジェクト名] 御見積依頼',
    body: '本文',
    recipientError: 'FAX番号が登録されていません',
  };

  let postSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // クリップボードAPIをモック
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    // 出力の記録の要求は成功（記録の ID を返す）を既定とする（Task 107.1）
    postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ recordId: 'record-1' });
  });

  afterEach(() => {
    postSpy.mockRestore();
  });

  describe('基本レンダリング', () => {
    it('見積依頼文パネルを表示する（Requirements: 6.1）', () => {
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      expect(screen.getByText(/見積依頼文/)).toBeInTheDocument();
    });

    it('宛先を表示する（Requirements: 6.2）', () => {
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('表題を表示する（Requirements: 6.3）', () => {
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      expect(screen.getByText('[プロジェクト名] 御見積依頼')).toBeInTheDocument();
    });

    it('本文を表示する（Requirements: 6.4）', () => {
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      expect(screen.getByText(/株式会社テスト 御中/)).toBeInTheDocument();
      expect(screen.getByText(/いつもお世話になっております/)).toBeInTheDocument();
    });
  });

  describe('エラー表示', () => {
    it('メールアドレス未登録時のエラーを表示する（Requirements: 6.5）', () => {
      render(<EstimateRequestTextPanel {...ids} text={mockTextWithError} />);

      expect(screen.getByText(/メールアドレスが登録されていません/)).toBeInTheDocument();
    });

    it('FAX番号未登録時のエラーを表示する（Requirements: 6.6）', () => {
      render(<EstimateRequestTextPanel {...ids} text={mockTextFaxError} />);

      expect(screen.getByText(/FAX番号が登録されていません/)).toBeInTheDocument();
    });

    it('エラー時は宛先フィールドにエラースタイルが適用される', () => {
      render(<EstimateRequestTextPanel {...ids} text={mockTextWithError} />);

      const errorMessage = screen.getByText(/メールアドレスが登録されていません/);
      expect(errorMessage).toHaveStyle({ color: 'rgb(220, 38, 38)' }); // red-600
    });
  });

  describe('クリップボードコピー', () => {
    it('宛先のコピーボタンを表示する（Requirements: 6.7）', () => {
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      const copyButtons = screen.getAllByRole('button', { name: /コピー/ });
      expect(copyButtons.length).toBeGreaterThanOrEqual(3); // 宛先、表題、本文
    });

    it('宛先のコピーボタンをクリックするとクリップボードにコピーされる', async () => {
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      // 最初のコピーボタンをクリック（宛先）
      const copyButtons = screen.getAllByRole('button', { name: /コピー/ });
      expect(copyButtons[0]).toBeDefined();
      fireEvent.click(copyButtons[0]!);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test@example.com');
      });
    });

    it('表題のコピーボタンをクリックするとクリップボードにコピーされる', async () => {
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      const copyButtons = screen.getAllByRole('button', { name: /コピー/ });
      expect(copyButtons[1]).toBeDefined();
      fireEvent.click(copyButtons[1]!);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('[プロジェクト名] 御見積依頼');
      });
    });

    it('本文のコピーボタンをクリックするとクリップボードにコピーされる', async () => {
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      const copyButtons = screen.getAllByRole('button', { name: /コピー/ });
      expect(copyButtons[2]).toBeDefined();
      fireEvent.click(copyButtons[2]!);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockText.body);
      });
    });
  });

  describe('セクション構成', () => {
    it('宛先セクションにラベルを表示する', () => {
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      expect(screen.getByText('宛先')).toBeInTheDocument();
    });

    it('表題セクションにラベルを表示する', () => {
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      expect(screen.getByText('表題')).toBeInTheDocument();
    });

    it('本文セクションにラベルを表示する', () => {
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      expect(screen.getByText('本文')).toBeInTheDocument();
    });
  });

  describe('ローディング状態', () => {
    it('loading=trueの場合ローディングインジケーターを表示する', () => {
      render(<EstimateRequestTextPanel {...ids} text={null} loading={true} />);

      expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
    });
  });

  describe('エラー状態', () => {
    it('textがnullでloadingがfalseの場合エラーメッセージを表示する', () => {
      render(<EstimateRequestTextPanel {...ids} text={null} loading={false} />);

      expect(screen.getByText(/見積依頼文を取得できませんでした/)).toBeInTheDocument();
    });

    // Task 97.2: 取得できなかった理由が分かっている場合は、汎用の文言ではなく理由の案内を表示する
    it('errorMessage を渡すと汎用の文言の代わりにその案内を表示する（Task 97.2）', () => {
      render(
        <EstimateRequestTextPanel
          {...ids}
          {...ids}
          text={null}
          loading={false}
          errorMessage="本文に含める項目が選択されていません。項目を選択してください"
        />
      );

      expect(screen.getByText(/項目を選択してください/)).toBeInTheDocument();
      expect(screen.queryByText(/見積依頼文を取得できませんでした/)).not.toBeInTheDocument();
    });

    it('errorMessage が null のときは汎用の文言を表示する（Task 97.2）', () => {
      render(<EstimateRequestTextPanel {...ids} text={null} loading={false} errorMessage={null} />);

      expect(screen.getByText(/見積依頼文を取得できませんでした/)).toBeInTheDocument();
      expect(screen.queryByText(/項目を選択してください/)).not.toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('パネルに適切なaria属性が設定されている', () => {
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      const panel = screen.getByRole('region');
      expect(panel).toHaveAttribute('aria-label');
    });

    it('本文がpre要素で整形表示される', () => {
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      const preElement = screen.getByText(/株式会社テスト 御中/).closest('pre');
      expect(preElement).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 84.3: showIncludeBreakdownToggle prop（Requirements: 39.8）
  // ==========================================================================
  describe('showIncludeBreakdownToggle prop（Task 84.3, Requirements: 39.8）', () => {
    it('showIncludeBreakdownToggle prop を受け取れる（型契約）（Requirements: 39.8）', () => {
      // showIncludeBreakdownToggle prop を渡してもエラーにならないこと（後方互換）
      render(
        <EstimateRequestTextPanel {...ids} text={mockText} showIncludeBreakdownToggle={true} />
      );
      expect(screen.getByText(/見積依頼文/)).toBeInTheDocument();
    });

    it('showIncludeBreakdownToggle=false でも正常にレンダリングされる（Requirements: 39.8）', () => {
      render(
        <EstimateRequestTextPanel {...ids} text={mockText} showIncludeBreakdownToggle={false} />
      );
      // 既存の見積依頼文の表示は維持される
      expect(screen.getByText(/見積依頼文/)).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('showIncludeBreakdownToggle のデフォルトは true（後方互換）（Requirements: 39.8）', () => {
      // prop 未指定でも従来通り表示されることを確認（後方互換）
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);
      expect(screen.getByText(/見積依頼文/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 90.2: メーラー起動ボタン（method props / mailto / Gmail）
  // Requirements: 41.1, 41.2, 41.3, 41.8, 41.9, 41.10, 41.11
  // ==========================================================================
  describe('メーラー起動ボタン（Task 90.2, Requirements: 41）', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('メール方法かつアドレスありで両ボタンが活性、「メールで開く」が mailto アンカーになる（Requirements: 41.1, 41.2, 41.8）', () => {
      render(<EstimateRequestTextPanel {...ids} text={mockText} method="EMAIL" />);

      // 「メールで開く」は活性時アンカー（<a href="mailto:...">）として描画される
      const mailLink = screen.getByRole('link', { name: 'メールで開く' });
      expect(mailLink).toBeInTheDocument();
      const href = mailLink.getAttribute('href');
      expect(href).toBeTruthy();
      expect(href!.startsWith('mailto:')).toBe(true);
      // 宛先メールアドレスが mailto URL に含まれること（転記対象, Req 41.4）
      expect(href).toContain(encodeURIComponent('test@example.com'));

      // 「Gmailで開く」は活性（disabled でない button）であること
      const gmailButton = screen.getByRole('button', { name: 'Gmailで開く' });
      expect(gmailButton).not.toBeDisabled();

      // disabled な「メールで開く」button は存在しない（アンカー描画のため）
      expect(screen.queryByRole('button', { name: 'メールで開く' })).not.toBeInTheDocument();
    });

    it('メールアドレス未登録（recipientError あり）で両ボタンが無効化され理由を表示する（Requirements: 41.9）', () => {
      render(<EstimateRequestTextPanel {...ids} text={mockTextWithError} method="EMAIL" />);

      // 無効化時は「メールで開く」も button（disabled）として描画される
      const mailButton = screen.getByRole('button', { name: 'メールで開く' });
      expect(mailButton).toBeDisabled();

      const gmailButton = screen.getByRole('button', { name: 'Gmailで開く' });
      expect(gmailButton).toBeDisabled();

      // 活性アンカーは存在しない
      expect(screen.queryByRole('link', { name: 'メールで開く' })).not.toBeInTheDocument();

      // 理由表示（アクション行の理由文言）
      // recipientError と同一文言のため複数一致する。理由要素が少なくとも 1 つ存在することを確認。
      expect(
        screen.getAllByText('メールアドレスが登録されていません').length
      ).toBeGreaterThanOrEqual(1);
    });

    it('FAX 方法で両ボタンが無効化され対象外である理由を表示する（Requirements: 41.10）', () => {
      render(<EstimateRequestTextPanel {...ids} text={mockText} method="FAX" />);

      const mailButton = screen.getByRole('button', { name: 'メールで開く' });
      expect(mailButton).toBeDisabled();

      const gmailButton = screen.getByRole('button', { name: 'Gmailで開く' });
      expect(gmailButton).toBeDisabled();

      expect(screen.queryByRole('link', { name: 'メールで開く' })).not.toBeInTheDocument();

      expect(screen.getByText('FAX依頼のためメール起動の対象外です')).toBeInTheDocument();
    });

    // Task 107.1: 記録を待つ間にポップアップが止められないよう、クリックの中で空のタブを同期的に開き、
    // 記録の成功の後に Gmail の作成画面へ移す。元の画面を参照させず（opener を切る）、参照元を送らない
    // （rel="noreferrer" のリンクで移す）ことで、従来の noopener,noreferrer の保ち方を引き継ぐ
    it('「Gmailで開く」クリックで新しいタブ（_blank）が Gmail compose URL へ参照元なしで移り、元の画面を参照できない（Requirements: 41.3）', async () => {
      const { tab, navigations } = fakeBlankTab();
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window);

      render(<EstimateRequestTextPanel {...ids} text={mockText} method="EMAIL" />);

      const gmailButton = screen.getByRole('button', { name: 'Gmailで開く' });
      fireEvent.click(gmailButton);

      expect(openSpy).toHaveBeenCalledTimes(1);
      const [url, target] = openSpy.mock.calls[0]!;
      // 開くのは空のタブ（中身は記録の成功の後に入る）
      expect(url).toBe('');
      expect(target).toBe('_blank');
      expect(tab.opener).toBeNull();

      await waitFor(() => {
        expect(navigations).toHaveLength(1);
      });
      expect(navigations[0]!.href).toContain('mail.google.com');
      expect(navigations[0]!.rel).toBe('noreferrer');
      expect(tab.close).not.toHaveBeenCalled();
    });

    it('既存の宛先・表題・本文コピーボタンは従来通り存在・動作する（非影響）（Requirements: 41.11）', async () => {
      render(<EstimateRequestTextPanel {...ids} text={mockText} method="EMAIL" />);

      // メーラー起動ボタン追加後も InlineCopyButton（コピー）が 3 つ存在する
      const copyButtons = screen.getAllByRole('button', { name: /コピー/ });
      expect(copyButtons.length).toBeGreaterThanOrEqual(3);

      // 宛先コピーが従来通り動作する
      fireEvent.click(copyButtons[0]!);
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test@example.com');
      });
    });
  });
  // ==========================================================================
  // Task 107.1: 出力の記録の成功の後にだけコピー・メールの起動を行う
  // Requirement 42.13, 42.14, 42.15, 42.16
  // ==========================================================================
  describe('見積依頼文のコピーの出力の記録（Task 107.1, Requirement 42.13, 42.14）', () => {
    const textRecord = {
      kind: 'estimate_request_text_clipboard',
      projectId: 'project-1',
      targetIds: ['er-1'],
      itemCount: 1,
    };

    it.each([
      ['宛先', 0, 'test@example.com'],
      ['表題', 1, '[プロジェクト名] 御見積依頼'],
      ['本文', 2, mockText.body],
    ])(
      '%sのコピーは種別・見積依頼の案件・見積依頼の ID・件数 1 で記録を 1 回要求してから書く（Requirement 42.13）',
      async (_label, index, expected) => {
        render(<EstimateRequestTextPanel {...ids} text={mockText} method="EMAIL" />);

        const copyButtons = screen.getAllByRole('button', { name: /^コピー$/ });
        fireEvent.click(copyButtons[index]!);

        await waitFor(() => {
          expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expected);
        });
        expect(postSpy).toHaveBeenCalledTimes(1);
        expect(postSpy).toHaveBeenCalledWith('/api/v1/audit-logs/exports', textRecord, {
          disableRetry: true,
        });
      }
    );

    it('クリックの処理の中で await を挟まずに記録を要求する（Safari の操作の猶予）（Requirement 42.13）', () => {
      postSpy.mockReturnValue(new Promise(() => {}));
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      const copyButtons = screen.getAllByRole('button', { name: /^コピー$/ });
      act(() => {
        fireEvent.click(copyButtons[2]!);
        expect(postSpy).toHaveBeenCalledTimes(1);
      });
    });

    it('記録の応答より前にクリップボードへ書かず、成功の後に中身を書く（Requirement 42.13）', async () => {
      const record = holdRecord();
      postSpy.mockReturnValue(record.pending);
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      const copyButtons = screen.getAllByRole('button', { name: /^コピー$/ });
      act(() => {
        fireEvent.click(copyButtons[2]!);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();

      await act(async () => {
        record.resolve({ recordId: 'record-1' });
      });
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockText.body);
      });
      expect(await screen.findByRole('button', { name: 'コピーしました' })).toBeInTheDocument();
    });

    it('記録の要求中はそのコピーのボタンを止め、押し直しても記録は 1 回だけ（Requirement 42.13）', async () => {
      const record = holdRecord();
      postSpy.mockReturnValue(record.pending);
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      const bodyCopy = screen.getAllByRole('button', { name: /^コピー$/ })[2]!;
      act(() => {
        fireEvent.click(bodyCopy);
      });
      expect(bodyCopy).toBeDisabled();
      act(() => {
        fireEvent.click(bodyCopy);
      });
      expect(postSpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        record.resolve({ recordId: 'record-1' });
      });
      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /コピー/ })[2]).toBeEnabled();
      });
      expect(postSpy).toHaveBeenCalledTimes(1);
    });

    it('記録の失敗ではクリップボードへ何も書かず、パネルの alert に記録の失敗の文言を表示する（Requirement 42.14）', async () => {
      postSpy.mockRejectedValue(new Error('500'));
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      const bodyCopy = screen.getAllByRole('button', { name: /^コピー$/ })[2]!;
      fireEvent.click(bodyCopy);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(RECORD_FAILED_EXACT);
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'コピーしました' })).not.toBeInTheDocument();
      expect(postSpy).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(bodyCopy).toBeEnabled());
    });

    it('記録の失敗の後のコピーの成功で記録の失敗の文言を消す（Requirement 42.14）', async () => {
      postSpy.mockRejectedValueOnce(new Error('500'));
      render(<EstimateRequestTextPanel {...ids} text={mockText} />);

      const bodyCopy = screen.getAllByRole('button', { name: /^コピー$/ })[2]!;
      fireEvent.click(bodyCopy);
      expect(await screen.findByRole('alert')).toHaveTextContent(RECORD_FAILED_EXACT);
      await waitFor(() => expect(bodyCopy).toBeEnabled());

      fireEvent.click(bodyCopy);
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockText.body);
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('メールで開く操作の出力の記録（Task 107.1, Requirement 42.15, 42.16）', () => {
    const mailRecord = {
      kind: 'estimate_request_text_mail',
      projectId: 'project-1',
      targetIds: ['er-1'],
      itemCount: 1,
    };
    const openMailClient = vi.mocked(mailLauncher.openMailClient);

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('「メールで開く」はリンクの既定の動作を止め、記録の成功の後に mailto の URL で起動する（Requirement 42.15）', async () => {
      const record = holdRecord();
      postSpy.mockReturnValue(record.pending);
      render(<EstimateRequestTextPanel {...ids} text={mockText} method="EMAIL" />);

      const mailLink = screen.getByRole('link', { name: 'メールで開く' });
      const href = mailLink.getAttribute('href');
      let notPrevented = true;
      act(() => {
        notPrevented = fireEvent.click(mailLink);
      });
      // リンクの既定の動作（mailto へのページの遷移）は止まり、記録を 1 回要求する
      expect(notPrevented).toBe(false);
      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith('/api/v1/audit-logs/exports', mailRecord, {
        disableRetry: true,
      });
      expect(openMailClient).not.toHaveBeenCalled();

      await act(async () => {
        record.resolve({ recordId: 'record-1' });
      });
      await waitFor(() => {
        expect(openMailClient).toHaveBeenCalledTimes(1);
      });
      expect(openMailClient).toHaveBeenCalledWith(href);
    });

    it('「Gmailで開く」は記録の入力で記録を 1 回要求し、記録の応答の前は空のタブのまま（Requirement 42.15）', async () => {
      const record = holdRecord();
      postSpy.mockReturnValue(record.pending);
      const { tab, navigations } = fakeBlankTab();
      vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window);
      render(<EstimateRequestTextPanel {...ids} text={mockText} method="EMAIL" />);

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Gmailで開く' }));
      });
      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith('/api/v1/audit-logs/exports', mailRecord, {
        disableRetry: true,
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(navigations).toHaveLength(0);

      await act(async () => {
        record.resolve({ recordId: 'record-1' });
      });
      await waitFor(() => {
        expect(navigations).toHaveLength(1);
      });
      expect(navigations[0]!.href).toMatch(/^https:\/\/mail\.google\.com\/mail\/\?view=cm/);
    });

    it('記録の要求中は両ボタンを止め、押し直しても記録は 1 回だけ（Requirement 42.15）', async () => {
      const record = holdRecord();
      postSpy.mockReturnValue(record.pending);
      const { tab } = fakeBlankTab();
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window);
      render(<EstimateRequestTextPanel {...ids} text={mockText} method="EMAIL" />);

      const gmailButton = screen.getByRole('button', { name: 'Gmailで開く' });
      act(() => {
        fireEvent.click(gmailButton);
      });
      expect(gmailButton).toBeDisabled();
      const mailLink = screen.getByRole('link', { name: 'メールで開く' });
      expect(mailLink).toHaveAttribute('aria-disabled', 'true');
      act(() => {
        fireEvent.click(mailLink);
        fireEvent.click(gmailButton);
      });
      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(openMailClient).not.toHaveBeenCalled();

      await act(async () => {
        record.resolve({ recordId: 'record-1' });
      });
      await waitFor(() => expect(gmailButton).toBeEnabled());
      expect(screen.getByRole('link', { name: 'メールで開く' })).not.toHaveAttribute(
        'aria-disabled'
      );
    });

    it('「メールで開く」の記録の失敗では起動せず、パネルの alert に記録の失敗の文言を表示する（Requirement 42.16）', async () => {
      postSpy.mockRejectedValue(new Error('500'));
      render(<EstimateRequestTextPanel {...ids} text={mockText} method="EMAIL" />);

      fireEvent.click(screen.getByRole('link', { name: 'メールで開く' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(RECORD_FAILED_EXACT);
      expect(openMailClient).not.toHaveBeenCalled();
      expect(postSpy).toHaveBeenCalledTimes(1);
    });

    it('「Gmailで開く」の記録の失敗では作成画面へ移さずに空のタブを閉じ、記録の失敗の文言を表示する（Requirement 42.16）', async () => {
      postSpy.mockRejectedValue(new Error('500'));
      const { tab, navigations } = fakeBlankTab();
      vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window);
      render(<EstimateRequestTextPanel {...ids} text={mockText} method="EMAIL" />);

      const gmailButton = screen.getByRole('button', { name: 'Gmailで開く' });
      fireEvent.click(gmailButton);

      expect(await screen.findByRole('alert')).toHaveTextContent(RECORD_FAILED_EXACT);
      expect(tab.close).toHaveBeenCalledTimes(1);
      expect(navigations).toHaveLength(0);
      expect(postSpy).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(gmailButton).toBeEnabled());
      // 記録の失敗では記録の失敗の文言だけを出し、42.18 の文言は出さない（Requirement 42.16・42.18）
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(screen.queryByText(COMPOSE_OPEN_FAILED_EXACT)).not.toBeInTheDocument();
    });

    it('空のタブを開けない（ポップアップが止められた）ときは記録を要求せず、ポップアップの許可を促す文言を表示する（Requirement 42.15, 42.17）', async () => {
      vi.spyOn(window, 'open').mockImplementation(() => null);
      render(<EstimateRequestTextPanel {...ids} text={mockText} method="EMAIL" />);

      const gmailButton = screen.getByRole('button', { name: 'Gmailで開く' });
      fireEvent.click(gmailButton);

      expect(await screen.findByRole('alert')).toHaveTextContent(POPUP_BLOCKED_EXACT);
      expect(postSpy).not.toHaveBeenCalled();
      // 記録の要求中の状態（両ボタンを止める）にはしない
      expect(gmailButton).toBeEnabled();
      expect(screen.getByRole('link', { name: 'メールで開く' })).not.toHaveAttribute(
        'aria-disabled'
      );
    });

    it('記録の失敗の文言が出ている状態でポップアップが止められると、前の文言を 42.17 の文言に置き換える（Requirement 42.17）', async () => {
      postSpy.mockRejectedValueOnce(new Error('500'));
      const { tab } = fakeBlankTab();
      const openSpy = vi
        .spyOn(window, 'open')
        .mockImplementationOnce(() => tab as unknown as Window)
        .mockImplementation(() => null);
      render(<EstimateRequestTextPanel {...ids} text={mockText} method="EMAIL" />);

      const gmailButton = screen.getByRole('button', { name: 'Gmailで開く' });
      fireEvent.click(gmailButton);
      expect(await screen.findByRole('alert')).toHaveTextContent(RECORD_FAILED_EXACT);
      await waitFor(() => expect(gmailButton).toBeEnabled());

      fireEvent.click(gmailButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(POPUP_BLOCKED_EXACT);
      });
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(openSpy).toHaveBeenCalledTimes(2);
      expect(postSpy).toHaveBeenCalledTimes(1);
    });

    it('記録の成功の後に作成画面へ移す処理が例外になるとタブを閉じ、再操作を促す文言を表示する。記録の要求は 1 回（Requirement 42.18）', async () => {
      const tab = fakeUnreachableTab();
      vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window);
      render(<EstimateRequestTextPanel {...ids} text={mockText} method="EMAIL" />);

      const gmailButton = screen.getByRole('button', { name: 'Gmailで開く' });
      fireEvent.click(gmailButton);

      expect(await screen.findByRole('alert')).toHaveTextContent(COMPOSE_OPEN_FAILED_EXACT);
      expect(tab.close).toHaveBeenCalledTimes(1);
      expect(tab.closed).toBe(true);
      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith('/api/v1/audit-logs/exports', mailRecord, {
        disableRetry: true,
      });
      // 記録は成功しているため、記録の失敗の文言は出さない
      expect(screen.queryByText(RECORD_FAILED_EXACT)).not.toBeInTheDocument();
      await waitFor(() => expect(gmailButton).toBeEnabled());
    });

    it('42.17・42.18 の文言は次の操作の開始で消える（Requirement 42.17, 42.18）', async () => {
      // 1 回目: ポップアップが止められる → 42.17
      // 2 回目: 文書へ触れられないタブ → 42.18（開始の時点で 42.17 が消える）
      // 3 回目: コピーの開始で 42.18 が消える
      const unreachable = fakeUnreachableTab();
      const record = holdRecord();
      vi.spyOn(window, 'open')
        .mockImplementationOnce(() => null)
        .mockImplementation(() => unreachable as unknown as Window);
      render(<EstimateRequestTextPanel {...ids} text={mockText} method="EMAIL" />);

      const gmailButton = screen.getByRole('button', { name: 'Gmailで開く' });
      fireEvent.click(gmailButton);
      expect(await screen.findByRole('alert')).toHaveTextContent(POPUP_BLOCKED_EXACT);

      postSpy.mockReturnValueOnce(record.pending);
      act(() => {
        fireEvent.click(gmailButton);
      });
      // 記録の要求中（次の操作の開始）には前の文言が無い
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await act(async () => {
        record.resolve({ recordId: 'record-1' });
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(COMPOSE_OPEN_FAILED_EXACT);
      await waitFor(() => expect(gmailButton).toBeEnabled());

      const copyRecord = holdRecord();
      postSpy.mockReturnValueOnce(copyRecord.pending);
      const copyButtons = screen.getAllByRole('button', { name: 'コピー' });
      act(() => {
        fireEvent.click(copyButtons[0]!);
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await act(async () => {
        copyRecord.resolve({ recordId: 'record-2' });
      });
    });
  });
});
