/**
 * @fileoverview 帳票の表紙に載せる周辺情報の取得（Task 56.9）
 *
 * 帳票（PDF）の表紙は見積明細の外側にある情報を必要とする（51.2〜51.15）。
 *
 * - 工事名・工事場所 … プロジェクト（`GET /api/projects/:id`）
 * - 宛先の名称・代表者名 … プロジェクトの取引先（`GET /api/trading-partners/:id`）
 * - 自社情報 … 自社情報登録（`GET /api/company-info`）
 *
 * いずれも**読み取りのみ**であり、帳票出力が保存操作を伴わない（56.3）ことを壊さない。
 * 出力ダイアログから切り出しているのは、UI と取得経路を別々に検証できるようにするため。
 *
 * 自社情報が未登録の場合、`GET /api/company-info` は空オブジェクトを返す
 * （`CompanyInfoResponse`）。その場合は全項目 `null` の `CompanyInfoSnapshot` を返し、
 * 表紙側の未登録時の表現（51.13）に委ねる。
 *
 * @module services/export/estimateReportSubject
 */

import { getProject } from '../../api/projects';
import { getTradingPartner } from '../../api/trading-partners';
import { getCompanyInfo } from '../../api/company-info';
import { isCompanyInfo } from '../../types/company-info.types';
import type { CompanyInfoSnapshot } from './EstimateCoverRenderer';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 帳票の表紙に載せる周辺情報
 *
 * `EstimatePdfExportInput` の `project` / `customer` / `company` と同じ形。
 */
export interface EstimateReportSubject {
  readonly project: { readonly name: string; readonly siteAddress: string | null };
  readonly customer: {
    readonly name: string | null;
    readonly representativeName: string | null;
  };
  readonly company: CompanyInfoSnapshot;
}

/**
 * 自社情報が未登録のときの表紙用スナップショット（51.13）
 *
 * **意図的に export しない**。テストがこの定数を import して期待値に使うと、
 * 定数がドリフトしてもアサーションが一緒に動いてしまい「全項目 null」の主張が
 * 空振りになる（表紙に捏造された会社情報が黙って印字される経路）。
 * 期待値はテスト側にリテラルで直書きすること。
 */
const UNREGISTERED_COMPANY: CompanyInfoSnapshot = {
  companyName: null,
  representative: null,
  address: null,
  phone: null,
  fax: null,
};

// ============================================================================
// 取得
// ============================================================================

/**
 * 帳票の表紙に載せる周辺情報を取得する
 *
 * @param projectId - 見積書が属するプロジェクトのID
 * @returns 表紙の描画に必要な周辺情報
 */
export async function loadEstimateReportSubject(projectId: string): Promise<EstimateReportSubject> {
  const [project, companyResponse] = await Promise.all([getProject(projectId), getCompanyInfo()]);

  // 代表者名はプロジェクトが持つ取引先サマリー（id / name / nameKana）に無いため、
  // 取引先が紐付いている場合のみ詳細を1件読む。
  const tradingPartner =
    project.tradingPartnerId !== null ? await getTradingPartner(project.tradingPartnerId) : null;

  return {
    project: { name: project.name, siteAddress: project.siteAddress ?? null },
    // 宛先は**取引先詳細**から取る。`project.tradingPartner`（要約）へのフォールバックは
    // 置かない——`TradingPartnerInfo.name` は非 null なので、取引先が紐付いていれば
    // 詳細の名称が必ず勝ち、紐付いていなければ要約も存在しないため、
    // 到達しえない分岐＝検証しえない分岐になるだけだった。
    customer: {
      name: tradingPartner?.name ?? null,
      representativeName: tradingPartner?.representativeName ?? null,
    },
    company: isCompanyInfo(companyResponse)
      ? {
          companyName: companyResponse.companyName,
          representative: companyResponse.representative,
          address: companyResponse.address,
          phone: companyResponse.phone,
          fax: companyResponse.fax,
        }
      : UNREGISTERED_COMPANY,
  };
}
