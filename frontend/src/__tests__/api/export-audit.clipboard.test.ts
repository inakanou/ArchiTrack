/**
 * クリップボードへの書き込みの事前記録の包み（runRecordedClipboardWrite）のテスト
 *
 * user-authentication タスク64.1。design.md の「ExportAuditService と ExportAuditClient」の節の
 * 「クリップボードへの書き込みの記録」。Safari はクリックの処理の中で同期的に始めた書き込みしか
 * 許さないため、包みは記録の要求と書き込みをどちらも最初の await より前に始め、書き込む中身は
 * 記録の成功の後にだけ解決し、記録の失敗では拒否する（拒否された中身は書き込まれない）。
 *
 * ここでは `ClipboardItem` と `navigator.clipboard` を偽物で与え、呼ばれる順と中身の解決・拒否を
 * 確かめる。利用者の操作の制約そのものは偽物では再現できないため、実ブラウザ（Chromium と WebKit）
 * での確認は tasks.md の Implementation Notes に記す。
 *
 * Requirements (user-authentication):
 * - REQ-40.10: 出力の開始時に記録を要求し、記録の成功の後に出力（クリップボードの中身）を作る
 * - REQ-40.11: 記録の要求が失敗したときは出力せず、エラーメッセージを返す
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EXPORT_RECORD_FAILED_MESSAGE,
  runRecordedClipboardWrite,
  type ExportRecordInput,
} from '../../api/export-audit';
import { ApiError, apiClient } from '../../api/client';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    apiClient: {
      post: vi.fn(),
    },
  };
});

const INPUT: ExportRecordInput = {
  kind: 'itemized_statement_clipboard',
  projectId: 'project-1',
  targetIds: ['statement-1'],
  itemCount: 3,
};

const TEXT = '名称\t数量\n壁\t12';

/** 外から解決・拒否できる Promise */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** ブラウザの ClipboardItem の偽物（種類ごとの値〔Blob か Blob の Promise〕を持つだけ） */
class FakeClipboardItem {
  readonly items: Record<string, Blob | Promise<Blob>>;
  constructor(items: Record<string, Blob | Promise<Blob>>) {
    this.items = items;
  }
}

/**
 * クリップボードの偽物。`write` は実物と同じく、項目の中身の Promise の解決を待ってから書き、
 * 中身が拒否されたときは何も書かずに拒否する
 */
function fakeClipboard() {
  const state = { written: null as string | null };
  const write = vi.fn(async (items: FakeClipboardItem[]) => {
    const blob = await items[0]!.items['text/plain']!;
    state.written = await blob.text();
  });
  const writeText = vi.fn(async (text: string) => {
    state.written = text;
  });
  return { state, clipboard: { write, writeText } };
}

function setClipboard(clipboard: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
}

/** 未解決の Promise を進める（記録の応答の後の連鎖を流す） */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

describe('runRecordedClipboardWrite', () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  /**
   * @requirement user-authentication/REQ-40.10
   */
  it('記録の要求と書き込みを記録の応答より前に始め、記録の成功の後に中身を作って書く', async () => {
    const { state, clipboard } = fakeClipboard();
    setClipboard(clipboard);
    const record = deferred<{ recordId: string }>();
    vi.mocked(apiClient.post).mockReturnValue(record.promise);
    const produce = vi.fn(() => TEXT);

    const running = runRecordedClipboardWrite(INPUT, produce);

    // 呼び出しの同期の部分（クリックの処理の中）で、記録の要求と書き込みの両方が始まっている
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/audit-logs/exports', INPUT, {
      disableRetry: true,
    });
    expect(clipboard.write).toHaveBeenCalledTimes(1);
    const postOrder = vi.mocked(apiClient.post).mock.invocationCallOrder[0] as number;
    const writeOrder = clipboard.write.mock.invocationCallOrder[0] as number;
    expect(postOrder).toBeLessThan(writeOrder);
    expect(clipboard.writeText).not.toHaveBeenCalled();

    // 記録の応答の前は中身を作らず、何も書かれていない
    await flush();
    expect(produce).not.toHaveBeenCalled();
    expect(state.written).toBeNull();

    record.resolve({ recordId: 'record-1' });
    const result = await running;

    expect(result).toEqual({ ok: true, value: undefined });
    expect(produce).toHaveBeenCalledTimes(1);
    expect(state.written).toBe(TEXT);
    const item = clipboard.write.mock.calls[0]![0][0]!;
    expect(Object.keys(item.items)).toEqual(['text/plain']);
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  /**
   * @requirement user-authentication/REQ-40.11
   */
  it('記録の要求が失敗したときは中身を拒否して何も書かず、RECORD_FAILED とメッセージを返す', async () => {
    const { state, clipboard } = fakeClipboard();
    setClipboard(clipboard);
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError(500, 'record failed'));
    const produce = vi.fn(() => TEXT);

    const result = await runRecordedClipboardWrite(INPUT, produce);

    expect(result).toEqual({
      ok: false,
      error: { type: 'RECORD_FAILED', message: EXPORT_RECORD_FAILED_MESSAGE },
    });
    expect(clipboard.write).toHaveBeenCalledTimes(1);
    await expect(clipboard.write.mock.results[0]!.value).rejects.toBeDefined();
    expect(produce).not.toHaveBeenCalled();
    expect(state.written).toBeNull();
    // 記録の要求は送り直さない
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  /**
   * @requirement user-authentication/REQ-40.11
   */
  it('記録の ID の無い応答は記録の失敗とし、何も書かずに RECORD_FAILED を返す', async () => {
    const { state, clipboard } = fakeClipboard();
    setClipboard(clipboard);
    vi.mocked(apiClient.post).mockResolvedValue({});
    const produce = vi.fn(() => TEXT);

    const result = await runRecordedClipboardWrite(INPUT, produce);

    expect(result).toEqual({
      ok: false,
      error: { type: 'RECORD_FAILED', message: EXPORT_RECORD_FAILED_MESSAGE },
    });
    expect(produce).not.toHaveBeenCalled();
    expect(state.written).toBeNull();
  });

  /**
   * @requirement user-authentication/REQ-40.10
   */
  it('記録の後の書き込みが失敗したときは GENERATION_FAILED と原因を返し、記録は送り直さない', async () => {
    const { clipboard } = fakeClipboard();
    const denied = new DOMException('Write permission denied.', 'NotAllowedError');
    clipboard.write.mockRejectedValue(denied);
    setClipboard(clipboard);
    vi.mocked(apiClient.post).mockResolvedValue({ recordId: 'record-1' });

    const result = await runRecordedClipboardWrite(INPUT, () => TEXT);

    expect(result).toEqual({ ok: false, error: { type: 'GENERATION_FAILED', cause: denied } });
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  /**
   * @requirement user-authentication/REQ-40.10
   */
  it('記録の後に中身の作成が失敗したときは何も書かず GENERATION_FAILED を返す', async () => {
    const { state, clipboard } = fakeClipboard();
    setClipboard(clipboard);
    vi.mocked(apiClient.post).mockResolvedValue({ recordId: 'record-1' });
    const broken = new Error('produce failed');

    const result = await runRecordedClipboardWrite(INPUT, async () => {
      throw broken;
    });

    expect(result).toEqual({ ok: false, error: { type: 'GENERATION_FAILED', cause: broken } });
    expect(state.written).toBeNull();
  });

  describe('ClipboardItem の無いブラウザ', () => {
    beforeEach(() => {
      vi.stubGlobal('ClipboardItem', undefined);
    });

    /**
     * @requirement user-authentication/REQ-40.10
     */
    it('記録の成功を待ってから文字列で書く', async () => {
      const { state, clipboard } = fakeClipboard();
      setClipboard(clipboard);
      const record = deferred<{ recordId: string }>();
      vi.mocked(apiClient.post).mockReturnValue(record.promise);
      const produce = vi.fn(async () => TEXT);

      const running = runRecordedClipboardWrite(INPUT, produce);
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      await flush();
      expect(clipboard.writeText).not.toHaveBeenCalled();
      expect(produce).not.toHaveBeenCalled();

      record.resolve({ recordId: 'record-1' });
      const result = await running;

      expect(result).toEqual({ ok: true, value: undefined });
      expect(clipboard.write).not.toHaveBeenCalled();
      expect(clipboard.writeText).toHaveBeenCalledWith(TEXT);
      expect(state.written).toBe(TEXT);
    });

    /**
     * @requirement user-authentication/REQ-40.11
     */
    it('記録の要求が失敗したときは書かずに RECORD_FAILED を返す', async () => {
      const { clipboard } = fakeClipboard();
      setClipboard(clipboard);
      vi.mocked(apiClient.post).mockRejectedValue(new ApiError(500, 'record failed'));
      const produce = vi.fn(() => TEXT);

      const result = await runRecordedClipboardWrite(INPUT, produce);

      expect(result).toEqual({
        ok: false,
        error: { type: 'RECORD_FAILED', message: EXPORT_RECORD_FAILED_MESSAGE },
      });
      expect(produce).not.toHaveBeenCalled();
      expect(clipboard.writeText).not.toHaveBeenCalled();
    });

    /**
     * @requirement user-authentication/REQ-40.10
     */
    it('記録の後の文字列の書き込みが失敗したときは GENERATION_FAILED を返す', async () => {
      const { clipboard } = fakeClipboard();
      const denied = new DOMException('Document is not focused.', 'NotAllowedError');
      clipboard.writeText.mockRejectedValue(denied);
      setClipboard(clipboard);
      vi.mocked(apiClient.post).mockResolvedValue({ recordId: 'record-1' });

      const result = await runRecordedClipboardWrite(INPUT, () => TEXT);

      expect(result).toEqual({ ok: false, error: { type: 'GENERATION_FAILED', cause: denied } });
    });
  });

  /**
   * @requirement user-authentication/REQ-40.10
   */
  it('navigator.clipboard が無いときは記録を要求せずに GENERATION_FAILED を返す', async () => {
    setClipboard(undefined);
    const produce = vi.fn(() => TEXT);

    const result = await runRecordedClipboardWrite(INPUT, produce);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.type).toBe('GENERATION_FAILED');
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(produce).not.toHaveBeenCalled();
  });
});
