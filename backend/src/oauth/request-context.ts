/**
 * @fileoverview 認可の窓口の要求の送信元を保存アダプターの通知へ渡す文脈（user-authentication タスク 73.2）
 *
 * ライブラリの保存の呼び出しには要求が渡らないので、AsyncLocalStorage で送信元を受け渡す。
 *
 * @module oauth/request-context
 */

import { AsyncLocalStorage } from 'async_hooks';
import type { RequestContext } from '../types/auth.types.js';

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * 送信元を文脈に置いて処理を実行する
 *
 * @param source - 要求の送信元
 * @param action - 文脈の中で実行する処理
 * @returns 処理の戻り値
 */
export function runWithRequestSource<T>(source: RequestContext, action: () => T): T {
  return storage.run(source, action);
}

/**
 * 現在の要求の送信元を返す
 *
 * @returns 送信元。要求の外では空
 */
export function getRequestSource(): RequestContext {
  return storage.getStore() ?? {};
}
