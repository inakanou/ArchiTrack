/**
 * @fileoverview useCameraAvailability フックのテスト
 *
 * Task 23.5: カメラをサポートしない端末でカメラの導線を出さない
 *
 * 端末のカメラの有無を `navigator.mediaDevices.enumerateDevices()` が列挙する
 * 機器の種類（`videoinput`）から判定すること、判定できないとき（API が無い・
 * 列挙が失敗する・列挙が空・判定の途中）は「判定できない」とし、カメラの導線を
 * 出す側へ倒すこと、機器の抜き差し（`devicechange`）で判定し直すことを検証する。
 *
 * Requirements (construction-photo):
 * - 5.3: デバイスがカメラをサポートしない場合、カメラ撮影による追加手段を提供せず
 *   ローカルアップロード手段のみを提示する
 *
 * Design: design.md `### Frontend Interfaces（R5.3 カメラの導線の出し分け）`
 *
 * @requirement construction-photo/REQ-5.3
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  classifyCameraAvailability,
  probeCameraAvailability,
  useCameraAvailability,
} from './useCameraAvailability';

// ============================================================================
// navigator.mediaDevices の差し替え
//
// jsdom は navigator.mediaDevices を実装しない。テストを条件付きで無効化せず、
// 各ケースで期待する端末の状態を明示的に差し替える（AI運用第3原則）。
// ============================================================================

const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

function device(kind: MediaDeviceKind): MediaDeviceInfo {
  // 許可の前は deviceId / label が空で返る（種類だけが分かる）実ブラウザの形に合わせる
  return { kind, deviceId: '', groupId: '', label: '', toJSON: () => ({}) } as MediaDeviceInfo;
}

interface FakeMediaDevices extends EventTarget {
  enumerateDevices: ReturnType<typeof vi.fn>;
}

function installMediaDevices(enumerateDevices: () => Promise<MediaDeviceInfo[]>): FakeMediaDevices {
  const target = new EventTarget() as FakeMediaDevices;
  target.enumerateDevices = vi.fn(enumerateDevices);
  Object.defineProperty(navigator, 'mediaDevices', { value: target, configurable: true });
  return target;
}

function removeMediaDevices(): void {
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
}

// ============================================================================
// document.permissionsPolicy / document.featurePolicy の差し替え
//
// jsdom はどちらも実装しない。権限ポリシーが camera を許さない文書では、列挙から
// カメラが省かれる（W3C Media Capture and Streams「creating a list of device info
// objects」）。その場合を各ケースで明示的に作る。
// ============================================================================

type PolicyApiName = 'permissionsPolicy' | 'featurePolicy';

function installPolicy(name: PolicyApiName, allowsCamera: boolean): ReturnType<typeof vi.fn> {
  const allowsFeature = vi.fn((feature: string) => (feature === 'camera' ? allowsCamera : true));
  Object.defineProperty(document, name, { value: { allowsFeature }, configurable: true });
  return allowsFeature;
}

afterEach(() => {
  if (originalDescriptor) {
    Object.defineProperty(navigator, 'mediaDevices', originalDescriptor);
  } else {
    // jsdom の既定（未実装）へ戻す
    delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  }
  delete (document as { permissionsPolicy?: unknown }).permissionsPolicy;
  delete (document as { featurePolicy?: unknown }).featurePolicy;
});

// ============================================================================
// 列挙結果の分類（純関数）
// ============================================================================

describe('classifyCameraAvailability', () => {
  it('videoinput が一つでもあれば available', () => {
    expect(classifyCameraAvailability([device('audioinput'), device('videoinput')])).toBe(
      'available'
    );
  });

  it('機器は列挙されたが videoinput が無ければ unavailable', () => {
    expect(classifyCameraAvailability([device('audioinput'), device('audiooutput')])).toBe(
      'unavailable'
    );
  });

  it('列挙が空なら判定できない（unknown）。許可の前に何も列挙しない実装と区別できないため', () => {
    expect(classifyCameraAvailability([])).toBe('unknown');
  });
});

// ============================================================================
// 端末への問い合わせ
// ============================================================================

describe('probeCameraAvailability', () => {
  it('navigator.mediaDevices が無い（非セキュアコンテキスト・未対応ブラウザ）なら unknown', async () => {
    removeMediaDevices();
    await expect(probeCameraAvailability()).resolves.toBe('unknown');
  });

  it('enumerateDevices が無ければ unknown', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: new EventTarget(),
      configurable: true,
    });
    await expect(probeCameraAvailability()).resolves.toBe('unknown');
  });

  it('enumerateDevices が reject したら unknown', async () => {
    installMediaDevices(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    await expect(probeCameraAvailability()).resolves.toBe('unknown');
  });

  it('enumerateDevices が同期的に例外を投げても unknown', async () => {
    installMediaDevices(() => {
      throw new Error('boom');
    });
    await expect(probeCameraAvailability()).resolves.toBe('unknown');
  });

  // 権限ポリシーが camera を許さない文書では、カメラを持つ端末でも列挙から videoinput が
  // 省かれる。その列挙を信じて隠すと、ポリシーの対象外である capture 付きのファイル入力
  // （OS のカメラを起動できる）まで奪うため、判定できない（unknown）とする
  it('permissionsPolicy が camera を許さない文書では、videoinput の無い列挙を信じず unknown', async () => {
    const allowsFeature = installPolicy('permissionsPolicy', false);
    installMediaDevices(() => Promise.resolve([device('audioinput')]));
    await expect(probeCameraAvailability()).resolves.toBe('unknown');
    expect(allowsFeature).toHaveBeenCalledWith('camera');
  });

  it('permissionsPolicy が無く featurePolicy（以前の名前の API）が camera を許さない文書でも unknown', async () => {
    const allowsFeature = installPolicy('featurePolicy', false);
    installMediaDevices(() => Promise.resolve([device('audioinput')]));
    await expect(probeCameraAvailability()).resolves.toBe('unknown');
    expect(allowsFeature).toHaveBeenCalledWith('camera');
  });

  it('permissionsPolicy が camera を許す文書では、videoinput の無い列挙は従来どおり unavailable', async () => {
    const allowsFeature = installPolicy('permissionsPolicy', true);
    installMediaDevices(() => Promise.resolve([device('audioinput')]));
    await expect(probeCameraAvailability()).resolves.toBe('unavailable');
    expect(allowsFeature).toHaveBeenCalledWith('camera');
  });

  it('権限ポリシーの API がどちらも無い文書では、列挙だけで判定する（unavailable）', async () => {
    expect((document as { permissionsPolicy?: unknown }).permissionsPolicy).toBeUndefined();
    expect((document as { featurePolicy?: unknown }).featurePolicy).toBeUndefined();
    installMediaDevices(() => Promise.resolve([device('audioinput')]));
    await expect(probeCameraAvailability()).resolves.toBe('unavailable');
  });

  it('権限ポリシーの問い合わせが例外を投げたら、判定できない（unknown）', async () => {
    Object.defineProperty(document, 'permissionsPolicy', {
      value: {
        allowsFeature: () => {
          throw new Error('boom');
        },
      },
      configurable: true,
    });
    installMediaDevices(() => Promise.resolve([device('audioinput')]));
    await expect(probeCameraAvailability()).resolves.toBe('unknown');
  });

  it('videoinput を列挙すれば available、列挙に無ければ unavailable', async () => {
    installMediaDevices(() => Promise.resolve([device('videoinput')]));
    await expect(probeCameraAvailability()).resolves.toBe('available');

    installMediaDevices(() => Promise.resolve([device('audioinput')]));
    await expect(probeCameraAvailability()).resolves.toBe('unavailable');
  });
});

// ============================================================================
// フック
// ============================================================================

describe('useCameraAvailability', () => {
  it('判定が確定するまでは unknown を返す', async () => {
    let resolveDevices: (devices: MediaDeviceInfo[]) => void = () => {};
    installMediaDevices(
      () =>
        new Promise<MediaDeviceInfo[]>((resolve) => {
          resolveDevices = resolve;
        })
    );

    const { result } = renderHook(() => useCameraAvailability());
    expect(result.current).toBe('unknown');

    await act(async () => {
      resolveDevices([device('audioinput')]);
    });
    expect(result.current).toBe('unavailable');
  });

  it('videoinput を列挙する端末では available', async () => {
    installMediaDevices(() => Promise.resolve([device('videoinput')]));
    const { result } = renderHook(() => useCameraAvailability());
    await waitFor(() => expect(result.current).toBe('available'));
  });

  it('機器はあるが videoinput が無い端末では unavailable', async () => {
    installMediaDevices(() => Promise.resolve([device('audioinput'), device('audiooutput')]));
    const { result } = renderHook(() => useCameraAvailability());
    await waitFor(() => expect(result.current).toBe('unavailable'));
  });

  it('API が無い端末では unknown のまま', async () => {
    removeMediaDevices();
    const { result } = renderHook(() => useCameraAvailability());
    // 問い合わせの完了を待ってから、unknown のままであることを主張する
    await act(async () => {
      // 問い合わせのマイクロタスクをすべて流しきる
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current).toBe('unknown');
  });

  it('列挙が reject する端末では unknown のまま', async () => {
    const media = installMediaDevices(() => Promise.reject(new Error('failed')));
    const { result } = renderHook(() => useCameraAvailability());
    await waitFor(() => expect(media.enumerateDevices).toHaveBeenCalledTimes(1));
    await act(async () => {
      // 問い合わせのマイクロタスクをすべて流しきる
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current).toBe('unknown');
  });

  it('devicechange でカメラが接続されたら available へ、外されたら unavailable へ判定し直す', async () => {
    let devices: MediaDeviceInfo[] = [device('audioinput')];
    const media = installMediaDevices(() => Promise.resolve(devices));

    const { result } = renderHook(() => useCameraAvailability());
    await waitFor(() => expect(result.current).toBe('unavailable'));

    devices = [device('audioinput'), device('videoinput')];
    await act(async () => {
      media.dispatchEvent(new Event('devicechange'));
    });
    await waitFor(() => expect(result.current).toBe('available'));

    devices = [device('audioinput')];
    await act(async () => {
      media.dispatchEvent(new Event('devicechange'));
    });
    await waitFor(() => expect(result.current).toBe('unavailable'));
    expect(media.enumerateDevices).toHaveBeenCalledTimes(3);
  });

  it('先に始めた問い合わせが後から解決しても、新しい判定を上書きしない', async () => {
    const resolvers: Array<(devices: MediaDeviceInfo[]) => void> = [];
    const media = installMediaDevices(
      () =>
        new Promise<MediaDeviceInfo[]>((resolve) => {
          resolvers.push(resolve);
        })
    );

    const { result } = renderHook(() => useCameraAvailability());
    await act(async () => {
      media.dispatchEvent(new Event('devicechange'));
    });
    expect(resolvers).toHaveLength(2);

    // 新しい問い合わせ（カメラあり）が先に解決し、古い問い合わせ（カメラなし）が後から解決する
    await act(async () => {
      resolvers[1]!([device('videoinput')]);
    });
    expect(result.current).toBe('available');
    await act(async () => {
      resolvers[0]!([device('audioinput')]);
    });
    expect(result.current).toBe('available');
  });

  it('アンマウント後は devicechange を購読しない', async () => {
    const media = installMediaDevices(() => Promise.resolve([device('audioinput')]));
    const { result, unmount } = renderHook(() => useCameraAvailability());
    await waitFor(() => expect(result.current).toBe('unavailable'));
    expect(media.enumerateDevices).toHaveBeenCalledTimes(1);

    unmount();
    media.dispatchEvent(new Event('devicechange'));
    expect(media.enumerateDevices).toHaveBeenCalledTimes(1);
  });
});
