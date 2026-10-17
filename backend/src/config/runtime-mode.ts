/**
 * 実行環境の判定（開発用の機能の有効化と本番の前提の検査）
 *
 * 開発用の機能（API ドキュメント、エラー応答のスタックトレース）は、実行環境が
 * development または test と明示されたときだけ有効にする（user-authentication 要件42.9）。
 * 環境変数の検証（config/env.ts）は NODE_ENV の未設定を既定値 development で補うが、
 * ここではその既定値を使わず process.env.NODE_ENV をそのまま読む。
 *
 * 本番では監査ログのアーカイブの鍵・信頼する中継の段数・キャッシュ基盤の接続先が
 * 欠けると起動を止める（要件41.3、要件35.1）。
 */

import { ARCHIVE_ENCRYPTION_KEY_PATTERN } from './env.js';

export type RuntimeKind = 'production' | 'development' | 'test' | 'unspecified';

export interface RuntimeMode {
  /** process.env.NODE_ENV をそのまま読む（スキーマの既定値を使わない） */
  kind(): RuntimeKind;
  /** 'development' または 'test' の明示のときだけ true */
  isDevelopmentFeatureEnabled(): boolean;
  /** 本番の前提の欠落で例外を投げる（本番以外では何もしない） */
  assertProductionPrerequisites(): void;
}

/**
 * 本番の前提の欠落を表す例外（メッセージには変数名だけを含め、値を含めない）
 */
export class ProductionPrerequisiteError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(
      'Production prerequisites are missing or invalid: ' +
        missing.join(', ') +
        '. Set them before starting the backend in production.'
    );
    this.name = 'ProductionPrerequisiteError';
  }
}

const KNOWN_KINDS: readonly RuntimeKind[] = ['production', 'development', 'test'];

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

/**
 * 実行環境の判定を作る
 * @param source 読む環境変数（既定は process.env。呼び出しのたびに読み直す）
 */
export function createRuntimeMode(source: NodeJS.ProcessEnv = process.env): RuntimeMode {
  const kind = (): RuntimeKind => {
    const value = source.NODE_ENV as string | undefined;
    return KNOWN_KINDS.includes(value as RuntimeKind) ? (value as RuntimeKind) : 'unspecified';
  };

  return {
    kind,

    isDevelopmentFeatureEnabled(): boolean {
      const current = kind();
      return current === 'development' || current === 'test';
    },

    assertProductionPrerequisites(): void {
      if (kind() !== 'production') {
        return;
      }

      const missing: string[] = [];
      const archiveKey = source.ARCHIVE_ENCRYPTION_KEY;
      if (archiveKey === undefined || !ARCHIVE_ENCRYPTION_KEY_PATTERN.test(archiveKey)) {
        missing.push('ARCHIVE_ENCRYPTION_KEY (64 hex characters)');
      }
      if (isBlank(source.TRUST_PROXY_HOPS)) {
        missing.push('TRUST_PROXY_HOPS');
      }
      if (isBlank(source.REDIS_URL)) {
        missing.push('REDIS_URL');
      }

      if (missing.length > 0) {
        throw new ProductionPrerequisiteError(missing);
      }
    },
  };
}

/**
 * process.env を読む実行環境の判定
 */
export const runtimeMode: RuntimeMode = createRuntimeMode();
