/**
 * @fileoverview 帳票の表紙に載せる周辺情報の取得の単体テスト（Task 56.9）
 *
 * 表紙（51.2〜51.15）は明細の外側にある3つの情報源を必要とする。それぞれ
 * **未登録・未設定という正常系**を持つ（自社情報の未登録、取引先の無いプロジェクト、
 * 現場住所の空欄）ため、フィクスチャは埋まった側と空の側の両方に立てる。
 *
 * Requirements: 51.12〜51.14（表紙の宛先・自社情報）, 56.3（読み取りのみで保存しない）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getProject } from '../../api/projects';
import { getTradingPartner } from '../../api/trading-partners';
import { getCompanyInfo } from '../../api/company-info';
// 期待値は**実装の定数を import せずリテラルで直書き**する。
// 実装のヘルパへ委譲すると、定数がドリフトしたときに期待値も一緒に動き、
// 主張している挙動が固定されなくなる。
import { loadEstimateReportSubject } from './estimateReportSubject';
import type { ProjectDetail } from '../../types/project.types';
import type { CompanyInfo } from '../../types/company-info.types';
import type { TradingPartnerDetail } from '../../types/trading-partner.types';

vi.mock('../../api/projects');
vi.mock('../../api/trading-partners');
vi.mock('../../api/company-info');

const project = (overrides: Partial<ProjectDetail> = {}): ProjectDetail =>
  ({
    id: 'proj-1',
    name: '本社ビル改修工事',
    tradingPartnerId: 'tp-1',
    tradingPartner: { id: 'tp-1', name: '株式会社サンプル', nameKana: 'サンプル' },
    salesPerson: { id: 'user-1', displayName: '営業担当' },
    status: 'IN_PROGRESS',
    statusLabel: '進行中',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    siteAddress: '東京都千代田区1-1',
    ...overrides,
  }) as ProjectDetail;

const COMPANY: CompanyInfo = {
  id: 'company-1',
  companyName: '株式会社アークン',
  address: '大阪府大阪市1-1',
  representative: '中野一郎',
  phone: '06-0000-0000',
  fax: '06-0000-0001',
  email: null,
  invoiceRegistrationNumber: null,
  version: 1,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

/**
 * 取引先**詳細**（`GET /api/trading-partners/:id`）。
 *
 * プロジェクトが持つ取引先要約（`project.tradingPartner.name`）と**異なる名称**にしてある。
 * 同じ名称だと「詳細から取っているのか要約から取っているのか」が区別できず、
 * 取得元を入れ替える変異が生き残る。
 */
const PARTNER = {
  id: 'tp-1',
  name: '株式会社サンプル商事',
  representativeName: '山田太郎',
} as TradingPartnerDetail;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProject).mockResolvedValue(project());
  vi.mocked(getTradingPartner).mockResolvedValue(PARTNER);
  vi.mocked(getCompanyInfo).mockResolvedValue(COMPANY);
});

/**
 * @requirement estimate-creation/REQ-51.13 自社情報を自社情報登録機能に登録された内容から取得する
 */
describe('loadEstimateReportSubject', () => {
  it('プロジェクト・取引先・自社情報を表紙の入力へまとめる', async () => {
    const subject = await loadEstimateReportSubject('proj-1');

    expect(getProject).toHaveBeenCalledWith('proj-1');
    expect(getTradingPartner).toHaveBeenCalledWith('tp-1');
    expect(subject).toEqual({
      project: { name: '本社ビル改修工事', siteAddress: '東京都千代田区1-1' },
      // プロジェクト要約の '株式会社サンプル' ではなく、取引先詳細の名称が載る
      customer: { name: '株式会社サンプル商事', representativeName: '山田太郎' },
      company: {
        companyName: '株式会社アークン',
        representative: '中野一郎',
        address: '大阪府大阪市1-1',
        phone: '06-0000-0000',
        fax: '06-0000-0001',
      },
    });
  });

  it('自社情報が未登録（空オブジェクト）の場合は全項目 null にする', async () => {
    vi.mocked(getCompanyInfo).mockResolvedValue({});

    const subject = await loadEstimateReportSubject('proj-1');

    // REQ-51.13: 表紙の自社情報欄を空欄で描くため、全項目が null であること自体を固定する。
    // ここが実装の定数への参照だと、定数がドリフトしても検知できない。
    expect(subject.company).toEqual({
      companyName: null,
      representative: null,
      address: null,
      phone: null,
      fax: null,
    });
    // 未登録でも他の情報は落とさない
    expect(subject.project.name).toBe('本社ビル改修工事');
  });

  it('取引先が紐付いていないプロジェクトでは取引先を読まず宛先を null にする', async () => {
    vi.mocked(getProject).mockResolvedValue(
      project({ tradingPartnerId: null, tradingPartner: null })
    );

    const subject = await loadEstimateReportSubject('proj-1');

    expect(getTradingPartner).not.toHaveBeenCalled();
    expect(subject.customer).toEqual({ name: null, representativeName: null });
  });

  it('現場住所が未入力の場合は null にする（undefined を持ち込まない）', async () => {
    vi.mocked(getProject).mockResolvedValue(project({ siteAddress: undefined }));

    const subject = await loadEstimateReportSubject('proj-1');

    expect(subject.project.siteAddress).toBeNull();
  });

  it('取引先詳細に代表者名が無い場合は名称だけを載せる', async () => {
    vi.mocked(getTradingPartner).mockResolvedValue({
      ...PARTNER,
      representativeName: null,
    } as TradingPartnerDetail);

    const subject = await loadEstimateReportSubject('proj-1');

    expect(subject.customer).toEqual({ name: '株式会社サンプル商事', representativeName: null });
  });
});
