/**
 * @fileoverview Claude Vision API連携ルート
 *
 * Requirements:
 * - 21.1: Claude Vision APIエンドポイント（POST /api/claude-vision/extract）
 * - 21.2: Base64画像データ受信
 * - 21.8: 複数ページ一括処理
 * - 21.9: APIエンドポイント認証
 * - 22.6: 機能無効時のHTTP 503レスポンス
 * - 23.7: エラー種別レスポンス
 *
 * Task 51.2: claude-vision.routesエンドポイントの実装
 *
 * タスク116.2（estimate-request の design の章「Requirements 43-50」の D7）で、外部の AI での読み取りの
 * 管理者の停止・専用の権限（claude_vision:use）・利用者ごとの回数制限・送信の記録を経路で強制する
 * （画面を経ない要求も経路で止まる）。状態の API（GET /status）は画面が確認を出すかを決めるために読む。
 * 数量表の取り込み（mode: 'quantity-table'）も同じ経路で同じ判定を受ける。
 *
 * app.ts は本ルーターを全体の本文の解析（5MB）より前に mount する（50MB の本文を経路の中で解析するため）。
 *
 * @module routes/claude-vision
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import type { RequestHandler } from 'express';
import express from 'express';
import getPrismaClient from '../db.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { claudeVisionLimiter } from '../middleware/rateLimit.middleware.js';
import {
  claudeVisionExtractRequestSchema,
  type ClaudeVisionExtractRequest,
} from '../schemas/claude-vision.schema.js';
import {
  ClaudeVisionService,
  type ClaudeVisionExtractionResult,
  type ClaudeVisionQuantityExtractionResult,
} from '../services/claude-vision.service.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { SystemSettingService } from '../services/system-setting.service.js';
import { getSharedRBACService } from '../services/rbac.service.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import { ClaudeVisionError } from '../errors/claudeVisionError.js';
import logger from '../utils/logger.js';

/** 外部の AI での読み取りの専用の権限 */
export const CLAUDE_VISION_USE_PERMISSION = 'claude_vision:use';

/** 送信の記録の対象の種類 */
export const CLAUDE_VISION_AUDIT_TARGET_TYPE = 'ClaudeVision';

/** 送信の記録の機能（対象の ID にも使う） */
export type ClaudeVisionFeature = 'received_quotation' | 'quantity_table';

/** 外部の AI での読み取りを使えない理由（判定の順: 停止 → 権限なし → 未設定） */
export type ClaudeVisionUnavailableReason =
  'disabled_by_admin' | 'no_permission' | 'not_configured';

/** 状態の API の応答 */
export interface ClaudeVisionStatus {
  available: boolean;
  reason: ClaudeVisionUnavailableReason | null;
}

/** ルーターの依存（試験で差し替える） */
export interface ClaudeVisionRouterDependencies {
  claudeVisionService: Pick<
    ClaudeVisionService,
    'isEnabled' | 'extractLineItems' | 'extractQuantityTableData'
  >;
  systemSettingService: Pick<SystemSettingService, 'getExternalAiReading'>;
  auditLogService: Pick<IAuditLogService, 'createLog'>;
  /** 状態の API で専用の権限を持つかを判定する */
  hasPermission: (userId: string, permission: string) => Promise<boolean>;
  /** 利用者ごとの回数制限（認証の後・権限の判定の前に掛ける） */
  limiter: RequestHandler;
}

const DEPENDENCY_KEYS: readonly (keyof ClaudeVisionRouterDependencies)[] = [
  'claudeVisionService',
  'systemSettingService',
  'auditLogService',
  'hasPermission',
  'limiter',
];

function defaultDependencies(): ClaudeVisionRouterDependencies {
  const prisma = getPrismaClient();
  const auditLogService = new AuditLogService({ prisma });
  return {
    claudeVisionService: new ClaudeVisionService(process.env.ANTHROPIC_API_KEY),
    systemSettingService: new SystemSettingService({ prisma, auditLogService }),
    auditLogService,
    hasPermission: (userId, permission) => getSharedRBACService().hasPermission(userId, permission),
    limiter: claudeVisionLimiter,
  };
}

/** 要求の mode から記録の機能を決める */
function featureOf(mode: ClaudeVisionExtractRequest['mode']): ClaudeVisionFeature {
  return mode === 'quantity-table' ? 'quantity_table' : 'received_quotation';
}

/**
 * Claude Vision のルーターを組み立てる
 *
 * @param overrides - 差し替える依存（省略したものは本番の依存）
 */
export function createClaudeVisionRouter(
  overrides: Partial<ClaudeVisionRouterDependencies> = {}
): Router {
  // 本番の依存は差し替えの無いものがあるときだけ組み立てる（試験で全てを差し替えたとき DB に触れない）
  const needsDefaults = DEPENDENCY_KEYS.some((key) => overrides[key] === undefined);
  const deps: ClaudeVisionRouterDependencies = {
    ...(needsDefaults ? defaultDependencies() : undefined),
    ...overrides,
  } as ClaudeVisionRouterDependencies;
  const { claudeVisionService, systemSettingService, auditLogService, hasPermission, limiter } =
    deps;

  const router = Router();

  /** 状態を判定する（停止 → 権限なし → 未設定の順。鍵の無い環境でも停止と権限なしを観測できる） */
  async function judgeStatus(userId: string): Promise<ClaudeVisionStatus> {
    const setting = await systemSettingService.getExternalAiReading();
    if (!setting.enabled) {
      return { available: false, reason: 'disabled_by_admin' };
    }
    if (!(await hasPermission(userId, CLAUDE_VISION_USE_PERMISSION))) {
      return { available: false, reason: 'no_permission' };
    }
    if (!claudeVisionService.isEnabled()) {
      return { available: false, reason: 'not_configured' };
    }
    return { available: true, reason: null };
  }

  /**
   * GET /api/claude-vision/status
   *
   * 外部の AI での読み取りを今の利用者が使えるかと、使えない理由を返す（認証だけを求める）。
   * 外部へは送らず、回数にも数えない
   */
  router.get('/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await judgeStatus(req.user!.userId);
      res.status(200).json(status);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/claude-vision/extract
   *
   * PDFページ画像からClaude Vision APIで明細行データを抽出する
   *
   * 順: 本文の解析（50MB）→ 認証 → 利用者ごとの回数制限 → 専用の権限 → 検証 → 設定の確認（停止なら 503）
   * → 送信 → 記録。記録に失敗したら結果を返さず 500 とする
   *
   * Requirements:
   * - 21.1: POST エンドポイント
   * - 21.2: Base64画像データ受信
   * - 21.9: 認証・認可
   * - 22.6: 機能無効時503
   */
  router.post(
    '/extract',
    express.json({ limit: '50mb' }), // ルートレベルで50MBに制限（グローバルの5MB制限は変更しない）
    authenticate,
    limiter,
    requirePermission(CLAUDE_VISION_USE_PERMISSION),
    validate(claudeVisionExtractRequestSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // 管理者の停止は API キーの有無より先に判定し、外部へ送らない
        const setting = await systemSettingService.getExternalAiReading();
        if (!setting.enabled) {
          throw ClaudeVisionError.disabledByAdmin();
        }

        // Check if Claude Vision is enabled
        if (!claudeVisionService.isEnabled()) {
          throw ClaudeVisionError.serviceUnavailable();
        }

        const { images, mode } = req.validatedBody as ClaudeVisionExtractRequest;
        const userId = req.user!.userId;
        const feature = featureOf(mode);

        logger.info(
          { imageCount: images.length, mode: mode || 'estimate', userId },
          'Claude Vision extraction request received'
        );

        // Call appropriate extraction method based on mode
        // Task 43.2: mode='quantity-table'の場合は数量表用抽出を実行
        let result: ClaudeVisionExtractionResult | ClaudeVisionQuantityExtractionResult | undefined;
        let sendError: unknown;
        try {
          result =
            mode === 'quantity-table'
              ? await claudeVisionService.extractQuantityTableData(images)
              : await claudeVisionService.extractLineItems(images);
        } catch (error) {
          sendError = error;
        }

        // 送信の記録: 機能・枚数・結果・失敗の種別だけを入れ、画像と読み取りの結果は入れない
        try {
          await auditLogService.createLog({
            action: 'CLAUDE_VISION_SENT',
            actorId: userId,
            targetType: CLAUDE_VISION_AUDIT_TARGET_TYPE,
            targetId: feature,
            metadata:
              sendError === undefined
                ? { feature, imageCount: images.length, outcome: 'success' }
                : {
                    feature,
                    imageCount: images.length,
                    outcome: 'failure',
                    errorType:
                      sendError instanceof ClaudeVisionError ? sendError.errorType : 'unknown',
                  },
          });
        } catch (auditError) {
          logger.error(
            { err: auditError, userId, feature },
            'Failed to record Claude Vision sending'
          );
          throw ClaudeVisionError.auditFailed();
        }

        if (sendError !== undefined) {
          throw sendError;
        }

        logger.info(
          { lineItemCount: result!.lineItems.length, pageCount: result!.pageCount },
          'Claude Vision extraction completed'
        );

        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export default createClaudeVisionRouter();
