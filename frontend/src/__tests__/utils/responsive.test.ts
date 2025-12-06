/**
 * @fileoverview レスポンシブユーティリティテスト
 *
 * Task 11.1: 画面幅対応の実装
 *
 * Requirements:
 * - 15.5: 320px〜1920pxの画面幅に対応
 * - 15.1, 15.2: レスポンシブデザイン
 */

import { describe, it, expect } from 'vitest';
import {
  BREAKPOINTS,
  MIN_VIEWPORT_WIDTH,
  MAX_VIEWPORT_WIDTH,
  MEDIA_QUERIES,
  getBreakpointForWidth,
  isWithinSupportedRange,
  getResponsiveValue,
} from '../../utils/responsive';

describe('responsive', () => {
  describe('BREAKPOINTS', () => {
    it('should define mobile breakpoint at 768px', () => {
      expect(BREAKPOINTS.mobile).toBe(768);
    });

    it('should define tablet breakpoint at 1024px', () => {
      expect(BREAKPOINTS.tablet).toBe(1024);
    });

    it('should define desktop breakpoint at 1280px', () => {
      expect(BREAKPOINTS.desktop).toBe(1280);
    });

    it('should define all breakpoints in ascending order', () => {
      expect(BREAKPOINTS.mobile).toBeLessThan(BREAKPOINTS.tablet);
      expect(BREAKPOINTS.tablet).toBeLessThan(BREAKPOINTS.desktop);
    });
  });

  describe('viewport constants', () => {
    it('should define minimum viewport width as 320px', () => {
      expect(MIN_VIEWPORT_WIDTH).toBe(320);
    });

    it('should define maximum viewport width as 1920px', () => {
      expect(MAX_VIEWPORT_WIDTH).toBe(1920);
    });
  });

  describe('MEDIA_QUERIES', () => {
    it('should define isMobile query for max-width 767px', () => {
      expect(MEDIA_QUERIES.isMobile).toBe('(max-width: 767px)');
    });

    it('should define isTablet query for 768px to 1023px', () => {
      expect(MEDIA_QUERIES.isTablet).toBe('(min-width: 768px) and (max-width: 1023px)');
    });

    it('should define isDesktop query for min-width 1024px', () => {
      expect(MEDIA_QUERIES.isDesktop).toBe('(min-width: 1024px)');
    });

    it('should define isSmallMobile query for max-width 479px', () => {
      expect(MEDIA_QUERIES.isSmallMobile).toBe('(max-width: 479px)');
    });

    it('should define isLargeDesktop query for min-width 1280px', () => {
      expect(MEDIA_QUERIES.isLargeDesktop).toBe('(min-width: 1280px)');
    });

    it('should define prefersReducedMotion query', () => {
      expect(MEDIA_QUERIES.prefersReducedMotion).toBe('(prefers-reduced-motion: reduce)');
    });
  });

  describe('getBreakpointForWidth', () => {
    it('should return "mobile" for width < 768px', () => {
      expect(getBreakpointForWidth(320)).toBe('mobile');
      expect(getBreakpointForWidth(767)).toBe('mobile');
    });

    it('should return "tablet" for width >= 768px and < 1024px', () => {
      expect(getBreakpointForWidth(768)).toBe('tablet');
      expect(getBreakpointForWidth(1023)).toBe('tablet');
    });

    it('should return "desktop" for width >= 1024px and < 1280px', () => {
      expect(getBreakpointForWidth(1024)).toBe('desktop');
      expect(getBreakpointForWidth(1279)).toBe('desktop');
    });

    it('should return "largeDesktop" for width >= 1280px', () => {
      expect(getBreakpointForWidth(1280)).toBe('largeDesktop');
      expect(getBreakpointForWidth(1920)).toBe('largeDesktop');
    });
  });

  describe('isWithinSupportedRange', () => {
    it('should return true for widths within 320px to 1920px', () => {
      expect(isWithinSupportedRange(320)).toBe(true);
      expect(isWithinSupportedRange(768)).toBe(true);
      expect(isWithinSupportedRange(1024)).toBe(true);
      expect(isWithinSupportedRange(1920)).toBe(true);
    });

    it('should return false for widths below 320px', () => {
      expect(isWithinSupportedRange(319)).toBe(false);
      expect(isWithinSupportedRange(0)).toBe(false);
    });

    it('should return false for widths above 1920px', () => {
      expect(isWithinSupportedRange(1921)).toBe(false);
      expect(isWithinSupportedRange(2560)).toBe(false);
    });
  });

  describe('getResponsiveValue', () => {
    it('should return mobile value for mobile breakpoint', () => {
      const result = getResponsiveValue('mobile', {
        mobile: 'small',
        tablet: 'medium',
        desktop: 'large',
      });
      expect(result).toBe('small');
    });

    it('should return tablet value for tablet breakpoint', () => {
      const result = getResponsiveValue('tablet', {
        mobile: 'small',
        tablet: 'medium',
        desktop: 'large',
      });
      expect(result).toBe('medium');
    });

    it('should return desktop value for desktop breakpoint', () => {
      const result = getResponsiveValue('desktop', {
        mobile: 'small',
        tablet: 'medium',
        desktop: 'large',
      });
      expect(result).toBe('large');
    });

    it('should return desktop value for largeDesktop breakpoint when desktop is defined', () => {
      const result = getResponsiveValue('largeDesktop', {
        mobile: 'small',
        tablet: 'medium',
        desktop: 'large',
      });
      expect(result).toBe('large');
    });

    it('should fallback to mobile value when specific breakpoint is not defined', () => {
      const result = getResponsiveValue('tablet', {
        mobile: 'default',
      });
      expect(result).toBe('default');
    });

    it('should fallback through breakpoints from tablet to mobile', () => {
      const result = getResponsiveValue('desktop', {
        mobile: 'mobile-value',
        tablet: 'tablet-value',
      });
      expect(result).toBe('tablet-value');
    });

    it('should return largeDesktop value when defined', () => {
      const result = getResponsiveValue('largeDesktop', {
        mobile: 'small',
        tablet: 'medium',
        desktop: 'large',
        largeDesktop: 'xlarge',
      });
      expect(result).toBe('xlarge');
    });

    it('should work with number values', () => {
      const result = getResponsiveValue('tablet', {
        mobile: 1,
        tablet: 2,
        desktop: 3,
      });
      expect(result).toBe(2);
    });

    it('should work with object values', () => {
      const result = getResponsiveValue('mobile', {
        mobile: { padding: '8px' },
        desktop: { padding: '16px' },
      });
      expect(result).toEqual({ padding: '8px' });
    });
  });
});
