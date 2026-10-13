/**
 * @fileoverview 端末のカメラの有無を判定するフック
 *
 * Task 23.5: カメラをサポートしない端末でカメラの導線を出さない（construction-photo 5.3）
 *
 * 判定の方法:
 *   `navigator.mediaDevices.enumerateDevices()` が列挙する機器の種類（`kind`）を見る。
 *   許可（getUserMedia）の前でも、主要なブラウザは機器の種類だけは列挙する
 *   （`deviceId` と `label` は空になる）。カメラが無い端末では `videoinput` が列挙されない。
 *
 * 判定の結果は三つである:
 *   - `available`   — `videoinput` が一つ以上ある
 *   - `unavailable` — 機器は列挙されたが `videoinput` が一つも無い
 *   - `unknown`     — 判定できない。API が無い（非セキュアコンテキスト・未対応のブラウザ）、
 *                     列挙が失敗した、列挙が空だった（許可の前に何も列挙しない実装・
 *                     機器を一切持たない環境と区別できない）、文書の権限ポリシーが
 *                     `camera` を許さない、権限ポリシーの問い合わせが失敗した、判定の途中
 *
 * 呼び出し側は `unavailable` のときだけカメラの導線を隠し、`unknown` では出す側へ倒す。
 * カメラの導線は `<input type="file" accept="image/*" capture>` であり、カメラの無い端末で
 * 押されても `capture` が無視されてファイルの選択が開くだけである。一方で誤って隠すと、
 * カメラを持つ端末から撮影の手段（5.1, 5.2）を奪うためである。
 *
 * 権限ポリシーによる絞り込み（誤って隠す経路の防御）:
 *   W3C Media Capture and Streams の「creating a list of device info objects」は、機器ごとに
 *   「If device is not a camera, or document is not allowed to use the feature identified by
 *   'camera', abort」と定め、MDN も「The returned list will omit any devices that are blocked by
 *   the document Permission Policy: microphone, camera …」と書く。つまり権限ポリシーが
 *   `camera` を許さない文書（`Permissions-Policy: camera=()` の応答ヘッダー、`allow="camera"` の
 *   無い iframe）では、カメラを持つ端末でも列挙が `audioinput` だけになる。一方で
 *   `capture` 付きのファイル入力はこのポリシーの対象外であり、OS のカメラを起動できる。
 *   そのため `document.permissionsPolicy.allowsFeature('camera')`（無ければ以前の名前の
 *   `document.featurePolicy.allowsFeature('camera')`）が偽なら、列挙を信じず `unknown` とする。
 *   どちらの API も持たないブラウザ（2026-10 時点では Chromium 系以外の多く）では、
 *   ポリシーで絞り込まれた列挙と区別できず、カメラを持つ端末でも導線が消えうる（残る限界）。
 *   現在の配信はこのヘッダーを送らず、最上位の文書として表示される。後から権限ポリシーを
 *   足す場合は `camera=(self)` とするか、この防御を保つこと。
 *
 * 機器の抜き差し（`devicechange`）で判定し直す。
 *
 * Requirements (construction-photo):
 * - 5.3: デバイスがカメラをサポートしない場合、カメラ撮影による追加手段を提供せず
 *   ローカルアップロード手段のみを提示する
 */

import { useEffect, useState } from 'react';

/** 端末のカメラの有無の判定結果 */
export type CameraAvailability = 'available' | 'unavailable' | 'unknown';

/**
 * 列挙された機器の一覧からカメラの有無を判定する（純関数）。
 *
 * 列挙が空のときは `unknown` とする。許可の前に何も列挙しないブラウザがあり、
 * 「カメラが無い」と区別できないためである。
 */
export function classifyCameraAvailability(
  devices: ReadonlyArray<Pick<MediaDeviceInfo, 'kind'>>
): CameraAvailability {
  if (devices.length === 0) {
    return 'unknown';
  }
  return devices.some((device) => device.kind === 'videoinput') ? 'available' : 'unavailable';
}

/** `allowsFeature` を持つ権限ポリシーの API（TS の標準の型定義に無いため最小限を宣言する） */
interface PolicyFeatureQuery {
  allowsFeature?: (feature: string) => boolean;
}

/** 権限ポリシーの API を持ちうる文書 */
type DocumentWithPolicy = Document & {
  permissionsPolicy?: PolicyFeatureQuery;
  featurePolicy?: PolicyFeatureQuery;
};

/**
 * 文書の権限ポリシーが `camera` を許すかを返す。
 *
 * - `true` / `false` — ポリシーの API が答えた
 * - `null` — API が無い（列挙だけで判定する）
 * - `'error'` — 問い合わせが例外を投げた（判定できない）
 *
 * `document.permissionsPolicy` を優先し、無ければ以前の名前の `document.featurePolicy` を見る。
 */
export function queryCameraPermissionsPolicy(): boolean | null | 'error' {
  if (typeof document === 'undefined') {
    return null;
  }
  const doc = document as DocumentWithPolicy;
  const policy = [doc.permissionsPolicy, doc.featurePolicy].find(
    (candidate): candidate is Required<PolicyFeatureQuery> =>
      !!candidate && typeof candidate.allowsFeature === 'function'
  );
  if (!policy) {
    return null;
  }
  try {
    return policy.allowsFeature('camera');
  } catch {
    return 'error';
  }
}

/**
 * 端末へ問い合わせてカメラの有無を判定する。例外を投げない。
 *
 * API が無い・列挙が失敗した場合は `unknown` を返す。文書の権限ポリシーが `camera` を
 * 許さない（または問い合わせが失敗した）場合も、列挙からカメラが省かれうるため `unknown` を返す。
 * 権限ポリシーの API が無い場合は列挙だけで判定する。
 */
export async function probeCameraAvailability(): Promise<CameraAvailability> {
  const mediaDevices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.enumerateDevices !== 'function') {
    return 'unknown';
  }
  const policyAllowsCamera = queryCameraPermissionsPolicy();
  if (policyAllowsCamera === false || policyAllowsCamera === 'error') {
    return 'unknown';
  }
  try {
    const devices = await mediaDevices.enumerateDevices();
    return classifyCameraAvailability(devices);
  } catch {
    return 'unknown';
  }
}

/**
 * 端末のカメラの有無を返すフック。
 *
 * 初回の判定が確定するまでは `unknown` を返す。`devicechange` を受けると判定し直し、
 * 先に始めた問い合わせが後から解決しても新しい判定を上書きしない。
 */
export function useCameraAvailability(): CameraAvailability {
  const [availability, setAvailability] = useState<CameraAvailability>('unknown');

  useEffect(() => {
    let disposed = false;
    let latestRequest = 0;

    const detect = () => {
      latestRequest += 1;
      const request = latestRequest;
      void probeCameraAvailability().then((result) => {
        if (!disposed && request === latestRequest) {
          setAvailability(result);
        }
      });
    };

    detect();

    const mediaDevices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    const canSubscribe = !!mediaDevices && typeof mediaDevices.addEventListener === 'function';
    if (canSubscribe) {
      mediaDevices.addEventListener('devicechange', detect);
    }

    return () => {
      disposed = true;
      if (canSubscribe) {
        mediaDevices.removeEventListener('devicechange', detect);
      }
    };
  }, []);

  return availability;
}
