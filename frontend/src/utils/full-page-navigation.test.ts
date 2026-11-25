/**
 * @fileoverview 全ページの遷移の単体検証
 *
 * 外部アプリの同意・拒否の後は、認可サーバーが返した再開の URL へ SPA のルーターを使わずに移る。
 * 受け取った値を組み立て直さず、そのまま `window.location.assign` へ渡すことを確かめる。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navigateFullPage } from './full-page-navigation';

describe('navigateFullPage', () => {
  const originalLocation = window.location;
  const assign = vi.fn();

  beforeEach(() => {
    assign.mockClear();
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, assign },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('受け取った URL を組み立て直さず、そのまま全ページの遷移へ渡す', () => {
    const resumeUrl = 'https://app.example.com/oauth/authorize/abc123?state=x%2Fy&code=1';

    navigateFullPage(resumeUrl);

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(resumeUrl);
  });
});
