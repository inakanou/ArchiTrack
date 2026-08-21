/**
 * @fileoverview E2Eテストの「検証無効化」構造の検出スクリプト
 *
 * E2Eテストには、書かれてはいるが実質的に何も検証しない構造が混入しやすい。
 * site-survey タスク 115.19 で整理した五つの型を、TypeScript の構文木を用いて
 * 機械的に洗い出す。加えて、同じ効果を持つ「条件付きスキップ」を補助規則として検出する。
 *
 * 使用方法:
 *   npx tsx scripts/check-e2e-assertion-guards.ts [options]
 *   npm run check:e2e-guards
 *
 * 検出する型:
 *   T1 conditional-expect   条件分岐で検証本体を包む
 *                           `if (cond) { await expect(...) }` — 条件が偽なら何も検証しない
 *   T2 ignored-timeout      待機の指定を尊重しない判定
 *                           `locator.isVisible({ timeout })` は timeout が無視され即時判定される。
 *                           描画前に false となり、その結果で分岐・早期終了すると検証が飛ぶ
 *   T3 tautology            常に真になる判定
 *                           `expect(typeof x === 'number').toBeTruthy()` のような恒真式
 *   T4 response-field-gate  応答の項目の有無を条件にする
 *                           `if (response.someField) { expect(...) }` — 当該項目が常に空なら一度も実行されない
 *   T5 observed-result-gate 自ら観測した結果を条件にする
 *                           `const has = await x.isVisible(); if (has) { await expect(x).toBeVisible(); }`
 *                           — 出ても出なくても通る。観測結果による早期 return / continue も含む
 *   T6 conditional-skip     前提が満たせない場合に沈黙して飛ばす
 *                           `test.skip(<式>, '理由')` / `test.fixme(<式>, ...)` — 条件次第で検証が丸ごと消える。
 *                           引数なしの `test.skip()` / `test.fixme()` も同型として計上する。
 *                           条件分岐の内側で呼ぶ形（`if (!cond) { test.skip(); return; }`）は
 *                           条件式を渡す形と効果が同一であり、無条件に呼ぶ形は検証そのものの放棄である
 *                           （Task 115.127 段0）。
 *                           第一引数が文字列（タイトル）や関数（実行条件の宣言）の形は対象外
 *
 * 分類の優先順位: T3 > T4 > T5 > T1（T2 と T6 は別軸のため重複して計上する）
 *
 * 検証を包む形（T1 / T4 / T5 の入口）:
 *   - `if (cond) { await expect(...) }`
 *   - `cond && (await expect(...))` / `cond ?? (await expect(...))`
 *   - `cond ? await expect(...) : undefined`（三項で包む形）
 *   - 観測結果を条件に黙って抜ける形（`if (!observed) { return; }` など）
 *     後始末や記録が脱出の直前に挟まる形も含む。検証が飛ぶかどうかを決めるのは
 *     「途中に何が書かれているか」ではなく「主張も失敗もせずに制御が抜けるか」である
 *     （Task 115.137。詳細は isSilentExit を参照）。
 *
 * 観測の語彙:
 *   条件式が「観測を運ぶか」の判定は、識別子の綴りを含む展開後の文字列に対して行う。
 *   語彙を語境界だけで一致させると、同じ観測を包んだ補助（`isVisibleWithin` など）が
 *   一致しなくなる。Task 115.137 で、この取りこぼしにより二百五十六箇所の分類が
 *   実質 `await` の有無だけに依存していたことが判明した。現在は次の二つで補う。
 *     - 述語の族（`isX`）と待機の族（`waitForX`）は接頭辞で一致させる
 *     - `e2e/helpers/` 配下で「真偽を返す」と**構文で判る**関数の名前を自動で取り込む
 *       （補助が増えるたびに検出器を書き換える運用は、書き換え漏れがそのまま
 *       静かな無検出になるため。判定は命名ではなく構造で行う）
 *
 * 局所変数の追跡:
 *   検出は「expect や if の直下に書かれた式」だけを見ると容易に迂回できる。
 *   同一ファイル内の値の出どころを表引きし、識別子が判定の主題・条件に現れた場合は
 *   その値を展開したうえで分類する。したがって次の二つは同じ扱いになる。
 *
 *     expect(a === null || a.ok()).toBeTruthy();            // 直接記述
 *     const ok = a === null || a.ok(); expect(ok).toBeTruthy(); // 変数を挟む形（同じく T3）
 *
 *   表に載せるのは次の三つの形である。
 *     (1) 初期化子を伴う宣言（`const ok = await res.json()`）
 *     (2) 分割して受ける形（`const { ok } = await res.json()` / `const [a] = await ...`）
 *     (3) 宣言と代入を分ける形（`let id: string;` … `id = await createProject()`）
 *   (3) は上位の有効範囲での宣言と組み合わさる用例が多く、表に載せないと
 *   `if (!id) { return; }` のような沈黙して終える構造が無検出になる。
 *
 *   値が次のいずれかを含む場合、その識別子は「観測」を運ぶものとして扱う。
 *     (a) 即時判定・観測（isVisible / count / textContent / getAttribute / evaluate 等）
 *     (b) await を伴う呼び出し（画面や API から結果を取り出す行為そのもの）
 *     (c) 失敗の握り潰し（`.catch(...)`）
 *   論理和・既定値（`||` / `??`）を含む値は恒真になり得るものとして扱う。
 *   スコープは追わず、同名の宣言は検出側に有利な方（観測を含む方）へ寄せて併合する。
 *
 *   表は「宣言の初期化子」と「代入の右辺」に分けて持つ。上記の分類（T1/T4/T5）では
 *   双方を同じように展開するが、T3 の主題の判断では扱いを変える。
 *     - 宣言の初期化子は、後から代入される名前については参照しない。
 *       `let accessToken = ''` のように宣言時の値が仮置きで、代入後の値を検証する形は
 *       正当な主張であり、宣言時の偽値のリテラルで恒真と数えてはならないためである。
 *     - 代入の右辺は、その形自体が論理和・既定値（右辺が偽値のリテラルでないもの）
 *       または型判定であるものに限って評価する。
 *       `let errorFound = false; errorFound = a || b;` は代入した式そのものが恒真であり、
 *       同じ式を `const` で書いた場合と扱いを変える理由が無いためである。
 *
 * 検出対象外とした構造（意図的に対象外。再検討時はこの記述を更新すること）:
 *   - 論理和による検証のうち、真偽以外の matcher に渡る形（`expect(a || b).toContain(...)` 等）
 *     既定値を与えてから内容を検証する正当な用法と区別できず、誤検出が支配的になるため。
 *     真偽値の matcher（toBeTruthy / toBeFalsy / toBe(true|false)）に渡る形は T3 で検出する。
 *   - 握り潰しの例外処理（`try { ... } catch { }` のように catch 節で何もしない形）
 *     後始末・クリーンアップでの使用が多数を占め、構文だけでは検証の放棄と区別できないため。
 *   - 応答待ちの握り潰し（`await page.waitForResponse(...).catch(() => null)`）
 *     待機自体を落とさない用法は正当でもあるため単独では対象外とする。
 *     ただし、その結果が条件や検証の主題に現れた時点で上記の局所変数の追跡により
 *     T3 / T5 として検出される（無害な待機と、検証を骨抜きにする使い方とを区別する）。
 *   - 比較の形を持つ式（`expect(status === 304).toBeTruthy()` 等）
 *     比較そのものは実質のある検証であり、恒真ではない。
 *     被演算子へ再帰するとリテラル比較まで恒真として数えてしまうため、比較を見つけた
 *     時点で打ち切る（型判定 `typeof x === 'number'` を持つ場合のみ例外）。
 *     `a === null || a.ok() || a.status() === 304` のように「比較を含むが全体としては
 *     恒真」な論理和は、打ち切りの前に論理和として判定されるため従来どおり検出される。
 *   - 既定値として偽値を補うだけの形（`const id = match?.[1] ?? null;` の検証）
 *     左辺が偽なら結果も偽であり、真偽の主張を骨抜きにしないため。
 *   - 真偽のリテラルを代入した値の検証（`let ok = false; ok = true; expect(ok).toBeTruthy()`）
 *     代入の右辺を評価する対象から真偽のリテラルを外した結果、この形は無検出になる。
 *     これは意図した限界であり、無条件に真を代入する恒真の主張は取り逃がす。
 *     `let downloadHappened = false; … downloadHappened = true;` のように、事象の発生や
 *     条件の成立を記録して検証する観測フラグが正当な用法として多数を占めるためである。
 *     本稿の執筆時点の走査では、この形に該当する箇所は e2e 配下に 34 箇所あり、
 *     いずれも条件分岐・例外処理・コールバックの内側でのみ真を代入している
 *     （無条件に真を代入する箇所は 0 件）。真偽のリテラルの代入まで辿ると、
 *     この 34 箇所がそのまま過検出として戻る。
 *   - 判定・抽出の実装そのものである分岐（Task 115.127 段3・計画の A 群）
 *     真偽を返す関数、またはブラウザ側で評価される関数（`evaluate` 族）の内側で、
 *     **expect を一つも含まず** then 節が脱出だけの分岐。述語は false を返す経路を必ず持ち、
 *     その `return false` を数えることは「述語が述語であること」を欠陥として数えるに等しい。
 *     真偽を呼び出し側がどう扱うかは関門であり、呼び出し側の分岐は従来どおり検出される。
 *     真偽を返す関数かどうかは**構造**で判定する（戻り値の型注釈、または自らの return が
 *     すべて真偽の値であること）。`isX` / `hasX` のような命名では判定しない。
 *     詳細は predicateImplementationExclusion を参照。
 *   - 探索・再試行の繰り返しを抜けるだけの `break` / `continue`（Task 115.137 の査読）
 *     `break` / `continue` は繰り返しを抜けるだけでテストからは抜けない。抜けた先で
 *     観測の結果が無条件に検査される（主張・throw・必ず落ちる関門）なら検証は飛んでいない。
 *     **これは削減計画が E 群の是正先として推奨している形そのもの**であり、負債として
 *     数えてはならない。抜けた先で結果を一切検査しない形は従来どおり検出する。
 *     詳細は escapesCheckedLoop を参照。
 *   - 値を作る補助の中の「値を伴う return」（Task 115.137 の査読・計画 §6 の条件 (3) の拡張）
 *     値を返す関数が値を返す経路を持つのは関数であることそのものであり、検証の放棄ではない。
 *     債務は呼び出し側がその値をどう扱うかにあり、呼び出し側の分岐は従来どおり検出される。
 *     テスト本体の中の値を伴わない `return;` は真正の沈黙脱出として検出したまま残す。
 *     詳細は valueProducingExitExclusion を参照。
 *   - どの経路でも throw か無条件の主張に到達する分岐（Task 115.127 段3・計画の B 群）
 *     `else` を持ち、then / else の双方の到達しうる終端がすべて throw か無条件の主張であり、
 *     かつ内側に throw を含む分岐。素通りする経路が構造上存在しない。
 *     throw を含まない全域分岐（計画の G 群）は「どの経路でも**同等の**検証が実行されるか」
 *     という中身の判断を要するため対象外にしない。詳細は guaranteedFailureExclusion を参照。
 *
 * 走査の対象:
 *   `e2e/specs/` `e2e/helpers/` `e2e/fixtures/` だけを走査する。検出しているのは
 *   「テストが検証を放棄している構造」であり、Playwright の実行基盤（`e2e/global-setup.ts` /
 *   `e2e/config.ts` / `e2e/reporters/`）はテストのライフサイクルの外で走るため対象外である。
 *   除外はファイル名の羅列ではなく置き場所の役割で決める（詳細は SCAN_SUBDIRS を参照）。
 *
 * 検出規則の確認:
 *   scripts/check-e2e-assertion-guards.selftest.ts に、捕捉すべき書き方と
 *   捕捉してはならない書き方を注入する一覧を置いている。規則を変更したら
 *   `npm run check:e2e-guards:selftest` を実行すること。
 *
 * 正当な用途の除外:
 *   条件分岐が正当な箇所は、該当行の直前行に以下の注釈を置くことで検出対象から外せる。
 *   理由は必須であり、理由が空の注釈は除外として扱わず（検出はそのまま残る）、検査を失敗させる。
 *
 *     // e2e-guard-allow: <理由>
 *
 *   除外を認める条件は一つだけである（Task 115.68 / 115.93）。
 *
 *     **前提が満たせない場合に必ず失敗すること。沈黙して通る経路が一つも無いこと。**
 *
 *   「検証ではなく前提の準備だから」は、それ単独では理由にならない。前提の準備であっても、
 *   前提が崩れたまま素通りすれば、失敗は崩れた地点ではなく後段に現れ、前提の崩れなのか
 *   検証対象の欠陥なのかを判別できなくなる。したがって理由には、
 *   「どこで失敗するか」（直後の throw／無条件の主張／全域である分岐のいずれか）を書くこと。
 *   逆に言えば、次のいずれかに当たるものだけが除外に値する。
 *     (1) 条件が偽なら直後に throw / 無条件の主張で落ちる（再試行の待機など）
 *     (2) 分岐が全域であり、どの経路でも同等の検証・操作が必ず実行される（変種の吸収）
 *     (3) 判定そのものを実装している述語ヘルパー（真偽を返す関数の内部）
 *
 *   除外は実行のたびに件数と箇所の一覧を出力し、基準にも件数を記録する。
 *   除外が増えた場合も検査は失敗する（大量除外による見かけ上の解消を防ぐため）。
 *
 * 再発検知:
 *   e2e/assertion-guard-baseline.json に「ファイル別・型別の既知件数」と
 *   「ファイル別の除外件数」を記録する。
 *   件数が増えた場合、または基準に無いファイルで検出された場合は exit 1 とする。
 *   件数が減った場合は警告のみ（基準の更新を促す）。
 *
 * 抑止一覧（基準）の位置づけ:
 *   基準に載っている件数は「解消済み」ではない。**いま抑止しているだけの既知の欠陥**である。
 *   放置すると「検査は通るのに欠陥は残る」状態が恒久化するため、次の二つを設けている。
 *
 *   (1) 負債の可視化
 *       実行のたびに、型別に「現在 / 基準 / 目標 / 残り」を出力する。目標と削減計画の所在は
 *       基準の `reduction` に記録する。CI の出力を見れば、通ったかどうかとは別に
 *       いくつ抑止されたままかが常に分かる。
 *   (2) 抑止一覧を増やす操作に摩擦を与える
 *       `--update-baseline` は件数が増える方向の書き出しを既定で拒否する。
 *       増加を記録する必要がある場合は `--allow-increase` を明示的に付けること。
 *       これは「直せないので登録して黙らせる」を無言でできないようにするための関門である。
 *
 * オプション:
 *   --verbose           検出箇所を全件表示する
 *   --json              JSON形式で出力する
 *   --update-baseline   現状を基準として書き出す（是正後に実行する）
 *   --allow-increase    件数が増える方向の基準更新を許可する（--update-baseline と併用）
 *   --no-baseline       基準と照合せず検出結果のみ出力する
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const E2E_DIR = path.join(ROOT, 'e2e');
const BASELINE_PATH = path.join(E2E_DIR, 'assertion-guard-baseline.json');
const ALLOW_MARKER = 'e2e-guard-allow:';

/**
 * 走査対象の下位ディレクトリ（Task 115.137 の是正）。
 *
 * 検出しているのは「テストが検証を放棄している構造」である。したがって走査してよいのは
 * **テストの実行中に働くもの**に限る。次の三つがそれに当たる。
 *   - `e2e/specs/`    テストの本体
 *   - `e2e/helpers/`  テストから呼ばれ、テストの中で観測・主張を行う補助
 *   - `e2e/fixtures/` テストから呼ばれる前提の準備（テストの成否に直結する）
 *
 * 逆に `e2e/` の直下に置かれるもの（`global-setup.ts` / `config.ts`）と `e2e/reporters/` は
 * Playwright の**実行基盤**であり、テストのライフサイクルの外で走る。そこにある
 * `return` / `break` は疎通待ちの成功や進捗表示の分岐であって検証の放棄ではない。
 * 実基盤を走査した結果、`e2e/global-setup.ts:31`（疎通待ちの成功時 return。枯渇時は throw）と
 * `e2e/reporters/progress-reporter.ts:74`（再試行の進捗表示）が誤検出されていた。
 *
 * 除外はファイル名の羅列ではなく**置き場所の役割**で決める。名前を並べる方式は、
 * 基盤のファイルが増えるたびに検出器を書き換える運用になり、書き換え漏れが誤検出として残る。
 */
const SCAN_SUBDIRS = ['specs', 'helpers', 'fixtures'];

// ============================================================================
// 型定義
// ============================================================================

export type GuardType =
  | 'T1-conditional-expect'
  | 'T2-ignored-timeout'
  | 'T3-tautology'
  | 'T4-response-field-gate'
  | 'T5-observed-result-gate'
  | 'T6-conditional-skip';

export interface Finding {
  file: string;
  line: number;
  type: GuardType;
  snippet: string;
}

interface AllowEntry {
  file: string;
  line: number;
  type: GuardType;
  reason: string;
  snippet: string;
}

export interface ScanResult {
  findings: Finding[];
  allowed: AllowEntry[];
  /** 理由の無い除外注釈（除外として扱わない） */
  invalidAllows: AllowEntry[];
  /**
   * 検出の元になった構文木の節点（`findings` と同じ並び・同じ長さ）。
   *
   * 分類走査（scripts/classify-e2e-assertion-guards.ts）が、検出箇所を
   * 行番号で当て直すことなく構文木のまま受け取るために持つ。
   * JSON 出力には含めない（節点は直列化できないため）。
   */
  findingNodes: ts.Node[];
}

type Baseline = Record<string, Partial<Record<GuardType, number>>>;
type AllowBaseline = Record<string, number>;

/**
 * 抑止一覧の削減計画。基準に記録し、実行のたびに残りを出力する。
 * 目標は「いつまでに何件へ落とすか」の宣言であり、検査の合否には用いない
 * （合否は従来どおり基準からの増加で判定する）。
 */
interface ReductionPlan {
  /** 削減計画を記した文書の位置 */
  doc?: string;
  /** 型別の目標件数 */
  targets?: Partial<Record<GuardType, number>>;
  /** 除外注釈の目標件数 */
  allowedTarget?: number;
}

const GUARD_TYPES: GuardType[] = [
  'T1-conditional-expect',
  'T2-ignored-timeout',
  'T3-tautology',
  'T4-response-field-gate',
  'T5-observed-result-gate',
  'T6-conditional-skip',
];

/** 即時判定であり timeout 指定が無視される Playwright の述語メソッド */
export const IMMEDIATE_PREDICATES = [
  'isVisible',
  'isHidden',
  'isEnabled',
  'isDisabled',
  'isChecked',
  'isEditable',
];

/**
 * 観測を示す語のうち、**接頭辞**で一致させるもの。
 *
 * 語境界だけで一致させると、同じ観測を包んだ補助（`isVisibleWithin` など）が
 * 一致しなくなる（末尾に語が続くため `\bisVisible\b` が成立しない）。
 * Task 115.137 で、この取りこぼしにより二百五十六箇所の分類が
 * 実質 `await` の有無だけに依存していたことが判明した。
 * 述語の族（`isX`）と待機の族（`waitForX`）は、接頭辞が一致する識別子が
 * 観測以外を指すことは事実上ありえないため、接頭辞一致へ広げる。
 */
const OBSERVATION_PREFIX_WORDS = [...IMMEDIATE_PREDICATES, 'waitFor'];

/** 観測を示す語のうち、語境界で一致させるもの（接頭辞へ広げると別語を巻き込むもの） */
const OBSERVATION_EXACT_WORDS = [
  'count',
  'textContent',
  'innerText',
  'inputValue',
  'getAttribute',
  'boundingBox',
  'locator',
  'getByTestId',
  'getByRole',
  'getByText',
  'evaluate',
];

/** 正規表現の特殊文字を無効化する */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `e2e/helpers/` 配下で「真偽を返す」と**構文で判る**関数の名前を集める。
 *
 * 観測を包んだ補助が増えるたびに検出器を書き換える運用は、書き換え漏れが
 * そのまま静かな無検出になる（Task 115.137 の再発源）。補助の名前を列挙するのではなく、
 * 補助の**形**（真偽を返す関数であること）から名前を自動で取り込む。
 * 判定には述語ヘルパーの判定と同じ `isBooleanReturningFunction` を用いるため、
 * `isX` / `hasX` のような命名には一切依存しない。
 */
export function collectBooleanHelperNames(dir: string = path.join(E2E_DIR, 'helpers')): string[] {
  const names = new Set<string>();
  // 取り込み元が失われた場合は黙って空を返さない（Task 115.137）。
  // 基礎語彙が残るため検出が丸ごと消えることはないが、`await` を条件式の外へ出した書き方は
  // 静かに無検出へ落ちる。本タスクが解消しようとしている「静かに消える」問題そのものなので、
  // 取り込みが成立しない場合は検査を失敗させる。
  if (!fs.existsSync(dir)) {
    throw new Error(
      `観測の語彙の取り込み元が見つかりません: ${dir}\n` +
        '取り込みが成立しないと、補助へ畳んだ観測が静かに無検出になります。'
    );
  }
  for (const file of collectFiles(dir)) {
    const sourceFile = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name && isBooleanReturningFunction(node)) {
        names.add(node.name.text);
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
        isBooleanReturningFunction(node.initializer)
      ) {
        names.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  if (names.size === 0) {
    throw new Error(
      `観測の語彙を取り込めませんでした（真偽を返す関数が一つも見つかりません）: ${dir}\n` +
        '取り込みが空のまま通すと、補助へ畳んだ観測が静かに無検出になります。'
    );
  }
  return [...names].sort();
}

/**
 * 画面・応答からの観測を示す語（条件式の分類に用いる）。
 *
 * 自己検査から「接頭辞一致」「自動取り込み」それぞれの寄与を切り分けて確かめられるよう公開する。
 */
export function buildObservationPattern(helperNames: string[]): RegExp {
  const alternatives = [
    ...OBSERVATION_PREFIX_WORDS.map((word) => `${escapeRegExp(word)}\\w*`),
    ...OBSERVATION_EXACT_WORDS.map(escapeRegExp),
    ...helperNames.map(escapeRegExp),
  ];
  return new RegExp(`\\b(${alternatives.join('|')})\\b`);
}

/** 走査が実際に用いている観測の語彙（取り込んだ名前と、そこから組んだ正規表現の対） */
export interface ObservationVocabulary {
  /** `e2e/helpers/` から自動で取り込んだ真偽を返す関数の名前 */
  readonly helperNames: readonly string[];
  /** 基礎語彙と `helperNames` から組んだ、走査が実際に用いる正規表現 */
  readonly pattern: RegExp;
}

let observationVocabulary: ObservationVocabulary | undefined;

/**
 * 走査が実際に用いる観測の語彙。`e2e/helpers/` の走査結果を取り込むため遅延して組み立てる。
 * 走査のたびに読み直す必要は無いので一度だけ組む。
 *
 * 取り込んだ名前を `pattern` と対で公開するのは、自己検査が「部品が動くこと」ではなく
 * **走査本体への結線**を主張できるようにするため。部品（`collectBooleanHelperNames` /
 * `buildObservationPattern`）を個別に呼ぶだけの確認では、両者を繋ぐ一行が失われても
 * 気づけない。それは本タスクが潰そうとしている「書き換え漏れが静かな無検出になる」形
 * そのものなので、結線の結果をここから観測できる形にしておく。
 */
export function getObservationVocabulary(): ObservationVocabulary {
  if (!observationVocabulary) {
    const helperNames = collectBooleanHelperNames();
    observationVocabulary = { helperNames, pattern: buildObservationPattern(helperNames) };
  }
  return observationVocabulary;
}

export function getObservationPattern(): RegExp {
  return getObservationVocabulary().pattern;
}

/** 応答の項目参照を示す語 */
const RESPONSE_PATTERN = /\b(response|res|body|json|payload|detail|result|data|api)\w*\s*[.?[]/i;

/** await を伴う呼び出し（画面・API から結果を取り出す行為） */
const AWAIT_PATTERN = /\bawait\b/;

/** 失敗の握り潰し */
const SWALLOW_PATTERN = /\.catch\s*\(/;

/** 局所変数の追跡で辿る深さの上限（循環・過剰展開の防止） */
const RESOLVE_DEPTH_LIMIT = 4;

// ============================================================================
// 走査
// ============================================================================

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectFiles(full, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out.sort();
}

/** 式の最も内側の識別子を取り出す（`expect(x).not.toBe` → `expect`） */
function rootIdentifier(node: ts.Node): ts.Node {
  let current = node;
  for (;;) {
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      current = current.expression;
    } else if (ts.isCallExpression(current)) {
      current = current.expression;
    } else if (ts.isAwaitExpression(current) || ts.isParenthesizedExpression(current)) {
      current = current.expression;
    } else {
      return current;
    }
  }
}

export function isExpectCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const root = rootIdentifier(node.expression);
  return ts.isIdentifier(root) && root.text === 'expect';
}

/** 検証が実行される呼び出し（expect の matcher 呼び出し） */
export function containsAssertion(node: ts.Node): boolean {
  return containsNode(node, (n) => isExpectCall(n));
}

/** 前提が満たせないときに失敗させる構造（throw / expect.fail / test.fail） */
export function containsFailure(node: ts.Node): boolean {
  return containsNode(node, (n) => {
    if (ts.isThrowStatement(n)) return true;
    if (ts.isCallExpression(n)) {
      const text = n.expression.getText();
      return text === 'expect.fail' || text === 'test.fail';
    }
    return false;
  });
}

function containsNode(node: ts.Node, predicate: (n: ts.Node) => boolean): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (predicate(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** ブラウザ側で評価する関数を受け取る呼び出し（内側は判定・抽出の実装そのもの） */
const EVALUATE_CALLEES = new Set([
  'evaluate',
  'evaluateAll',
  'evaluateHandle',
  'waitForFunction',
  '$eval',
  '$$eval',
]);

/** テスト本体・フックの実行単位を受け取る呼び出し（述語ヘルパーの探索の打ち切り地点） */
const TEST_BODY_CALLEES = new Set([
  'test',
  'it',
  'describe',
  'test.step',
  'test.describe',
  'test.beforeAll',
  'test.afterAll',
  'test.beforeEach',
  'test.afterEach',
  'test.describe.serial',
  'test.describe.parallel',
  'beforeAll',
  'afterAll',
  'beforeEach',
  'afterEach',
]);

/**
 * 真偽の値を持つ式か（述語ヘルパーの判定に用いる）。
 *
 * 識別子は辿らない。辿ると「真偽を返す関数」の範囲が曖昧に広がり、
 * 除外して良い形と紛らわしい形の区別が付かなくなるためである。
 */
function isBooleanValued(node: ts.Expression): boolean {
  const inner = unwrapParentheses(node);
  if (ts.isAwaitExpression(inner)) return isBooleanValued(inner.expression);
  if (inner.kind === ts.SyntaxKind.TrueKeyword || inner.kind === ts.SyntaxKind.FalseKeyword) {
    return true;
  }
  if (ts.isPrefixUnaryExpression(inner) && inner.operator === ts.SyntaxKind.ExclamationToken) {
    return true;
  }
  if (ts.isTypeOfExpression(inner)) return false;
  if (ts.isConditionalExpression(inner)) {
    return isBooleanValued(inner.whenTrue) && isBooleanValued(inner.whenFalse);
  }
  if (ts.isBinaryExpression(inner)) {
    const kind = inner.operatorToken.kind;
    if (COMPARISON_OPERATORS.has(kind)) return true;
    if (
      kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      kind === ts.SyntaxKind.BarBarToken ||
      kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return isBooleanValued(inner.left) && isBooleanValued(inner.right);
    }
    return false;
  }
  if (ts.isCallExpression(inner)) {
    if (ts.isIdentifier(inner.expression) && inner.expression.text === 'Boolean') return true;
    if (ts.isPropertyAccessExpression(inner.expression)) {
      const name = inner.expression.name.text;
      if (IMMEDIATE_PREDICATES.includes(name)) return true;
      if (['some', 'every', 'includes', 'startsWith', 'endsWith', 'test', 'has'].includes(name)) {
        return true;
      }
    }
    return false;
  }
  return false;
}

/** 型注釈が真偽（または真偽の Promise）か */
function isBooleanTypeNode(type: ts.TypeNode | undefined): boolean {
  if (!type) return false;
  if (type.kind === ts.SyntaxKind.BooleanKeyword) return true;
  if (ts.isTypeReferenceNode(type) && type.typeName.getText() === 'Promise') {
    return isBooleanTypeNode(type.typeArguments?.[0]);
  }
  return false;
}

/** 当該の関数が自ら持つ return 文（入れ子の関数の内側は辿らない） */
function ownReturnStatements(fn: ts.SignatureDeclaration): ts.ReturnStatement[] {
  const body = (fn as ts.FunctionLikeDeclaration).body;
  if (!body || !ts.isBlock(body)) return [];
  const found: ts.ReturnStatement[] = [];
  const visit = (n: ts.Node): void => {
    if (n !== body && ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n)) found.push(n);
    ts.forEachChild(n, visit);
  };
  visit(body);
  return found;
}

/**
 * 真偽を返す関数の本体か。**命名ではなく構造で判定する。**
 *
 * `hasX` / `isX` のような命名で判定してはならない。段1 で「ガードが見張る値と
 * テストが実際に使う値が違っていた」実例があり、名前は構造の保証にならない。
 *
 * 次のいずれかを満たす場合に真とする。
 *   - 戻り値の型注釈が `boolean` / `Promise<boolean>` である
 *   - 本体が式である矢印関数で、その式が真偽の値を持つ
 *   - 自らの return 文が一つ以上あり、そのすべてが真偽の値を返す
 */
function isBooleanReturningFunction(fn: ts.SignatureDeclaration): boolean {
  if (isBooleanTypeNode(fn.type)) return true;
  const body = (fn as ts.FunctionLikeDeclaration).body;
  if (!body) return false;
  if (!ts.isBlock(body)) return isBooleanValued(body as ts.Expression);
  const returns = ownReturnStatements(fn);
  if (returns.length === 0) return false;
  return returns.every((r) => r.expression !== undefined && isBooleanValued(r.expression));
}

/** 呼び出しの被呼び出し名（`page.evaluate` → `evaluate`、`test.step` → `test.step`） */
function calleeNames(call: ts.CallExpression): { last: string; full: string } {
  const full = call.expression.getText();
  const last = ts.isPropertyAccessExpression(call.expression)
    ? call.expression.name.text
    : ts.isIdentifier(call.expression)
      ? call.expression.text
      : '';
  return { last, full };
}

/**
 * 判定そのものを実装している文脈の内側か（計画 §6 の除外条件 (3)）。
 *
 * 該当する場合はその細目を、しない場合は `undefined` を返す。
 * 判定は構文木の形のみで行い、識別子の綴りは一切見ない。
 *
 * 内側の関数から外側へ辿り、テスト本体・フックの実行単位に達した時点で打ち切る
 * （そこから先はテストの本体であり、述語の実装ではないため）。
 */
function booleanPredicateContext(node: ts.Node): string | undefined {
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (!ts.isFunctionLike(current)) continue;
    const parent = current.parent;
    if (parent && ts.isCallExpression(parent) && parent.arguments.some((a) => a === current)) {
      const { last, full } = calleeNames(parent);
      if (EVALUATE_CALLEES.has(last)) {
        return isBooleanReturningFunction(current)
          ? 'evaluate:真偽を返す'
          : 'evaluate:真偽を返さない';
      }
      if (TEST_BODY_CALLEES.has(full) || TEST_BODY_CALLEES.has(last)) return undefined;
      if (isBooleanReturningFunction(current)) return '述語:引数として渡す関数';
      continue;
    }
    if (isBooleanReturningFunction(current)) return '述語:名前に束ねた関数';
  }
  return undefined;
}

/** 当該の分岐が自ら持つ return 文（入れ子の関数の内側は辿らない） */
function ownReturnsIn(statement: ts.Statement): ts.ReturnStatement[] {
  const found: ts.ReturnStatement[] = [];
  const visit = (n: ts.Node): void => {
    if (n !== statement && ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n)) found.push(n);
    ts.forEachChild(n, visit);
  };
  visit(statement);
  return found;
}

/**
 * 【検出器の規則による対象外 (1)】判定・抽出の実装そのものである分岐か。
 *
 * 計画（e2e-assertion-guard-reduction-plan.md）§6 の除外条件 (3)
 * 「判定そのものを実装している述語ヘルパーの内部」に、構造上必ず該当する形だけを外す。
 * 該当する場合は理由を、しない場合は `undefined` を返す。
 *
 * 次のすべてを満たす場合に限る。**識別子の綴りは一切見ない。**
 *   (a) `if` 文であり、その内側（then / else の全体）に **expect が一つも無い**。
 *       主張を包む分岐は「判定の実装」ではなく検証の無効化であるため、ここで必ず落ちる。
 *   (b) then 節が脱出だけで構成される（`return` / `continue` / `break`）。
 *       すなわち分岐の役目は「この関数の値を決めること」に尽きる。
 *   (c) 外側が (i) 真偽を返す関数、または (ii) ブラウザ側で評価される関数
 *       （`evaluate` 族）である。(i) の場合は then 節の return がすべて真偽の値であること。
 *
 * **なぜこれが「抑止」ではないか**: 述語は false を返す経路を必ず持つ。
 * その `return false` を数えることは「述語が述語であること」を欠陥として数えることに等しい。
 * 一方、その真偽を**呼び出し側がどう扱うか**は関門であり、呼び出し側の
 * `if (await hasX())` は従来どおり検出される。したがって債務は移動しない。
 * (a) の条件があるため、述語の内部であっても主張を条件で包んでいれば検出は残る。
 */
export function predicateImplementationExclusion(node: ts.Node): string | undefined {
  if (!ts.isIfStatement(node)) return undefined;
  if (containsAssertion(node)) return undefined;
  if (!isSilentExit(node.thenStatement)) return undefined;
  const context = booleanPredicateContext(node);
  if (!context) return undefined;
  if (context.startsWith('evaluate')) {
    return `ブラウザ側で評価される関数の内側で値を決める分岐（${context}）`;
  }
  const returns = ownReturnsIn(node.thenStatement);
  if (returns.length === 0) return undefined;
  if (!returns.every((r) => r.expression !== undefined && isBooleanValued(r.expression))) {
    return undefined;
  }
  return `真偽を返す関数の内側で真偽を決める分岐（${context}）`;
}

/**
 * 分岐の到達しうる終端がすべて「throw する」か「主張する」か。
 *
 * 入れ子の `if` は else を伴う場合に限り再帰する（else が無ければ素通りする経路が残るため）。
 */
function alwaysFailsOrAsserts(statement: ts.Statement): boolean {
  const list = ts.isBlock(statement) ? [...statement.statements] : [statement];
  for (const s of list) {
    if (ts.isThrowStatement(s)) return true;
    if (ts.isExpressionStatement(s) && containsAssertion(s)) return true;
    if (
      ts.isIfStatement(s) &&
      s.elseStatement &&
      alwaysFailsOrAsserts(s.thenStatement) &&
      alwaysFailsOrAsserts(s.elseStatement)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 【検出器の規則による対象外 (2)】どの経路でも throw か主張に到達する分岐か。
 *
 * 計画 §6 の除外条件 (1)「条件が偽なら直後に throw / 無条件の主張で落ちる」に
 * 構造上必ず該当する形だけを外す。
 *
 * 次のすべてを満たす場合に限る。
 *   (a) `if` 文であり `else` を持つ（else が無ければ素通りする経路が残る）。
 *   (b) then / else の双方について、到達しうる終端がすべて throw か無条件の主張である。
 *   (c) その内側に throw が少なくとも一つある。
 *
 * (c) を課すのは、throw を含まない全域分岐（計画の G 群）を巻き込まないためである。
 * G 群の正当性は「どの経路でも**同等の**検証・操作が実行される」という中身の判断を要し、
 * 構造だけでは決められない（計画 §6 の条件 (2)。段7 で一件ずつ扱う）。
 * throw は中身の判断を要さない無条件の失敗であるため、ここだけを構造で外せる。
 */
export function guaranteedFailureExclusion(node: ts.Node): string | undefined {
  if (!ts.isIfStatement(node)) return undefined;
  if (!node.elseStatement) return undefined;
  if (!containsNode(node, (n) => ts.isThrowStatement(n))) return undefined;
  if (!alwaysFailsOrAsserts(node.thenStatement)) return undefined;
  if (!alwaysFailsOrAsserts(node.elseStatement)) return undefined;
  return 'どの経路でも throw か無条件の主張に到達する分岐';
}

/** テスト本体・フックとして渡された関数か（`test('...', async () => {...})` の本体） */
function isTestBodyFunction(fn: ts.Node): boolean {
  const parent = fn.parent;
  if (!parent || !ts.isCallExpression(parent)) return false;
  if (!parent.arguments.some((a) => a === fn)) return false;
  const { last, full } = calleeNames(parent);
  return TEST_BODY_CALLEES.has(full) || TEST_BODY_CALLEES.has(last);
}

/** 節点を囲む最も内側の関数がテスト本体でない（値を作る補助である）か */
function insideNonTestFunction(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n)) return !isTestBodyFunction(n);
  }
  return false;
}

/**
 * 【検出器の規則による対象外 (3)】値を作る補助が値を返す分岐か。
 *
 * 計画 §6 の除外条件 (3)「判定そのものを実装している補助の内部」を、真偽以外を返す
 * 補助（抽出・遷移）まで同じ理屈で広げたものである。
 *
 * 次のすべてを満たす場合に限る。**識別子の綴りは一切見ない。**
 *   (a) `if` 文であり、その内側に **expect が一つも無い**（主張を包む分岐はここで落ちる）。
 *   (b) then 節が沈黙して抜ける形であり、その終端が **値を伴う `return`** である。
 *   (c) その分岐を囲む最も内側の関数が**テスト本体ではない**（補助の内部である）。
 *
 * **なぜこれが「抑止」ではないか**: 値を返す関数が値を返す経路を持つのは、その関数が
 * 関数であることそのものである。`return <値>` はテストの流れを放棄しておらず、
 * 呼び出し側へ結果を渡している。債務は呼び出し側がその値をどう扱うかにあり、
 * 呼び出し側の `if (await navigateTo...())` は従来どおり検出される（A 群と同じ理屈）。
 *
 * テスト本体の中の `return;`（値を伴わない）は、以降の検証が丸ごと実行されない
 * 真正の沈黙脱出であり、この規則には当たらない
 * （`e2e/specs/quantity-tables/import-e2e.spec.ts:809` がその実例）。
 *
 * Task 115.137 の査読で、沈黙脱出の見極めを広げた結果、補助の中の
 * `return <値>`（`e2e/specs/auth/password-reset.spec.ts:587` の受信メールの取り出し、
 * `e2e/specs/quantity-tables/import-e2e.spec.ts:132` の遷移補助）が
 * 誤検出になっていたため加えた。
 */
export function valueProducingExitExclusion(node: ts.Node): string | undefined {
  if (!ts.isIfStatement(node)) return undefined;
  if (containsAssertion(node)) return undefined;
  if (!isSilentExit(node.thenStatement)) return undefined;
  const list = ts.isBlock(node.thenStatement)
    ? [...node.thenStatement.statements]
    : [node.thenStatement];
  const terminal = list[list.length - 1];
  if (!terminal || !ts.isReturnStatement(terminal) || !terminal.expression) return undefined;
  if (!insideNonTestFunction(node)) return undefined;
  return '値を作る補助が値を返す分岐（検証からの脱出ではない）';
}

/**
 * 検出器の規則による対象外。該当する場合は理由を返す。
 *
 * 注釈（`e2e-guard-allow`）による除外と違い、こちらは**そもそも欠陥ではない構造**を
 * 検出器が誤って拾っていた分である（計画 §5 の A 群・B 群、Task 115.127 段3）。
 * 規則を戻すと自己検査（check-e2e-assertion-guards.selftest.ts）が落ちる。
 */
export function ruleBasedExclusion(node: ts.Node): string | undefined {
  return (
    predicateImplementationExclusion(node) ??
    guaranteedFailureExclusion(node) ??
    valueProducingExitExclusion(node)
  );
}

/** 制御を分岐の外へ出す文か（return / continue / break / test.skip / test.fixme） */
function isExitStatement(statement: ts.Statement): boolean {
  if (ts.isReturnStatement(statement)) return true;
  if (ts.isContinueStatement(statement)) return true;
  if (ts.isBreakStatement(statement)) return true;
  if (ts.isExpressionStatement(statement)) {
    const text = statement.expression.getText();
    return text.startsWith('test.skip') || text.startsWith('test.fixme');
  }
  return false;
}

/**
 * `break` / `continue` が抜ける繰り返し。
 *
 * 判定できない形（ラベル付き、`switch` を挟む、関数の境界に達する）では `undefined` を返す。
 * 判定できない場合は検出を残す側（沈黙脱出として扱う側）へ倒す。
 */
function enclosingLoop(statement: ts.BreakOrContinueStatement): ts.IterationStatement | undefined {
  if (statement.label) return undefined; // ラベル付きは抜ける先を構造だけでは決められない
  for (let n: ts.Node | undefined = statement.parent; n; n = n.parent) {
    if (ts.isIterationStatement(n, /* lookInLabeledStatements */ false)) return n;
    // `switch` の中の `break` は繰り返しではなく `switch` を抜ける
    if (ts.isSwitchStatement(n) && ts.isBreakStatement(statement)) return undefined;
    if (ts.isFunctionLike(n)) return undefined;
  }
  return undefined;
}

/** 文（またはブロック）の直下に throw があるか（前提が崩れたら必ず落ちる関門） */
function throwsDirectly(statement: ts.Statement): boolean {
  const list = ts.isBlock(statement) ? [...statement.statements] : [statement];
  return list.some((s) => ts.isThrowStatement(s));
}

/**
 * 続く文の並びが「観測の結果を無条件に検査する」か。
 *
 * 次のいずれかが並びの中にあれば真とする。
 *   (a) 無条件の主張（`expect(found).toBe(true)` / `await expect(...).toBeVisible()`）
 *   (b) 無条件の throw
 *   (c) `else` を持たない分岐で、その本体が必ず throw する（`if (!found) { throw ... }`）
 *   (d) `else` を持つ分岐で、どちらの経路も throw か主張に至る
 */
function checksOutcome(list: readonly ts.Statement[]): boolean {
  for (const s of list) {
    if (ts.isThrowStatement(s)) return true;
    if (ts.isExpressionStatement(s) && containsAssertion(s)) return true;
    if (ts.isVariableStatement(s) && containsAssertion(s)) return true;
    if (ts.isIfStatement(s)) {
      if (!s.elseStatement) {
        if (throwsDirectly(s.thenStatement)) return true;
        continue;
      }
      if (alwaysFailsOrAsserts(s.thenStatement) && alwaysFailsOrAsserts(s.elseStatement)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 【誤検出の抑止】探索・再試行の繰り返しから抜けるだけの `break` / `continue` か。
 *
 * `break` / `continue` は**繰り返しを抜けるだけ**であり、テストからは抜けない。
 * 抜けた先で観測の結果が無条件に検査されていれば、検証は一つも飛んでいない。
 *
 *     let found = false;
 *     for (let i = 0; i < rowCount; i++) {
 *       const rowText = await rows.nth(i).textContent();
 *       if (rowText?.includes(TARGET)) {
 *         found = true;
 *         break;            // ← 繰り返しを抜けるだけ
 *       }
 *     }
 *     expect(found).toBe(true);   // ← 観測が偽なら必ず失敗する
 *
 * **これは削減計画が E 群の是正先として推奨している形そのものである。**
 * 沈黙脱出の見極めを「本体の終端が脱出であること」へ広げた際、この定型が丸ごと
 * 誤検出になった（Task 115.137 の査読で判明。誤検出 16 件）。正しい書き方を
 * 負債として数えてはならないため、繰り返しを抜けた先の検査を見て除く。
 *
 * **`isExitStatement` から `break` / `continue` を外す案は採らなかった。**
 * 実測では、その案でも今日の走査結果は本規則と同じ箇所（誤検出だった三件）しか動かない。
 * 違いが出るのは将来である。その案は「抜けた先で結果を一切検査しない `break` / `continue`」
 * （`if (!(await row.isVisible())) continue;` だけで終わる形）まで一律に無検出にするため、
 * E 群の是正先として推奨した形が劣化したときに検出できない。本規則は劣化した形を残す。
 */
function escapesCheckedLoop(statement: ts.Statement): boolean {
  if (!ts.isBreakStatement(statement) && !ts.isContinueStatement(statement)) return false;
  const loop = enclosingLoop(statement);
  if (!loop) return false;
  const parent = loop.parent;
  if (!parent || !ts.isBlock(parent)) return false;
  const index = parent.statements.indexOf(loop as ts.Statement);
  if (index < 0) return false;
  return checksOutcome(parent.statements.slice(index + 1));
}

/**
 * 分岐の本体が「黙って抜ける」か。
 *
 * **「脱出の文だけで構成される」ではなく「脱出で終わり、その途中で主張も失敗もしない」**
 * を条件とする（Task 115.137）。
 *
 * 以前は本体の**すべての文**が脱出であることを求めていた。この形は、脱出の直前に
 * 後始末や記録が一つでも挟まると成立せず、沈黙して抜ける経路が丸ごと無検出になっていた。
 * 実例（`e2e/specs/quantity-tables/import-e2e.spec.ts:809`）:
 *
 *     if (!(await isVisibleWithin(groupButton, getTimeout(3000)))) {
 *       const cancelBtn = dialog.getByRole('button', { name: 'キャンセル' }).last();
 *       if (await isVisibleWithin(cancelBtn, getTimeout(2000))) {
 *         await cancelBtn.click();   // ← 後始末が挟まるだけで無検出になっていた
 *       }
 *       return;                      // ← 以降の検証は丸ごと実行されない
 *     }
 *
 * 検証が飛ぶかどうかを決めるのは「途中に何が書かれているか」ではなく、
 * 「主張も失敗もせずに制御が抜けるか」である。したがって次を条件とする。
 *   (a) 本体の終端が脱出の文である（そこで必ず分岐の外へ出る）
 *   (b) 本体のどこにも主張（expect）が無い
 *   (c) 本体のどこにも失敗（throw / expect.fail / test.fail）が無い
 *
 * (b)(c) があるため、後始末の途中で必ず落ちる形や、抜ける前に主張する形は含まれない。
 * 終端が脱出でない形（`if (x) return;` で終わる等、素通りする経路が残る形）も含まれない。
 *
 * さらに (d) として、終端が `break` / `continue` であり、抜けた繰り返しの後で観測の結果が
 * 無条件に検査される形を除く（Task 115.137 の査読。詳細は escapesCheckedLoop を参照）。
 * `break` / `continue` は繰り返しを抜けるだけでテストからは抜けないため、
 * これを一律に「検証からの脱出」とみなすと、探索・再試行の正しい定型が誤検出になる。
 */
export function isSilentExit(statement: ts.Statement): boolean {
  const statements = ts.isBlock(statement) ? [...statement.statements] : [statement];
  if (statements.length === 0) return false;
  const terminal = statements[statements.length - 1]!;
  if (!isExitStatement(terminal)) return false;
  // 繰り返しを抜けるだけで、抜けた先で結果が無条件に検査される形は沈黙脱出ではない
  if (escapesCheckedLoop(terminal)) return false;
  if (containsAssertion(statement)) return false;
  if (containsFailure(statement)) return false;
  return true;
}

/** 比較の演算子（比較そのものは実質のある検証なので恒真とはみなさない） */
const COMPARISON_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.InstanceOfKeyword,
  ts.SyntaxKind.InKeyword,
]);

/** 代入の演算子か（`=` および複合代入） */
function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function unwrapParentheses(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

/**
 * 偽値のリテラルか。
 *
 * `x ?? null` や `x || ''` のように既定値として偽値を補う形は、
 * 真偽の主張（toBeTruthy）を骨抜きにしない。左辺が偽なら結果も偽であり、
 * 主張はそのまま左辺に対して働くためである。
 */
function isFalsyLiteral(node: ts.Expression): boolean {
  const inner = unwrapParentheses(node);
  if (inner.kind === ts.SyntaxKind.NullKeyword) return true;
  if (inner.kind === ts.SyntaxKind.FalseKeyword) return true;
  if (ts.isIdentifier(inner) && inner.text === 'undefined') return true;
  if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) {
    return inner.text === '';
  }
  if (ts.isNumericLiteral(inner)) return Number(inner.text) === 0;
  return false;
}

/** 型判定を直接の被演算子に持つか（`typeof x === 'number'` の判別） */
function hasTypeOfOperand(node: ts.BinaryExpression): boolean {
  return (
    ts.isTypeOfExpression(unwrapParentheses(node.left)) ||
    ts.isTypeOfExpression(unwrapParentheses(node.right))
  );
}

/**
 * 恒真になり得る式か。
 *
 * 対象は次の三つに限る。
 * - リテラルそのもの（`expect(true)`）
 * - 型判定（`typeof x === 'number'`。実行時の値ではなく静的な型に依存する）
 * - 論理和・既定値（`expect(A || B)`。どちらの結果でも通るため観測を検証していない）
 *
 * 比較（`a === b`、`a <= b` 等）は実質のある検証なので含めない。被演算子へ再帰すると
 * `x === 304` のようなリテラル比較まで恒真として数えてしまうため、比較の形を見つけた
 * 時点で打ち切る（型判定を被演算子に持つ場合のみ例外とする）。
 * これにより `a === null || a.ok() || a.status() === 304` のように
 * 「比較を含むが全体としては恒真」な論理和は従来どおり検出される。
 *
 * 既定値として偽値を補うだけの形（`match?.[1] ?? null`）も、真偽の主張を
 * 骨抜きにしないため恒真とはみなさない。
 */
function isVacuousBoolean(node: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(node)) return isVacuousBoolean(node.expression);
  if (ts.isTypeOfExpression(node)) return true;
  if (ts.isBinaryExpression(node)) {
    const kind = node.operatorToken.kind;
    if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken) {
      if (isFalsyLiteral(node.right)) return isVacuousBoolean(node.left);
      return true;
    }
    if (COMPARISON_OPERATORS.has(kind)) return hasTypeOfOperand(node);
    if (isAssignmentOperator(kind)) return false;
    return isVacuousBoolean(node.left) || isVacuousBoolean(node.right);
  }
  return (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    ts.isNumericLiteral(node) ||
    ts.isStringLiteral(node)
  );
}

/**
 * 代入の右辺のうち、恒真の主題として評価してよい形か。
 *
 * 後から代入される名前については、宣言時の仮置きの値を主題にしてはならない
 * （`let accessToken = ''`）。しかし代入の右辺まで一律に打ち切ると、
 * `let errorFound = false; errorFound = a || b;` のように代入した式そのものが
 * 恒真である形を取り逃がす。そこで右辺の形を見て次の二つに限り評価する。
 *
 * - 論理和・既定値（`a || b` / `a ?? b`。右辺が偽値のリテラルである既定値は除く）
 * - 型判定（`typeof x === 'number'` / `typeof x`）
 *
 * 真偽のリテラルの単純な代入（`flag = true`）は評価しない。
 * `let downloadHappened = false; … downloadHappened = true;` のように、
 * 事象の発生を記録して検証する観測フラグが正当な用法として多数を占めるためである。
 */
function isEvaluableAssignment(node: ts.Expression): boolean {
  const inner = unwrapParentheses(node);
  if (ts.isTypeOfExpression(inner)) return true;
  if (ts.isBinaryExpression(inner)) {
    const kind = inner.operatorToken.kind;
    if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken) {
      return !isFalsyLiteral(inner.right);
    }
    if (COMPARISON_OPERATORS.has(kind)) return hasTypeOfOperand(inner);
  }
  return false;
}

/**
 * 条件付きスキップか（`test.skip(<式>, ...)` / `test.fixme(<式>, ...)`）
 *
 * 引数なしの呼び出し（`test.skip()`）も対象とする。条件分岐の内側で呼ぶ形は
 * 条件式を渡す形と効果が同一であり、無条件に呼ぶ形は検証そのものの放棄であるため、
 * どちらも「前提が満たせない場合に沈黙して飛ばす」型に属する（Task 115.127 段0）。
 */
function isConditionalSkip(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression.getText(sourceFile);
  if (callee !== 'test.skip' && callee !== 'test.fixme') return false;
  const first = node.arguments[0];
  // 引数なしの飛ばし（`test.skip();`）。条件分岐の内側／外側を問わず検証が消える
  if (!first) return true;
  // タイトル指定（文字列）や実行条件の宣言（関数）は対象外
  if (ts.isStringLiteralLike(first) || ts.isTemplateExpression(first)) return false;
  if (ts.isArrowFunction(first) || ts.isFunctionExpression(first)) return false;
  return true;
}

export function scanFile(absPath: string): ScanResult {
  return scanSource(path.relative(ROOT, absPath), fs.readFileSync(absPath, 'utf8'));
}

/**
 * e2e 配下の走査対象ファイル（分類走査から同じ集合を辿るために公開する）。
 *
 * `SCAN_SUBDIRS` の説明のとおり、テストの実行中に働くものだけを走査する。
 * 走査対象のディレクトリが失われている場合は**黙って空にせず失敗させる**。
 * 走査対象が消えれば検出は静かにゼロへ近づき、検査は「通った」ように見えるためである。
 */
export function collectE2eFiles(): string[] {
  const files: string[] = [];
  for (const name of SCAN_SUBDIRS) {
    const dir = path.join(E2E_DIR, name);
    if (!fs.existsSync(dir)) {
      throw new Error(
        `走査対象のディレクトリが見つかりません: ${path.relative(ROOT, dir)}\n` +
          '走査対象が失われると検出は静かに消えます。SCAN_SUBDIRS を実態に合わせてください。'
      );
    }
    collectFiles(dir, files);
  }
  return files.sort();
}

/**
 * 走査本体。ファイルの内容そのものを受け取るため、検出規則の確認では
 * 任意の書き方を注入して結果を検証できる（scripts/check-e2e-assertion-guards.selftest.ts）。
 */
export function scanSource(relPath: string, source: string): ScanResult {
  const sourceFile = ts.createSourceFile(relPath, source, ts.ScriptTarget.Latest, true);
  const lines = source.split('\n');
  const findings: Finding[] = [];
  const findingNodes: ts.Node[] = [];
  const allowed: AllowEntry[] = [];
  const invalidAllows: AllowEntry[] = [];

  const lineOf = (node: ts.Node): number =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const snippetOf = (node: ts.Node): string =>
    node.getText(sourceFile).split('\n')[0]!.trim().slice(0, 110);

  // --------------------------------------------------------------------------
  // 局所変数の表（同名は併合する）
  //
  // 初期化子を伴う宣言のほか、次の二つの書き方も同じ表に載せる。
  //   - 分割して受ける形（`const { ok } = await res.json()` / `const [a] = await ...`）
  //   - 宣言と代入を分ける形（`let id: string;` … `id = await createProject()`）
  // 後者は上位の有効範囲での宣言と組み合わさる用例が多く、表に載せないと
  // `if (!id) { return; }` のような沈黙して終える構造が無検出になる。
  // --------------------------------------------------------------------------
  //
  // 表は「宣言の初期化子」と「代入の右辺」に分ける。分類（T1/T4/T5）では双方を
  // 同じように展開するが、T3 の主題の判断では扱いが異なるためである（後述）。
  // --------------------------------------------------------------------------
  /** 宣言の初期化子（分割して受ける形を含む） */
  const declTable = new Map<string, ts.Expression[]>();
  /** 代入の右辺（`id = await createProject()` の右辺） */
  const assignTable = new Map<string, ts.Expression[]>();
  /** 後から代入される名前（宣言時の値を主題の判断に用いない） */
  const reassigned = new Set<string>();
  {
    const register = (
      table: Map<string, ts.Expression[]>,
      name: string,
      expression: ts.Expression
    ): void => {
      const list = table.get(name) ?? [];
      list.push(expression);
      table.set(name, list);
    };
    const registerBinding = (name: ts.BindingName, expression: ts.Expression): void => {
      if (ts.isIdentifier(name)) {
        register(declTable, name.text, expression);
        return;
      }
      for (const element of name.elements) {
        if (ts.isOmittedExpression(element)) continue;
        registerBinding(element.name, expression);
      }
    };
    const collect = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && n.initializer) {
        registerBinding(n.name, n.initializer);
      }
      if (ts.isBinaryExpression(n) && isAssignmentOperator(n.operatorToken.kind)) {
        const target = unwrapParentheses(n.left);
        if (ts.isIdentifier(target)) {
          reassigned.add(target.text);
          if (n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            register(assignTable, target.text, n.right);
          }
        }
      }
      if (
        (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
        (n.operator === ts.SyntaxKind.PlusPlusToken ||
          n.operator === ts.SyntaxKind.MinusMinusToken) &&
        ts.isIdentifier(n.operand)
      ) {
        reassigned.add(n.operand.text);
      }
      ts.forEachChild(n, collect);
    };
    collect(sourceFile);
  }

  /** 式に現れる識別子の初期化子を展開した文字列（分類に用いる） */
  const expandedText = (node: ts.Node): string => {
    const parts = [node.getText(sourceFile)];
    const seen = new Set<string>();
    const walk = (n: ts.Node, depth: number): void => {
      if (depth > RESOLVE_DEPTH_LIMIT) return;
      const visitIdentifiers = (m: ts.Node): void => {
        if (ts.isIdentifier(m) && !seen.has(m.text)) {
          const values = [...(declTable.get(m.text) ?? []), ...(assignTable.get(m.text) ?? [])];
          if (values.length > 0) {
            seen.add(m.text);
            for (const value of values) {
              parts.push(value.getText(sourceFile));
              walk(value, depth + 1);
            }
          }
        }
        ts.forEachChild(m, visitIdentifiers);
      };
      visitIdentifiers(n);
    };
    walk(node, 0);
    return parts.join(' ');
  };

  /**
   * 判定の主題が恒真になり得るか（識別子は値の出どころまで辿る）。
   *
   * 後から代入される名前は、宣言時の値を辿らない。`let accessToken = ''` のように
   * 宣言時の値が仮置きで、代入後の値を検証する形が正当な主張であるため。
   * 一方で代入の右辺は、その形自体が恒真になり得るもの（論理和・既定値・型判定）に
   * 限って評価する。`let ok = false; ok = a || b;` は宣言時の値ではなく代入した式が
   * 恒真なのであり、同じ式を `const` で書いた場合と扱いを変える理由が無いためである。
   */
  const isVacuousSubject = (node: ts.Expression, depth = 0): boolean => {
    if (ts.isParenthesizedExpression(node)) return isVacuousSubject(node.expression, depth);
    if (ts.isAwaitExpression(node)) return isVacuousSubject(node.expression, depth);
    if (isVacuousBoolean(node)) return true;
    if (ts.isIdentifier(node) && depth < RESOLVE_DEPTH_LIMIT) {
      if (reassigned.has(node.text)) {
        for (const assigned of assignTable.get(node.text) ?? []) {
          if (isEvaluableAssignment(assigned) && isVacuousSubject(assigned, depth + 1)) return true;
        }
        return false;
      }
      for (const initializer of declTable.get(node.text) ?? []) {
        if (isVacuousSubject(initializer, depth + 1)) return true;
      }
    }
    return false;
  };

  const isObservation = (text: string): boolean =>
    getObservationPattern().test(text) || AWAIT_PATTERN.test(text) || SWALLOW_PATTERN.test(text);

  /** 条件式の分類（局所変数を挟んだ形も直接記述と同等に扱う） */
  const classifyCondition = (node: ts.Node): GuardType => {
    const text = expandedText(node);
    if (isObservation(text)) return 'T5-observed-result-gate';
    if (RESPONSE_PATTERN.test(text)) return 'T4-response-field-gate';
    return 'T1-conditional-expect';
  };

  /** 条件式が観測または応答参照を運ぶか（黙って抜ける分岐の判定に用いる） */
  const carriesObservation = (node: ts.Node): boolean => {
    const text = expandedText(node);
    return isObservation(text) || RESPONSE_PATTERN.test(text);
  };

  // --------------------------------------------------------------------------
  // 除外注釈（理由必須）
  // --------------------------------------------------------------------------
  /** 直前の非空行の除外注釈。marked=注釈あり、reason=注釈に続く理由 */
  const allowAnnotation = (line: number): { marked: boolean; reason: string } => {
    for (let i = line - 2; i >= 0; i -= 1) {
      const text = lines[i]!.trim();
      if (text === '') continue;
      const index = text.indexOf(ALLOW_MARKER);
      if (index === -1) return { marked: false, reason: '' };
      return { marked: true, reason: text.slice(index + ALLOW_MARKER.length).trim() };
    }
    return { marked: false, reason: '' };
  };

  const push = (node: ts.Node, type: GuardType, snippetNode?: ts.Node): void => {
    // 検出器の規則による対象外（欠陥ではない構造の誤検出を外す。Task 115.127 段3）。
    // 注釈による除外と違い件数にも残さない。詳細は ruleBasedExclusion の説明を参照。
    if (ruleBasedExclusion(node)) return;
    const line = lineOf(node);
    const snippet = snippetOf(snippetNode ?? node);
    const { marked, reason } = allowAnnotation(line);
    if (marked && reason !== '') {
      allowed.push({ file: relPath, line, type, reason, snippet });
      return;
    }
    if (marked) {
      // 理由の無い注釈は除外として扱わない（検出は残したうえで検査を失敗させる）
      invalidAllows.push({ file: relPath, line, type, reason: '', snippet });
    }
    findings.push({ file: relPath, line, type, snippet });
    findingNodes.push(node);
  };

  const visit = (node: ts.Node): void => {
    // --- T2: 待機の指定を尊重しない判定 ---
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (IMMEDIATE_PREDICATES.includes(node.expression.name.text)) {
        const arg = node.arguments[0];
        if (
          arg &&
          ts.isObjectLiteralExpression(arg) &&
          arg.properties.some((p) => p.name?.getText(sourceFile) === 'timeout')
        ) {
          push(node, 'T2-ignored-timeout');
        }
      }
    }

    // --- T6: 条件付きスキップ ---
    if (isConditionalSkip(node, sourceFile)) {
      push(node, 'T6-conditional-skip');
    }

    // --- T3: 常に真になる判定 ---
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const matcher = node.expression.name.text;
      if (matcher === 'toBeTruthy' || matcher === 'toBeFalsy' || matcher === 'toBe') {
        let receiver: ts.Node = node.expression.expression;
        while (ts.isPropertyAccessExpression(receiver)) receiver = receiver.expression;
        if (
          ts.isCallExpression(receiver) &&
          ts.isIdentifier(receiver.expression) &&
          receiver.expression.text === 'expect'
        ) {
          const subject = receiver.arguments[0];
          const matcherArgIsBoolean =
            matcher !== 'toBe' ||
            (node.arguments.length === 1 &&
              (node.arguments[0]!.kind === ts.SyntaxKind.TrueKeyword ||
                node.arguments[0]!.kind === ts.SyntaxKind.FalseKeyword));
          if (subject && matcherArgIsBoolean && isVacuousSubject(subject)) {
            push(node, 'T3-tautology', receiver);
          }
        }
      }
    }

    // --- T1 / T4 / T5: 分岐による検証の無効化 ---
    if (ts.isIfStatement(node)) {
      const thenAsserts = containsAssertion(node.thenStatement);
      const elseAsserts = node.elseStatement ? containsAssertion(node.elseStatement) : false;
      const elseFails = node.elseStatement ? containsFailure(node.elseStatement) : false;
      const thenFails = containsFailure(node.thenStatement);

      // 前提が満たせないときに失敗させる分岐は正当な用途として扱う
      const isFailFast = thenFails && !thenAsserts;

      if (!isFailFast && (thenAsserts || elseAsserts) && !elseFails) {
        push(node, classifyCondition(node.expression), node.expression);
      } else if (!isFailFast && isSilentExit(node.thenStatement)) {
        // 観測結果を条件に黙って抜ける（検証本体に到達しない）
        if (carriesObservation(node.expression)) {
          push(node, classifyCondition(node.expression), node.expression);
        }
      }
    }

    // --- 論理短絡による検証の無効化 ---
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) &&
      containsAssertion(node.right) &&
      !containsAssertion(node.left)
    ) {
      push(node, classifyCondition(node.left), node.left);
    }

    // --- 三項で検証を包む形（if 文と同じく条件次第で検証本体に到達しない） ---
    if (ts.isConditionalExpression(node) && !containsAssertion(node.condition)) {
      const branchAsserts = containsAssertion(node.whenTrue) || containsAssertion(node.whenFalse);
      const branchFails = containsFailure(node.whenTrue) || containsFailure(node.whenFalse);
      if (branchAsserts && !branchFails) {
        push(node, classifyCondition(node.condition), node.condition);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { findings, allowed, invalidAllows, findingNodes };
}

// ============================================================================
// 基準との照合
// ============================================================================

function tally(findings: Finding[]): Baseline {
  const result: Baseline = {};
  for (const finding of findings) {
    const perFile = (result[finding.file] ??= {});
    perFile[finding.type] = (perFile[finding.type] ?? 0) + 1;
  }
  return result;
}

function tallyAllowed(allowed: AllowEntry[]): AllowBaseline {
  const result: AllowBaseline = {};
  for (const entry of allowed) {
    result[entry.file] = (result[entry.file] ?? 0) + 1;
  }
  return result;
}

function loadBaseline(): {
  files: Baseline;
  allowedFiles: AllowBaseline;
  generatedTotal: number;
  allowedTotal: number;
  reduction: ReductionPlan;
} {
  if (!fs.existsSync(BASELINE_PATH)) {
    return { files: {}, allowedFiles: {}, generatedTotal: 0, allowedTotal: 0, reduction: {} };
  }
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as {
    files?: Baseline;
    allowedFiles?: AllowBaseline;
    generatedTotal?: number;
    allowedTotal?: number;
    reduction?: ReductionPlan;
  };
  return {
    files: parsed.files ?? {},
    allowedFiles: parsed.allowedFiles ?? {},
    generatedTotal: parsed.generatedTotal ?? 0,
    allowedTotal: parsed.allowedTotal ?? 0,
    reduction: parsed.reduction ?? {},
  };
}

function writeBaseline(
  current: Baseline,
  total: number,
  allowedFiles: AllowBaseline,
  allowedTotal: number,
  reduction: ReductionPlan
): void {
  const ordered: Baseline = {};
  for (const file of Object.keys(current).sort()) {
    const perType: Partial<Record<GuardType, number>> = {};
    for (const type of GUARD_TYPES) {
      const count = current[file]![type];
      if (count) perType[type] = count;
    }
    ordered[file] = perType;
  }
  const orderedAllowed: AllowBaseline = {};
  for (const file of Object.keys(allowedFiles).sort()) {
    orderedAllowed[file] = allowedFiles[file]!;
  }
  const payload = {
    $comment: [
      'E2Eテストの「検証無効化」構造の既知件数（scripts/check-e2e-assertion-guards.ts）。',
      '件数が増えた場合、または一覧に無いファイルで検出された場合は検査が失敗する。',
      '是正して件数を減らしたら `npm run check:e2e-guards:update` で更新すること。',
      '正当な分岐は該当行の直前に `// e2e-guard-allow: <理由>` を置いて除外できる（理由は必須）。',
      'allowedFiles は除外注釈の件数。除外が増えた場合も検査は失敗する（差分として現れる）。',
      'ここに載っている件数は解消済みではなく、いま抑止しているだけの既知の欠陥である。',
      'reduction は削減の目標と計画文書の所在。実行のたびに残り件数を出力する（合否には用いない）。',
      '件数が増える方向の更新は既定で拒否する。記録が必要な場合のみ --allow-increase を付けること。',
    ],
    generatedTotal: total,
    allowedTotal,
    reduction,
    allowedFiles: orderedAllowed,
    files: ordered,
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

// ============================================================================
// 実行
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const asJson = args.includes('--json');
  const update = args.includes('--update-baseline');
  const allowIncrease = args.includes('--allow-increase');
  const skipBaseline = args.includes('--no-baseline');

  const files = collectE2eFiles();
  const results = files.map(scanFile);
  const findings = results.flatMap((r) => r.findings);
  const allowed = results.flatMap((r) => r.allowed);
  const invalidAllows = results.flatMap((r) => r.invalidAllows);
  const current = tally(findings);
  const currentAllowed = tallyAllowed(allowed);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          total: findings.length,
          allowedTotal: allowed.length,
          findings,
          allowed,
          invalidAllows,
        },
        null,
        2
      )
    );
    return;
  }

  const byType = new Map<GuardType, number>(GUARD_TYPES.map((t) => [t, 0]));
  for (const finding of findings) {
    byType.set(finding.type, (byType.get(finding.type) ?? 0) + 1);
  }

  console.log('🔍 E2E 検証無効化チェック (scripts/check-e2e-assertion-guards.ts)');
  console.log(`   走査ファイル数: ${files.length}`);
  console.log(`   検出件数: ${findings.length}`);
  for (const type of GUARD_TYPES) {
    console.log(`     ${type}: ${byType.get(type)}`);
  }

  console.log(`   除外件数 (e2e-guard-allow): ${allowed.length}`);
  for (const entry of allowed) {
    console.log(`     ${entry.file}:${entry.line} [${entry.type}] 理由: ${entry.reason}`);
  }

  // 抑止一覧の残高を常に出力する。「検査が通ったこと」と「欠陥が残っていないこと」は別であり、
  // 出力に残高が出ないと、抑止一覧が「直さなくてよい」の記録へ静かに変質する（Task 115.93）。
  if (!skipBaseline) {
    const recorded = loadBaseline();
    const targets = recorded.reduction.targets ?? {};
    console.log('');
    console.log(
      `   抑止されている既知の欠陥（負債）: ${findings.length} 件 / 基準 ${recorded.generatedTotal} 件`
    );
    for (const type of GUARD_TYPES) {
      const now = byType.get(type) ?? 0;
      const target = targets[type];
      const label = `     ${type.padEnd(24)} 現在 ${String(now).padStart(4)}`;
      if (target === undefined) {
        console.log(`${label}  （目標 未設定）`);
      } else if (now === 0 && target === 0) {
        console.log(`${label}  目標 ${String(target).padStart(4)}  ✅ 解消済み`);
      } else if (now <= target) {
        // 目標が現状と同じ型は「解消済み」ではない。今の段では着手しないという宣言である。
        console.log(
          `${label}  目標 ${String(target).padStart(4)}  据置（本段の対象外・負債は残存）`
        );
      } else {
        console.log(
          `${label}  目標 ${String(target).padStart(4)}  残り ${String(now - target).padStart(4)}`
        );
      }
    }
    if (recorded.reduction.allowedTarget !== undefined) {
      console.log(
        `     ${'e2e-guard-allow'.padEnd(24)} 現在 ${String(allowed.length).padStart(4)}  目標 ${String(recorded.reduction.allowedTarget).padStart(4)}`
      );
    }
    if (recorded.reduction.doc) {
      console.log(`   削減計画: ${recorded.reduction.doc}`);
    } else {
      console.log('   削減計画: 未登録（基準の reduction.doc に計画文書の位置を記録すること）');
    }
  }

  if (verbose) {
    console.log('');
    for (const finding of findings) {
      console.log(`   ${finding.file}:${finding.line} [${finding.type}] ${finding.snippet}`);
    }
  }

  if (invalidAllows.length > 0) {
    console.log('\n❌ 理由の無い除外注釈があります（除外として扱いません）:');
    for (const entry of invalidAllows) {
      console.log(`   ${entry.file}:${entry.line} [${entry.type}] ${entry.snippet}`);
    }
    console.log(`\n   \`// ${ALLOW_MARKER} <理由>\` の形で理由を書いてください。`);
    process.exit(1);
  }

  if (update) {
    const previous = loadBaseline();
    // 抑止一覧は「今は直せない」の記録であって「直さなくてよい」の記録ではない。
    // 増える方向の書き出しを無言で通すと、検出された欠陥をその場で登録して黙らせられる。
    // 増加の記録には明示的な意思表示（--allow-increase）を要求する（Task 115.93）。
    const growth: string[] = [];
    for (const file of Object.keys(current).sort()) {
      for (const type of GUARD_TYPES) {
        const now = current[file]![type] ?? 0;
        const before = previous.files[file]?.[type] ?? 0;
        if (now > before) growth.push(`${file} [${type}] ${before} → ${now}`);
      }
    }
    for (const file of Object.keys(currentAllowed).sort()) {
      const now = currentAllowed[file] ?? 0;
      const before = previous.allowedFiles[file] ?? 0;
      if (now > before) growth.push(`${file} [e2e-guard-allow] ${before} → ${now}`);
    }
    if (growth.length > 0 && !allowIncrease) {
      console.log('\n❌ 件数が増える方向の基準更新は既定で拒否します:');
      for (const line of growth) console.log(`   ${line}`);
      console.log(
        '\n   抑止一覧は「今は直せない」の記録であって「直さなくてよい」の記録ではありません。'
      );
      console.log('   まず是正を試みてください。記録が必要な場合のみ次を実行します:');
      console.log(
        '     npx tsx scripts/check-e2e-assertion-guards.ts --update-baseline --allow-increase'
      );
      console.log(
        '   その際は増加の理由と解消の見通しを、基準の reduction.doc が指す計画文書に残してください。'
      );
      process.exit(1);
    }
    writeBaseline(current, findings.length, currentAllowed, allowed.length, previous.reduction);
    console.log(`\n✅ 基準を更新しました: ${path.relative(ROOT, BASELINE_PATH)}`);
    if (growth.length > 0) {
      console.log('   ⚠️ 増加を記録しました（--allow-increase）。計画文書への記載を忘れないこと:');
      for (const line of growth) console.log(`      ${line}`);
    }
    return;
  }

  if (skipBaseline) return;

  const baseline = loadBaseline();
  const regressions: string[] = [];
  const improvements: string[] = [];

  // 基準そのものの整合を確かめる。件数の内訳と総数がずれている基準は手で書き換えられた
  // 疑いがあり、抑止の総量を見えなくする（Task 115.93）。
  let baselineSum = 0;
  for (const perType of Object.values(baseline.files)) {
    for (const count of Object.values(perType)) baselineSum += count ?? 0;
  }
  let baselineAllowSum = 0;
  for (const count of Object.values(baseline.allowedFiles)) baselineAllowSum += count;
  if (baselineSum !== baseline.generatedTotal || baselineAllowSum !== baseline.allowedTotal) {
    console.log('\n❌ 基準の内訳と総数が一致しません（手作業での書き換えが疑われます）:');
    console.log(`   files の合計 ${baselineSum} / generatedTotal ${baseline.generatedTotal}`);
    console.log(
      `   allowedFiles の合計 ${baselineAllowSum} / allowedTotal ${baseline.allowedTotal}`
    );
    console.log('   `npm run check:e2e-guards:update` で書き出し直してください。');
    process.exit(1);
  }

  for (const file of Object.keys(current).sort()) {
    for (const type of GUARD_TYPES) {
      const actual = current[file]![type] ?? 0;
      const allowedCount = baseline.files[file]?.[type] ?? 0;
      if (actual > allowedCount) {
        regressions.push(`${file} [${type}] ${allowedCount} → ${actual}`);
      }
    }
  }
  for (const file of Object.keys(baseline.files).sort()) {
    for (const type of GUARD_TYPES) {
      const allowedCount = baseline.files[file]?.[type] ?? 0;
      const actual = current[file]?.[type] ?? 0;
      if (actual < allowedCount) {
        improvements.push(`${file} [${type}] ${allowedCount} → ${actual}`);
      }
    }
  }

  const allowRegressions: string[] = [];
  for (const file of Object.keys(currentAllowed).sort()) {
    const actual = currentAllowed[file] ?? 0;
    const known = baseline.allowedFiles[file] ?? 0;
    if (actual > known) {
      allowRegressions.push(`${file} [e2e-guard-allow] ${known} → ${actual}`);
    }
  }

  if (improvements.length > 0) {
    console.log('\nℹ️  基準より減っています（是正済み）。基準の更新を推奨します:');
    for (const line of improvements) console.log(`   ${line}`);
    console.log('   更新: npm run check:e2e-guards:update');
  }

  if (allowRegressions.length > 0) {
    console.log('\n❌ 除外（e2e-guard-allow）が増えています:');
    for (const line of allowRegressions) console.log(`   ${line}`);
    console.log('\n   除外は正当性をレビューできる形で残す必要があります。');
    console.log('   妥当であれば `npm run check:e2e-guards:update` で基準に反映してください。');
  }

  if (regressions.length > 0) {
    console.log('\n❌ 検証無効化の構造が増えています:');
    for (const line of regressions) console.log(`   ${line}`);
    console.log('\n   検証を無条件にするか、前提が満たせない場合に失敗させてください。');
    console.log('   正当な分岐であれば直前行に `// e2e-guard-allow: <理由>` を付けてください。');
    console.log('   詳細: npm run check:e2e-guards -- --verbose');
  }

  if (regressions.length > 0 || allowRegressions.length > 0) {
    process.exit(1);
  }

  console.log('\n✅ 新規の検証無効化は検出されませんでした');
}

// 直接起動されたときのみ実行する（検出規則の確認からは走査部分だけを読み込む）
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
