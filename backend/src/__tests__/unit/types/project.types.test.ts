/**
 * @fileoverview プロジェクトステータスおよびトランジション種別の型定義テスト
 *
 * Requirements:
 * - 10.1: プロジェクトステータスとして12種類を提供
 * - 10.11: 遷移種別として4種類を定義
 */

import { describe, it, expect } from 'vitest';
import {
  PROJECT_STATUSES,
  TRANSITION_TYPES,
  PROJECT_STATUS_LABELS,
  TRANSITION_TYPE_LABELS,
  isProjectStatus,
  isTransitionType,
  getProjectStatusLabel,
  getTransitionTypeLabel,
} from '../../../types/project.types.js';
import type { ProjectStatus, TransitionType } from '../../../types/project.types.js';

describe('ProjectStatus Enum', () => {
  it('should define all 12 project statuses', () => {
    // Requirement 10.1: 12種類のプロジェクトステータス
    expect(PROJECT_STATUSES).toHaveLength(12);
    expect(PROJECT_STATUSES).toContain('PREPARING');
    expect(PROJECT_STATUSES).toContain('SURVEYING');
    expect(PROJECT_STATUSES).toContain('ESTIMATING');
    expect(PROJECT_STATUSES).toContain('APPROVING');
    expect(PROJECT_STATUSES).toContain('CONTRACTING');
    expect(PROJECT_STATUSES).toContain('CONSTRUCTING');
    expect(PROJECT_STATUSES).toContain('DELIVERING');
    expect(PROJECT_STATUSES).toContain('BILLING');
    expect(PROJECT_STATUSES).toContain('AWAITING');
    expect(PROJECT_STATUSES).toContain('COMPLETED');
    expect(PROJECT_STATUSES).toContain('CANCELLED');
    expect(PROJECT_STATUSES).toContain('LOST');
  });

  it('should have unique status values', () => {
    const uniqueStatuses = new Set(PROJECT_STATUSES);
    expect(uniqueStatuses.size).toBe(PROJECT_STATUSES.length);
  });
});

describe('TransitionType Enum', () => {
  it('should define all 4 transition types', () => {
    // Requirement 10.11: 4種類の遷移種別
    expect(TRANSITION_TYPES).toHaveLength(4);
    expect(TRANSITION_TYPES).toContain('initial');
    expect(TRANSITION_TYPES).toContain('forward');
    expect(TRANSITION_TYPES).toContain('backward');
    expect(TRANSITION_TYPES).toContain('terminate');
  });

  it('should have unique transition type values', () => {
    const uniqueTypes = new Set(TRANSITION_TYPES);
    expect(uniqueTypes.size).toBe(TRANSITION_TYPES.length);
  });
});

describe('PROJECT_STATUS_LABELS', () => {
  it('should provide Japanese labels for all statuses', () => {
    expect(PROJECT_STATUS_LABELS.PREPARING).toBe('準備中');
    expect(PROJECT_STATUS_LABELS.SURVEYING).toBe('調査中');
    expect(PROJECT_STATUS_LABELS.ESTIMATING).toBe('見積中');
    expect(PROJECT_STATUS_LABELS.APPROVING).toBe('決裁待ち');
    expect(PROJECT_STATUS_LABELS.CONTRACTING).toBe('契約中');
    expect(PROJECT_STATUS_LABELS.CONSTRUCTING).toBe('工事中');
    expect(PROJECT_STATUS_LABELS.DELIVERING).toBe('引渡中');
    expect(PROJECT_STATUS_LABELS.BILLING).toBe('請求中');
    expect(PROJECT_STATUS_LABELS.AWAITING).toBe('入金待ち');
    expect(PROJECT_STATUS_LABELS.COMPLETED).toBe('完了');
    expect(PROJECT_STATUS_LABELS.CANCELLED).toBe('中止');
    expect(PROJECT_STATUS_LABELS.LOST).toBe('失注');
  });

  it('should have labels for all defined statuses', () => {
    for (const status of PROJECT_STATUSES) {
      expect(PROJECT_STATUS_LABELS[status]).toBeDefined();
      expect(typeof PROJECT_STATUS_LABELS[status]).toBe('string');
      expect(PROJECT_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });
});

describe('TRANSITION_TYPE_LABELS', () => {
  it('should provide Japanese labels for all transition types', () => {
    expect(TRANSITION_TYPE_LABELS.initial).toBe('初期遷移');
    expect(TRANSITION_TYPE_LABELS.forward).toBe('順方向遷移');
    expect(TRANSITION_TYPE_LABELS.backward).toBe('差し戻し遷移');
    expect(TRANSITION_TYPE_LABELS.terminate).toBe('終端遷移');
  });

  it('should have labels for all defined transition types', () => {
    for (const type of TRANSITION_TYPES) {
      expect(TRANSITION_TYPE_LABELS[type]).toBeDefined();
      expect(typeof TRANSITION_TYPE_LABELS[type]).toBe('string');
      expect(TRANSITION_TYPE_LABELS[type].length).toBeGreaterThan(0);
    }
  });
});

describe('isProjectStatus', () => {
  it('should return true for valid project statuses', () => {
    expect(isProjectStatus('PREPARING')).toBe(true);
    expect(isProjectStatus('SURVEYING')).toBe(true);
    expect(isProjectStatus('ESTIMATING')).toBe(true);
    expect(isProjectStatus('APPROVING')).toBe(true);
    expect(isProjectStatus('CONTRACTING')).toBe(true);
    expect(isProjectStatus('CONSTRUCTING')).toBe(true);
    expect(isProjectStatus('DELIVERING')).toBe(true);
    expect(isProjectStatus('BILLING')).toBe(true);
    expect(isProjectStatus('AWAITING')).toBe(true);
    expect(isProjectStatus('COMPLETED')).toBe(true);
    expect(isProjectStatus('CANCELLED')).toBe(true);
    expect(isProjectStatus('LOST')).toBe(true);
  });

  it('should return false for invalid project statuses', () => {
    expect(isProjectStatus('INVALID')).toBe(false);
    expect(isProjectStatus('')).toBe(false);
    expect(isProjectStatus('preparing')).toBe(false); // case sensitive
    expect(isProjectStatus(null)).toBe(false);
    expect(isProjectStatus(undefined)).toBe(false);
    expect(isProjectStatus(123)).toBe(false);
    expect(isProjectStatus({})).toBe(false);
  });
});

describe('isTransitionType', () => {
  it('should return true for valid transition types', () => {
    expect(isTransitionType('initial')).toBe(true);
    expect(isTransitionType('forward')).toBe(true);
    expect(isTransitionType('backward')).toBe(true);
    expect(isTransitionType('terminate')).toBe(true);
  });

  it('should return false for invalid transition types', () => {
    expect(isTransitionType('INVALID')).toBe(false);
    expect(isTransitionType('')).toBe(false);
    expect(isTransitionType('FORWARD')).toBe(false); // case sensitive
    expect(isTransitionType(null)).toBe(false);
    expect(isTransitionType(undefined)).toBe(false);
    expect(isTransitionType(123)).toBe(false);
    expect(isTransitionType({})).toBe(false);
  });
});

describe('getProjectStatusLabel', () => {
  it('should return the correct Japanese label for valid statuses', () => {
    expect(getProjectStatusLabel('PREPARING')).toBe('準備中');
    expect(getProjectStatusLabel('COMPLETED')).toBe('完了');
    expect(getProjectStatusLabel('CANCELLED')).toBe('中止');
    expect(getProjectStatusLabel('LOST')).toBe('失注');
  });

  it('should return undefined for invalid statuses', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getProjectStatusLabel('INVALID' as any)).toBeUndefined();
  });
});

describe('getTransitionTypeLabel', () => {
  it('should return the correct Japanese label for valid transition types', () => {
    expect(getTransitionTypeLabel('initial')).toBe('初期遷移');
    expect(getTransitionTypeLabel('forward')).toBe('順方向遷移');
    expect(getTransitionTypeLabel('backward')).toBe('差し戻し遷移');
    expect(getTransitionTypeLabel('terminate')).toBe('終端遷移');
  });

  it('should return undefined for invalid transition types', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getTransitionTypeLabel('INVALID' as any)).toBeUndefined();
  });
});

describe('Type exports', () => {
  it('should allow using ProjectStatus type', () => {
    const status: ProjectStatus = 'PREPARING';
    expect(status).toBe('PREPARING');
  });

  it('should allow using TransitionType type', () => {
    const type: TransitionType = 'forward';
    expect(type).toBe('forward');
  });
});
