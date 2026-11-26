/**
 * @fileoverview 全ページの遷移（user-authentication タスク78.1）
 *
 * 外部アプリの同意・拒否の後は、認可サーバーが返した再開の URL へ SPA のルーターを使わずに移る
 * （design.md の ConsentPage「`redirectTo` への遷移は全ページの遷移で行う」）。
 * URL は画面で組み立てず、受け取った値をそのまま渡す。テストではこのモジュールを差し替える。
 */

/**
 * 指定の URL へ全ページで遷移する
 *
 * @param url - 遷移先（API の応答の値）
 */
export function navigateFullPage(url: string): void {
  window.location.assign(url);
}
