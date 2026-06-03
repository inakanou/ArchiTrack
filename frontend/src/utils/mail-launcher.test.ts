/**
 * @fileoverview メール起動 URL ビルダーユーティリティ 単体テスト
 *
 * Task 90.1: URL ビルダーのユニットテスト（Requirement 41）
 *
 * Requirements:
 * - 41.2: mailto による OS 既定メーラー起動用 URL の生成（宛先・表題・本文入力済み）
 * - 41.3: ブラウザ版 Gmail の新規作成画面 URL の生成（宛先・表題・本文入力済み）
 * - 41.6: 本文の改行・整形を保持（CRLF 正規化のうえ `%0D%0A` にエンコード）
 *
 * 対象は副作用を持たない純粋関数（buildMailtoUrl / buildGmailComposeUrl）。
 * DOM・モック不要で入出力（URL 文字列）を直接アサートする。
 */

import { describe, it, expect } from 'vitest';
import { buildMailtoUrl, buildGmailComposeUrl } from './mail-launcher';

describe('mail-launcher', () => {
  describe('buildMailtoUrl', () => {
    // §Unit 1: mailto 基本形式（mailto:<to>?subject=...&body=...、subject/body が百分率エンコード）
    it('mailto:<to>?subject=...&body=... 形式を返し、宛先がアドレス位置・subject/body が百分率エンコードされる', () => {
      const url = buildMailtoUrl({
        to: 'partner@example.com',
        subject: 'Quote Request',
        body: 'Line one',
      });

      // mailto: 直後のアドレス位置に宛先が来る（クエリ開始までがアドレス）
      expect(url.startsWith('mailto:partner%40example.com?')).toBe(true);

      // subject / body がクエリに含まれ、百分率エンコードされている（スペースは %20）
      expect(url).toContain('subject=Quote%20Request');
      expect(url).toContain('body=Line%20one');

      // 全体形式の検証（subject が body より前、& 区切り）
      expect(url).toBe('mailto:partner%40example.com?subject=Quote%20Request&body=Line%20one');
    });

    // §Unit 2: mailto 改行保持（\n が %0D%0A にエンコード）（Req 41.6）
    it('本文の改行が CRLF 正規化されて %0D%0A にエンコードされる（Req 41.6）', () => {
      const url = buildMailtoUrl({
        to: 'a@example.com',
        subject: 'S',
        body: 'first\nsecond\nthird',
      });

      // LF が %0D%0A（CRLF）になっていること
      expect(url).toContain('body=first%0D%0Asecond%0D%0Athird');
      // 単独の %0A（LF のみ）や %0D 重複が混入しないこと
      expect(url).not.toMatch(/body=first%0Asecond/);
      expect(url).not.toContain('%0D%0D');
    });

    it('CRLF・CR・LF が混在しても全て %0D%0A に統一される（重複しない）', () => {
      const url = buildMailtoUrl({
        to: 'a@example.com',
        subject: 'S',
        // CRLF / CR / LF の3種混在
        body: 'crlf\r\ncr\rlf\n',
      });

      expect(url).toContain('body=crlf%0D%0Acr%0D%0Alf%0D%0A');
      // CRLF を二重にエンコードした %0D%0D%0A が現れないこと
      expect(url).not.toContain('%0D%0D');
    });

    // §Unit 3: mailto スペース（本文・表題のスペースが %20、+ ではない）
    it('表題・本文のスペースが %20 にエンコードされ、+ にならない', () => {
      const url = buildMailtoUrl({
        to: 'a@example.com',
        subject: 'subject with spaces',
        body: 'body with spaces',
      });

      expect(url).toContain('subject=subject%20with%20spaces');
      expect(url).toContain('body=body%20with%20spaces');
      // スペースが + にエンコードされていないこと
      expect(url).not.toContain('+');
    });

    // §Unit 4: mailto 全角・特殊文字（&/?/# などが正しくエンコード）
    it('全角文字および & / ? / # などの特殊文字が正しくエンコードされる', () => {
      const url = buildMailtoUrl({
        to: 'a@example.com',
        subject: '見積依頼 A&B',
        body: '質問? #1 価格&数量',
      });

      // 全角（日本語）が encodeURIComponent 相当でエンコードされている
      expect(url).toContain(encodeURIComponent('見積依頼'));
      expect(url).toContain(encodeURIComponent('質問'));

      // & / ? / # がリテラルで残らず、エンコードされている（クエリ境界を壊さない）
      expect(url).toContain('%26'); // &
      expect(url).toContain('%3F'); // ?
      expect(url).toContain('%23'); // #

      // クエリ部分（最初の ? 以降）にリテラルの & ? # が混入しないこと
      const queryPart = url.slice(url.indexOf('?') + 1);
      expect(queryPart).not.toContain('&B'); // 表題の生の & が残っていない
      expect(queryPart).not.toContain('?'); // 本文の生の ? が残っていない
      expect(queryPart).not.toContain('#'); // 本文の生の # が残っていない

      // 全体としては subject と body の境界 & のみがクエリ区切りとして存在する
      expect(queryPart.split('&').length).toBe(2); // subject=... と body=... の2要素
    });
  });

  describe('buildGmailComposeUrl', () => {
    // §Unit 5: Gmail compose 基本形式
    it('https://mail.google.com/mail/? に view=cm・fs=1・to・su・body を含む', () => {
      const url = buildGmailComposeUrl({
        to: 'partner@example.com',
        subject: 'Quote Request',
        body: 'Hello',
      });

      expect(url.startsWith('https://mail.google.com/mail/?')).toBe(true);

      const query = url.slice(url.indexOf('?') + 1);
      const params = new URLSearchParams(query);
      expect(params.get('view')).toBe('cm');
      expect(params.get('fs')).toBe('1');
      expect(params.get('to')).toBe('partner@example.com');
      expect(params.get('su')).toBe('Quote Request');
      expect(params.get('body')).toBe('Hello');
    });

    // §Unit 6: Gmail 改行・全角保持
    it('本文の改行が %0D%0A にエンコードされ、全角文字が保持される', () => {
      const url = buildGmailComposeUrl({
        to: 'a@example.com',
        subject: '見積依頼',
        body: '一行目\n二行目',
      });

      // 改行が CRLF（%0D%0A）でエンコードされている
      expect(url).toContain('%0D%0A');

      // URLSearchParams でデコードすると元の改行・全角が復元される
      const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
      expect(params.get('su')).toBe('見積依頼');
      // CRLF 正規化されるため、デコード結果は \r\n
      expect(params.get('body')).toBe('一行目\r\n二行目');
    });
  });
});
