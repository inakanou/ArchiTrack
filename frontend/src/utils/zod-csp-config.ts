/**
 * @fileoverview Zod を画面の CSP の下で動かすための設定
 *
 * user-authentication 要件44.4（design.md の FrontendNginxConfig）。画面の CSP は script-src に
 * `'unsafe-eval'` を含めない。Zod v4 は既定でオブジェクトのスキーマを作るときに `new Function("")` で
 * eval の可否を試し、可能なら検証の関数を生成する（JIT）。CSP の下では試行は失敗して通常の検証へ
 * 戻るが、試行のたびに CSP の違反（`securitypolicyviolation`）が起きる。JIT を止めて試行そのものを
 * なくす（検証の結果は変わらない）。
 *
 * スキーマはモジュールの読み込み時に作られるため、画面の入口（`main.tsx`）が他のモジュールより先に
 * 本モジュールを読み込む。
 */

import { z } from 'zod';

z.config({ jitless: true });
