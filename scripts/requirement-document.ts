/**
 * @fileoverview 要件定義書（`.kiro/specs/<機能>/requirements.md`）の読み取り規則
 *
 * 要件定義書から「要件」と「受入基準」を切り出す規則を、リポジトリで一箇所に置く。
 *
 * なぜ一箇所でなければならないか:
 *   この規則は二つの指標の**単位**を同時に決めている。
 *     - 被覆率が数える単位（scripts/check-requirement-coverage.ts の extractRequirements）
 *     - 除外が指す単位（scripts/check-requirement-exclusions.ts の loadRequirementCatalogue）
 *   両者が別々に規則を持つと、片方だけが変わったとき「除外が分母から外している条文」と
 *   「被覆率が分母に載せている条文」がずれる。ずれても双方の検査は緑のままになる
 *   （タスク 115.190 で実測した。片側の要件ヘッダー規則を変異させても
 *   check:req-exclusions / :selftest / check:req-coverage:selftest / type-check /
 *   lint はすべて通り、check:req-coverage の失敗件数も動かなかった）。
 *
 * 一元化にあたって既にあった微差を裁定した（タスク 115.190）。合成文書で実測した差は4件:
 *   A. 番号のゼロ詰め（`05.`）… 被覆率側は parseInt で `REQ-N.5`、除外側は生の文字で
 *      `REQ-N.05`。**被覆率側を正とする。** 除外定義の `id` も被覆印の `REQ-N.M` も
 *      十進の素の数字で書かれており、`05` という鍵はどちらからも指せないためである。
 *   B. 受入基準の番号の重複（同じ `1.` が二度）… 被覆率側は二件とも分母へ積み、
 *      除外側は Map の後勝ちで一件に潰す。**どちらも正としない。**
 *      前者は分母を水増しし、後者は条文を黙って落とす。要件定義書の欠陥であるから
 *      `throw` で赤くする（AI運用7原則 第3原則）。実データ 2919 件（現役 2888 + 撤廃 31。
 *      `npm run check:req-coverage:json` の summary.acceptanceCriteria.total と
 *      `npm run check:req-coverage` が機能ごとに出す撤廃件数で再現できる）に
 *      重複は 0 件であり、分母は動かない。重複が 0 件であり続けることは
 *      scripts/check-requirement-exclusions.selftest.ts の機構の対照
 *      「両抽出器が実データで同じ受入基準・同じ題を返す」が機械で確かめる
 *      （例外になった機能は食い違いが無くても失敗として挙げる）。
 *   C. 題が空の要件ヘッダー（`### 要件2:`）… 被覆率側は truthy 判定のため
 *      ヘッダーを**丸ごと読み落とし**、続く受入基準を直前の要件へ付け替えてしまう。
 *      除外側の `!== undefined` を正とする。実データに題が空のヘッダーは無い。
 *   D. 要件番号の重複ヘッダー… 被覆率側は二件の要件として並べ、除外側は題を上書きする。
 *      B と同じ理由で `throw` で赤くする。実データ 364 件（分母 360 件 ＋ 受入基準が
 *      すべて撤廃されたため分母外となる 4 件）に重複は 0 件。
 *
 * 一元化そのものが保たれていることも自己検査が機械で見る。
 * scripts/check-requirement-exclusions.selftest.ts の
 * 「抽出規則の複製が二箇所へ戻っていない（共有モジュールが唯一の担い手である）」が、
 * 消費側のソースに規則の断片が現れないこと・双方が本モジュールを静的に取り込んでいること・
 * 断片が本モジュールに実在すること（対照が空振りしていないこと）を確かめる。
 *
 * 枝つき番号（`1a.` `4b.`）は受入基準として読まない（分母に入れない）。読まないことを
 * 呼び手が知る必要があるため、基底の番号だけを letteredCriterionNumbers に残す。
 *
 * ## 機能名の探索も本モジュールが持つ（タスク 115.221）
 *
 * 「どのディレクトリが一つの機能か」（`.kiro/specs/` 直下で `requirements.md` を持つもの）は、
 * 抽出規則と同じく**二つの指標の母集団を同時に決める**規則である。115.190 は抽出規則だけを
 * ここへ寄せ、探索は二箇所の複製のまま残していた。実測した複製間の差は次の二点であり、
 * **判定の規則そのものは完全に一致していた**（タスク 115.221 の実測。実データ 13 機能と、
 * `requirements.md` を持たないディレクトリ・直下のファイル・ディレクトリへの symlink・
 * 孫階層・隠しディレクトリ・`requirements.md` という名のディレクトリを並べた合成の根の
 * いずれでも両者の出力は一致した）:
 *   1. 根の与え方（除外側は引数で任意の根を取り、被覆率側は cwd 相対の裸のパス）
 *   2. スペックディレクトリ不在時の扱い（除外側は空配列、被覆率側は stderr へ出して exit 1）
 * どちらも**呼び手の方針**であって探索の規則ではないため、規則だけを本モジュールへ寄せ、
 * 方針は各呼び手に残す。不在時に空配列を返すのは本モジュールの既定であり、
 * それを検査の停止条件にするか続行の条件にするかは呼び手が決める。
 *
 * 探索はファイルシステムを読む。scanRequirementsDocument が内容だけを受け取る設計
 * （自己検査が合成の文書を直接与えられるようにするため）は変えていない。探索の側は
 * 根を引数に取ることで、同じく合成の根を与えられる形にしてある。
 *
 * ## 根そのものは本モジュールが持たない（タスク 115.269）
 *
 * `.kiro/specs` は設計文書の走査根でもある。同じ値を二箇所で宣言すると別名が並び、
 * 片方が動いたときにもう片方が静かに残る。値は scripts/spec-directory.ts が唯一の担い手と
 * して持ち、本モジュールは取り込んで再輸出する。判断の経緯と実測はそちらの冒頭に置く。
 */

import * as fs from 'fs';
import * as path from 'path';
import { SPEC_DIR } from './spec-directory.js';

/**
 * 要件定義書が置かれる根（リポジトリ根からの相対）
 *
 * 値は scripts/spec-directory.ts が持つ（タスク 115.269）。設計文書の走査根と同じ一つの値で
 * あり、ここで持つと同値の別名が二つ並ぶ。再輸出するのは、既存の呼び手が本モジュールから
 * 要件定義書の読み取り規則をまとめて取れる形を保つためである。
 */
export { SPEC_DIR };

/** 一つの機能の要件定義書のファイル名 */
export const REQUIREMENTS_DOCUMENT_BASENAME = 'requirements.md';

/**
 * 一つの機能の要件定義書の位置
 *
 * @param rootDir 根。`'.'` を与えると cwd 相対の素のパス（`.kiro/specs/<機能>/requirements.md`）
 *                になる。被覆率側は算出結果へこの文字列をそのまま載せるため、
 *                絶対パスへ均してはならない。
 */
export function requirementsDocumentPath(rootDir: string, featureName: string): string {
  return path.join(rootDir, SPEC_DIR, featureName, REQUIREMENTS_DOCUMENT_BASENAME);
}

/**
 * `.kiro/specs/` 直下から機能名を集める
 *
 * 一つの機能とは「`.kiro/specs/` の直下にあるディレクトリで、`requirements.md` を持つもの」
 * である。並びは既定の昇順に揃える。ディレクトリへの symlink は `isDirectory()` が偽である
 * ため機能として数えない（実測で両複製が一致していた挙動をそのまま引き継ぐ）。
 *
 * スペックディレクトリが無い場合は空配列を返す。**呼び手はこれを「機能が無い」と読んで
 * 黙って素通りさせてはならない**（AI運用7原則 第3原則）。被覆率側は不在を検査の前提の崩壊と
 * みなして exit 1 で落とす。
 *
 * 現状この規範に従っていない呼び手が一つある（既知の例外。タスク 115.221 の境界の外であり、
 * 挙動は変えていない）: scripts/check-requirement-exclusions.ts の scanCoverageTags は
 * 機能が 0 件のとき空の被覆印索引を返して続行する。実データでこれが起きれば
 * scripts/check-requirement-exclusions.selftest.ts の対照
 * 「実データの走査が空振りしていない（被覆印とラチェットの双方を見つける）」が赤くなるが、
 * 検査そのものは緑を出しうる。ここに書き留めるのは、規範を満たしたことにするためではなく、
 * 満たしていない箇所を隠さないためである。
 */
export function discoverFeatureNames(rootDir: string): string[] {
  const specsDir = path.resolve(rootDir, SPEC_DIR);
  if (!fs.existsSync(specsDir)) return [];
  return fs
    .readdirSync(specsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        fs.existsSync(path.join(specsDir, entry.name, REQUIREMENTS_DOCUMENT_BASENAME))
    )
    .map((entry) => entry.name)
    .sort();
}

/** 一件の受入基準 */
export interface ScannedCriterion {
  /** 属する要件の番号（`REQ-4`, `REQ-27A`） */
  requirementId: string;
  /** 受入基準の番号（十進で正規化した整数。`05.` は 5） */
  number: number;
  /** 本文（行頭の番号を除いた残り。前後の空白は落とす） */
  text: string;
  /** 要件定義書での行番号（1 始まり） */
  line: number;
  /** 取り消し線（`~~`）で無効化されているか */
  retired: boolean;
}

/** 一件の要件 */
export interface ScannedRequirement {
  /** `REQ-4`, `REQ-27A` */
  id: string;
  /** 要件の題（空文字もありうる） */
  title: string;
  /** 要件定義書での行番号（1 始まり） */
  line: number;
  /** 現役の受入基準（分母に入る） */
  criteria: ScannedCriterion[];
  /** 取り消し線で無効化された受入基準（分母に入らない墓標） */
  retiredCriteria: ScannedCriterion[];
  /** `1a.` `4b.` のように英字の枝を持つ番号で書かれた行の、基底となる番号 */
  letteredCriterionNumbers: number[];
}

/**
 * 受入基準が要件定義書上で無効化（撤廃・移管）されているか
 *
 * 要件定義書は、撤廃した受入基準や別の要件へ移した受入基準を、番号を保ったまま
 * 取り消し線（`~~`）で潰して残す（後続の番号をずらさないための表記である）。
 * 本文が丸ごと潰されている場合も、原文を潰したうえで移管先を添える場合も、
 * 先頭が `~~` で始まる点は共通しており、実データ 31 件はすべてこの形である。
 *
 * **この判定は「先頭が `~~`」だけを見る。** 本文の途中に `~~` を含むだけの現役の
 * 受入基準を落とさないためである（実データにその形は無いが、規則を緩めると
 * 分母が黙って縮む方向に壊れる）。
 */
export function isRetiredCriterionText(text: string): boolean {
  return text.trimStart().startsWith('~~');
}

/** 要件ヘッダー（日本語表記）: `### 要件4: 題` / `### 要件27A: 題` */
const REQUIREMENT_HEADER_JA = /^###\s*要件(\d+[A-E]?):\s*(.*)$/;
/** 要件ヘッダー（英語表記）: `### Requirement 4: 題` */
const REQUIREMENT_HEADER_EN = /^###\s*Requirement\s+(\d+[A-E]?):\s*(.*)$/;
/** 受入基準: 行頭の `4. 本文` */
const CRITERION_LINE = /^(\d+)\.\s+(.+)$/;
/** 枝つき番号: 行頭の `4b. 本文`。受入基準としては読まない */
const LETTERED_CRITERION_LINE = /^(\d+)[a-z]\.\s+(.+)$/;
/** 受入基準セクションの始まり */
const CRITERIA_SECTION_HEADINGS = ['#### 受入基準', '##### 受入基準', '#### Acceptance Criteria'];

/**
 * 要件定義書の本文から要件と受入基準を切り出す
 *
 * ファイルの読み出しは呼び手が行う（自己検査が合成の文書を直接与えられるようにするため）。
 *
 * @param content 要件定義書の全文
 * @param sourceLabel 例外に添える出所（ファイルパスなど）
 * @throws 要件番号または受入基準の番号が同一の文書内で重複するとき。
 *         重複は要件定義書の欠陥であり、どちらを採るかを黙って決めると
 *         分母が水増しされるか条文が黙って落ちるかのいずれかになる。
 */
export function scanRequirementsDocument(
  content: string,
  sourceLabel: string
): ScannedRequirement[] {
  const requirements: ScannedRequirement[] = [];
  const seenRequirementIds = new Set<string>();

  let current: ScannedRequirement | null = null;
  let seenCriterionNumbers = new Set<number>();
  let inCriteriaSection = false;

  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined) continue;

    const headerMatch = REQUIREMENT_HEADER_JA.exec(line) ?? REQUIREMENT_HEADER_EN.exec(line);
    if (headerMatch?.[1] !== undefined && headerMatch[2] !== undefined) {
      const id = `REQ-${headerMatch[1]}`;
      if (seenRequirementIds.has(id)) {
        throw new Error(
          `要件番号 ${id} が重複しています（${sourceLabel}:${index + 1}）。` +
            '要件定義書の側で番号を一意にしてください。'
        );
      }
      seenRequirementIds.add(id);
      if (current) requirements.push(current);
      current = {
        id,
        title: headerMatch[2].trim(),
        line: index + 1,
        criteria: [],
        retiredCriteria: [],
        letteredCriterionNumbers: [],
      };
      seenCriterionNumbers = new Set<number>();
      inCriteriaSection = false;
      continue;
    }

    if (CRITERIA_SECTION_HEADINGS.some((heading) => line.includes(heading))) {
      inCriteriaSection = true;
      continue;
    }

    // 新しいセクション（`####`）に入ったら受入基準セクションは終わる。
    // `###` の要件ヘッダーは次の反復でヘッダーとして処理する。
    if (line.startsWith('###') && !line.startsWith('#####') && !line.includes('受入基準')) {
      if (line.startsWith('### 要件') || line.startsWith('### Requirement')) {
        // 次の反復でヘッダーとして処理する
      } else if (line.startsWith('####') && !line.startsWith('#####')) {
        inCriteriaSection = false;
        continue;
      }
    }

    if (current === null || !inCriteriaSection) continue;

    const letteredMatch = LETTERED_CRITERION_LINE.exec(line);
    if (letteredMatch?.[1] !== undefined) {
      const base = Number.parseInt(letteredMatch[1], 10);
      if (!current.letteredCriterionNumbers.includes(base)) {
        current.letteredCriterionNumbers.push(base);
      }
      continue;
    }

    const criterionMatch = CRITERION_LINE.exec(line);
    if (criterionMatch?.[1] === undefined || criterionMatch[2] === undefined) continue;

    const number = Number.parseInt(criterionMatch[1], 10);
    if (seenCriterionNumbers.has(number)) {
      throw new Error(
        `受入基準の番号 ${current.id}.${number} が重複しています（${sourceLabel}:${index + 1}）。` +
          '要件定義書の側で番号を一意にしてください。'
      );
    }
    seenCriterionNumbers.add(number);

    const text = criterionMatch[2].trim();
    const criterion: ScannedCriterion = {
      requirementId: current.id,
      number,
      text,
      line: index + 1,
      retired: isRetiredCriterionText(text),
    };
    // 取り消し線で無効化された受入基準は「番号だけが残った墓標」であり、
    // 検証を要求される条文ではない。分母に入れると被覆率が水増しされる。
    if (criterion.retired) {
      current.retiredCriteria.push(criterion);
    } else {
      current.criteria.push(criterion);
    }
  }

  if (current) requirements.push(current);
  return requirements;
}
