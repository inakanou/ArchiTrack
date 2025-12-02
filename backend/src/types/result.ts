/**
 * Result型: 成功（Ok）または失敗（Err）を表現する型安全なエラーハンドリングパターン
 *
 * このパターンにより、サービス層のエラーを明示的に伝播し、
 * コントローラー層で適切に処理できるようになります。
 *
 * @template T 成功時の値の型
 * @template E 失敗時のエラーの型
 *
 * @example
 * ```typescript
 * // サービス層での使用
 * async function findUser(id: string): Promise<Result<User, UserError>> {
 *   const user = await db.findUser(id);
 *   if (!user) {
 *     return Err({ type: 'USER_NOT_FOUND' });
 *   }
 *   return Ok(user);
 * }
 *
 * // コントローラー層での使用
 * const result = await findUser('123');
 * if (!result.ok) {
 *   // エラーハンドリング
 *   throw new NotFoundError(result.error.type);
 * }
 * // 成功時の値を使用
 * const user = result.value;
 * ```
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/**
 * 成功結果を生成
 *
 * @template T 成功時の値の型
 * @param value 成功時の値
 * @returns 成功を示すResult型
 *
 * @example
 * ```typescript
 * return Ok({ id: '123', name: 'Alice' });
 * ```
 */
export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * 失敗結果を生成
 *
 * @template E 失敗時のエラーの型
 * @param error エラー情報
 * @returns 失敗を示すResult型
 *
 * @example
 * ```typescript
 * return Err({ type: 'INVALID_INPUT', message: 'Email is required' });
 * ```
 */
export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
