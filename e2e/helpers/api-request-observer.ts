/**
 * @fileoverview ブラウザが送出したAPIリクエストを観測するヘルパー
 *
 * 「操作がサーバーへ書き込みを発生させないこと」「保存が1回だけ発生すること」を
 * 検証するために、画面上の代理シグナルではなくブラウザが実際に送出した
 * リクエストを収集します。
 *
 * リクエストの選別と記録は**オリジンではなくパス**で行います。ブラウザ側が使う
 * APIオリジン（`VITE_API_URL`）とE2E側の `API_BASE_URL` は同一とは限らず、
 * CI環境では前者が `http://localhost:3000`、後者が `http://127.0.0.1:3000` に
 * なります。オリジン文字列でリクエストを選別すると、両者が食い違う環境では
 * 観測対象が1件も残らず「書き込みは0件」という検証が常に成立してしまい、
 * テストが前提条件で自動的に無効化されるためです。
 */

import type { Page } from '@playwright/test';

/** 観測対象として扱うAPIパスの接頭辞 */
const API_PATH_PREFIX = '/api/';

/**
 * 明細操作と無関係に発生しうるため観測から除外するAPIパスの接頭辞
 *
 * アクセストークンの再取得はPOSTだが、見積明細の保存有無を判定する材料に
 * ならないため除外する。
 */
const EXCLUDED_PATH_PREFIX = '/api/auth/';

/** `page.on('request')` が渡すオブジェクトのうち本ヘルパーが使う部分 */
interface ObservableRequest {
  url: () => string;
  method: () => string;
}

/**
 * リクエストURLから観測対象のAPIパスを取り出す
 *
 * クエリ文字列は含めない。API以外・除外対象・URLとして解釈できない場合は `null`。
 */
export function toObservableApiPath(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith(API_PATH_PREFIX) || pathname.startsWith(EXCLUDED_PATH_PREFIX)) {
    return null;
  }
  return pathname;
}

/** 観測結果 */
export interface ApiRequestObservation {
  /** GET 以外（POST/PUT/PATCH/DELETE …）の記録。形式は `METHOD /api/...` */
  writes: string[];
  /** GET の記録。形式は `GET /api/...` */
  reads: string[];
  /** 観測を終了する */
  stop: () => void;
}

/**
 * ブラウザが送出したAPIリクエストの観測を開始する
 *
 * CORSプリフライト（OPTIONS）は書き込みでも読み取りでもないため記録しない。
 *
 * @param page - 観測対象のページ
 * @returns 記録の格納先と観測終了関数
 */
export function observeApiRequests(page: Page): ApiRequestObservation {
  const writes: string[] = [];
  const reads: string[] = [];

  const record = (request: ObservableRequest): void => {
    const path = toObservableApiPath(request.url());
    if (path === null) {
      return;
    }
    const method = request.method();
    if (method === 'OPTIONS') {
      return;
    }
    if (method === 'GET') {
      reads.push(`${method} ${path}`);
      return;
    }
    writes.push(`${method} ${path}`);
  };

  page.on('request', record);
  return { writes, reads, stop: () => page.off('request', record) };
}
