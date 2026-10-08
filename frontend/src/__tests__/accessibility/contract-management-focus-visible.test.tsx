/**
 * @fileoverview 契約書フォームの部品のフォーカス表示の単体テスト
 *
 * フォーカス表示は全画面共通の規則（`src/index.css` の `@layer base` の `:focus-visible`）で描く
 * （steering `tech.md` の「フォーカス表示方針」）。部品の側は、その規則を打ち消す `outline: none` を
 * インラインで持たず、背景に対して 3:1 に届かない自前の影の輪（box-shadow）も重ねないことで規則に乗る
 * （タスク 17.1）。ここでは次を確かめる。
 *   (1) 契約書フォーム（ContractForm）のキーボードで止まる部品（契約種類の radio・見積書の選択・
 *       消費税率と日付の欄・3 つの文章の欄・キャンセルと作成（保存）の釦、変更契約では基となる契約書の
 *       選択）が、新規作成の初期の表示・変更契約の表示・検証エラーの表示中・編集の表示のいずれでも、
 *       インラインで outline を打ち消さず、影の輪も描かないこと
 *   (2) 検証エラーの表示中も、必須の欄の赤い枠と文言が残ること（フォーカス表示の是正で
 *       エラーの示し方を失わない）
 * 規則そのものの太さとコントラスト比は `focus-visible.test.tsx` が確かめ、実際のブラウザで
 * フォーカス中に表示が出ることは e2e/specs/contracts/contract-management-focus-visible.spec.ts
 * が主張する（jsdom は :focus-visible の照合も CSS の適用もしない）。
 * 監理者の欄（TradingPartnerSelect）は project-management の部品のため、ここでは差し替えて測らない
 * （実際の表示は上の E2E が測る）。
 *
 * Requirements (contract-management):
 * 受け入れ条件にフォーカス表示を定める項は無いため、要件番号は名乗らない。
 * タスク 17.1 は、要件 2〜10 の契約書の作成・編集画面の上で steering の方針の下限へ揃える。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ContractForm from '../../components/contract/ContractForm';
import * as contractsApi from '../../api/contracts';
import * as estimatesApi from '../../api/estimates';
import * as companyInfoApi from '../../api/company-info';

vi.mock('../../api/contracts');
vi.mock('../../api/estimates');
vi.mock('../../api/company-info');
vi.mock('../../components/projects/TradingPartnerSelect', () => ({
  default: () => <div data-testid="trading-partner-select" />,
}));

const PROJECT_INFO = {
  id: 'proj-focus',
  name: 'フォーカス測定プロジェクト',
  siteAddress: null,
  tradingPartner: null,
};

const PARENT_CONTRACT: contractsApi.ContractDetail = {
  id: 'contract-focus-parent',
  projectId: 'proj-focus',
  contractType: 'NEW',
  status: 'CONTRACTED',
  parentContractId: null,
  estimateId: 'est-focus',
  contractDate: '2026-04-01',
  constructionStartDate: '2026-04-10',
  constructionEndDate: '2026-09-30',
  deliveryDate: '2026-10-15',
  taxRate: 0.1,
  paymentTerms: '',
  separateConstruction: '',
  otherNotes: '',
  supervisorTradingPartnerId: null,
  contractAmount: 0,
  constructionPrice: 0,
  taxAmount: 0,
  estimate: { id: 'est-focus', name: 'フォーカス測定見積書' },
  parentContract: null,
  supervisorTradingPartner: null,
  project: PROJECT_INFO,
  version: 0,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
};

/** 部品の名前と、インラインの outline の打ち消し・影の輪の有無 */
interface ControlStyle {
  name: string;
  outlineSuppressed: boolean;
  boxShadow: string;
}

function describeControl(control: HTMLElement): ControlStyle {
  const labelText =
    (control as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).labels?.[0]
      ?.textContent ?? '';
  return {
    name: labelText.trim() || (control.textContent ?? '').trim(),
    outlineSuppressed: control.style.outlineStyle === 'none' || control.style.outline === 'none',
    boxShadow: control.style.boxShadow,
  };
}

/** 名前の並びから、いずれも打ち消しと影の輪を持たないときの観測値を作る */
function expectedControls(names: string[]): ControlStyle[] {
  return names.map((name) => ({ name, outlineSuppressed: false, boxShadow: '' }));
}

/** 新規契約・編集で共通に止まる、見積書から文章の欄までの部品の名前（画面の並び順） */
const FIELD_NAMES = [
  '見積書',
  '消費税率（%）',
  '契約日',
  '工期着手日',
  '工期完成日',
  '引渡日',
  '支払条件',
  '別途工事',
  'その他',
];

/** フォームの、キーボードで止まりうる部品（画面の並び順。変更契約では基となる契約書の選択を含む） */
function getFormControls(): HTMLElement[] {
  const form = screen.getByTestId('contract-form');
  return Array.from(
    form.querySelectorAll<HTMLElement>('input:not([type="hidden"]), select, textarea, button')
  ).filter((control) => !control.closest('[data-testid="trading-partner-select"]'));
}

function renderForm(props: Partial<React.ComponentProps<typeof ContractForm>> = {}): void {
  render(
    <MemoryRouter>
      <ContractForm
        mode="create"
        projectId="proj-focus"
        projectInfo={PROJECT_INFO}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('契約書フォームの部品が共通のフォーカス表示を打ち消さない', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(estimatesApi.getEstimates).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
    vi.mocked(companyInfoApi.getCompanyInfo).mockResolvedValue({});
    vi.mocked(contractsApi.getContracts).mockResolvedValue({
      contracts: [
        {
          id: PARENT_CONTRACT.id,
          contractType: 'NEW',
          contractDate: PARENT_CONTRACT.contractDate,
          status: 'CONTRACTED',
          contractAmount: 0,
          estimateName: 'フォーカス測定見積書',
          parentContractId: null,
          createdAt: PARENT_CONTRACT.createdAt,
          updatedAt: PARENT_CONTRACT.updatedAt,
        },
      ],
      total: 1,
    } as contractsApi.ContractsResponse);
    vi.mocked(contractsApi.getContractDetail).mockResolvedValue(PARENT_CONTRACT);
  });

  /**
   * インラインの `outline: none` は stylesheet のどの規則にも勝つため、
   * 一つでも残ると、その部品だけキーボード操作でフォーカスが見えなくなる。
   */
  it('新規作成の初期の表示の部品がインラインで outline を消さず、影の輪も描かない', async () => {
    renderForm();
    await waitFor(() => expect(estimatesApi.getEstimates).toHaveBeenCalled());

    expect(getFormControls().map(describeControl)).toEqual(
      expectedControls(['新規契約', '変更契約', ...FIELD_NAMES, 'キャンセル', '作成'])
    );
  });

  it('変更契約を選んだ表示の基となる契約書の選択もインラインで outline を消さず、影の輪も描かない', async () => {
    renderForm();
    await waitFor(() => expect(estimatesApi.getEstimates).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('radio', { name: '変更契約' }));
    const parentSelect = await screen.findByRole('combobox', { name: '基となる契約書' });
    await waitFor(() => expect(contractsApi.getContracts).toHaveBeenCalled());
    expect(parentSelect).toBeInTheDocument();

    expect(getFormControls().map(describeControl)).toEqual(
      expectedControls([
        '新規契約',
        '変更契約',
        '基となる契約書',
        ...FIELD_NAMES,
        'キャンセル',
        '作成',
      ])
    );
  });

  it('検証エラーの表示中も部品がインラインで outline を消さず、必須の欄は赤い枠と文言を残す', async () => {
    renderForm();
    await waitFor(() => expect(estimatesApi.getEstimates).toHaveBeenCalled());

    // 必須の欄を空のまま送信すると、見積書・契約日・工期・引渡日に検証エラーが出る
    fireEvent.submit(screen.getByTestId('contract-form'));
    expect(await screen.findByText('見積書の選択は必須です')).toBeInTheDocument();
    expect(screen.getByText('契約日の入力は必須です')).toBeInTheDocument();
    expect(screen.getByText('工期着手日の入力は必須です')).toBeInTheDocument();
    expect(screen.getByText('工期完成日の入力は必須です')).toBeInTheDocument();
    expect(screen.getByText('引渡日の入力は必須です')).toBeInTheDocument();

    const requiredControls = [
      screen.getByRole('combobox', { name: '見積書' }),
      screen.getByLabelText('契約日'),
      screen.getByLabelText('工期着手日'),
      screen.getByLabelText('工期完成日'),
      screen.getByLabelText('引渡日'),
    ];
    for (const control of requiredControls) {
      expect(control.style.border).toMatch(/#dc2626|rgb\(220, 38, 38\)/i);
    }
    expect(getFormControls().map(describeControl)).toEqual(
      expectedControls(['新規契約', '変更契約', ...FIELD_NAMES, 'キャンセル', '作成'])
    );
  });

  it('フォーカス中の消費税率の欄も影の輪を描かず、outline を打ち消さない', async () => {
    renderForm();
    await waitFor(() => expect(estimatesApi.getEstimates).toHaveBeenCalled());

    const taxRate = screen.getByLabelText('消費税率（%）');
    fireEvent.focus(taxRate);

    expect(describeControl(taxRate)).toEqual(expectedControls(['消費税率（%）'])[0]);
  });

  it('編集の表示の部品がインラインで outline を消さず、影の輪も描かない', async () => {
    renderForm({ mode: 'edit', initialData: PARENT_CONTRACT });
    await waitFor(() => expect(estimatesApi.getEstimates).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    expect(getFormControls().map(describeControl)).toEqual(
      expectedControls(['新規契約', '変更契約', ...FIELD_NAMES, 'キャンセル', '保存'])
    );
  });
});
