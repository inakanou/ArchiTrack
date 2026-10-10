/**
 * @vitest-environment jsdom
 *
 * @fileoverview ContractForm の監理者の候補の取得のテスト
 *
 * Task 18.5: 監理者の選択欄が取引先の一覧を取得できない状態を、画面の側の送り方を正して直す。
 * 監理者の選択欄（TradingPartnerSelect）を差し替えずに描き、取引先の一覧の API クライアントが
 * 実際に送る値を確かめる。API の側は一覧の API の契約（種別 type は単一の値だけを受け付け、
 * 複数の値は 400「無効な種別です」）を写した偽物で応じる。
 *
 * Requirements (contract-management):
 * - REQ-3.8: 新規契約フォームに監理者となる取引先を検索・選択できるUIを提供する
 * - REQ-5.3: 変更契約フォームに新規契約と同一の入力フィールド（監理者を含む）を提供する
 * - REQ-9.1: 契約書編集画面に新規作成画面で入力した全項目を編集可能な状態で表示する
 */

import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ContractForm from './ContractForm';
import * as contractsApi from '../../api/contracts';
import * as estimatesApi from '../../api/estimates';
import * as companyInfoApi from '../../api/company-info';
import { apiClient, ApiError } from '../../api/client';
import type { TradingPartnerInfo, TradingPartnerType } from '../../types/trading-partner.types';

vi.mock('../../api/contracts');
vi.mock('../../api/estimates');
vi.mock('../../api/company-info');
vi.mock('../../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/client')>();
  return { ...original, apiClient: { get: vi.fn() } };
});

// jsdom は scrollIntoView を持たない
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
});

// ============================================================================
// テストデータ
// ============================================================================

function partner(
  id: string,
  name: string,
  nameKana: string,
  types: TradingPartnerType[]
): TradingPartnerInfo {
  return {
    id,
    name,
    nameKana,
    branchName: null,
    representativeName: null,
    types,
    address: '東京都千代田区1-1-1',
    phoneNumber: null,
    faxNumber: null,
    email: null,
    billingClosingDay: null,
    paymentMonthOffset: null,
    paymentDay: null,
    notes: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

/** 顧客だけの取引先 */
const CUSTOMER_PARTNER = partner('tp-customer', '顧客の監理事務所', 'ウコキャク', ['CUSTOMER']);
/** 協力業者だけの取引先 */
const SUBCONTRACTOR_PARTNER = partner('tp-sub', '協力業者の監理事務所', 'アキョウリョク', [
  'SUBCONTRACTOR',
]);
/** 顧客と協力業者の両方の種別を持つ取引先（種別ごとの取得の両方に現れる） */
const BOTH_PARTNER = partner('tp-both', '両方の種別の監理事務所', 'イリョウホウ', [
  'CUSTOMER',
  'SUBCONTRACTOR',
]);
const ALL_PARTNERS = [CUSTOMER_PARTNER, SUBCONTRACTOR_PARTNER, BOTH_PARTNER];

const VALID_TYPES: readonly string[] = ['CUSTOMER', 'SUBCONTRACTOR'];

/** API クライアントへ渡された取引先一覧の要求のパス */
let tradingPartnerListPaths: string[] = [];

/**
 * 取引先一覧の API の偽物。backend の tradingPartnerListQuerySchema と同じく、
 * 種別 type は単一の値だけを受け付け、それ以外は 400「無効な種別です」を返す。
 * 応答はフリガナの昇順（sort=nameKana, order=asc）に並べる
 */
async function fakeApiGet(path: string): Promise<unknown> {
  const url = new URL(path, 'http://localhost');
  if (url.pathname !== '/api/trading-partners') {
    throw new Error(`想定しない要求: ${path}`);
  }
  tradingPartnerListPaths.push(path);
  const types = url.searchParams.getAll('type');
  const type = types[0];
  if (types.length > 1 || (type !== undefined && !VALID_TYPES.includes(type))) {
    throw new ApiError(400, '無効な種別です');
  }
  const data = ALL_PARTNERS.filter((p) =>
    type === undefined ? true : p.types.includes(type as TradingPartnerType)
  ).sort((a, b) => (a.nameKana < b.nameKana ? -1 : a.nameKana > b.nameKana ? 1 : 0));
  return { data, pagination: { page: 1, limit: 100, total: data.length, totalPages: 1 } };
}

const mockProjectInfo = {
  id: 'proj-001',
  name: 'テストプロジェクト',
  siteAddress: '東京都千代田区1-1-1',
  tradingPartner: { id: 'tp-001', name: 'テスト顧客株式会社' },
};

const mockEstimates = {
  data: [
    {
      id: 'est-001',
      projectId: 'proj-001',
      name: '見積書A',
      sourceItemizedStatementId: null,
      sourceItemizedStatementName: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ],
  pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
};

const mockEstimateDetail: estimatesApi.EstimateDetail = {
  reportFields: { submissionDate: null, validityPeriod: null, separateWorks: [] },
  id: 'est-001',
  projectId: 'proj-001',
  name: '見積書A',
  sourceItemizedStatementId: null,
  sourceItemizedStatementName: null,
  totalAmount: '10000000',
  items: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockCompanyInfo = {
  id: 'company-001',
  companyName: 'テスト建設株式会社',
  address: '大阪府大阪市北区1-2-3',
  representative: '山田太郎',
  phone: '06-1234-5678',
  fax: null,
  email: null,
  invoiceRegistrationNumber: null,
  version: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockContracts = {
  contracts: [
    {
      id: 'contract-001',
      contractType: 'NEW' as const,
      contractDate: '2024-06-01',
      status: 'CONTRACTED' as const,
      contractAmount: 8800000,
      estimateName: '見積書A',
      parentContractId: null,
      createdAt: '2024-06-01T00:00:00.000Z',
      updatedAt: '2024-06-01T00:00:00.000Z',
    },
  ],
  total: 1,
};

/** 監理者に協力業者だけの取引先を選んだ新規契約（変更契約の基契約書・編集の初期値に使う） */
const mockContractDetail: contractsApi.ContractDetail = {
  id: 'contract-001',
  projectId: 'proj-001',
  contractType: 'NEW',
  status: 'CONTRACTED',
  parentContractId: null,
  estimateId: 'est-001',
  contractDate: '2024-06-01',
  constructionStartDate: '2024-07-01',
  constructionEndDate: '2024-12-31',
  deliveryDate: '2025-01-15',
  taxRate: 0.1,
  paymentTerms: '出来高払い',
  separateConstruction: '電気工事',
  otherNotes: 'メモ',
  supervisorTradingPartnerId: SUBCONTRACTOR_PARTNER.id,
  contractAmount: 8800000,
  constructionPrice: 8000000,
  taxAmount: 800000,
  estimate: { id: 'est-001', name: '見積書A' },
  parentContract: null,
  supervisorTradingPartner: { id: SUBCONTRACTOR_PARTNER.id, name: SUBCONTRACTOR_PARTNER.name },
  project: mockProjectInfo,
  version: 1,
  createdAt: '2024-06-01T00:00:00.000Z',
  updatedAt: '2024-06-01T00:00:00.000Z',
};

// ============================================================================
// ヘルパー関数
// ============================================================================

function renderContractForm(props: Partial<React.ComponentProps<typeof ContractForm>> = {}) {
  return render(
    <MemoryRouter>
      <ContractForm
        mode="create"
        projectId="proj-001"
        projectInfo={mockProjectInfo}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );
}

/** 監理者の選択欄が読み込みを終えて操作できるようになるのを待つ */
async function waitForSupervisorReady(): Promise<HTMLInputElement> {
  const input = screen.getByRole('combobox', { name: '監理者' }) as HTMLInputElement;
  await waitFor(() => {
    expect(input).toBeEnabled();
  });
  return input;
}

/** 送られた取引先一覧の要求が、いずれも一覧の API の契約（種別は単一の有効な値）に沿うことを主張する */
function expectRequestsFollowListApiContract(): void {
  expect(tradingPartnerListPaths.length).toBeGreaterThan(0);
  const requestedTypes = tradingPartnerListPaths.map((path) => {
    const types = new URL(path, 'http://localhost').searchParams.getAll('type');
    expect(types.length).toBe(1);
    expect(VALID_TYPES).toContain(types[0]);
    return types[0];
  });
  // 監理者の候補は顧客と協力業者の両方の種別から取る
  expect(new Set(requestedTypes)).toEqual(new Set(['CUSTOMER', 'SUBCONTRACTOR']));
}

// ============================================================================
// テスト
// ============================================================================

describe('ContractForm - 監理者の候補の取得 (Task 18.5)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    tradingPartnerListPaths = [];
    vi.mocked(apiClient.get).mockImplementation(fakeApiGet as typeof apiClient.get);
    vi.mocked(estimatesApi.getEstimates).mockResolvedValue(mockEstimates);
    vi.mocked(estimatesApi.getEstimateDetail).mockResolvedValue(mockEstimateDetail);
    vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue(mockCompanyInfo);
    vi.mocked(contractsApi.getContracts).mockResolvedValue(mockContracts);
    vi.mocked(contractsApi.getContractDetail).mockResolvedValue(mockContractDetail);
  });

  /**
   * @requirement contract-management/REQ-3.8: 新規契約フォームに監理者となる取引先を検索・選択できるUIを提供する
   */
  it('新規契約で、監理者の候補に顧客と協力業者の取引先がフリガナ順に重複なく並ぶ', async () => {
    const user = userEvent.setup({ delay: null });
    renderContractForm();

    const input = await waitForSupervisorReady();
    expectRequestsFollowListApiContract();
    expect(input).not.toHaveAttribute('placeholder', '取引先一覧の取得に失敗しました');

    await user.click(input);
    const listbox = screen.getByRole('listbox', { name: '取引先候補' });
    const optionNames = within(listbox)
      .getAllByRole('option')
      .map((option) => option.textContent);
    // 両方の種別を持つ取引先は 1 度だけ並び、全体はフリガナの昇順
    expect(optionNames).toEqual([
      '-- 選択なし --',
      SUBCONTRACTOR_PARTNER.name,
      BOTH_PARTNER.name,
      CUSTOMER_PARTNER.name,
    ]);
  });

  /**
   * @requirement contract-management/REQ-3.8: 新規契約フォームに監理者となる取引先を検索・選択できるUIを提供する
   */
  it('新規契約で、協力業者の取引先を監理者に選ぶと名前が表示される', async () => {
    const user = userEvent.setup({ delay: null });
    renderContractForm();

    const input = await waitForSupervisorReady();
    await user.click(input);
    await user.click(
      within(screen.getByRole('listbox', { name: '取引先候補' })).getByRole('option', {
        name: SUBCONTRACTOR_PARTNER.name,
      })
    );

    expect(input).toHaveValue(SUBCONTRACTOR_PARTNER.name);
  });

  /**
   * @requirement contract-management/REQ-5.3: 変更契約フォームに新規契約と同一の入力フィールド（監理者を含む）を提供する
   */
  it('変更契約で、基契約書の監理者（協力業者）の名前が監理者の欄に表示される', async () => {
    const user = userEvent.setup({ delay: null });
    renderContractForm();

    await user.click(screen.getByLabelText('変更契約'));
    const parentSelect = await screen.findByLabelText('基となる契約書');
    await waitFor(() => {
      expect(parentSelect.querySelector('option[value="contract-001"]')).not.toBeNull();
    });
    await user.selectOptions(parentSelect, 'contract-001');

    const input = await waitForSupervisorReady();
    expectRequestsFollowListApiContract();
    await waitFor(() => {
      expect(input).toHaveValue(SUBCONTRACTOR_PARTNER.name);
    });
  });

  /**
   * @requirement contract-management/REQ-9.1: 契約書編集画面に新規作成画面で入力した全項目を編集可能な状態で表示する
   */
  it('編集で、保存済みの監理者（協力業者）の名前が監理者の欄に表示される', async () => {
    renderContractForm({ mode: 'edit', initialData: mockContractDetail });

    const input = await waitForSupervisorReady();
    expectRequestsFollowListApiContract();
    await waitFor(() => {
      expect(input).toHaveValue(SUBCONTRACTOR_PARTNER.name);
    });
  });
});
