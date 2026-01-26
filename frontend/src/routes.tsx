import { RouteObject, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ProtectedLayout } from './components/ProtectedLayout';
import { Profile } from './pages/Profile';
import { Sessions } from './pages/Sessions';
import { AuditLogs } from './pages/AuditLogs';
import { UserManagement } from './pages/UserManagement';
import { InvitationsPage } from './pages/InvitationsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { PasswordResetPage } from './pages/PasswordResetPage';
import { TwoFactorSetupPage } from './pages/TwoFactorSetupPage';
import { Dashboard } from './pages/Dashboard';
import { RoleManagement } from './pages/RoleManagement';
import { PermissionManagement } from './pages/PermissionManagement';
import ProjectListPage from './pages/ProjectListPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProjectCreatePage from './pages/ProjectCreatePage';
import ProjectEditPage from './pages/ProjectEditPage';
import TradingPartnerListPage from './pages/TradingPartnerListPage';
import TradingPartnerDetailPage from './pages/TradingPartnerDetailPage';
import TradingPartnerCreatePage from './pages/TradingPartnerCreatePage';
import TradingPartnerEditPage from './pages/TradingPartnerEditPage';
import SiteSurveyListPage from './pages/SiteSurveyListPage';
import SiteSurveyDetailPage from './pages/SiteSurveyDetailPage';
import SiteSurveyCreatePage from './pages/SiteSurveyCreatePage';
import SiteSurveyEditPage from './pages/SiteSurveyEditPage';
import SiteSurveyImageViewerPage from './pages/SiteSurveyImageViewerPage';
import QuantityTableListPage from './pages/QuantityTableListPage';
import QuantityTableCreatePage from './pages/QuantityTableCreatePage';
import QuantityTableEditPage from './pages/QuantityTableEditPage';
import QuantityTableRedirectPage from './pages/QuantityTableRedirectPage';
import ItemizedStatementDetailPage from './pages/ItemizedStatementDetailPage';
import ItemizedStatementListPage from './pages/ItemizedStatementListPage';
import ItemizedStatementCreatePage from './pages/ItemizedStatementCreatePage';
import EstimateRequestListPage from './pages/EstimateRequestListPage';
import EstimateRequestCreatePage from './pages/EstimateRequestCreatePage';
import EstimateRequestDetailPage from './pages/EstimateRequestDetailPage';
import EstimateRequestEditPage from './pages/EstimateRequestEditPage';

/**
 * アプリケーションのルート設定
 *
 * ## ルート構造
 * - 公開ルート: ログイン、登録、パスワードリセット
 * - 保護されたルート: プロフィール、セッション管理、2FA設定、管理機能
 *
 * ## 認証フロー
 * 1. 未認証ユーザーが保護されたルートにアクセス → ログインページへリダイレクト
 * 2. ログイン後、元のページ（リダイレクト元）に戻る
 * 3. 認証済みユーザーがログインページにアクセス → ダッシュボードへリダイレクト
 *
 * ## Note
 * - LoginForm, RegisterForm等の認証コンポーネントはコンテナページに統合済み
 * - LoginPage, RegisterPage, PasswordResetPageがAPIと統合
 */
export const routes: RouteObject[] = [
  // ルートパス - ダッシュボードへリダイレクト
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
  },

  // 認証関連の公開ルート（AppHeaderなし）
  {
    path: '/login',
    element: (
      <ProtectedRoute requireAuth={false} redirectTo="/dashboard">
        <LoginPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/register',
    element: (
      <ProtectedRoute requireAuth={false} redirectTo="/dashboard">
        <RegisterPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/password-reset',
    element: (
      <ProtectedRoute requireAuth={false} redirectTo="/dashboard">
        <PasswordResetPage />
      </ProtectedRoute>
    ),
  },

  // 保護されたルート（AppHeader付きレイアウト）
  // REQ-28.21: 認証済みユーザーが保護された画面にアクセスすると共通ヘッダーナビゲーションが表示される
  {
    element: (
      <ProtectedRoute>
        <ProtectedLayout />
      </ProtectedRoute>
    ),
    children: [
      // ダッシュボード
      {
        path: '/dashboard',
        element: <Dashboard />,
      },
      // ユーザープロフィール
      {
        path: '/profile',
        element: <Profile />,
      },
      // セッション管理
      {
        path: '/sessions',
        element: <Sessions />,
      },
      // 2FA設定
      {
        path: '/profile/2fa-setup',
        element: <TwoFactorSetupPage />,
      },
      // プロジェクト一覧
      // REQ-21.2: ヘッダーの「プロジェクト」リンクからプロジェクト一覧画面に遷移
      // REQ-21.6: ダッシュボードの「プロジェクト管理」カードからプロジェクト一覧画面に遷移
      {
        path: '/projects',
        element: <ProjectListPage />,
      },
      // プロジェクト新規作成（/projects/:id より先に定義する必要あり）
      // REQ-1.1: 「新規作成」ボタンでプロジェクト作成フォームを表示
      {
        path: '/projects/new',
        element: <ProjectCreatePage />,
      },
      // プロジェクト編集（/projects/:id より先に定義する必要あり）
      // REQ-21.23: /projects/:id/edit のURLで提供
      // REQ-21.17: パンくず: ダッシュボード > プロジェクト > [プロジェクト名] > 編集
      {
        path: '/projects/:id/edit',
        element: <ProjectEditPage />,
      },
      // プロジェクト詳細
      // REQ-7.1, 7.2, 7.3: プロジェクト詳細表示
      {
        path: '/projects/:id',
        element: <ProjectDetailPage />,
      },

      // 現場調査新規作成（/projects/:projectId/site-surveys より先に定義する必要あり）
      // REQ-1.1: 現場調査作成フォーム
      // Task 22.1: ルーティング設定を実装する
      {
        path: '/projects/:projectId/site-surveys/new',
        element: <SiteSurveyCreatePage />,
      },
      // 現場調査一覧
      // REQ-2.5, 2.6, 2.7: ブレッドクラムナビゲーション対応
      // REQ-3.1: 現場調査一覧画面
      // Task 10.2: ブレッドクラムナビゲーションを実装する
      {
        path: '/projects/:projectId/site-surveys',
        element: <SiteSurveyListPage />,
      },
      // 現場調査編集（/site-surveys/:id より先に定義する必要あり）
      // REQ-1.3: 現場調査情報編集
      // Task 22.1: ルーティング設定を実装する
      {
        path: '/site-surveys/:id/edit',
        element: <SiteSurveyEditPage />,
      },
      // 画像ビューア/エディタ（/site-surveys/:id より先に定義する必要あり）
      // REQ-2.4: 詳細画面から画像ビューア/エディタへの遷移
      // Task 22.1: ルーティング設定を実装する
      {
        path: '/site-surveys/:id/images/:imageId',
        element: <SiteSurveyImageViewerPage />,
      },
      // 現場調査詳細
      // REQ-1.2: 現場調査詳細画面
      // REQ-2.3: 現場調査一覧から詳細画面への遷移
      // REQ-2.4: 詳細画面から画像ビューア/エディタへの遷移
      // Task 10.3: 現場調査詳細から画像ビューアへの導線を実装する
      {
        path: '/site-surveys/:id',
        element: <SiteSurveyDetailPage />,
      },

      // 数量表新規作成（/projects/:projectId/quantity-tables より先に定義する必要あり）
      // REQ-2.1: 数量表名を入力して作成を確定する
      // REQ-2.2: 新しい数量表を作成し、数量表編集画面に遷移する
      // Task 10.1: 数量表新規作成画面の統合
      {
        path: '/projects/:projectId/quantity-tables/new',
        element: <QuantityTableCreatePage />,
      },
      // 数量表一覧
      // REQ-1.4: 数量表一覧画面への遷移リンク
      // REQ-2.3: プロジェクトに紐づく全ての数量表を作成日時順に一覧表示する
      // Task 4.2: 数量表一覧画面を実装する
      {
        path: '/projects/:projectId/quantity-tables',
        element: <QuantityTableListPage />,
      },
      // 数量表詳細（編集画面へリダイレクト）
      // REQ-1.5: 数量表カードクリックで編集画面遷移
      // プロジェクト詳細画面の数量表セクションからの遷移先
      {
        path: '/projects/:projectId/quantity-tables/:id',
        element: <QuantityTableRedirectPage />,
      },
      // 数量表編集画面
      // REQ-3.1: 数量表編集画面を表示する
      // REQ-3.2: 数量グループ一覧と各グループ内の数量項目を階層的に表示する
      // Task 5.1: 数量表編集画面のレイアウトを実装する
      {
        path: '/quantity-tables/:id/edit',
        element: <QuantityTableEditPage />,
      },

      // 内訳書新規作成（/projects/:projectId/itemized-statements より先に定義する必要あり）
      // REQ-15.1: 内訳書新規作成画面を独立したページとして提供する
      // REQ-15.2: プロジェクト詳細画面に戻るリンクを表示する
      // REQ-15.3: 内訳書名入力フィールドを表示する
      // REQ-15.4: 内訳書名フィールドのデフォルト値として「内訳書」を設定する
      // REQ-15.5: 数量表選択リストを表示する
      // REQ-15.6: 作成成功時に内訳書詳細画面へ遷移する
      // REQ-15.7: キャンセル時にプロジェクト詳細画面に遷移する
      // Task 17.1, 17.2: 内訳書新規作成画面の実装とルーティング設定
      {
        path: '/projects/:projectId/itemized-statements/new',
        element: <ItemizedStatementCreatePage />,
      },
      // 内訳書一覧画面（/itemized-statements/:id より先に定義する必要あり）
      // REQ-3.2: 作成済み内訳書を作成日時の降順で一覧表示する
      // REQ-3.3: 内訳書が存在しない場合「内訳書はまだ作成されていません」メッセージを表示する
      // REQ-3.4: 内訳書一覧の各行は内訳書名、作成日時、集計元数量表名、合計項目数を表示する
      // REQ-3.5: ユーザーが内訳書行をクリックすると内訳書詳細画面に遷移する
      // REQ-11.5: 内訳書セクションは一覧画面へのリンクを表示する
      {
        path: '/projects/:projectId/itemized-statements',
        element: <ItemizedStatementListPage />,
      },
      // 内訳書詳細画面
      // REQ-4.1, 4.2, 4.3, 4.4, 4.5: 内訳書詳細表示、内訳項目テーブル
      // REQ-8.4: 集計元数量表名を参照情報として表示
      // REQ-9.1, 9.2, 9.3, 9.4: パンくずナビゲーション
      // Task 7.1, 7.2: 内訳書詳細画面の実装
      {
        path: '/itemized-statements/:id',
        element: <ItemizedStatementDetailPage />,
      },

      // 見積依頼新規作成（/projects/:projectId/estimate-requests より先に定義する必要あり）
      // REQ-3.6: 見積依頼作成
      // Task 6.1: EstimateRequestCreatePageの実装
      {
        path: '/projects/:projectId/estimate-requests/new',
        element: <EstimateRequestCreatePage />,
      },
      // 見積依頼一覧
      // REQ-2.1: プロジェクトに関連する見積依頼一覧を表示
      // Task 5.2: EstimateRequestListPageの実装
      {
        path: '/projects/:projectId/estimate-requests',
        element: <EstimateRequestListPage />,
      },
      // 見積依頼編集（/estimate-requests/:id より先に定義する必要あり）
      // REQ-9.3: 見積依頼の名前を編集可能にする
      // Task 6.3: EstimateRequestEditPageの実装
      {
        path: '/estimate-requests/:id/edit',
        element: <EstimateRequestEditPage />,
      },
      // 見積依頼詳細
      // REQ-4.1-4.12: 見積依頼詳細画面、項目選択
      // Task 6.2: EstimateRequestDetailPageの実装
      {
        path: '/estimate-requests/:id',
        element: <EstimateRequestDetailPage />,
      },

      // 取引先一覧
      // REQ-12.9: /trading-partners のURLで提供
      // REQ-12.2: ヘッダーの「取引先」リンクから取引先一覧画面に遷移
      // REQ-12.6: ダッシュボードの「取引先管理」カードから取引先一覧画面に遷移
      {
        path: '/trading-partners',
        element: <TradingPartnerListPage />,
      },
      // 取引先新規作成（/trading-partners/:id より先に定義する必要あり）
      // REQ-12.10: /trading-partners/new のURLで提供
      // REQ-12.16: パンくず: ダッシュボード > 取引先 > 新規作成
      {
        path: '/trading-partners/new',
        element: <TradingPartnerCreatePage />,
      },
      // 取引先編集（/trading-partners/:id より先に定義する必要あり）
      // REQ-12.12: /trading-partners/:id/edit のURLで提供
      // REQ-12.17: パンくず: ダッシュボード > 取引先 > [取引先名] > 編集
      {
        path: '/trading-partners/:id/edit',
        element: <TradingPartnerEditPage />,
      },
      // 取引先詳細
      // REQ-12.11: /trading-partners/:id のURLで提供
      // REQ-12.15: パンくず: ダッシュボード > 取引先 > [取引先名]
      {
        path: '/trading-partners/:id',
        element: <TradingPartnerDetailPage />,
      },
    ],
  },

  // 管理者専用ルート（AppHeader付きレイアウト）
  {
    element: (
      <ProtectedRoute requiredRole="admin">
        <ProtectedLayout />
      </ProtectedRoute>
    ),
    children: [
      // 監査ログ
      {
        path: '/admin/audit-logs',
        element: <AuditLogs />,
      },
      // ユーザー管理
      {
        path: '/admin/users',
        element: <UserManagement />,
      },
      // 招待管理
      {
        path: '/admin/invitations',
        element: <InvitationsPage />,
      },
      // ロール管理
      {
        path: '/admin/roles',
        element: <RoleManagement />,
      },
      // 権限管理
      {
        path: '/admin/permissions',
        element: <PermissionManagement />,
      },
    ],
  },

  // 404 Not Found
  {
    path: '*',
    element: (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">404 - ページが見つかりません</h1>
          <p className="mt-2 text-gray-600">お探しのページは存在しません。</p>
          <p className="mt-4">
            <a href="/" className="text-blue-600 hover:text-blue-800 underline">
              ホームに戻る
            </a>
          </p>
        </div>
      </div>
    ),
  },
];
