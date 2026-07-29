#!/usr/bin/env node
/**
 * @fileoverview セキュリティ監査スクリプト
 *
 * ベストプラクティスに基づいたnpm audit実行:
 * - 本番依存: high以上でブロック（許容リスト対応）
 * - 開発依存: high以上で警告（許容リスト対応）
 * - CIとローカルで同一ルールを適用
 *
 * Usage:
 *   node scripts/security-audit.mjs [--workspace=backend|frontend|root] [--mode=strict|warn]
 *
 * Options:
 *   --workspace  チェック対象 (backend, frontend, root, all) デフォルト: all
 *   --mode       strict=ブロック, warn=警告のみ デフォルト: strict
 *   --verbose    詳細出力
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// カラー出力
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}`),
};

/**
 * 許容リストを読み込む
 */
function loadAllowlist() {
  const allowlistPath = resolve(PROJECT_ROOT, '.security-audit-allowlist.json');

  if (!existsSync(allowlistPath)) {
    log.warn('許容リストが見つかりません: .security-audit-allowlist.json');
    return { allowlist: { backend: [], frontend: [], root: [] } };
  }

  try {
    const content = readFileSync(allowlistPath, 'utf-8');
    const allowlist = JSON.parse(content);

    // 有効期限切れのエントリをチェック
    const today = new Date().toISOString().split('T')[0];
    for (const workspace of ['backend', 'frontend', 'root']) {
      if (allowlist.allowlist[workspace]) {
        for (const entry of allowlist.allowlist[workspace]) {
          if (entry.expires && entry.expires < today) {
            log.warn(
              `許容リストの有効期限切れ: ${entry.package} (${workspace}) - 期限: ${entry.expires}`
            );
          }
        }
      }
    }

    return allowlist;
  } catch (error) {
    log.error(`許容リストの読み込みに失敗: ${error.message}`);
    return { allowlist: { backend: [], frontend: [], root: [] } };
  }
}

/**
 * npm auditを実行してJSONを取得
 */
function runNpmAudit(workspacePath, omitDev = false) {
  const cwd = resolve(PROJECT_ROOT, workspacePath);

  if (!existsSync(resolve(cwd, 'package.json'))) {
    return null;
  }

  try {
    const omitFlag = omitDev ? '--omit=dev' : '';
    const cmd = `npm audit --json ${omitFlag} 2>/dev/null || true`;
    const output = execSync(cmd, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });

    if (!output.trim()) {
      return { vulnerabilities: {} };
    }

    return JSON.parse(output);
  } catch (error) {
    log.error(`npm audit実行エラー (${workspacePath}): ${error.message}`);
    return null;
  }
}

/**
 * GHSA URL / ID を GHSA-ID に正規化する
 */
function normalizeAdvisoryId(value) {
  if (!value) return null;
  // URL の場合は末尾セグメント（GHSA-xxxx-...）を取り出す
  return String(value).split('/').filter(Boolean).pop();
}

const SEVERITY_ORDER = ['info', 'low', 'moderate', 'high', 'critical'];

/**
 * 脆弱性 pkg の via チェーンを再帰的に辿り、根本 advisory を返す
 *   Map<GHSA-ID, severity(最大)>
 *
 * npm audit の via は「他パッケージ名(string)」か「advisory オブジェクト」の混在配列。
 * string は同一 vulnerabilities マップ内の別エントリを指すため再帰的に解決する。
 */
function resolveRootAdvisories(pkg, vulnerabilities, seen = new Set()) {
  const result = new Map();
  if (seen.has(pkg)) return result;
  seen.add(pkg);

  const merge = (id, severity) => {
    if (!id) return;
    const prev = result.get(id);
    if (prev === undefined || SEVERITY_ORDER.indexOf(severity) > SEVERITY_ORDER.indexOf(prev)) {
      result.set(id, severity);
    }
  };

  const vuln = vulnerabilities[pkg];
  if (!vuln || !Array.isArray(vuln.via)) return result;

  for (const item of vuln.via) {
    if (typeof item === 'string') {
      for (const [id, sev] of resolveRootAdvisories(item, vulnerabilities, seen)) {
        merge(id, sev);
      }
    } else if (item && typeof item === 'object') {
      const id = normalizeAdvisoryId(item.url) || normalizeAdvisoryId(item.source) || item.title;
      merge(id, item.severity);
    }
  }
  return result;
}

/**
 * 期限切れでない許容 advisory ID の集合を作る
 */
function activeAllowedAdvisories(allowlist, today) {
  const set = new Set();
  for (const entry of allowlist) {
    if (entry.expires && entry.expires < today) continue;
    if (entry.advisory) set.add(normalizeAdvisoryId(entry.advisory));
  }
  return set;
}

/**
 * 脆弱性が許容リストに含まれているかチェック
 *
 * 2 方式をサポート:
 *  - パッケージ名一致: entry.package === pkg（従来方式）
 *  - advisory 一致: entry.advisory が指す GHSA を根本原因とする脆弱性を許容。
 *    推移的依存（例: brace-expansion に起因する eslint / jest / minimatch 等）を
 *    根本 advisory 1 件でまとめて許容でき、別 advisory は素通しさせない精密方式。
 *    しきい値以上の根本 advisory がすべて許容されていれば許可する
 *    （しきい値未満の root は単独では警告対象外のため判定から除外）。
 */
function isAllowed(pkg, allowlist, vulnerabilities, severityThreshold = 'high') {
  const today = new Date().toISOString().split('T')[0];

  // 1) パッケージ名一致（advisory 指定のないエントリのみ）
  for (const entry of allowlist) {
    if (entry.advisory) continue;
    if (entry.package === pkg) {
      if (entry.expires && entry.expires < today) continue; // 期限切れは許容しない
      return true;
    }
  }

  // 2) advisory 根本原因一致: しきい値以上の根本 advisory がすべて許容集合に含まれるか
  const allowedAdvisories = activeAllowedAdvisories(allowlist, today);
  if (allowedAdvisories.size > 0) {
    const thresholdIndex = SEVERITY_ORDER.indexOf(severityThreshold);
    const relevantRoots = [...resolveRootAdvisories(pkg, vulnerabilities)].filter(
      ([, sev]) => SEVERITY_ORDER.indexOf(sev) >= thresholdIndex
    );
    if (relevantRoots.length > 0 && relevantRoots.every(([id]) => allowedAdvisories.has(id))) {
      return true;
    }
  }

  return false;
}

/**
 * 脆弱性をフィルタリング・分析
 */
function analyzeVulnerabilities(auditResult, workspaceAllowlist, severityThreshold = 'high') {
  if (!auditResult || !auditResult.vulnerabilities) {
    return { blocked: [], warned: [], allowed: [] };
  }

  const thresholdIndex = SEVERITY_ORDER.indexOf(severityThreshold);

  const blocked = [];
  const warned = [];
  const allowed = [];

  for (const [pkg, vuln] of Object.entries(auditResult.vulnerabilities)) {
    const severity = vuln.severity;
    const severityIndex = SEVERITY_ORDER.indexOf(severity);

    if (severityIndex >= thresholdIndex) {
      if (isAllowed(pkg, workspaceAllowlist, auditResult.vulnerabilities, severityThreshold)) {
        allowed.push({ package: pkg, severity, via: vuln.via });
      } else {
        blocked.push({ package: pkg, severity, via: vuln.via, fixAvailable: vuln.fixAvailable });
      }
    } else {
      warned.push({ package: pkg, severity, via: vuln.via });
    }
  }

  return { blocked, warned, allowed };
}

/**
 * ワークスペースの監査を実行
 */
function auditWorkspace(workspaceName, workspacePath, allowlistData, mode, verbose) {
  log.header(`🔍 ${workspaceName} セキュリティ監査`);

  const workspaceAllowlist = allowlistData.allowlist[workspaceName] || [];

  // 本番依存のチェック（high以上でブロック）
  log.info('本番依存をチェック中...');
  const prodResult = runNpmAudit(workspacePath, true);

  if (prodResult === null) {
    log.error(`${workspaceName}のnpm audit実行に失敗`);
    return { success: false, hasBlocking: true };
  }

  const prodAnalysis = analyzeVulnerabilities(prodResult, workspaceAllowlist, 'high');

  // 開発依存のチェック（警告のみ）
  log.info('全依存をチェック中...');
  const allResult = runNpmAudit(workspacePath, false);

  if (allResult === null) {
    log.error(`${workspaceName}のnpm audit実行に失敗`);
    return { success: false, hasBlocking: true };
  }

  const allAnalysis = analyzeVulnerabilities(allResult, workspaceAllowlist, 'high');

  // 開発依存のみの脆弱性を抽出
  const prodPackages = new Set(prodAnalysis.blocked.map((v) => v.package));
  const devOnlyBlocked = allAnalysis.blocked.filter((v) => !prodPackages.has(v.package));

  // 結果表示
  let hasBlocking = false;

  // 本番依存のブロック対象
  if (prodAnalysis.blocked.length > 0) {
    log.error(`本番依存で未許容の脆弱性が見つかりました:`);
    for (const v of prodAnalysis.blocked) {
      console.log(`   ${colors.red}●${colors.reset} ${v.package} (${v.severity})`);
      if (verbose && v.via) {
        console.log(`     via: ${JSON.stringify(v.via)}`);
      }
      if (v.fixAvailable) {
        console.log(`     ${colors.green}修正可能: npm audit fix${colors.reset}`);
      }
    }
    if (mode === 'strict') {
      hasBlocking = true;
    }
  }

  // 開発依存のみの脆弱性（警告）
  if (devOnlyBlocked.length > 0) {
    log.warn(`開発依存で未許容の脆弱性が見つかりました（警告のみ）:`);
    for (const v of devOnlyBlocked) {
      console.log(`   ${colors.yellow}●${colors.reset} ${v.package} (${v.severity}) - dev only`);
    }
    console.log(`   ${colors.cyan}💡 開発ツールのため本番には影響しません${colors.reset}`);
    console.log(
      `   ${colors.cyan}   許容する場合は .security-audit-allowlist.json に追加してください${colors.reset}`
    );
  }

  // 許容された脆弱性
  if (allAnalysis.allowed.length > 0 && verbose) {
    log.info(`許容リストにより許可された脆弱性:`);
    for (const v of allAnalysis.allowed) {
      console.log(`   ${colors.blue}●${colors.reset} ${v.package} (${v.severity})`);
    }
  }

  // 結果サマリー
  const totalBlocked = prodAnalysis.blocked.length;
  const totalDevOnly = devOnlyBlocked.length;
  const totalAllowed = allAnalysis.allowed.length;

  if (totalBlocked === 0 && totalDevOnly === 0) {
    log.success(`${workspaceName}: 高リスク脆弱性なし`);
  } else {
    console.log(
      `   サマリー: ブロック=${totalBlocked}, 開発のみ=${totalDevOnly}, 許容=${totalAllowed}`
    );
  }

  return {
    success: !hasBlocking,
    hasBlocking,
    prodBlocked: prodAnalysis.blocked.length,
    devBlocked: devOnlyBlocked.length,
    allowed: allAnalysis.allowed.length,
  };
}

/**
 * メイン処理
 */
function main() {
  const args = process.argv.slice(2);

  // 引数パース
  let workspace = 'all';
  let mode = 'strict';
  let verbose = false;

  for (const arg of args) {
    if (arg.startsWith('--workspace=')) {
      workspace = arg.split('=')[1];
    } else if (arg.startsWith('--mode=')) {
      mode = arg.split('=')[1];
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node scripts/security-audit.mjs [options]

Options:
  --workspace=<name>  チェック対象 (backend, frontend, root, all)
                      デフォルト: all
  --mode=<mode>       strict=ブロック, warn=警告のみ
                      デフォルト: strict
  --verbose, -v       詳細出力
  --help, -h          ヘルプ表示

Examples:
  node scripts/security-audit.mjs                    # 全ワークスペースをチェック
  node scripts/security-audit.mjs --workspace=backend
  node scripts/security-audit.mjs --mode=warn        # 警告のみ（ブロックしない）
`);
      process.exit(0);
    }
  }

  log.header('🔒 セキュリティ監査を開始');
  console.log(`   モード: ${mode === 'strict' ? 'strict（本番依存のhighでブロック）' : 'warn（警告のみ）'}`);
  console.log(`   対象: ${workspace}`);

  // 許容リストを読み込み
  const allowlistData = loadAllowlist();

  const workspaces = {
    backend: 'backend',
    frontend: 'frontend',
    root: '.',
  };

  const targetWorkspaces = workspace === 'all' ? Object.keys(workspaces) : [workspace];

  let hasAnyBlocking = false;
  const results = {};

  for (const ws of targetWorkspaces) {
    if (!workspaces[ws]) {
      log.error(`不明なワークスペース: ${ws}`);
      continue;
    }

    const result = auditWorkspace(ws, workspaces[ws], allowlistData, mode, verbose);
    results[ws] = result;

    if (result.hasBlocking) {
      hasAnyBlocking = true;
    }
  }

  // 最終結果
  log.header('📊 監査結果サマリー');

  for (const [ws, result] of Object.entries(results)) {
    const status = result.hasBlocking
      ? `${colors.red}BLOCKED${colors.reset}`
      : result.devBlocked > 0
        ? `${colors.yellow}WARNING${colors.reset}`
        : `${colors.green}PASSED${colors.reset}`;
    console.log(`   ${ws}: ${status}`);
  }

  if (hasAnyBlocking) {
    console.log('');
    log.error('本番依存に未許容の高リスク脆弱性があります。');
    console.log('   対処方法:');
    console.log('   1. npm audit fix で修正可能な場合は実行してください');
    console.log('   2. 修正版がない場合は .security-audit-allowlist.json に追加してください');
    console.log('      （理由と有効期限を必ず記載）');
    process.exit(1);
  }

  log.success('セキュリティ監査完了');
  process.exit(0);
}

main();
