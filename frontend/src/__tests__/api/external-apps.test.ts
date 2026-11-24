/**
 * 外部アプリの同意の API クライアントのテスト（user-authentication タスク78.1）
 *
 * design.md「ExternalAppRoutes」の同意の API（`/oauth/interaction/:uid/...`）へ、backend の経路と同じ形で送る。
 * 状態を変える 3 本は CSRF トークン付きの手段（`apiClient.sendWithCsrf`）で送り、範囲は利用者の選択だけを送る。
 *
 * @requirement user-authentication/REQ-47.4
 * @requirement user-authentication/REQ-47.5
 * @requirement user-authentication/REQ-47.11
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), sendWithCsrf: vi.fn() }));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    apiClient: { get: mocks.get, sendWithCsrf: mocks.sendWithCsrf },
  };
});

import {
  approveConsent,
  denyConsent,
  getConsentInteraction,
  isValidInteractionUid,
  verifyConsentSecondFactor,
} from '../../api/external-apps';

const UID = 'A'.repeat(21) + '_-' + 'b9'.repeat(10);

describe('external-apps API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isValidInteractionUid', () => {
    it('43 文字の英数字・_・- だけを受ける（backend の検証と同じ形）', () => {
      expect(UID).toHaveLength(43);
      expect(isValidInteractionUid(UID)).toBe(true);
    });

    it.each([
      ['42 文字', 'a'.repeat(42)],
      ['44 文字', 'a'.repeat(44)],
      ['記号を含む', 'a'.repeat(42) + '.'],
      ['パスの区切りを含む', 'a'.repeat(21) + '/' + 'a'.repeat(21)],
      ['空', ''],
      ['undefined', undefined],
    ])('%s は受けない', (_label, value) => {
      expect(isValidInteractionUid(value)).toBe(false);
    });
  });

  it('getConsentInteraction は details を GET する', async () => {
    mocks.get.mockResolvedValue({ appName: 'Claude' });

    await expect(getConsentInteraction(UID)).resolves.toEqual({ appName: 'Claude' });
    expect(mocks.get).toHaveBeenCalledWith(`/oauth/interaction/${UID}/details`);
  });

  it('verifyConsentSecondFactor は second-factor へ CSRF 付きで POST する', async () => {
    mocks.sendWithCsrf.mockResolvedValue('');

    await verifyConsentSecondFactor(UID, { type: 'totp', code: '123456' });

    expect(mocks.sendWithCsrf).toHaveBeenCalledWith(
      'POST',
      `/oauth/interaction/${UID}/second-factor`,
      { type: 'totp', code: '123456' }
    );
  });

  it('approveConsent は選んだ範囲だけを本文の scopes で送り、redirectTo を返す', async () => {
    mocks.sendWithCsrf.mockResolvedValue({ redirectTo: 'https://issuer.example/resume' });

    await expect(approveConsent(UID, ['read'])).resolves.toEqual({
      redirectTo: 'https://issuer.example/resume',
    });
    expect(mocks.sendWithCsrf).toHaveBeenCalledWith('POST', `/oauth/interaction/${UID}/approve`, {
      scopes: ['read'],
    });
  });

  it('denyConsent は本文なしで deny へ CSRF 付きで POST する', async () => {
    mocks.sendWithCsrf.mockResolvedValue({ redirectTo: 'https://issuer.example/resume' });

    await denyConsent(UID);

    expect(mocks.sendWithCsrf).toHaveBeenCalledWith('POST', `/oauth/interaction/${UID}/deny`);
  });

  it.each([
    ['redirectTo が無い', {}],
    ['redirectTo が文字列でない', { redirectTo: 42 }],
    ['http(s) でない', { redirectTo: 'javascript:alert(1)' }],
    ['URL でない', { redirectTo: 'not a url' }],
  ])('応答の %s ときは失敗として扱う', async (_label, body) => {
    mocks.sendWithCsrf.mockResolvedValue(body);

    await expect(denyConsent(UID)).rejects.toThrow();
  });
});
