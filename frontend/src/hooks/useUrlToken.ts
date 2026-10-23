import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * 招待・パスワードリセットのリンクのトークンを URL から受け取る（user-authentication 要件37.3）
 *
 * メールのリンクと招待 URL はトークンをフラグメント（`#token=…`）に置く。フラグメントはサーバーへ送られず、
 * アクセスログに残らない。移行期間は以前のクエリの形（`?token=…`）のリンクも読む。
 * 読んだトークンは画面の状態に保ち、URL からは読んだ直後に取り除く（画面の再描画や共有・ブックマークで残さない）。
 */

const TOKEN_KEY = 'token';

function fragmentParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
}

/**
 * URL のクエリとフラグメントからトークンを読む（フラグメントを優先し、無ければクエリ）
 *
 * @param search - `location.search`
 * @param hash - `location.hash`
 * @returns トークン（無ければ null）
 */
export function readUrlToken(search: string, hash: string): string | null {
  const fromFragment = fragmentParams(hash).get(TOKEN_KEY);
  if (fromFragment) {
    return fromFragment;
  }
  const fromQuery = new URLSearchParams(search).get(TOKEN_KEY);
  return fromQuery || null;
}

/**
 * ブラウザの URL からトークンだけを取り除く
 *
 * 履歴の項目を増やさないよう `history.replaceState` で置き換え、ルーターが履歴に置いた状態（`history.state`）を引き継ぐ。
 * トークンの無いクエリ・フラグメントはそのまま残す。
 */
export function removeUrlToken(): void {
  const { pathname, search, hash } = window.location;
  const query = new URLSearchParams(search);
  const fragment = fragmentParams(hash);
  const queryHasToken = query.has(TOKEN_KEY);
  const fragmentHasToken = fragment.has(TOKEN_KEY);
  if (!queryHasToken && !fragmentHasToken) {
    return;
  }

  query.delete(TOKEN_KEY);
  fragment.delete(TOKEN_KEY);
  const restQuery = query.toString();
  const restFragment = fragment.toString();
  const nextSearch = queryHasToken ? (restQuery ? `?${restQuery}` : '') : search;
  const nextHash = fragmentHasToken ? (restFragment ? `#${restFragment}` : '') : hash;
  window.history.replaceState(window.history.state, '', `${pathname}${nextSearch}${nextHash}`);
}

/**
 * URL のトークンを読み、URL から取り除く
 *
 * 画面を開いたときのトークンは最初の描画で状態に取り込む（StrictMode の二重の実行でも同じ値を保つ）。
 * 取り除くのは描画の後の副作用で行い、二重に実行されても結果は変わらない。
 * 画面を開いたまま同じタブでリンクを開いた（フラグメントだけが変わり再読み込みされない）ときも、
 * `hashchange` で新しいトークンを読み、同じく URL から取り除く。
 *
 * @returns トークン（無ければ空文字）
 */
export function useUrlToken(): string {
  const location = useLocation();
  const [token, setToken] = useState(() => readUrlToken(location.search, location.hash) ?? '');

  useEffect(() => {
    removeUrlToken();

    const handleHashChange = () => {
      const next = readUrlToken(window.location.search, window.location.hash);
      if (next) {
        setToken(next);
        removeUrlToken();
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return token;
}
