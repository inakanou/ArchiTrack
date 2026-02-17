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
 * @module routes/claude-vision
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import express from 'express';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { requirePermission } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  claudeVisionExtractRequestSchema,
  type ClaudeVisionExtractRequest,
} from '../schemas/claude-vision.schema.js';
import { ClaudeVisionService } from '../services/claude-vision.service.js';
import { ClaudeVisionError } from '../errors/claudeVisionError.js';
import logger from '../utils/logger.js';

const router = Router();

// Service instance
const claudeVisionService = new ClaudeVisionService(process.env.ANTHROPIC_API_KEY);

/**
 * POST /api/claude-vision/extract
 *
 * PDFページ画像からClaude Vision APIで明細行データを抽出する
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
  requirePermission('estimate_request:read'),
  validate(claudeVisionExtractRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if Claude Vision is enabled
      if (!claudeVisionService.isEnabled()) {
        throw ClaudeVisionError.serviceUnavailable();
      }

      const { images } = req.validatedBody as ClaudeVisionExtractRequest;

      logger.info({ imageCount: images.length }, 'Claude Vision extraction request received');

      // Call Claude Vision service
      const result = await claudeVisionService.extractLineItems(images);

      logger.info(
        { lineItemCount: result.lineItems.length, pageCount: result.pageCount },
        'Claude Vision extraction completed'
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
