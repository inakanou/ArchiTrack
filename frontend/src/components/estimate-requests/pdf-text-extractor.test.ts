/**
 * @fileoverview PDFテキスト抽出 - 画像前処理パイプラインのユニットテスト
 *
 * Task 46: OCR画像前処理のユニットテスト
 *
 * Requirements:
 * - 19.2: グレースケール変換
 * - 19.3: 大津の二値化
 * - 19.4: 水平線除去
 * - 19.5: 垂直線除去
 * - 19.6: 画像前処理パイプライン統合
 */

import { describe, it, expect } from 'vitest';
import {
  toGrayscale,
  otsuBinarize,
  removeHorizontalLines,
  removeVerticalLines,
  preprocessImageData,
} from './pdf-text-extractor';

/**
 * テスト用ImageDataを作成するヘルパー関数
 * jsdom環境ではImageDataコンストラクタが利用できないため、
 * プレーンオブジェクトで代用する
 */
function createTestImageData(
  width: number,
  height: number,
  fillColor?: [number, number, number, number]
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fillColor) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fillColor[0];
      data[i + 1] = fillColor[1];
      data[i + 2] = fillColor[2];
      data[i + 3] = fillColor[3];
    }
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

/**
 * 特定ピクセルのRGBA値を取得するヘルパー
 */
function getPixel(imageData: ImageData, x: number, y: number): [number, number, number, number] {
  const idx = (y * imageData.width + x) * 4;
  return [
    imageData.data[idx] ?? 0,
    imageData.data[idx + 1] ?? 0,
    imageData.data[idx + 2] ?? 0,
    imageData.data[idx + 3] ?? 0,
  ];
}

/**
 * 特定ピクセルのRGBA値を設定するヘルパー
 */
function setPixel(
  imageData: ImageData,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number = 255
): void {
  const idx = (y * imageData.width + x) * 4;
  imageData.data[idx] = r;
  imageData.data[idx + 1] = g;
  imageData.data[idx + 2] = b;
  imageData.data[idx + 3] = a;
}

// ============================================================================
// Task 46.1: グレースケール変換のテスト (Requirement 19.2)
// ============================================================================

describe('toGrayscale', () => {
  it('赤色（255,0,0）のピクセルがグレースケール値（約76）に変換される', () => {
    const imageData = createTestImageData(1, 1, [255, 0, 0, 255]);

    toGrayscale(imageData);

    const [r, g, b, a] = getPixel(imageData, 0, 0);
    // 0.299*255 + 0.587*0 + 0.114*0 = 76.245 ≈ 76
    expect(r).toBeCloseTo(76, 0);
    expect(g).toBeCloseTo(76, 0);
    expect(b).toBeCloseTo(76, 0);
    expect(a).toBe(255);
  });

  it('白色（255,255,255）がそのまま維持される', () => {
    const imageData = createTestImageData(1, 1, [255, 255, 255, 255]);

    toGrayscale(imageData);

    const [r, g, b, a] = getPixel(imageData, 0, 0);
    // 0.299*255 + 0.587*255 + 0.114*255 = 255
    expect(r).toBe(255);
    expect(g).toBe(255);
    expect(b).toBe(255);
    expect(a).toBe(255);
  });

  it('黒色（0,0,0）がそのまま維持される', () => {
    const imageData = createTestImageData(1, 1, [0, 0, 0, 255]);

    toGrayscale(imageData);

    const [r, g, b, a] = getPixel(imageData, 0, 0);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
    expect(a).toBe(255);
  });

  it('複数ピクセルのImageDataに対して全ピクセルが変換される', () => {
    // 2x2の画像: 赤、緑、青、白
    const imageData = createTestImageData(2, 2);
    setPixel(imageData, 0, 0, 255, 0, 0); // 赤
    setPixel(imageData, 1, 0, 0, 255, 0); // 緑
    setPixel(imageData, 0, 1, 0, 0, 255); // 青
    setPixel(imageData, 1, 1, 255, 255, 255); // 白

    toGrayscale(imageData);

    // 赤: 0.299*255 ≈ 76
    const [r1] = getPixel(imageData, 0, 0);
    expect(r1).toBeCloseTo(76, 0);

    // 緑: 0.587*255 ≈ 150
    const [r2] = getPixel(imageData, 1, 0);
    expect(r2).toBeCloseTo(150, 0);

    // 青: 0.114*255 ≈ 29
    const [r3] = getPixel(imageData, 0, 1);
    expect(r3).toBeCloseTo(29, 0);

    // 白: 255
    const [r4] = getPixel(imageData, 1, 1);
    expect(r4).toBe(255);
  });

  it('インプレースで変換される（同じImageData参照が変更される）', () => {
    const imageData = createTestImageData(1, 1, [255, 0, 0, 255]);
    const originalData = imageData.data;

    toGrayscale(imageData);

    // 同じdata配列が変更される
    expect(imageData.data).toBe(originalData);
  });
});

// ============================================================================
// Task 46.2: 大津の二値化のテスト (Requirement 19.3)
// ============================================================================

describe('otsuBinarize', () => {
  it('明確な二峰性ヒストグラムに対して適切な閾値が算出される', () => {
    // 10x1の画像: 前半5ピクセルは暗い（50）、後半5ピクセルは明るい（200）
    const imageData = createTestImageData(10, 1);
    for (let x = 0; x < 5; x++) {
      setPixel(imageData, x, 0, 50, 50, 50);
    }
    for (let x = 5; x < 10; x++) {
      setPixel(imageData, x, 0, 200, 200, 200);
    }

    otsuBinarize(imageData);

    // 暗いピクセルは0（黒）に変換される
    for (let x = 0; x < 5; x++) {
      const [r] = getPixel(imageData, x, 0);
      expect(r).toBe(0);
    }
    // 明るいピクセルは255（白）に変換される
    for (let x = 5; x < 10; x++) {
      const [r] = getPixel(imageData, x, 0);
      expect(r).toBe(255);
    }
  });

  it('閾値に基づき0または255のいずれかに変換される', () => {
    // グラデーション画像（0-255）
    const imageData = createTestImageData(256, 1);
    for (let x = 0; x < 256; x++) {
      setPixel(imageData, x, 0, x, x, x);
    }

    otsuBinarize(imageData);

    // すべてのピクセルが0か255のいずれかである
    for (let x = 0; x < 256; x++) {
      const [r] = getPixel(imageData, x, 0);
      expect(r === 0 || r === 255).toBe(true);
    }
  });

  it('全白の入力に対してもエラーなく動作する', () => {
    const imageData = createTestImageData(5, 5, [255, 255, 255, 255]);

    expect(() => otsuBinarize(imageData)).not.toThrow();

    // 全白が維持される（閾値以上のため255）
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const [r] = getPixel(imageData, x, y);
        expect(r).toBe(255);
      }
    }
  });

  it('全黒の入力に対してもエラーなく動作する', () => {
    const imageData = createTestImageData(5, 5, [0, 0, 0, 255]);

    expect(() => otsuBinarize(imageData)).not.toThrow();

    // 全黒が維持される（閾値以下のため0）
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const [r] = getPixel(imageData, x, y);
        expect(r).toBe(0);
      }
    }
  });
});

// ============================================================================
// Task 46.3: 水平線除去のテスト (Requirement 19.4)
// ============================================================================

describe('removeHorizontalLines', () => {
  it('画像幅の30%以上の連続黒ピクセルの水平ランが白に置換される', () => {
    // 10x3の画像（白背景）
    const imageData = createTestImageData(10, 3, [255, 255, 255, 255]);

    // 中央行に幅4（40%）の水平線を描画（閾値30%以上）
    for (let x = 2; x < 6; x++) {
      setPixel(imageData, x, 1, 0, 0, 0);
    }

    removeHorizontalLines(imageData, 0.3);

    // 水平線が白に置換されている
    for (let x = 2; x < 6; x++) {
      const [r] = getPixel(imageData, x, 1);
      expect(r).toBe(255);
    }
  });

  it('画像幅の30%未満の連続黒ピクセル（文字の一部）が保持される', () => {
    // 10x3の画像（白背景）
    const imageData = createTestImageData(10, 3, [255, 255, 255, 255]);

    // 中央行に幅2（20%）の短い黒ピクセル（閾値30%未満）
    setPixel(imageData, 3, 1, 0, 0, 0);
    setPixel(imageData, 4, 1, 0, 0, 0);

    removeHorizontalLines(imageData, 0.3);

    // 短い黒ピクセルは保持される
    const [r1] = getPixel(imageData, 3, 1);
    const [r2] = getPixel(imageData, 4, 1);
    expect(r1).toBe(0);
    expect(r2).toBe(0);
  });

  it('複数行にまたがる水平線がすべて除去される', () => {
    // 10x5の画像（白背景）
    const imageData = createTestImageData(10, 5, [255, 255, 255, 255]);

    // 行1と行3に水平線を描画
    for (let x = 0; x < 10; x++) {
      setPixel(imageData, x, 1, 0, 0, 0);
      setPixel(imageData, x, 3, 0, 0, 0);
    }

    removeHorizontalLines(imageData, 0.3);

    // 両方の水平線が除去されている
    for (let x = 0; x < 10; x++) {
      const [r1] = getPixel(imageData, x, 1);
      const [r3] = getPixel(imageData, x, 3);
      expect(r1).toBe(255);
      expect(r3).toBe(255);
    }
  });
});

// ============================================================================
// Task 46.4: 垂直線除去のテスト (Requirement 19.5)
// ============================================================================

describe('removeVerticalLines', () => {
  it('画像高さの30%以上の連続黒ピクセルの垂直ランが白に置換される', () => {
    // 3x10の画像（白背景）
    const imageData = createTestImageData(3, 10, [255, 255, 255, 255]);

    // 中央列に高さ4（40%）の垂直線を描画（閾値30%以上）
    for (let y = 2; y < 6; y++) {
      setPixel(imageData, 1, y, 0, 0, 0);
    }

    removeVerticalLines(imageData, 0.3);

    // 垂直線が白に置換されている
    for (let y = 2; y < 6; y++) {
      const [r] = getPixel(imageData, 1, y);
      expect(r).toBe(255);
    }
  });

  it('画像高さの30%未満の連続黒ピクセル（文字の一部）が保持される', () => {
    // 3x10の画像（白背景）
    const imageData = createTestImageData(3, 10, [255, 255, 255, 255]);

    // 中央列に高さ2（20%）の短い黒ピクセル（閾値30%未満）
    setPixel(imageData, 1, 3, 0, 0, 0);
    setPixel(imageData, 1, 4, 0, 0, 0);

    removeVerticalLines(imageData, 0.3);

    // 短い黒ピクセルは保持される
    const [r1] = getPixel(imageData, 1, 3);
    const [r2] = getPixel(imageData, 1, 4);
    expect(r1).toBe(0);
    expect(r2).toBe(0);
  });
});

// ============================================================================
// Task 46.5: preprocessImageDataパイプライン統合テスト (Requirement 19.6)
// ============================================================================

describe('preprocessImageData', () => {
  it('4ステップ（グレースケール→二値化→水平線除去→垂直線除去）が順次実行される', () => {
    // 100x100の画像（白背景にカラーの罫線パターン）
    const imageData = createTestImageData(100, 100, [240, 240, 240, 255]);

    // 水平線（暗色、幅の80%）- row 20
    for (let x = 0; x < 80; x++) {
      setPixel(imageData, x, 20, 20, 20, 20);
    }

    // 垂直線（暗色、高さの80%）- col 50
    for (let y = 0; y < 80; y++) {
      setPixel(imageData, 50, y, 20, 20, 20);
    }

    // 文字（小さな黒のブロック、5x5）
    for (let dy = 0; dy < 5; dy++) {
      for (let dx = 0; dx < 5; dx++) {
        setPixel(imageData, 10 + dx, 60 + dy, 30, 30, 30);
      }
    }

    const result = preprocessImageData(imageData);

    // 同じ参照が返される（インプレース変更）
    expect(result).toBe(imageData);

    // すべてのピクセルが0か255のいずれか（二値化済み）
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        const [r] = getPixel(imageData, x, y);
        expect(r === 0 || r === 255).toBe(true);
      }
    }

    // 水平線が除去されている（row 20の大部分が白）
    let horizontalLineBlackCount = 0;
    for (let x = 0; x < 80; x++) {
      const [r] = getPixel(imageData, x, 20);
      if (r === 0) horizontalLineBlackCount++;
    }
    // 水平線はほぼ全て除去されているはず
    expect(horizontalLineBlackCount).toBeLessThan(10);

    // 垂直線が除去されている（col 50の大部分が白）
    // 水平線除去でrow 20の交差点が白化されるため、垂直線は0-19(20px)と21-79(59px)に分割
    // 59px(59%)は30%以上なので除去、20px(20%)は30%未満なので保持される
    let verticalLineBlackCount = 0;
    for (let y = 0; y < 80; y++) {
      const [r] = getPixel(imageData, 50, y);
      if (r === 0) verticalLineBlackCount++;
    }
    // 短い分割部分（20px）が残存するため許容値を広げる
    expect(verticalLineBlackCount).toBeLessThan(25);
  });

  it('罫線パターンを含む合成ImageDataに対して罫線が除去され文字部分が保持される', () => {
    // 100x100の画像（白背景）
    const imageData = createTestImageData(100, 100, [255, 255, 255, 255]);

    // 水平罫線（row 10）- 全幅（100%）
    for (let x = 0; x < 100; x++) {
      setPixel(imageData, x, 10, 0, 0, 0);
    }

    // 垂直罫線（col 90）- 全高（100%）
    // 水平線とは異なる位置に配置して、交差の影響を最小化
    for (let y = 0; y < 100; y++) {
      setPixel(imageData, 90, y, 0, 0, 0);
    }

    // 文字ブロック（5x5の塊、2箇所）
    const charPositions = [
      { x: 5, y: 30 },
      { x: 40, y: 60 },
    ];
    for (const pos of charPositions) {
      for (let dy = 0; dy < 5; dy++) {
        for (let dx = 0; dx < 5; dx++) {
          setPixel(imageData, pos.x + dx, pos.y + dy, 0, 0, 0);
        }
      }
    }

    preprocessImageData(imageData);

    // 水平罫線が除去されている（row 10の大部分が白）
    let horizontalBlackCount = 0;
    for (let x = 0; x < 100; x++) {
      const [r] = getPixel(imageData, x, 10);
      if (r === 0) horizontalBlackCount++;
    }
    // 水平線は除去されているはず（交差点1箇所の残存を許容）
    expect(horizontalBlackCount).toBeLessThan(5);

    // 垂直罫線が除去されている（col 90の大部分が白）
    // 水平線除去でrow 10の交差点が白になるため、垂直線は0-9(10px)と11-99(89px)に分割
    // 89pxは89%なので30%以上、除去される
    // 10pxは10%なので30%未満、保持される
    let verticalBlackCount = 0;
    for (let y = 0; y < 100; y++) {
      const [r] = getPixel(imageData, 90, y);
      if (r === 0) verticalBlackCount++;
    }
    // 垂直線の大部分（89px分）が除去され、短い部分（10px分）が残る
    expect(verticalBlackCount).toBeLessThan(15);

    // 文字ブロック（5x5は画像幅/高さの5%未満なので罫線除去の対象にならない）
    // 二値化で0に変換されているはず
    for (const pos of charPositions) {
      let blackCount = 0;
      for (let dy = 0; dy < 5; dy++) {
        for (let dx = 0; dx < 5; dx++) {
          const [r] = getPixel(imageData, pos.x + dx, pos.y + dy);
          if (r === 0) blackCount++;
        }
      }
      // 文字部分の黒ピクセルがある程度保持されている
      expect(blackCount).toBeGreaterThan(0);
    }
  });
});
