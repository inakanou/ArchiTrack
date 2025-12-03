# リサーチ結果

## 概要

本ドキュメントは、user-authentication機能の設計フェーズで実施したリサーチ結果を記録します。

**リサーチ実施日**: 2025-12-03
**対象要件**: 要件28（画面遷移とナビゲーション）、要件29（パスワードリセット画面のUI/UX）

## リサーチ分類

本機能は**Extension（既存システムへの拡張）**に分類されます。既存のdesign.mdに対して新規要件（要件28、29）を統合する軽量ディスカバリープロセスを適用しました。

## 既存コードベース分析

### フロントエンド技術スタック

既存のsteering/tech.mdおよびstructure.mdから以下の技術スタックを確認：

- **フレームワーク**: React 18.x + TypeScript
- **ルーティング**: React Router v6.x
- **状態管理**: React Context API
- **スタイリング**: Tailwind CSS
- **フォーム管理**: React Hook Form
- **HTTPクライアント**: Axios（カスタムapiClient）

### 既存の認証関連コンポーネント

design.mdの既存セクションから以下のコンポーネントを確認：

1. **AuthContext**: 認証状態管理、トークン管理、自動リフレッシュ
2. **ProtectedRoute**: 認証保護されたルートコンポーネント
3. **TokenRefreshManager**: トークンリフレッシュの自動化、Race Condition対策、マルチタブ同期
4. **LoginForm**: ログインフォームコンポーネント
5. **RegisterForm**: ユーザー登録フォームコンポーネント

## 要件28分析：画面遷移とナビゲーション

### 受入基準の分類

**45の受入基準を以下のカテゴリに分類**：

| カテゴリ | 受入基準数 | 主要コンポーネント |
|---------|----------|------------------|
| 初期画面とルーティング | 3 | Router |
| ログイン画面からの遷移 | 4 | LoginPage, Navigate |
| パスワードリセットフロー | 6 | PasswordResetRequestPage, PasswordResetPage |
| 2FA検証画面からの遷移 | 4 | TwoFactorVerificationPage, BackupCodeVerificationPage |
| ユーザー登録画面からの遷移 | 3 | RegisterPage |
| 共通ナビゲーション | 5 | AppHeader, Navigation |
| ダッシュボードからの遷移 | 2 | DashboardPage |
| プロフィール画面からの遷移 | 4 | ProfilePage |
| 2FA設定画面からの遷移 | 2 | TwoFactorSetupPage |
| セッション管理画面 | 2 | SessionManagementPage |
| 管理者専用画面への遷移 | 5 | Admin Pages |
| ログアウト | 2 | useAuth, logout |
| 画面遷移時の共通動作 | 3 | History API |

### 設計決定

1. **React Router v6のcreateBrowserRouter使用**: 既存のsingle-page application（SPA）アーキテクチャと整合
2. **ネストされたルート構造**: 共通レイアウト（AppLayout）を親ルートに配置
3. **ProtectedRouteコンポーネント拡張**: requiredPermission propsによる権限ベースのアクセス制御
4. **redirectUrl保存**: React Router v6のlocation.stateを使用

## 要件29分析：パスワードリセット画面のUI/UX

### 受入基準の分類

**19の受入基準を以下のカテゴリに分類**：

| カテゴリ | 受入基準数 | 主要コンポーネント |
|---------|----------|------------------|
| パスワードリセット要求画面 | 9 | PasswordResetRequestPage |
| パスワード再設定画面 | 10 | PasswordResetPage |

### 設計決定

1. **セキュリティ考慮**: メールアドレス存在確認を漏らさないため、成功・失敗を問わず同じメッセージを表示
2. **パスワード強度表示**: 既存のPasswordStrengthIndicatorとPasswordRequirementsChecklistコンポーネントを再利用
3. **自動リダイレクト**: パスワード変更成功後、3秒後にログイン画面へ自動リダイレクト
4. **アクセシビリティ**: aria-liveリージョンでエラーメッセージをスクリーンリーダーに通知

## 既存設計との統合ポイント

### Requirements Traceability更新

| 要件 | 要件概要 | コンポーネント | インターフェース | フロー |
|------|---------|--------------|----------------|--------|
| 28 | 画面遷移とナビゲーション | Router, ProtectedRoute, Navigation | React Router, History API | 全フロー |
| 29 | パスワードリセット画面のUI/UX | PasswordResetRequestPage, PasswordResetPage | POST /api/v1/auth/password/reset-request, GET /api/v1/auth/password/verify-reset, POST /api/v1/auth/password/reset | パスワードリセットフロー |

### 既存コンポーネントとの依存関係

```
要件28/29
├── AuthContext（既存）
│   └── useAuth hook
├── apiClient（既存）
│   └── HTTPリクエスト
├── ProtectedRoute（拡張）
│   ├── isLoading状態（要件16A対応）
│   └── requiredPermission（新規追加）
├── PasswordStrengthIndicator（既存）
├── PasswordRequirementsChecklist（既存）
└── React Router v6
    └── createBrowserRouter
```

## リサーチ結果のサマリー

### 主要な発見事項

1. **既存設計の再利用可能性が高い**: ProtectedRoute、AuthContext、パスワード関連コンポーネントは既に設計済み
2. **React Router v6のネストルート構造が最適**: 共通レイアウトと権限ベースのアクセス制御を統合可能
3. **パスワードリセットフローはセキュリティ重視**: メールアドレス存在確認を漏らさない設計が必須

### 設計への反映

- design.mdに「画面遷移とナビゲーション設計（要件28対応）」セクションを追加
- design.mdに「パスワードリセット画面設計（要件29対応）」セクションを追加
- Requirements Traceabilityテーブルに要件28、29を追加

## 今後の検討事項

1. **tasks.md更新**: 要件28、29に対応する実装タスクの追加が必要
2. **E2Eテスト拡張**: 画面遷移とパスワードリセットフローのE2Eテスト追加
3. **Storybook Stories追加**: PasswordResetRequestPage、PasswordResetPageのStories追加
