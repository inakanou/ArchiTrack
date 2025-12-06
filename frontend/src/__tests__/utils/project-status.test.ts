/**
 * @fileoverview ステータス表示ユーティリティのユニットテスト
 *
 * TDD: RED Phase - テストを先に作成
 *
 * Requirements:
 * - 10.12: 各ステータスを視覚的に区別できる色分けで表示
 * - 10.16: ステータス変更UIで順方向遷移と差し戻し遷移を視覚的に区別して表示
 */

import { describe, it, expect } from 'vitest';
import {
  STATUS_COLORS,
  TRANSITION_TYPE_STYLES,
  getStatusColor,
  getTransitionTypeStyle,
  type StatusColorConfig,
  type TransitionTypeStyleConfig,
} from '../../utils/project-status';
import { PROJECT_STATUSES, TRANSITION_TYPES } from '../../types/project.types';
import type { ProjectStatus, TransitionType } from '../../types/project.types';

describe('Project Status Display Utilities', () => {
  describe('STATUS_COLORS', () => {
    it('should have color configuration for all 12 statuses', () => {
      expect(Object.keys(STATUS_COLORS)).toHaveLength(12);
      PROJECT_STATUSES.forEach((status) => {
        expect(STATUS_COLORS[status]).toBeDefined();
      });
    });

    it('should have bg and text properties for each status', () => {
      PROJECT_STATUSES.forEach((status) => {
        expect(STATUS_COLORS[status]).toHaveProperty('bg');
        expect(STATUS_COLORS[status]).toHaveProperty('text');
        expect(typeof STATUS_COLORS[status].bg).toBe('string');
        expect(typeof STATUS_COLORS[status].text).toBe('string');
      });
    });

    it('should have correct Tailwind CSS classes for PREPARING status', () => {
      expect(STATUS_COLORS.PREPARING.bg).toBe('bg-gray-100');
      expect(STATUS_COLORS.PREPARING.text).toBe('text-gray-800');
    });

    it('should have correct Tailwind CSS classes for SURVEYING status', () => {
      expect(STATUS_COLORS.SURVEYING.bg).toBe('bg-blue-100');
      expect(STATUS_COLORS.SURVEYING.text).toBe('text-blue-800');
    });

    it('should have correct Tailwind CSS classes for ESTIMATING status', () => {
      expect(STATUS_COLORS.ESTIMATING.bg).toBe('bg-yellow-100');
      expect(STATUS_COLORS.ESTIMATING.text).toBe('text-yellow-800');
    });

    it('should have correct Tailwind CSS classes for APPROVING status', () => {
      expect(STATUS_COLORS.APPROVING.bg).toBe('bg-orange-100');
      expect(STATUS_COLORS.APPROVING.text).toBe('text-orange-800');
    });

    it('should have correct Tailwind CSS classes for CONTRACTING status', () => {
      expect(STATUS_COLORS.CONTRACTING.bg).toBe('bg-purple-100');
      expect(STATUS_COLORS.CONTRACTING.text).toBe('text-purple-800');
    });

    it('should have correct Tailwind CSS classes for CONSTRUCTING status', () => {
      expect(STATUS_COLORS.CONSTRUCTING.bg).toBe('bg-indigo-100');
      expect(STATUS_COLORS.CONSTRUCTING.text).toBe('text-indigo-800');
    });

    it('should have correct Tailwind CSS classes for DELIVERING status', () => {
      expect(STATUS_COLORS.DELIVERING.bg).toBe('bg-cyan-100');
      expect(STATUS_COLORS.DELIVERING.text).toBe('text-cyan-800');
    });

    it('should have correct Tailwind CSS classes for BILLING status', () => {
      expect(STATUS_COLORS.BILLING.bg).toBe('bg-teal-100');
      expect(STATUS_COLORS.BILLING.text).toBe('text-teal-800');
    });

    it('should have correct Tailwind CSS classes for AWAITING status', () => {
      expect(STATUS_COLORS.AWAITING.bg).toBe('bg-lime-100');
      expect(STATUS_COLORS.AWAITING.text).toBe('text-lime-800');
    });

    it('should have correct Tailwind CSS classes for COMPLETED status', () => {
      expect(STATUS_COLORS.COMPLETED.bg).toBe('bg-green-100');
      expect(STATUS_COLORS.COMPLETED.text).toBe('text-green-800');
    });

    it('should have correct Tailwind CSS classes for CANCELLED status', () => {
      expect(STATUS_COLORS.CANCELLED.bg).toBe('bg-red-100');
      expect(STATUS_COLORS.CANCELLED.text).toBe('text-red-800');
    });

    it('should have correct Tailwind CSS classes for LOST status', () => {
      expect(STATUS_COLORS.LOST.bg).toBe('bg-rose-100');
      expect(STATUS_COLORS.LOST.text).toBe('text-rose-800');
    });

    it('should have unique color combinations for each status', () => {
      const colorCombinations = PROJECT_STATUSES.map(
        (status) => `${STATUS_COLORS[status].bg}-${STATUS_COLORS[status].text}`
      );
      const uniqueCombinations = new Set(colorCombinations);
      expect(uniqueCombinations.size).toBe(12);
    });
  });

  describe('TRANSITION_TYPE_STYLES', () => {
    it('should have style configuration for all 4 transition types', () => {
      expect(Object.keys(TRANSITION_TYPE_STYLES)).toHaveLength(4);
      TRANSITION_TYPES.forEach((type) => {
        expect(TRANSITION_TYPE_STYLES[type]).toBeDefined();
      });
    });

    it('should have icon, color, and bgColor properties for each type', () => {
      TRANSITION_TYPES.forEach((type) => {
        expect(TRANSITION_TYPE_STYLES[type]).toHaveProperty('icon');
        expect(TRANSITION_TYPE_STYLES[type]).toHaveProperty('color');
        expect(TRANSITION_TYPE_STYLES[type]).toHaveProperty('bgColor');
        expect(typeof TRANSITION_TYPE_STYLES[type].icon).toBe('string');
        expect(typeof TRANSITION_TYPE_STYLES[type].color).toBe('string');
        expect(typeof TRANSITION_TYPE_STYLES[type].bgColor).toBe('string');
      });
    });

    it('should have correct style for initial transition', () => {
      expect(TRANSITION_TYPE_STYLES.initial.icon).toBe('plus-circle');
      expect(TRANSITION_TYPE_STYLES.initial.color).toBe('text-blue-700');
      expect(TRANSITION_TYPE_STYLES.initial.bgColor).toBe('bg-blue-50');
    });

    it('should have correct style for forward transition', () => {
      expect(TRANSITION_TYPE_STYLES.forward.icon).toBe('arrow-right');
      expect(TRANSITION_TYPE_STYLES.forward.color).toBe('text-green-700');
      expect(TRANSITION_TYPE_STYLES.forward.bgColor).toBe('bg-green-50');
    });

    it('should have correct style for backward transition', () => {
      expect(TRANSITION_TYPE_STYLES.backward.icon).toBe('arrow-left');
      expect(TRANSITION_TYPE_STYLES.backward.color).toBe('text-orange-700');
      expect(TRANSITION_TYPE_STYLES.backward.bgColor).toBe('bg-orange-50');
    });

    it('should have correct style for terminate transition', () => {
      expect(TRANSITION_TYPE_STYLES.terminate.icon).toBe('x-circle');
      expect(TRANSITION_TYPE_STYLES.terminate.color).toBe('text-red-700');
      expect(TRANSITION_TYPE_STYLES.terminate.bgColor).toBe('bg-red-50');
    });

    it('should visually distinguish forward and backward transitions', () => {
      // 順方向と差し戻しで異なる色を使用していることを確認
      expect(TRANSITION_TYPE_STYLES.forward.color).not.toBe(TRANSITION_TYPE_STYLES.backward.color);
      expect(TRANSITION_TYPE_STYLES.forward.bgColor).not.toBe(
        TRANSITION_TYPE_STYLES.backward.bgColor
      );
      expect(TRANSITION_TYPE_STYLES.forward.icon).not.toBe(TRANSITION_TYPE_STYLES.backward.icon);
    });
  });

  describe('getStatusColor', () => {
    it('should return correct color config for valid status', () => {
      const result = getStatusColor('PREPARING');
      expect(result).toEqual({
        bg: 'bg-gray-100',
        text: 'text-gray-800',
      });
    });

    it('should return color config for all valid statuses', () => {
      PROJECT_STATUSES.forEach((status) => {
        const result = getStatusColor(status);
        expect(result).toBeDefined();
        expect(result.bg).toBeDefined();
        expect(result.text).toBeDefined();
      });
    });

    it('should return default color for invalid status', () => {
      const result = getStatusColor('INVALID' as ProjectStatus);
      expect(result).toEqual({
        bg: 'bg-gray-100',
        text: 'text-gray-800',
      });
    });

    it('should return completed color for COMPLETED status', () => {
      const result = getStatusColor('COMPLETED');
      expect(result).toEqual({
        bg: 'bg-green-100',
        text: 'text-green-800',
      });
    });

    it('should return terminal color for CANCELLED status', () => {
      const result = getStatusColor('CANCELLED');
      expect(result).toEqual({
        bg: 'bg-red-100',
        text: 'text-red-800',
      });
    });

    it('should return terminal color for LOST status', () => {
      const result = getStatusColor('LOST');
      expect(result).toEqual({
        bg: 'bg-rose-100',
        text: 'text-rose-800',
      });
    });
  });

  describe('getTransitionTypeStyle', () => {
    it('should return correct style config for valid transition type', () => {
      const result = getTransitionTypeStyle('forward');
      expect(result).toEqual({
        icon: 'arrow-right',
        color: 'text-green-700',
        bgColor: 'bg-green-50',
      });
    });

    it('should return style config for all valid transition types', () => {
      TRANSITION_TYPES.forEach((type) => {
        const result = getTransitionTypeStyle(type);
        expect(result).toBeDefined();
        expect(result.icon).toBeDefined();
        expect(result.color).toBeDefined();
        expect(result.bgColor).toBeDefined();
      });
    });

    it('should return default style for invalid transition type', () => {
      const result = getTransitionTypeStyle('INVALID' as TransitionType);
      expect(result).toEqual({
        icon: 'question-mark-circle',
        color: 'text-gray-700',
        bgColor: 'bg-gray-50',
      });
    });

    it('should return initial style for initial transition', () => {
      const result = getTransitionTypeStyle('initial');
      expect(result.icon).toBe('plus-circle');
      expect(result.color).toContain('blue');
    });

    it('should return backward style for backward transition', () => {
      const result = getTransitionTypeStyle('backward');
      expect(result.icon).toBe('arrow-left');
      expect(result.color).toContain('orange');
    });

    it('should return terminate style for terminate transition', () => {
      const result = getTransitionTypeStyle('terminate');
      expect(result.icon).toBe('x-circle');
      expect(result.color).toContain('red');
    });
  });

  describe('Type definitions', () => {
    it('should have correct StatusColorConfig structure', () => {
      const config: StatusColorConfig = {
        bg: 'bg-gray-100',
        text: 'text-gray-800',
      };
      expect(config.bg).toBeDefined();
      expect(config.text).toBeDefined();
    });

    it('should have correct TransitionTypeStyleConfig structure', () => {
      const config: TransitionTypeStyleConfig = {
        icon: 'arrow-right',
        color: 'text-green-700',
        bgColor: 'bg-green-50',
      };
      expect(config.icon).toBeDefined();
      expect(config.color).toBeDefined();
      expect(config.bgColor).toBeDefined();
    });
  });

  describe('WCAG 2.1 Level AA compliance', () => {
    it('should use sufficient contrast colors (light bg with dark text)', () => {
      // 背景色が100系（明るい）で、テキスト色が700または800系（暗い）であることを確認
      PROJECT_STATUSES.forEach((status) => {
        const { bg, text } = STATUS_COLORS[status];
        expect(bg).toMatch(/bg-\w+-100/);
        expect(text).toMatch(/text-\w+-[78]00/);
      });
    });

    it('should use sufficient contrast for transition type styles', () => {
      // 背景色が50系（明るい）で、テキスト色が700系（暗い）であることを確認
      TRANSITION_TYPES.forEach((type) => {
        const { color, bgColor } = TRANSITION_TYPE_STYLES[type];
        expect(bgColor).toMatch(/bg-\w+-50/);
        expect(color).toMatch(/text-\w+-700/);
      });
    });
  });
});
