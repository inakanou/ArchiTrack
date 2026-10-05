# 実装タスク一覧

本ドキュメントは、ユーザー認証機能（user-authentication）の実装タスクを定義します。要件定義書（requirements.md）と技術設計書（design.md）に基づいて、段階的に実装を進めます。

**実装方針**:
- Phase 1-3: 完了 (46タスク、全32要件カバー)
- Phase 4: 実装ギャップ対応 (10タスク、実装ギャップ分析で特定された項目)
- Phase 5: E2Eテスト修正 (1タスク)
- Phase 6: 画面遷移・ナビゲーション強化 (3タスク、要件28, 29対応)

## タスク一覧

### Phase 1-3: 完了タスク

既存の実装タスク（1-11）は完了しています。詳細は以下のセクションを参照してください。

- [x] 1. プロジェクト基盤整備とデータモデル構築（4サブタスク完了）
- [x] 2. 認証システムのコア機能実装（8サブタスク完了）
- [x] 3. 認可システムの実装（7サブタスク完了）
- [x] 4. 二要素認証（2FA）の実装（4サブタスク完了）
- [x] 5. 監査ログシステムの構築（3サブタスク完了）
- [x] 6. APIエンドポイントとバリデーション（7サブタスク完了）
- [x] 7. フロントエンド基盤構築（4サブタスク完了）
- [x] 8. 認証UI実装（4サブタスク完了）
- [x] 9. RBACとプロフィール管理UI実装（3サブタスク完了）
- [x] 10. E2Eテスト実装（3サブタスク完了）
- [x] 11. パフォーマンス・セキュリティ・デプロイ（4サブタスク完了）

**Phase 1-3完了サマリー**:
- **完了タスク数**: 11メジャータスク、47サブタスク
- **要件カバレッジ**: 全32要件を完全にカバー

---

### Phase 4: 実装ギャップ対応（優先度順）

実装ギャップ分析（2025-11-25実施）で特定された10項目の実装漏れを優先的にタスク化します。

#### 12. 【Critical】EdDSA鍵ペア生成スクリプトとセットアップガイドの整備

- [x] 12.1 鍵ペア生成スクリプト作成とドキュメント整備
  - `scripts/generate-eddsa-keys.ts`が存在するか確認し、存在しない場合は作成
  - 開発環境セットアップ手順書（README.md）への鍵ペア生成セクション追加
  - 本番環境セットアップ手順書（Railway デプロイガイド）への鍵ペア設定セクション追加
  - .env.example への JWT_PUBLIC_KEY、JWT_PRIVATE_KEY、JWT_PUBLIC_KEY_OLD サンプル追加
  - _Requirements: 5.1, 10.1_
  - _Details: design.md「EdDSA鍵ペア管理と運用戦略」参照_

#### 13. 【Critical】JWKS公開鍵エンドポイントの実装検証

- [x] 13.1 JWKSエンドポイント実装検証とテスト追加
  - `backend/src/routes/jwks.routes.ts`が実装されているか確認
  - 現在の公開鍵（JWT_PUBLIC_KEY）と旧公開鍵（JWT_PUBLIC_KEY_OLD）を両方配信する実装を検証
  - 単体テスト（jwks.routes.test.ts）にて猶予期間中の複数鍵配信をテスト
  - E2Eテスト（e2e/specs/api/jwks.spec.ts）にてRFC 7517準拠のレスポンス形式を検証
  - _Requirements: 5.1_
  - _Details: design.md「JWKS（JSON Web Key Set）エンドポイント実装」参照_

#### 14. 【High】Result型統合パターンの実装検証

- [x] 14.1 Result型ユーティリティ実装検証
  - `backend/src/types/result.ts`にOk/Err関数が定義されているか確認
  - `backend/src/utils/result-mapper.ts`にmapResultToApiError関数が実装されているか確認
  - `backend/src/utils/controller-helpers.ts`にhandleServiceResult関数が実装されているか確認
  - サービス層（AuthService、InvitationService等）がResult型を返すように実装されているか確認
  - コントローラー層でhandleServiceResultを使用しているか確認
  - 単体テストで全エラー型（AuthError、InvitationError、PasswordError、RBACError）のマッピングを検証
  - _Requirements: 10.1, 10.2_
  - _Details: design.md「Result型統合パターンの実装詳細（Critical Issue 1対応）」参照_

#### 15. 【High】N+1問題対策の実装検証

- [x] 15.1 Prisma includeによるJOINクエリ実装検証
  - RBACService.getUserPermissions()でPrisma includeが使用されているか確認
  - AuditLogService.getAuditLogs()でPrisma includeが使用されているか確認
  - InvitationService.listInvitations()でPrisma includeが使用されているか確認
  - N+1問題が発生しやすいAPIエンドポイントを特定し、Prisma includeで対策されているか確認
  - パフォーマンステスト（Autocannon）でN+1対策の効果を測定
  - _Requirements: 23.1_
  - _Details: design.md「Performance Optimization: N+1 Problem Mitigation」参照_

#### 16. 【High】鍵ローテーション戦略の実装検証

- [x] 16.1 鍵ローテーション手順書作成
  - design.md「鍵ローテーション戦略（90日周期）」のフェーズ1-4を基に、運用手順書を作成
  - フェーズ1: 準備（T-7日目）の手順を記載
  - フェーズ2: 新しい鍵ペア生成（T日目）の手順を記載
  - フェーズ3: 猶予期間開始（T日目 - T+30日目）の動作説明と検証方法を記載
  - フェーズ4: 旧鍵削除（T+30日目）の手順を記載
  - ローテーション完了チェックリストを作成
  - _Requirements: 5.1_
  - _Details: design.md「鍵ローテーション詳細運用手順（Critical Issue 2対応）」参照_

#### 17. 【Medium】Redisフォールバック処理の実装検証

- [x] 17.1 Graceful Degradationパターン実装検証
  - RBACService.getUserPermissions()でRedisキャッシュ読み取り失敗時にDB fallbackが実装されているか確認
  - Redisキャッシュ書き込み失敗時に警告ログが記録されているか確認
  - 単体テストでRedis接続エラー時のフォールバック処理を検証
  - _Requirements: 24.1_
  - _Details: design.md「Redisキャッシング戦略（Cache-Asideパターン + Graceful Degradation）」参照_

#### 18. 【Medium】Bloom Filter禁止パスワードリストの準備

- [x] 18.1 禁止パスワードリストの準備とBloom Filter統合検証
  - `data/common-passwords.txt`が存在するか確認し、存在しない場合はHIBP Pwned Passwordsのサブセットを準備
  - PasswordServiceでBloom Filter初期化（サイズ1000万件、偽陽性率0.001）が実装されているか確認
  - 単体テストでBloom Filter照合機能を検証
  - パフォーマンステストでBloom Filter照合時間を測定（目標: O(k)、k=ハッシュ関数数）
  - _Requirements: 2.3, 7.1_
  - _Details: design.md「Bloom Filter実装」参照_

#### 19. 【Medium】2FA暗号化鍵の設定ガイド

- [x] 19.1 2FA暗号化鍵設定ガイド作成
  - 環境変数`TWO_FACTOR_ENCRYPTION_KEY`（256ビット16進数文字列、64文字）のサンプル生成スクリプト作成
  - 開発環境セットアップ手順書への2FA暗号化鍵設定セクション追加
  - 本番環境セットアップ手順書（Railway）への2FA暗号化鍵設定セクション追加
  - .env.exampleへのTWO_FACTOR_ENCRYPTION_KEYサンプル追加
  - _Requirements: 27.4_
  - _Details: design.md「TwoFactorService」参照_

#### 20. 【Low】パスワード履歴自動削除の実装検証

- [x] 20.1 パスワード履歴自動削除実装検証
  - PasswordServiceでパスワード更新時に過去3件のパスワード履歴のみ保持する実装を確認
  - 古いパスワード履歴を自動削除する処理が実装されているか確認
  - 単体テストでパスワード履歴自動削除を検証
  - _Requirements: 7.2_
  - _Details: requirements.md「要件7受入基準8」参照_

#### 21. 【Low】マルチタブ同期のBroadcast Channel API実装検証

- [x] 21.1 Broadcast Channel API統合検証
  - TokenRefreshManagerでBroadcast Channel API初期化が実装されているか確認
  - トークン更新時に他のタブへ通知する処理が実装されているか確認
  - 他のタブからのトークン更新通知を受信する処理が実装されているか確認
  - E2Eテストでマルチタブ同期を検証（2つのタブを開き、1つのタブでトークン更新、もう1つのタブで自動反映を確認）
  - _Requirements: 16.1_
  - _Details: design.md「マルチタブ同期（Broadcast Channel API）」参照_

---

### Phase 5: E2Eテスト修正と改善

#### 22. E2Eテスト待機処理改善

- [x] 22.1 E2Eテスト待機処理改善
  - `waitForFunction`にタイムアウト設定（10秒推奨）を追加
  - 複数のURLパターン対応（リダイレクト先が動的な場合は正規表現やOR条件で柔軟に対応）
  - `waitForLoadState('networkidle')`を使用してネットワーク通信完了を待機
  - 全E2Eテストファイル（e2e/specs/api/、e2e/specs/ui/、e2e/specs/integration/）を確認し、待機処理を改善
  - _Requirements: 10.1_
  - _Details: tech.md「待機処理のベストプラクティス」参照_

---

### Phase 6: 画面遷移・ナビゲーション強化

#### 23. 【High】画面遷移とナビゲーションの実装強化

- [x] 23.1 (P) ProtectedRouteの遷移先state保存の検証と強化
  - 未認証時にログイン画面へリダイレクトする際、元のパス（pathname + search）をlocation.stateに保存
  - ログイン成功後に元のパスへリダイレクトする処理の検証
  - state.fromが存在しない場合のデフォルトリダイレクト先（/dashboard）の設定
  - _Requirements: 28.1, 28.3_
  - _Completed: 2025-12-03 - LoginPageのデフォルトリダイレクト先を`/`から`/dashboard`に修正、テスト強化_

- [x] 23.2 (P) ナビゲーションコンポーネントの認証状態対応
  - ヘッダーナビゲーションに認証状態を反映（ログイン・ログアウトリンク切り替え）
  - 管理者メニューの権限に応じた表示・非表示制御
  - ユーザー情報（displayName）の表示
  - _Requirements: 28.2_
  - _Completed: 2025-12-03 - AppHeaderコンポーネント実装、ドロップダウンメニュー、キーボードナビゲーション対応、ARIA属性対応_

- [x] 23.3 セッション有効期限切れ時のリダイレクト確認
  - 401エラー受信時のログイン画面リダイレクト処理の検証
  - リダイレクト先に`redirectUrl`クエリパラメータを含める
  - ログイン画面でredirectUrlを復元しログイン後に遷移する処理
  - _Requirements: 16.1, 16.2, 28.1_
  - _Completed: 2025-12-03 - ProtectedRouteにredirectUrlクエリパラメータ追加、LoginPageでredirectUrl優先読み取り、セキュリティ対策（外部URL、プロトコル相対URL拒否）実装_

#### 24. 【High】パスワードリセット画面のUI/UX強化

- [x] 24.1 パスワードリセット要求画面の実装検証
  - メールアドレス入力フォームのバリデーション確認
  - 送信成功時の確認メッセージ表示（「リセットリンクを送信しました」）
  - 存在しないメールアドレスでもセキュリティ上同一メッセージを表示
  - ログイン画面へのリンク配置
  - _Requirements: 29.1_
  - _Completed: 2025-12-03 - PasswordResetForm/PasswordResetPageの実装検証完了、セキュリティ要件テスト追加（28テスト+15テスト全パス）_

- [x] 24.2 パスワードリセット実行画面の実装検証
  - URLパラメータからリセットトークンを取得
  - トークン検証APIの呼び出しとエラー表示（無効・期限切れ）
  - 新しいパスワード入力フォーム（パスワード確認含む）
  - PasswordStrengthIndicatorとPasswordRequirementsChecklistの統合
  - リセット成功時のログイン画面リダイレクト
  - _Requirements: 29.2, 29.3_
  - _Completed: 2025-12-03 - PasswordResetFormにPasswordStrengthIndicator統合、トークン検証エラー処理、要件29.2テスト追加（55テスト全パス）_

- [x] 24.3 パスワードリセットフローのE2Eテスト検証
  - パスワードリセット要求 → メール送信 → リセット実行 → ログインの一連のフロー確認
  - 無効トークンでのエラー表示確認
  - 期限切れトークンでのエラー表示確認
  - _Requirements: 29.1, 29.2, 29.3_
  - _Completed: 2025-12-03 - Mailpit連携E2Eテスト追加、パスワードリセットURLをpassword-resetに修正、全20テストパス_

#### 25. 【Medium】初期管理者セットアップの自動化検証

- [x] 25.1 prisma/seed.tsの実装確認と検証
  - 初期管理者アカウント作成ロジックの確認（ADMIN_EMAIL, ADMIN_PASSWORD環境変数）
  - システムロール（admin, user）の初期データ挿入確認
  - デフォルト権限（user:read, user:create, user:update, user:delete, user:invite等）の定義確認
  - パスワードがArgon2idでハッシュ化されていることの確認
  - 重複実行時の冪等性（既存ユーザーがある場合はスキップ）の確認
  - _Requirements: 3.1_
  - _Completed: 2025-12-03 - user:invite権限追加、Argon2idハッシュ検証テスト追加、INITIAL_ADMIN_*環境変数優先テスト追加（全8テストパス）_

---

## 実装状況サマリー

### 完了タスク数
- **Phase 1-3 (Critical/High/Medium)**: 11メジャータスク、47サブタスク完了
- **Phase 4 (実装ギャップ対応)**: 10メジャータスク完了
- **Phase 5 (E2Eテスト修正)**: 1メジャータスク完了
- **Phase 6 (画面遷移・ナビゲーション強化)**: 5サブタスク完了、2サブタスク未完了

**合計**: 25メジャータスク、67サブタスク（2サブタスク未完了）

### 要件カバレッジ
- 要件1: 管理者によるユーザー招待
- 要件2: 招待を受けたユーザーのアカウント作成
- 要件3: 初期管理者アカウントのセットアップ
- 要件4: ログイン
- 要件5: トークン管理
- 要件6: 拡張可能なRBAC
- 要件7: パスワード管理
- 要件8: セッション管理
- 要件9: ユーザー情報取得・管理
- 要件10: セキュリティとエラーハンドリング
- 要件11: ログイン画面のUI/UX
- 要件12: ユーザー登録画面のUI/UX
- 要件13: 管理者ユーザー招待画面のUI/UX
- 要件14: プロフィール画面のUI/UX
- 要件15: 共通UI/UXガイドライン
- 要件16: セッション有効期限切れ時の自動リダイレクト
- 要件16A: 認証状態初期化時のUIチラつき防止
- 要件17: 動的ロール管理
- 要件18: 権限（Permission）管理
- 要件19: ロールへの権限割り当て
- 要件20: ユーザーへのロール割り当て
- 要件21: 権限チェック機能
- 要件22: 監査ログとコンプライアンス
- 要件23: 非機能要件（パフォーマンス・スケーラビリティ）
- 要件24: フォールトトレランス（障害耐性）
- 要件25: データ整合性とトランザクション管理
- 要件26: セキュリティ対策（脅威モデリング）
- 要件27: 二要素認証（2FA）設定機能
- 要件27A: 二要素認証（2FA）ログイン機能
- 要件27B: 二要素認証（2FA）管理機能
- 要件27C: 二要素認証（2FA）セキュリティ要件
- 要件27D: 二要素認証（2FA）UI/UX要件
- 要件27E: 二要素認証（2FA）アクセシビリティ要件
- 要件28: 画面遷移とナビゲーション
- 要件29: パスワードリセット画面のUI/UX

**カバレッジ**: 全35要件を完全にカバー

### 次のアクション
1. Phase 6（画面遷移・ナビゲーション強化）のタスク23-25を実装
2. 総合E2Eテストを実行し、全要件が満たされていることを確認
3. `/kiro-validate-impl user-authentication`を実行し、実装品質を検証

---

## 既存完了タスク詳細（Phase 1-3）

### 1. プロジェクト基盤整備とデータモデル構築（完了）

- [x] 1.1 ユーザー情報とアクセス制御のデータモデル構築
  - 招待制ユーザー登録に必要なデータ構造を定義
  - ロールベースアクセス制御のデータ関係を確立
  - セッション管理と二要素認証のデータ保存機能を準備
  - データ検索性能を最適化するインデックス戦略を実装
  - データベーススキーマをマイグレーションで適用
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1, 17.1, 18.1, 19.1, 21.1, 27.1_

- [x] 1.2 JWT署名鍵の生成と公開鍵配布機能の準備
  - EdDSA署名用の鍵ペアを生成
  - 秘密鍵と公開鍵を環境変数用に準備
  - 公開鍵をJWKS形式で配布するエンドポイントを実装
  - _Requirements: 5.1_

- [x] 1.3 認証機能に必要な依存関係のインストール
  - JWT署名・検証ライブラリを追加
  - パスワードハッシュライブラリを追加
  - メール送信とキュー管理ライブラリを追加
  - 二要素認証とパスワード強度評価ライブラリを追加
  - 型定義ファイルを含むすべての依存関係を設定
  - _Requirements: 2.3, 5.1, 7.1, 27.1, 27.2_

- [x] 1.4 環境変数の設定とパスワード強度チェック準備
  - トークン有効期限の環境変数を設定
  - 二要素認証暗号化鍵の環境変数を設定
  - 初期管理者アカウント情報の環境変数を設定
  - 漏洩パスワードデータベースをBloom Filterに変換
  - Frontend APIベースURLとトークンリフレッシュ設定を追加
  - _Requirements: 2.3, 3.1, 5.1, 27.4_

### 2. 認証システムのコア機能実装（完了）

- [x] 2.1 JWTトークンの生成・検証機能の実装
  - EdDSA署名によるアクセストークンを発行する機能を実装
  - EdDSA署名によるリフレッシュトークンを発行する機能を実装
  - トークンの署名検証とペイロード抽出機能を実装
  - トークンのデコード機能を実装（検証なし）
  - _Requirements: 5.1, 5.2_

- [x] 2.2 セキュアなパスワード管理機能の実装
  - パスワードのハッシュ化機能を実装
  - ハッシュ化されたパスワードの検証機能を実装
  - パスワード強度の評価機能を実装（長さ、複雑性、漏洩チェック）
  - パスワード履歴の管理機能を実装（過去3回の再利用防止）
  - _Requirements: 2.3, 7.1, 7.2, 10.2_

- [x] 2.3 招待制ユーザー登録の管理機能実装
  - 管理者による新規ユーザー招待機能を実装
  - 招待トークンの検証機能を実装（有効期限、使用済みチェック）
  - 招待の取り消し機能を実装
  - 招待一覧の取得機能を実装（ステータス別フィルタリング対応）
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2.4 メール送信の非同期処理基盤実装
  - メール送信の基盤を実装（SMTP設定、テンプレート対応）
  - 非同期メール送信キューを実装
  - 招待メールの送信機能を実装
  - パスワードリセットメールの送信機能を実装
  - メール送信の自動リトライ機能を実装
  - _Requirements: 1.2, 7.3, 24.1_

- [x] 2.5 ユーザー認証フローの統合実装
  - ユーザー登録機能を実装（招待経由、パスワード検証、トランザクション管理）
  - ログイン機能を実装（メールアドレス・パスワード検証、JWT発行、連続失敗検知）
  - ログアウト機能を実装（リフレッシュトークン無効化）
  - 全デバイスログアウト機能を実装
  - 現在のユーザー情報取得機能を実装
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 4.1, 4.2, 4.3, 4.4, 8.1, 8.2, 9.1, 9.2_

- [x] 2.6 パスワードリセット機能の実装
  - パスワードリセット要求機能を実装（リセットトークン生成、メール送信）
  - リセットトークン検証機能を実装（24時間有効期限チェック）
  - パスワードリセット実行機能を実装（新パスワード設定、全トークン無効化）
  - パスワード変更機能を実装（現在のパスワード確認、履歴チェック）
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 2.7 JWT認証ミドルウェアの実装
  - JWTトークン検証ミドルウェアを実装
  - トークン期限切れエラーハンドリングを実装
  - _Requirements: 5.1, 16.1, 16.2_

- [x] 2.8 マルチデバイスセッション管理機能の実装
  - デバイスごとの独立したセッション管理機能を実装
  - セッション有効期限の自動延長機能を実装
  - セッション一覧の取得機能を実装
  - _Requirements: 8.1, 8.2_

### 3. 認可システムの実装（完了）

- [x] 3.1 ロールベースアクセス制御（RBAC）サービスの実装
  - ユーザーの権限取得機能を実装（N+1問題対策済み）
  - 権限チェック機能を実装
  - Redisキャッシュによる権限情報のキャッシング
  - _Requirements: 6.1, 20.1, 23.1_

- [x] 3.2 ロール管理機能の実装
  - ロール作成機能を実装
  - ロール更新機能を実装
  - ロール削除機能を実装（システムロール削除禁止）
  - ロール一覧取得機能を実装
  - _Requirements: 17.1, 17.2_

- [x] 3.3 権限管理機能の実装
  - 権限一覧取得機能を実装
  - ロールへの権限割り当て機能を実装
  - ロールからの権限削除機能を実装
  - _Requirements: 18.1, 18.2_

- [x] 3.4 ユーザー・ロール管理機能の実装
  - ユーザーへのロール割り当て機能を実装
  - ユーザーからのロール削除機能を実装（最後の管理者保護）
  - _Requirements: 19.1, 19.2_

- [x] 3.5 認可ミドルウェアの実装
  - authorize関数の実装
  - 権限チェックとForbiddenError処理
  - _Requirements: 6.1, 20.1_

- [x] 3.6 権限キャッシュの実装
  - Redisキャッシュによる権限情報のキャッシング（TTL 15分）
  - キャッシュ無効化（ロール変更時）
  - _Requirements: 23.1_

- [x] 3.7 Graceful Degradationの実装
  - Redis障害時のDBフォールバック
  - 警告ログ記録
  - _Requirements: 24.1_

### 4. 二要素認証（2FA）の実装（完了）

- [x] 4.1 TOTP生成・検証機能の実装
  - TOTP秘密鍵生成
  - 秘密鍵のAES-256-GCM暗号化
  - TOTP検証（30秒ウィンドウ、±1ステップ許容）
  - QRコード生成
  - _Requirements: 27.1, 27.2_

- [x] 4.2 バックアップコード機能の実装
  - バックアップコード生成（10個、8文字英数字）
  - Argon2idハッシュ化
  - バックアップコード検証（1回限り使用）
  - バックアップコード再生成
  - _Requirements: 27.3_

- [x] 4.3 2FA有効化・無効化機能の実装
  - 2FAセットアップ
  - TOTP検証後の2FA有効化
  - パスワード確認後の2FA無効化
  - _Requirements: 27.1, 27.3, 27.4_

- [x] 4.4 2FAログインフローの統合
  - ログイン時の2FA判定
  - TOTP検証APIエンドポイント
  - バックアップコード検証
  - _Requirements: 27.2_

### 5. 監査ログシステムの構築（完了）

- [x] 5.1 監査ログ記録機能の実装
  - 監査ログ記録サービス
  - ロール変更、権限変更、ユーザー・ロール変更のログ記録
  - 2FA有効化・無効化のログ記録
  - _Requirements: 21.1_

- [x] 5.2 監査ログ取得機能の実装
  - フィルタリング取得
  - Prisma includeによるN+1問題対策
  - ページネーション
  - _Requirements: 21.2_

- [x] 5.3 監査ログエクスポート機能の実装
  - JSON Linesエクスポート
  - _Requirements: 21.2_

### 6. APIエンドポイントとバリデーション（完了）

- [x] 6.1 認証APIエンドポイントの実装
  - POST /api/v1/auth/register
  - POST /api/v1/auth/login
  - POST /api/v1/auth/logout
  - POST /api/v1/auth/logout-all
  - POST /api/v1/auth/refresh
  - _Requirements: 2.1, 4.1, 5.2, 8.1, 8.2_

- [x] 6.2 2FA APIエンドポイントの実装
  - POST /api/v1/auth/2fa/setup
  - POST /api/v1/auth/2fa/enable
  - POST /api/v1/auth/2fa/disable
  - POST /api/v1/auth/verify-2fa
  - POST /api/v1/auth/2fa/backup-codes/regenerate
  - _Requirements: 27.1, 27.2, 27.3, 27.4_

- [x] 6.3 招待APIエンドポイントの実装
  - POST /api/v1/invitations
  - GET /api/v1/invitations
  - GET /api/v1/invitations/verify
  - POST /api/v1/invitations/:id/revoke
  - POST /api/v1/invitations/:id/resend
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1_

- [x] 6.4 パスワード管理APIエンドポイントの実装
  - POST /api/v1/auth/password/reset-request
  - GET /api/v1/auth/password/verify-reset
  - POST /api/v1/auth/password/reset
  - _Requirements: 7.3, 7.4, 29.1, 29.2_

- [x] 6.5 ユーザー情報APIエンドポイントの実装
  - GET /api/v1/users/me
  - PATCH /api/v1/users/me
  - _Requirements: 9.1, 9.2_

- [x] 6.6 RBAC管理APIエンドポイントの実装
  - GET/POST/PATCH/DELETE /api/v1/roles
  - POST/DELETE /api/v1/roles/:id/permissions
  - GET /api/v1/permissions
  - POST/DELETE /api/v1/users/:id/roles
  - _Requirements: 17.1, 17.2, 18.1, 18.2, 19.1, 19.2_

- [x] 6.7 監査ログAPIエンドポイントの実装
  - GET /api/v1/audit-logs
  - _Requirements: 21.2_

### 7. フロントエンド基盤構築（完了）

- [x] 7.1 AuthContext実装
  - 認証状態管理（user, isAuthenticated, isLoading）
  - login, verify2FA, register, logout, refreshToken関数
  - isLoading初期値trueによるUIチラつき防止
  - _Requirements: 11.1, 16.1, 16.2_

- [x] 7.2 TokenRefreshManager実装
  - 単一Promiseパターン（Race Condition対策）
  - Broadcast Channel APIによるマルチタブ同期
  - 有効期限5分前の自動リフレッシュ
  - _Requirements: 5.3, 16.1_

- [x] 7.3 APIクライアント拡張
  - トークンリフレッシュインターセプター
  - 401エラー時の自動リフレッシュ
  - HttpOnly Cookie対応
  - _Requirements: 5.3, 16.1_

- [x] 7.4 ProtectedRoute実装
  - isLoading中のローディングインジケーター表示
  - 未認証時のリダイレクト
  - アクセシビリティ対応
  - _Requirements: 16.2, 28.1_

### 8. 認証UI実装（完了）

- [x] 8.1 LoginForm/LoginPage実装
  - メールアドレス・パスワード入力
  - Zodバリデーション
  - エラーメッセージ表示
  - _Requirements: 11.1, 11.2, 11.3, 28.1_

- [x] 8.2 TwoFactorVerificationForm/Page実装
  - 6桁TOTPコード入力
  - バックアップコードモード
  - _Requirements: 27.6, 27.7, 28.1_

- [x] 8.3 RegisterForm/RegisterPage実装
  - 表示名、パスワード入力
  - PasswordStrengthIndicator
  - PasswordRequirementsChecklist
  - _Requirements: 12.1, 12.2, 12.3, 28.1_

- [x] 8.4 PasswordReset画面実装
  - パスワードリセット要求画面
  - パスワードリセット実行画面
  - _Requirements: 29.1, 29.2, 29.3, 28.1_

### 9. RBACとプロフィール管理UI実装（完了）

- [x] 9.1 ProfileForm/ProfilePage実装
  - 表示名編集
  - パスワード変更
  - 2FA設定セクション
  - _Requirements: 14.1, 14.2, 14.3, 27.5_

- [x] 9.2 TwoFactorSetupForm実装
  - 3ステップウィザード
  - QRコード表示
  - バックアップコード保存機能
  - _Requirements: 27.5, 27.6_

- [x] 9.3 招待管理UI実装
  - InvitationForm
  - InvitationList
  - InvitationManagementPage
  - _Requirements: 13.1, 13.2, 13.3_

### 10. E2Eテスト実装（完了）

- [x] 10.1 認証フローE2Eテスト
  - ユーザー招待 → 登録 → ログイン
  - 2FA設定 → ログイン
  - パスワードリセット
  - _Requirements: 1.1, 2.1, 4.1, 7.3, 27.2_

- [x] 10.2 権限チェックE2Eテスト
  - 管理者アクセス
  - 一般ユーザーアクセス制限
  - _Requirements: 6.1, 20.1_

- [x] 10.3 セッション管理E2Eテスト
  - 有効期限切れリダイレクト
  - マルチタブ同期
  - _Requirements: 16.1_

### 11. パフォーマンス・セキュリティ・デプロイ（完了）

- [x] 11.1 パフォーマンステスト
  - ログインAPI
  - 権限チェックAPI
  - トークンリフレッシュAPI
  - _Requirements: 23.1_

- [x] 11.2 セキュリティ設定
  - helmetミドルウェア
  - CSP/HSTSヘッダー
  - レート制限
  - _Requirements: 10.1, 10.2, 26.1_

- [x] 11.3 Storybook実装
  - 認証コンポーネントStories
  - アクセシビリティテスト
  - _Requirements: 15.1, 15.2, 15.3, 27.8_

- [x] 11.4 単体テスト・統合テスト
  - サービス層テスト
  - ミドルウェアテスト
  - コンテキスト・コンポーネントテスト
  - _Requirements: 全要件_

---

### Phase 7: セッション切れモーダル再認証（要件30対応）

_追加日: 2026-02-09_

**概要**: 操作中にセッションが切れた場合、ログイン画面へのリダイレクトではなくモーダルダイアログによるインプレース再認証を実装し、フォーム入力データの損失を防止する。

**前提条件**: Phase 1-6の実装が完了していること。

#### 26. API Client にセッション切れコールバック機構を追加

- [x] 26.1 sessionExpiredCallback の追加
  - `frontend/src/api/client.ts` に `sessionExpiredCallback` プロパティと `setSessionExpiredCallback()` メソッドを追加
  - 401レスポンスでトークンリフレッシュが失敗した場合に `sessionExpiredCallback` を呼び出す
  - `tokenRefreshCallback` が null の場合にも `sessionExpiredCallback` を呼び出す
  - _Requirements: 30.13_
  - _Test: `frontend/src/__tests__/api/client.test.ts` に追加テスト_

- [x] 26.2 既存テストの更新
  - `client.test.ts` の既存401テストケースが `sessionExpiredCallback` を考慮するよう更新
  - リフレッシュ失敗時に `sessionExpiredCallback` が呼ばれることを検証
  - `sessionExpiredCallback` が null の場合に既存動作が維持されることを検証
  - _Requirements: 30.13_

#### 27. AuthContext のセッション切れ状態管理を拡張

- [x] 27.1 sessionExpiredDuringOperation 状態の追加
  - `AuthContext.tsx` に `sessionExpiredDuringOperation` 状態を追加
  - `isInitialized === true` の場合のみモーダル方式を適用する条件分岐を実装
  - `handleReauthSuccess` 関数を実装（トークン更新、TRM再初期化、状態リセット）
  - `navigateToLogin` 関数を実装（トークンクリア、ログイン画面遷移）
  - `apiClient.setSessionExpiredCallback()` の設定をログイン・セッション復元の各箇所に追加
  - _Requirements: 30.14, 30.15_
  - _Test: `frontend/src/__tests__/contexts/AuthContext.test.tsx` に追加テスト_

- [x] 27.2 AuthContextValue インターフェースの更新
  - `sessionExpiredDuringOperation`, `handleReauthSuccess`, `navigateToLogin` を公開インターフェースに追加
  - `useAuth` フックのエクスポート型に反映
  - 既存テストが新しいインターフェースと互換であることを確認
  - _Requirements: 30.14, 30.15_

- [x] 27.3 ProtectedRoute のリダイレクト抑制
  - `ProtectedRoute.tsx` に `sessionExpiredDuringOperation` の参照を追加
  - `!isAuthenticated && !sessionExpiredDuringOperation` の条件でリダイレクトを制御
  - 操作中セッション切れ時にはchildrenを表示し続け、モーダルがオーバーレイで動作することを保証
  - 既存のProtectedRouteテストを更新し、新しい条件分岐をカバー
  - _Requirements: 30.2, 30.3_
  - _Test: `frontend/src/__tests__/components/ProtectedRoute.test.tsx` に追加テスト_

#### 28. SessionExpiredModal コンポーネントの実装

- [x] 28.1 基本コンポーネント構造の実装
  - `frontend/src/components/SessionExpiredModal.tsx` を新規作成
  - Props定義: `isOpen`, `userEmail`, `onReauthSuccess`, `onNavigateToLogin`
  - オーバーレイ（クリック無効）＋中央配置モーダルカードのレイアウト
  - Tailwind CSSによるスタイリング
  - _Requirements: 30.2, 30.3, 30.5_

- [x] 28.2 再認証フォームの実装
  - メールアドレスフィールド（自動入力、読み取り専用）
  - パスワード入力フィールド（自動フォーカス、`autocomplete="current-password"`）
  - 再ログインボタン（ローディング状態対応）
  - エラーメッセージ表示領域
  - フォームバリデーション（パスワード必須）
  - _Requirements: 30.4, 30.7, 30.8, 30.11_

- [x] 28.3 再認証APIの呼び出しロジック
  - `apiClient.post('/api/v1/auth/login', ...)` を呼び出し
  - 成功時: `onReauthSuccess` コールバックを呼び出し、トークンを返す
  - 失敗時: モーダル内にエラーメッセージを表示
  - 連続失敗カウンターの管理（3回連続失敗で「ログイン画面へ移動」ボタン表示）
  - ネットワークエラー時のメッセージ表示とリトライボタン
  - _Requirements: 30.8, 30.9, 30.10, 30.11, 30.16, 30.17_

- [x] 28.4 2FA対応
  - ログインレスポンスの `requires2FA` フィールドを検知
  - 2FA要求時にTOTPコード入力フィールドを追加表示（6桁入力）
  - 「バックアップコードを使用する」リンクの表示
  - 2FA検証APIの呼び出し（`/api/v1/auth/verify-2fa`、`/api/v1/auth/verify-2fa/backup`）
  - _Requirements: 30.12_

- [x] 28.5 アクセシビリティ実装
  - `role="dialog"`, `aria-modal="true"`, `aria-labelledby="session-expired-title"`
  - フォーカストラップ実装（Tab/Shift+Tab循環）
  - Escキー無効化
  - `aria-live="assertive"` でセッション切れメッセージをスクリーンリーダーに通知
  - _Requirements: 30.6, 30.18, 30.19, 30.20_

- [x] 28.6 レスポンシブ対応
  - デスクトップ: `max-w-md` 中央配置
  - モバイル（< 768px）: フルスクリーンに近いレイアウト
  - _Requirements: 30.21_

#### 29. グローバルレイアウトへの統合

- [x] 29.1 SessionExpiredModal のグローバル配置
  - `App.tsx` または認証済みレイアウトにSessionExpiredModalを配置
  - `useAuth()` から `sessionExpiredDuringOperation`, `user`, `handleReauthSuccess`, `navigateToLogin` を取得して Props に渡す
  - 全ての認証済み画面で一貫してモーダルが表示されることを保証
  - _Requirements: 30.1, 30.2, 30.3_

#### 30. 単体テスト・Storybook

- [x] 30.1 SessionExpiredModal 単体テスト
  - `frontend/src/__tests__/components/SessionExpiredModal.test.tsx` を新規作成
  - テストケース:
    - `isOpen=false` 時にモーダルが表示されないこと
    - `isOpen=true` 時にモーダルが表示されること
    - メールアドレスが自動入力されていること
    - パスワード入力 → 再ログインボタンクリック → 成功時にコールバックが呼ばれること
    - 認証失敗時にエラーメッセージが表示されること
    - 3回連続失敗後に「ログイン画面へ移動」ボタンが表示されること
    - ネットワークエラー時のメッセージとリトライボタン表示
    - 2FA要求時にTOTPフィールドが表示されること
    - Escキーでモーダルが閉じないこと
    - フォーカストラップが機能すること
    - aria属性が正しく設定されていること
    - レスポンシブレイアウトの検証
  - _Requirements: 30.1-30.21_

- [x] 30.2 Storybook ストーリー作成
  - `frontend/src/components/SessionExpiredModal.stories.tsx` を新規作成
  - ストーリー: Default, WithError, With2FA, ConsecutiveFailures, NetworkError, Mobile
  - _Requirements: 30.4, 30.12, 30.16, 30.17, 30.21_

#### 31. E2Eテスト

- [x] 31.1 セッション切れモーダルE2Eテスト
  - `e2e/specs/auth/session-expired-modal.spec.ts` を新規作成
  - テストシナリオ:
    - フォーム入力中にトークン期限切れ → モーダル表示 → 再認証 → 入力データ保持確認
    - 再認証3回連続失敗 → ログイン画面遷移ボタン表示
    - 2FAユーザーのモーダル再認証フロー
    - モーダル表示中にEscキーで閉じないことの確認
  - _Requirements: 30.1-30.21_

---

**Phase 7 サマリー**:
- **メジャータスク数**: 6（タスク26-31）
- **サブタスク数**: 15
- **新規ファイル**: 4（SessionExpiredModal.tsx, SessionExpiredModal.test.tsx, SessionExpiredModal.stories.tsx, session-expired-modal.spec.ts）
- **既存ファイル変更**: 3（client.ts, AuthContext.tsx, App.tsx）
- **要件カバレッジ**: 要件30（全21受入基準）を完全にカバー

**推奨実装順序**:
1. タスク26 → タスク27 → タスク28 → タスク29 → タスク30 → タスク31（順次依存）

**並列実行可能タスク**:
- タスク28.5（アクセシビリティ）と タスク28.6（レスポンシブ）は並列可能
- タスク30（単体テスト/Storybook）と タスク31（E2E）は並列可能

## タスク32: 公開鍵配布のキャッシュ制御（要件31）

**経緯**: site-survey の Task 115.127 段6 で、E2E の「適切なCache-Controlヘッダーが設定されていること」が観測結果で主張を包む構造により恒久的に緑になっていたことが判明した。実装は `Cache-Control` を一切設定しておらず、かつ**本仕様に JWKS の記述が無かった**ため、誰も決めていない仕様を検証している状態だった。利用者の判断（2026-08-22）により、要件へ昇格して実装することとした。

- [x] 32.1 公開鍵配布エンドポイントにキャッシュ制御を実装する
  - `backend/src/routes/jwks.routes.ts` の応答に `Cache-Control` を設定する。有効期間は300秒（5分）とする
  - 値の根拠を注釈に残すこと。**鍵の入れ替えの猶予期間（`JWT_PUBLIC_KEY_OLD` が設定されている期間）より十分に短いこと**が要件6の趣旨である。アクセストークンの既定有効期限15分より短い値を選んでいる
  - 有効期間は本番コードの定数として一元管理し、検証側が同じ定数を参照できるようにすること。**検証が本番の算出を再実行する形にしないこと**（期待値は具体値で書くこと）
  - 単体テストで、応答に `Cache-Control` が含まれ有効期間が300秒であることを確認できること
  - _Requirements: 31.4, 31.5, 31.6_
  - _Boundary: 公開鍵配布エンドポイントの応答ヘッダー_
  - **処遇（コミット `af75c660` の作業ツリー、2026-09-26 にリポジトリルートで実測）**: `backend/src/routes/jwks.routes.ts` に公開定数 `JWKS_CACHE_MAX_AGE_SECONDS = 300` を置き、成功応答の `res.json` の直前で `Cache-Control: public, max-age=300` を設定した（500 応答には付けない）。値の根拠は注釈に残した——鍵の入れ替えの猶予期間（design.md の鍵ローテーション手順 T〜T+30日）より十分に短く、アクセストークンの既定有効期限 15 分（`security.constants.ts` の `ACCESS_TOKEN_EXPIRY: '15m'`）より短い。要件・設計に `public` / `private` の指定は無く、公開鍵は秘匿情報を含まないため共有キャッシュを許す `public` とした
  - **検証**: 単体テスト `backend/src/__tests__/unit/routes/jwks.routes.test.ts` の `describe('キャッシュ制御')` に2件を追加した——応答ヘッダーが `'public, max-age=300'` と一致すること（`@requirement` 31.4 / 31.5）、定数が `300` であり 30日（`2_592_000`）と15分（`900`）より小さいこと（31.5 / 31.6）。期待値はいずれも具体値。**RED**: フラグ OFF で `expected undefined to be 'public, max-age=300'` により1件が落ち、ON で10件緑、フラグ撤去後も10件緑。独立レビューが `res.set` の削除・`max-age=3000`・定数 3000 の変異をいずれも赤で再現した。backend 単体 5740件・type-check・lint は緑
  - **関門**: `check:req-coverage` は基線から EXIT 1 のまま、本スペックの受入基準は 358→361/388（31.4 / 31.5 / 31.6 が単体の印で被覆）。`count:coverage-marks` は本スペック 461→464。`check:req-exclusions` / `check:design-code-refs` / `check:design-path-refs` / `check:design-measurement-freshness` は差分なし
  - **申し送り（32.2 で必ず扱うこと）**: (i) 実装は test 環境（tsx watch）へ即反映され、`e2e/specs/api/jwks.spec.ts` のキャッシュ制御の検証に置かれた `test.fail()` は「落ちるはずが通った」として赤になる。**本項を含むブランチの push は 32.2 の完了後に行うこと**。(ii) `e2e/requirement-exclusions.json` の REQ-31.4 / 31.5 / 31.6 は pending-implementation のまま「実装が存在しない」と述べており、本項で事実と合わなくなった。32.2 の対象要件は 31.4 / 31.5 だけで、**31.6 の除外の処遇（削除するか、代替検証を上記の単体テストへ書き換えるか）は担当が明記されていない**
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test -- jwks` 10/10、backend type-check EXIT=0

- [x] 32.2 公開鍵配布の受入検証からラチェットを外す
  - `e2e/specs/api/jwks.spec.ts` の「キャッシュ制御: 適切なCache-Controlヘッダーが設定されていること」に置かれた `test.fail()` を外す
  - 主張を要件31.5 の具体値（300秒）と突き合わせる形へ強化すること。**「定義されている」「public か private か max-age を含む」といった弱い主張のままにしないこと**
  - あわせて `@requirement user-authentication/REQ-31.4, 31.5` を付与し、被覆に計上されるようにすること
  - **変異検証**: ヘッダーの設定を外すと当該の検証が落ちることを実測すること
  - _Depends: 32.1_
  - _Requirements: 31.4, 31.5_
  - _Boundary: 公開鍵配布のE2E_
  - **処遇（コミット `4dd8f37d` の作業ツリー、2026-09-26 にリポジトリルートで実測）**: `e2e/specs/api/jwks.spec.ts` の「キャッシュ制御: 適切なCache-Controlヘッダーが設定されていること」から `test.fail()` を外し、主張をステータス 200 と `cache-control` が `'public, max-age=300'` と一致すること（具体値。本番定数は参照しない）へ強めた。旧来の `toBeDefined` / `toMatch(/public|private|max-age/)` は残していない。`@requirement user-authentication/REQ-31.4` / `REQ-31.5` を同ファイルの 31.1〜31.3 と同じ書式で付与した。被覆印とラチェットの無い除外の同居は `coverage-tag-coexistence:no-ratchet` で禁じられるため、`e2e/requirement-exclusions.json` の REQ-31.4 / 31.5 の除外を取り下げた。**REQ-31.6 は利用者の裁定（2026-09-26「(A) 実態どおりに書き換える」）により**、値の選び方への制約で E2E から観測できないため除外に残し、分類を pending-implementation → integration-test、代替検証を method: unit-test / tool: Vitest（`backend/src/__tests__/unit/routes/jwks.routes.test.ts` の定数の検証）へ改めた（同じ組み合わせの既存除外は17件）。集計は総数 157→155、pending-implementation 4→1、integration-test 38
  - **検証（独立レビューが再現）**: `npm run test:e2e -- e2e/specs/api/jwks.spec.ts` は 10/10 で緑（実装者2回・レビュー1回）。**変異**: `jwks.routes.ts` の `res.set` の一行を外すと当該の検証が `toBe` の不一致で落ちる（9/10、EXIT=1）。復元は blob `ccac2729` の一致で確かめ、再実行は 10/10。`check:req-exclusions`（155 件、同居の違反なし）/ `check:e2e-guards` / `check:e2e-selfjudge` / `count:coverage-marks`（本スペック 464→466）/ prettier / eslint は EXIT 0。`check:req-coverage` は基線から EXIT 1 のまま、method:none は 3→0
  - **取り下げで赤くなった上流所管の関門（HEAD では緑）**: `check:req-exclusions:selftest`（`promiselessEntry` が実データの method:none の除外を前提にしており、0件で中断）、`check:design-measurement-freshness`（site-survey の design.md を錨にする5宣言: 除外総数 157→155、pending 4→1、promiseless 3→0、自己検査を引く2宣言が空）、`check:design-measurement-freshness:selftest`（1/56）。いずれも site-survey の所管であり下流は書き換えていない。デバッグ調査は、境界内で関門を赤くせずに本項を実装する方法は無いと結論した（印を付けずにラチェットだけ外す案は本文の要求に反し、31.6 を method:none のまま残す案でも件数の宣言は赤くなる）。**利用者の判断（2026-09-26）で本項はローカルにコミットし、上流へ起票して待つ**。上流が解決するまで当該ブランチは push できない
  - **上流待ちの解除（2026-09-27）**: site-survey 115.334 は `b36ea8ce` で解決し、`check:req-exclusions:selftest`・`check:design-measurement-freshness`・`check:design-measurement-freshness:selftest` がいずれも EXIT=0 に戻ったことを親が確かめたため `[x]` とした。解除前の注記: site-survey スペックの Task 115.334（除外台帳の自己検査の対照を合成データへ改めることと、除外の件数を固定した5宣言の貼り直し。親が上流の tasks.md へ実際に書き込み済み）の解決待ち。変更そのものは承認・コミット済み。`[x]` は 115.334 の解決後に関門が緑へ戻ったことを確かめてから付けること

- [x] 32.3 (P) 公開鍵配布の既存の受入基準を要件へ結線する
  - 要件31.1〜31.3（JWKS形式での応答・旧公開鍵の併載・`alg`/`use`/`kid` の付与）は実装済みであり、`e2e/specs/api/jwks.spec.ts` に検証も存在する
  - 当該の検証へ `@requirement user-authentication/REQ-31.1` 等を付与し、被覆に計上されるようにすること
  - **実装が既にあることを確認したうえで付与すること。**タグだけ付けて被覆を埋める形にしないこと
  - _Requirements: 31.1, 31.2, 31.3_
  - _Boundary: 公開鍵配布のE2Eの要件タグ_
  - **処遇（コミット `8546b446` の作業ツリー、2026-09-26 にリポジトリルートで実測）**: 要件 31.1〜31.3 の実装が `backend/src/routes/jwks.routes.ts` にあることを確かめた（`{ keys }` 形式の応答、`JWT_PUBLIC_KEY_OLD` による旧鍵の併載、`ensureRfc7517Compliance` による `alg` / `use` / `kid` の付与）。被覆印は `f11f09a5` で既に付いていたため、**印を検証ごとに見直し、主張が受入基準に届いていないものを正した**。本節の前提「検証も存在する」は 31.2 については成り立っていなかった
    - **31.1**: 印は形式だけを確かめる「RFC 7517準拠: レスポンスがkeysプロパティを持つJWKS形式であること」にあり、`{keys: []}` でも緑になった（独立レビューの差し戻し1回）。主張は変えずに、鍵が1本以上あることと kty / crv / x を主張する「RFC 7517準拠: 公開鍵がEdDSA (OKP) 形式であること」にも印を付け、形式と現在の鍵の配布の両方を結線した
    - **31.2**: 印の付いた E2E は `keys.length > 0` しか主張しておらず、test 環境には `JWT_PUBLIC_KEY_OLD` が無い（応答は `current` の1本のみ）ため偽の被覆だった。**利用者の裁定（2026-09-26「(A) 印を単体テストへ移す」）**に従い、E2E から印を外してテスト名を主張どおり「鍵の配布: keys配列が空でないこと」へ改め（主張は不変）、旧鍵を設定して2本と kid の順を主張する `backend/src/__tests__/unit/routes/jwks.routes.test.ts` の「should include old public key when JWT_PUBLIC_KEY_OLD is set」へ印を付けた
    - **31.3**: 印は `kid` の検証にしか無かったため、`use`（`sig`）と `alg`（`EdDSA`）の検証にも付けた
  - **変異（独立レビューが両方を再現）**: 旧鍵を加える行を外すと単体テストで 31.2 の検証だけが `expected 1 to be 2` で赤。現在の鍵を加える行を外すと（tsx watch の再読込を `touch backend/src/index.ts` と curl の `{"keys":[]}` で確認）、E2E で EdDSA（31.1）・kid / use / alg（31.3）・「鍵の配布」の5件が赤、形式の検証は緑のまま。いずれも復元後 `git hash-object` が HEAD の blob `ccac2729` と一致し、E2E 10/10・単体 10/10 が緑
  - **関門**: `check:req-exclusions` 緑（155 件。31.1〜31.3 の除外は無い）、被覆は 2735/2890 で不変（31.1 / 31.3 は `e2e/specs/api/jwks.spec.ts`、31.2 は単体テストが被覆）、`count:coverage-marks` の総数は不変（jwks.spec.ts 5→4、jwks.routes.test.ts 3→4）。prettier / eslint 合格。`check:req-coverage` は基線から EXIT 1（要件31とは無関係の未被覆）
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test -- jwks` 10/10、`check:req-exclusions` EXIT=0

## タスク33: 除外一覧が名乗る検証道具名を実体へ揃える

**経緯**: site-survey の Task 115.213 が設計文書に滞留していた未起票の提案を台帳化し、その `### 判定の一覧` の行7「他機能スペックの除外一覧の Jest 道具名」を**後続タスクへ送る**と裁定した。site-survey の Task 115.238 が申し送りを実行して本節を起こした。**所有権は本スペックにある。** site-survey は自機能分 32 件を Task 115.121 で既に Vitest へ改めており、現場調査スペックの所管は 0 件である。

**測った事実**（いずれもコミット `9e63637`、2026-09-02 にリポジトリルートで実測）:

- **本リポジトリに Jest は存在しない。** `find . -name 'jest.config*' -not -path '*/node_modules/*' | wc -l` の出力が `0`。`package.json` / `backend/package.json` / `frontend/package.json` の依存に `jest` は無く、名前に jest を含むのは `frontend/package.json` の `@testing-library/jest-dom`（Vitest から使う照合子の集まりであって走者ではない）だけである
- **単体・統合の走者は backend / frontend とも Vitest である。** 両者の `npm test` はいずれも `vitest run` であり、`backend/vitest.config.ts` / `backend/vitest.integration.config.ts` / `frontend/vitest.config.ts` が実在する
- **利用の実測**: `grep -rlE "from ['\"]vitest['\"]" backend/src frontend/src --include=*.ts --include=*.tsx | wc -l` の出力が `757` である。**同じ走査根・同じ glob** で `grep -rlE "from ['\"]@jest/globals['\"]|\bjest\.(fn|mock|spyOn)\(" backend/src frontend/src --include=*.ts --include=*.tsx | wc -l` を測ると出力は `0` である。**総数 `757` を併記するのは、`0` だけでは「走査根を読めていない」場合と区別できないためである**——同じ式を実在しないパスへ当てても出力は同じく `0` になる（2026-09-02 に実測）
- **提案が生きていること**: `node -e "const j=require('./e2e/requirement-exclusions.json');const k=j.exclusions.filter(e=>/Jest/.test(e.alternativeVerification.tool));console.log(k.length, k.filter(e=>e.id.startsWith('site-survey/')).length)"` の出力が `64 0`（後の `0` が現場調査スペックの分）
- **機械保証は無い。断定でなく変異で示す**（115.235 の作法）: `e2e/requirement-exclusions.schema.json` は `tool` を `{ "type": "string", "minLength": 1 }` としか定めず、道具の実在を見ない。実在しない道具名 `Kaboomtest 9000 / Nonexistent Runner` へ一件を差し替える変異を当てても `npm run check:req-exclusions` は 205 件を検査して終了コード 0 のままである（2026-09-02 に実測。変異は複製からの書き戻しで復元し、blob ハッシュが `HEAD` と一致することで確かめた）

**是正すると別の関門が赤くなる。着手前に読むこと**: 上の `node -e` の出力 `64 0` は `scripts/design-measurements.json` の宣言 `jest-alternative-verification-exclusions` に固定されており、`.kiro/specs/site-survey/design.md` の台帳の再現コマンド 5 の行と双方向で突き合わされる。**一件でも道具名から Jest を落とすと `npm run check:design-measurement-freshness` が「expected=`64 0` actual=`63 0`」として終了コード 1 で落ちる**（`company-info/REQ-6.9` の道具名を実在しない `Kaboomtest 9000 / Nonexistent Runner` へ差し替える変異を実際に当てて実測。2026-09-02、コミット `9e63637` にリポジトリルートで実測。変異は事前複製からの `cp` で復元し、`git hash-object e2e/requirement-exclusions.json` が `HEAD` の blob `77d4bb8443f19bc5c2de768c866eae1943175a6d` と一致することで確かめた）。宣言の解除と台帳の追随は**現場調査スペックの Task 115.280 が所管する**。

**同じ変異を当てたまま測った他の関門の実測**（走査の範囲は日本語でなくコマンドで宣言する。2026-09-02、コミット `9e63637` にリポジトリルートで実測）: 測ったのは `npm run` に与える名で `check:req-exclusions` / `check:req-exclusions:selftest` / `check:req-coverage` / `check:trace-coverage` / `check:design-refs` / `check:design-code-refs` / `check:design-path-refs` / `check:cf-evidence` / `check:steering-refs` / `check:steering-idents` / `check:steering-test-tree` / `lint` / `type-check` / `format:check` の **14 本**である。**いずれも基線と同じ終了コードのままであった。ただし `check:req-coverage` は基線から既に終了コード 1 であり（到達被覆 2632/2684 = 98.1%、未カバー 215 件）、変異の前後で変わらない**——「14 本が緑のままであった」のではない。**終了コードが動かないことと出力が動かないことも別である**: 14 本のうち 13 本は基線と出力まで一致したが、`check:req-coverage` だけは除外一覧の監査の内訳が「リポジトリ外の代替検証: 32件 / リポジトリ内検証あり: 22件」から「33件 / 21件」へ変わる（差分はこの 2 行のみで、終了コードも被覆率も動かない）。**着手時にはこの 14 本と `check:design-measurement-freshness` を自分で測り直し、実測日とコミットハッシュを添えること**（115.212 の規約）。

**是正先**:

1. `e2e/requirement-exclusions.json` の下表の `alternativeVerification.tool`
2. 本スペックの設計文書——**ただし実測では該当が 0 件である。** `for f in .kiro/specs/*/design.md; do printf '%s %s\n' "$f" "$(grep -c Jest "$f")"; done` を走らせると、`Jest` を挙げる設計文書は 13 スペックのうち `site-survey` の 1 件（6 箇所）だけで、他の 12 スペックはいずれも `0` である（2026-09-02 に実測）。台帳の行7 は是正先に「各機能スペックの設計文書」を挙げているが、起票の時点で当たりが無い。**この `0` は着手時に測り直すこと**

**本スペックの所管は 12 件で、全件を次に挙げる**（2026-09-02 に実測。抜き取りではない）。**この 12 件は id に機能名の接頭辞を持たない。** 機能名を冠さない旧来の識別子は本スペックへ帰属する（`scripts/check-requirement-exclusions.ts` の `DEFAULT_FEATURE` が `user-authentication` であり、被覆率側の `normalizeExclusionId` と同じ規則である）。`REQ-24` / `REQ-25` は `.kiro/specs/user-authentication/requirements.md` の `### 要件24: フォールトトレランス（障害耐性）` と `### 要件25: データ整合性とトランザクション管理` に実在する（2026-09-02 に実測）:

| id | 現在の `alternativeVerification.tool` |
|---|---|
| `REQ-24.3` | `Jest / Vitest with mock` |
| `REQ-24.6` | `Jest / Toxiproxy` |
| `REQ-24.7` | `Jest with log spy` |
| `REQ-24.8` | `Jest with mock` |
| `REQ-25.6` | `Jest / Prisma` |
| `REQ-25.8` | `Jest / Concurrent requests` |
| `REQ-25.1` | `Jest / Prisma` |
| `REQ-25.2` | `Jest / Prisma` |
| `REQ-25.3` | `Jest / Prisma` |
| `REQ-25.4` | `Jest / Prisma` |
| `REQ-25.5` | `Jest / Prisma` |
| `REQ-25.7` | `Jest / Prisma` |

- [x] 33.1 除外一覧の道具名を実体へ揃える
  - 上表 12 件の `alternativeVerification.tool` から、実在しない `Jest` を取り除く
  - **先例に揃えること**: site-survey は Task 115.121 で自機能分 32 件を「道具名の先頭 `Jest` を `Vitest` へ置換し、`React Testing Library` / `Supertest` などの併記部分は据え置く」形で是正した。`.kiro/specs/site-survey/design.md` の `**あわせて是正した除外一覧の記述**` に続く項が、その形を逐語で記録している
  - **`REQ-24.3` の `Jest / Vitest with mock` は、`Jest` を落とすだけで `Vitest with mock` になる。** 先頭を置換すると重複になるため、置換ではなく除去であること
  - **`REQ-24.7` の `Jest with log spy` と `REQ-24.8` の `Jest with mock` は区切りが `/` ではない。** 先頭語だけを見る一括置換では取りこぼす
  - **`REQ-24.6` の `Toxiproxy` は併記の側も確かめること。** `toxiproxy` は npm の依存ではなく単体の実行体であるため、root / backend / frontend のいずれの `package.json` の依存にも無いこと（2026-09-02 に実測）は不在の証明にならない。**接続断を実際に模倣している手段を測ってから書くこと**
  - **`Prisma` は実在する**（`backend/package.json`。2026-09-02 に実測）ため据え置いてよい。`REQ-25.8` の `Concurrent requests` は道具名ではなく手法の記述であり、走者名との併記として残すか `description` 側へ寄せるかを判断すること
  - **道具名だけを機械的に置換して終えないこと。** 除外は受入基準を分母から丸ごと外すため、`description` が約束する代替検証が現に存在するかを一件ずつ確かめること。存在しないなら道具名の是正ではなく除外の取り下げが要る
  - **JSON の整形は `npm run format:check` では見られない。** リポジトリルートの `format:check` は `prettier --check "e2e/**/*.{js,ts}" "playwright.config.{js,ts}" "scripts/**/*.ts"` であって JSON を含まず、`lint-staged` も `*.{js,ts}` だけを対象とする（2026-09-02 に実測）。`npx prettier --check e2e/requirement-exclusions.json` を直接走らせること（現況は整形済みで終了コード 0。同日に実測）
  - **検証**: `npm run check:req-exclusions` が緑であること、および上の `node -e` の出力の第一値が本スペックの件数だけ減っていること
  - _Depends: site-survey スペックの Task 115.280（`64 0` の宣言の解除と台帳の追随）_
  - _Boundary: 本スペックが所管する除外項目の `alternativeVerification.tool`_
  - **処遇（コミット `0459f048` の作業ツリー、2026-09-26 にリポジトリルートで実測。利用者の裁定「取り下げて後続を起票」）**: 道具名を是正する前に、12 件の代替検証が実在するかを一件ずつ確かめた。**`description` の約束を満たす検証は 0 件だった**。部分的な検証にとどまるのは 3 件——24.3 は `backend/src/__tests__/unit/services/email.service.test.ts` がキュー投入・`attempts: 5`・exponential を主張するが間隔を見ず、しかも実装は Bull の `(2^n−1)×60s`（1分・3分・7分・15分）で条文の 1分・5分・15分・1時間・6時間と一致しない。25.1 は `auth.integration.test.ts` が登録の結果だけを、25.2 は `database.integration.test.ts` が Prisma 一般のロールバックだけを見る。24.7 は実装（`rbac.service.ts`）があるが検証が無い。24.6 / 24.8 / 25.3 / 25.4 / 25.5 / 25.6 / 25.7 / 25.8 は実装も無い。併記の `Toxiproxy` はリポジトリの中で一度も使われていない（親も `git grep` で確認）。確かめる対象の無い条文を分母から外すのは偽の宣言になるため、道具名は是正せず、`e2e/requirement-exclusions.json` から 12 件を取り下げて未被覆として分母へ戻した（summary: `totalExclusions` 155→143、`fault-tolerance` 14→10、`data-integrity` 27→19、`note` に経緯を追記）。実装と検証はタスク35 として起票した
  - **関門（前後の実測）**: `node -e` の出力は `48 0` → `36 0`（第一値が本スペックの 12 件だけ減り、本スペック分で `Jest` を名乗る除外は 0 件）。`check:req-exclusions` EXIT=0（155→143 件）、`npx prettier --check e2e/requirement-exclusions.json` EXIT=0。`check:req-coverage` は基線から EXIT=1 で FAILED の種類は不変——適用対象 2735→2747、到達被覆 2700/2735（98.7%）→ 2700/2747（98.3%）、本スペックの E2E 適用対象 99.4%→96.3%、未カバー受入基準 2→14 件。`count:coverage-marks` は不変。`check:design-measurement-freshness` / `:selftest` は上流 115.334 に由来して基線から EXIT=1 で、本件で実測値が動いたのは既に赤だった `requirement-exclusions-total`（actual 155→143）だけ、新しく赤になった宣言は無い（`jest-alternative-verification-exclusions` は版固定で `64 0` のまま）。`check:req-exclusions:selftest` は上流 115.334 に由来して基線から停止したまま。本スペックの設計文書の `grep -c Jest` は 0
  - **申し送り**: `requirement-exclusions-total` の現況 143 を site-survey 115.334 へ追記した。REQ-24.1 / 24.2 の道具名 `Toxiproxy` も偽りだが `Jest` を含まず本項の範囲外（別途の扱いを要する）

## タスク34: 認証のE2Eに残る返り値を使わない待機を撤去する

**経緯**: site-survey の Task 115.108 が新設した検査の洗い出しで、認証のE2E2箇所に**何も待たない待機**が残ることが判明した。同スペックは所管外として Task 115.154 を `_Blocked:_` に置いたが、**本スペックへ起票されないまま滞留していた**。site-survey の機能レベル検証がその断絶を検出し、申し送りを実行して本節を起こした。**所有権は本スペックにある。**

**実害は無い。体裁の問題である。** 2箇所とも直後に通信の傍受による本番経路の主張（`expect(...).toBe(true)`）があるため、**偽の緑ではない**。撤去しても検証の主張は一つも減らない。**起票の粒度をこれ以上大きくしないこと**——過大な起票は、実害のある起票を埋もれさせる。

**測った事実**（いずれもコミット `c3f3e9f6`、2026-09-08 にリポジトリルートで実測）:

- `e2e/specs/auth/session-expired-modal.spec.ts` の区間 `REQ-30.8: 有効な認証情報で再認証API呼び出しが行われる` に、述語が定数 `true` を返す待機が1件ある（`grep -cF 'await page.waitForFunction(() => true, {}, { timeout: getTimeout(5000) });' e2e/specs/auth/session-expired-modal.spec.ts` の出力が `1`）。註は「APIが呼び出されたことを確認」と述べるが、**述語は API の呼び出しを一切読まない**。実際に確認しているのは直後の `expect(loginApiCalled).toBe(true)` である
- `e2e/specs/auth/token-refresh.spec.ts` の区間 `アクセストークン有効期限の5分前に自動リフレッシュされる` に、本体が `return true;` で終わる待機が1件ある（入口は `grep -nF '// 注: 実際にはrouteハンドラーで検出されるため、このチェックは補助的' e2e/specs/auth/token-refresh.spec.ts`。当たりは1行）。**註自身が「補助的」と認めている**。実際に確認しているのは直後の `expect(backgroundRefreshCalled).toBe(true)` である
- **機械の関門は無い**: `npm run check:e2e-selfjudge` は「画面の中で判定を自前で書き起こす構造」を見る検査であり、**返り値を使わない待機は検出対象外である**（2026-09-08 に実行し、走査ファイル217件・画面へ送るスクリプト456件で検出0件・終了コード0。上の2件は在るまま通る）。**「画面へ送るスクリプト」の件数は他タスクのE2E編集で動く**——同日の起票作業中に 455 件から 456 件へ動いた。**動くのは母集団であって、上の2件が検出されないという性質ではない**

**着手前に測り直すこと**: `e2e/specs/**` は他のタスクが並行して編集しうる。上の2件が現存するかを取り直してから着手すること。**既に撤去されていれば本節は不要である**（site-survey の Task 115.155 と同じ形の差分零の完了になる。その場合は解消元を明記すること）。

- [x] 34.1 (P) 何も待たない2件の待機を撤去する
  - 上の2箇所を削る。**主張（`expect`）には触れないこと**——本節は無価値な一行を消すだけであり、検証の主張を増減させない
  - 待機を消したことで不安定になる場合は、**定数を返す述語で待つのではなく、実際に待ちたい条件を述語へ書くこと**。「短い待機でAPIコールの完了を待つ」型の固定時間待機へ置き換えないこと
  - **出口条件**: 上の2つの再現コマンドの出力がいずれも `0` になり、両ファイルの当該区間が緑のままであること
  - **`_Requirements:` を持たないのは意図である。** 本節は受入基準を実装せず、既存の主張を変えずに無価値な一行を消すだけである。当該区間が名乗る受入基準を挙げると偽の被覆申告になる
  - _Boundary: 認証のE2Eの待機（`session-expired-modal.spec.ts` / `token-refresh.spec.ts` の各1箇所）_
  - **処遇（コミット `d84f54cb` の作業ツリー、2026-09-26 にリポジトリルートで実測）**: 着手前に測り直すと2件とも残っていた（再現コマンド1 は `1`、token-refresh の入口 grep は 329 行目の1件）。`session-expired-modal.spec.ts` の区間「REQ-30.8: 有効な認証情報で再認証API呼び出しが行われる」から定数 `true` を返す `waitForFunction` とその註を、`token-refresh.spec.ts` の区間「アクセストークン有効期限の5分前に自動リフレッシュされる」から `return true;` で終わる `waitForFunction` とその註を削った（削除 11 行、追加 0 行、`expect` は不変）。削った待機はいずれも画面側で何も実行しておらず、判定は route ハンドラーのフラグ（`loginApiCalled` / `backgroundRefreshCalled`）に対する既存の `expect` が担う（独立レビューが HEAD の版を読んで確認）。代わりの待機は要しなかった
  - **検証**: 2つの再現コマンドの出力はいずれも `0`（親が承認後に新鮮な証拠で再実行）。`npm run test:e2e -- e2e/specs/auth/session-expired-modal.spec.ts e2e/specs/auth/token-refresh.spec.ts` は撤去前1回・撤去後2回（実装者）と1回（独立レビュー）でいずれも 31/31 緑・Flaky 0。`check:e2e-guards` / `count:coverage-marks` は前後で出力同一、`check:e2e-selfjudge` は検出0のまま（画面へ送るスクリプトが 495→493 件へ減ったのは削った2件の分）。eslint / prettier 合格
  - **範囲外の観測（起票はしていない）**: 同じ REQ-30.8 の区間に、撤去前からある固定時間の待機 `await page.waitForTimeout(1000);`（註「短い待機でAPIコールの完了を待つ」）が残る。本節が避けるべき型として名指す形であり、クリック前に仕掛けた `page.waitForRequest('**/api/v1/auth/login')` を待つ形への置き換えが後続の候補である。`token-refresh.spec.ts` が `networkidle` を同期点にしている点も同系統の弱さ（優先度はさらに低い）

_申し送り元: site-survey スペックの Task 115.154（同スペックでは所管外としてブロック）_

## タスク35: 要件24・25（障害耐性・データ整合性）を実装し検証する

**経緯**: タスク33.1 は、除外一覧の道具名 `Jest` を是正する前に、12 件（REQ-24.3 / 24.6 / 24.7 / 24.8 / 25.1〜25.8）の代替検証が実在するかを一件ずつ確かめた。`description` の約束を満たす検証は 0 件で、8 件は実装も存在しなかった。利用者の裁定「取り下げて後続を起票」（2026-09-26）に従い、12 件は除外から取り下げて未被覆として分母へ戻した。本節はその後続である。**所有権は本スペックにある。** 各項の完了条件は、**条文を直接主張する検証（Vitest の単体または統合テスト、`@requirement user-authentication/REQ-…` の被覆印付き）を置き、それが変異で現に赤くなることを実測する**ことである。

**測った事実**（コミット `0459f048`、2026-09-26 にリポジトリルートで実測）: 各項に記す。

- [x] 35.1 メール再送の間隔を条文へ合わせる
  - 条文 24.3（逐語）: 「WHEN 外部メールサービスが応答しない THEN Authentication Serviceはメール送信をキューに保存し、最大5回までリトライ（1分、5分、15分、1時間、6時間後）を実行しなければならない」
  - 実測: `backend/src/services/email.service.ts:87-93` に `RETRY_DELAYS = [1分, 5分, 15分, 1時間, 6時間]` があるが、`:178-186` 等の `emailQueue.add` は `attempts: 5, backoff: { type: 'exponential', delay: RETRY_DELAYS[0] }` を渡している。Bull 4.16.5 の exponential は `(2^n − 1) × delay`（`backend/node_modules/bull/lib/backoffs.js:12-15`）であり、実際の間隔は 1分・3分・7分・15分で、`RETRY_DELAYS[1..4]` は使われていない
  - 実測: 既存の検証 `backend/src/__tests__/unit/services/email.service.test.ts` の `:229` の検証（`:239` の `attempts: 5`）/ `:244` の検証（`:256` の `delay: expect.any(Number)`）は間隔を見ていない
  - 条文の「最大5回までリトライ」が初回を含む 5 回（`attempts: 5`）か初回＋リトライ 5 回（`attempts: 6`）かを、間隔が 5 つであることを踏まえて決めてから実装すること
  - 実装: Bull のカスタム backoff 戦略（`settings.backoffStrategies`）で `RETRY_DELAYS[attemptsMade − 1]` を返し、4 種のジョブすべてに適用する
  - 検証: 戦略関数が n = 1..5 に 60000 / 300000 / 900000 / 3600000 / 21600000 を返すこと、4 種のジョブがその戦略名で投入されることを主張する
  - _Requirements: 24.3_
  - _Boundary: EmailService のキュー投入オプションと backoff 戦略、およびその単体検証_
  - **処遇（コミット `edc68558` の作業ツリー、2026-09-26 にリポジトリルートで実測）**: 条文 24.3 の「最大5回までリトライ（1分、5分、15分、1時間、6時間後）」は間隔が 5 つ挙がっているため、初回に続くリトライを 5 回と読み、Bull の `attempts: 6` とした（design.md の EmailService 節へ「再送（要件24.3）（2026-09-26 タスク35.1 で追記）」として記録。既存の記述は残した）。組み込みの exponential（`(2^n−1)×60s` で実際は 1分・3分・7分・15分）をやめ、`backend/src/services/email.service.ts` のキュー生成時に `settings.backoffStrategies` へカスタム戦略 `email-retry-schedule` を登録した。戦略は n 回目の失敗の後に `RETRY_DELAYS[n−1]` を返し、4 種のジョブ（招待・パスワードリセット・2FA 有効化・管理者ロール変更アラート）すべてをこの戦略名と `attempts: 6` で投入する。Bull 4.16.5 の `lib/job.js`（`attemptsMade++` の後 `attemptsMade < attempts` の間だけ戦略を呼ぶ）と `lib/backoffs.js`（カスタム戦略を組み込みより優先し `(attemptsMade, err, strategyOptions)` で呼ぶ）で、戦略が n=1..5 で呼ばれることを確かめた（独立レビューが再確認）
  - **検証**: `backend/src/__tests__/unit/services/email.service.test.ts` に `@requirement user-authentication/REQ-24.3` を付け、本番の経路で Bull へ渡した戦略が n=1..5 に 60000 / 300000 / 900000 / 3600000 / 21600000 を返すこと、4 種の投入オプションが `{ attempts: 6, backoff: { type: 'email-retry-schedule' } }` であることをリテラルで主張した。**RED**: フラグ OFF で 10 件失敗、ON で 20/20、フラグ撤去後も 20/20。変異（5分→3分／1時間→30分／exponential への回帰／attempts を 5）はいずれも赤（独立レビューが再現）。全単体 5744 件・type-check・lint 緑。`check:req-coverage` は本スペックの受入基準 361→362/388（24.3 が被覆へ）
  - **独立レビューの差し戻し（1回）**: 被覆印によって上流 site-survey の宣言 `featureless-headers-resolvable-by-own-feature-after-115308` が 584→585 で新たに赤くなり、その申し送りが無かった（テストファイルが名乗る機能名が1つになり、機能名なしヘッダーが解決可能側へ移ったため）。ヘッダーに機能名を付ける回避は別の宣言を赤くするため採らず、**親が上流 115.334 へ増分を追記した**（33.1 と同じ作法）。実装とテストのコードは変えていない
  - **上流待ちの解除（2026-09-27）**: site-survey 115.334 は `b36ea8ce` で解決し、`check:req-exclusions:selftest`・`check:design-measurement-freshness`・`check:design-measurement-freshness:selftest` がいずれも EXIT=0 に戻ったことを親が確かめたため `[x]` とした。解除前の注記: site-survey スペックの Task 115.334（本項の被覆印に由来する `featureless-headers-resolvable-by-own-feature-after-115308` 584→585 の貼り直しを含む。親が上流の tasks.md へ追記済み）の解決待ち。実装そのものは承認・コミット済み。`[x]` は 115.334 の解決後に鮮度の関門で当該宣言が緑へ戻ったことを確かめてから付けること

- [x] 35.2 DB 接続タイムアウト時のリトライを実装する
  - 条文 24.6: 最大 3 回、1 秒・2 秒・4 秒のエクスポネンシャルバックオフ
  - 実測: `backend/src/db.ts`（全 45 行）にリトライの実装は無い。`grep -rlE "retr(y|ies)" backend/src --include=*.ts`（テストを除く）の当たりは `redis.ts` と `rateLimit.middleware.ts` だけ。Toxiproxy はリポジトリのどこでも使われていない
  - 実装の範囲（接続確立時のみかクエリ単位か）と 24.1（タイムアウト時 503）との関係を design.md で決めること
  - 検証: 接続失敗を模したモックで、3 回まで再試行し間隔が 1000 / 2000 / 4000ms（偽の時計で測る）、4 回目は行わず失敗を返すことを主張する
  - _Requirements: 24.6_
  - _Boundary: `backend/src/db.ts`（または新設する接続ラッパー）とその単体検証_
  - **処遇（コミット `5a485c1f` の作業ツリー、2026-09-26 にリポジトリルートで実測）**: 再試行するのは接続の確立（pg のプールからの接続の取得）だけとし、クエリ単位では再試行しないと design.md の「## Error Handling」に日付付きで記録した（取得前には SQL が送られないため書き込みの二重実行は起きない）。`backend/src/db.ts` に `RetryingPool`（`pg.Pool` の派生）を新設し、PrismaPg へ `disposeExternalPool: true` で渡した（adapter-pg 7.3.0 の外部プール受け取りと `$disconnect` 時の後始末、通常のクエリ・対話型トランザクションがいずれもプールの `connect` を通ることを独立レビューがソースで確認）。ETIMEDOUT と pg-pool の2つのタイムアウト文言のときに限り 1000 / 2000 / 4000 ms の間隔で最大 3 回再試行し、4 回目は行わず最後のエラーを返す
  - **接続タイムアウト**: 要件の環境変数表の `DATABASE_CONNECTION_TIMEOUT`（既定 5000ms）で与える（`backend/src/config/env.ts` の `parseDatabaseConnectionTimeout`。正の整数のみ、表の書き方に合わせ単位 ms を付けた表記も受け付け、`5s` のような他の単位は拒否）。既存の `backend/.env.example` の同変数がこれで初めて読まれるようになった。pg の既定 0 は無制限で、そのままでは再試行が働かない
  - **独立レビューの差し戻し（1回）**: 初回はタイムアウトを設定しておらず、本番で pg-pool のタイムアウトが起きないため再試行が実質働かない（到達しない宛先で 8 秒後も待機のまま）と差し戻された。是正の過程で、親が当初指示した新しい変数名 `DB_CONNECT_TIMEOUT_MS` が承認済み requirements.md の `DATABASE_CONNECTION_TIMEOUT` と食い違うことを実装者が指摘し、要件の変数を使う形へ改めた。承認後、要件の表が既定値を `5000ms` と書くため本番で単位付きに設定されていると起動時に落ちる危険が指摘され、ms 付き表記の受け付けを加えた
  - **検証**: `backend/src/__tests__/unit/db.test.ts`（11 件、`@requirement user-authentication/REQ-24.6`。偽の時計で回数と間隔、ETIMEDOUT、pool.query の経路、結線、タイムアウトの既定 5000・上書き 1500・5000ms・`5s` と `0` の拒否）と `env.test.ts`（9 件）。**RED**: 初回はフラグ OFF で 4 件、タイムアウトの配線前に 3 件、ms 付き表記の実装前に 2 件が赤。変異（間隔 2000→3000、再試行 4 回、再試行 2 回、素の `pg.Pool` の配線、タイムアウトの撤去、ETIMEDOUT の判定の撤去、既定値 30000）はいずれも赤。**実測**: モックなしの `getPrismaClient().user.findFirst()` を到達しない宛先 10.255.255.1:5432・タイムアウト 200ms で実行すると、1/2/4 秒の間隔で 3 回再試行した後、約 8000ms で素の `Error`（Connection terminated due to connection timeout）として失敗した（実装者・独立レビューの双方）。backend 単体 5764 件・統合 914 件・type-check・lint 緑。`check:req-coverage` は本スペックの受入基準 362→363/388（24.6 が被覆）。鮮度の関門の赤の集合は着手前と同一（新しい赤は無い）
  - **範囲外（起票済み）**: 再試行を使い切った失敗の 503 への対応づけ（24.1）は 35.8、`DATABASE_RETRY_COUNT` は 35.9 へ回した
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test -- db env` 51/51、type-check EXIT=0、鮮度の関門の赤の集合は着手前と同一

- [x] 35.3 権限キャッシュ障害時の警告ログを検証する
  - 実測: 実装は既にある。`backend/src/services/rbac.service.ts:40-54` の `getUserPermissions` は `redis.get` の失敗時に `logger.warn({ error, userId }, 'Failed to get permissions from Redis cache')` を出して DB の取得へ進む
  - 実測: 検証が無い。`backend/src/__tests__/unit/services/rbac.service.test.ts:397` / `:477` は `invalidate*` の例外が漏れないことを見るだけで、`getUserPermissions` の障害経路もログも主張していない
  - 検証: `redis.get` を reject させたとき `logger.warn` が 1 回呼ばれること（spy）と、DB から取った権限が返ることを主張する。warn の削除または debug への格下げで赤くなることを変異で実測する
  - _Requirements: 24.7_
  - _Boundary: `rbac.service.test.ts` への検証の追加（実装に欠陥が見つかった場合に限り `rbac.service.ts`）_
  - **処遇（コミット `347f5242` の作業ツリー、2026-09-26 にリポジトリルートで実測）**: 実装（`rbac.service.ts` の `getUserPermissions`）は `redis.get` が失敗すると `logger.warn({ error, userId }, 'Failed to get permissions from Redis cache')` を出して DB の取得へ進み、条文 24.7（フォールバック時の警告ログ）と 24.2（DB から直接取得）に食い違いは無いため実装は変えていない。`backend/src/__tests__/unit/services/rbac.service.test.ts` に「getUserPermissions() の権限キャッシュ障害時」を追加し、`redis.get` の reject で warn がちょうど1回、対象ユーザーと障害を添えて呼ばれること、同じ文言で debug が呼ばれないこと、DB 由来の権限が返ること、キャッシュが読めるときは warn も DB 問い合わせも起きないことを主張した（`@requirement user-authentication/REQ-24.7`。24.2 は除外中のため印を付けていない）
  - **変異（独立レビューが再現）**: warn の削除・debug への格下げのいずれも障害経路の検証が赤（1 failed / 19 passed）。復元後 `rbac.service.ts` の hash は 58940794 で一致。backend 単体 5766 件・type-check・lint 緑。`check:req-coverage` で 24.7 は未被覆から被覆へ
  - **上流への申し送り**: 機能名なしのヘッダーを持つ当該ファイルに印が入ったため、上流の鮮度宣言 `featureless-headers-resolvable-by-own-feature-after-115308` の実測値が 585→586 へ動いた（着手前から赤）。親が site-survey 115.334 へ追記した
  - **範囲外の観測（起票はしていない）**: `e2e/requirement-exclusions.json` の REQ-24.2 の除外が代替検証に挙げる chaos-engineering（Docker stop redis / Toxiproxy）はリポジトリに存在しない。本項の障害経路の検証が 24.2 を単体レベルで実際に主張しているため、除外の代替検証をこの検証へ向け直す（または除外を取り下げて印を付ける）ことが後続の候補である
  - **上流待ちの解除（2026-09-27）**: site-survey 115.334 は `b36ea8ce` で解決し、`check:req-exclusions:selftest`・`check:design-measurement-freshness`・`check:design-measurement-freshness:selftest` がいずれも EXIT=0 に戻ったことを親が確かめたため `[x]` とした。解除前の注記: site-survey スペックの Task 115.334（本項の被覆印に由来する `featureless-headers-resolvable-by-own-feature-after-115308` 585→586 を含む。親が上流の tasks.md へ追記済み）の解決待ち。検証そのものは承認・コミット済み。`[x]` は 115.334 の解決後に当該宣言が緑へ戻ったことを確かめてから付けること

- [x] 35.4 登録・招待の処理をメール送信から切り離す
  - 実測: `EmailService.sendInvitationEmail`（`email.service.ts:177`）の本番からの呼び出しは 0 件。本番から呼ばれるのは `password.service.ts:302` と `user-role.service.ts:147` / `:286` だけで、`InvitationService.createInvitation`（`invitation.service.ts:45`）はメールを送らない
  - 実測: `password.service.ts:302` は `sendPasswordResetEmail` を await しており、キュー投入（Redis）が失敗すると `catch` で `RESET_TOKEN_INVALID` を返す
  - 招待メールを結線するか（design.md で決める）と、キュー投入が失敗しても招待・登録が成功することを実装する
  - 検証: キューの `add` を reject させても招待の作成（と登録）が Ok を返し DB の状態が成立することを主張する
  - _Requirements: 24.8_
  - _Boundary: InvitationService / AuthService / EmailService の結線と、その単体・統合検証_
  - **処遇（HEAD `6638f436` の作業ツリー、2026-09-27 にリポジトリルートで実測）**: 要件1.3「WHEN 招待トークンが生成される THEN Authentication Serviceは招待メールを対象メールアドレスに送信しなければならない」と design.md の招待フロー（`Backend->>Queue: メール送信ジョブをキュー` の後に `201 Created`）は結線を求めていると判断し、`InvitationService.createInvitation` が招待レコードの作成後に `EmailService.sendInvitationEmail` へ投入するよう結線した（`createInvitationRoutes` は既定で `EmailService` を渡す）。**これにより本番で招待メールが実際に送られるようになる**。条文24.8 は、メール送信（キュー投入を含む）の成否が招待・登録の成否を左右しないことと読んだ。投入は完了を待たず（Redis 無応答で HTTP 応答が止まらないように）、失敗は `logger.warn` に `err`（pino の標準シリアライザが効くキー）と `invitationId` を添えて残す。登録は EmailService を呼ばず構造上メールに依存しない。決定は design.md の InvitationService 節に日付付きで追記した
  - **検証**: `@requirement user-authentication/REQ-24.8`（投入の単体検証には REQ-1.3）を付けた——単体（`invitation.service.test.ts`: 投入の reject で Ok と `{ err, invitationId }` の warn 1回、無応答でも1秒以内に Ok、投入が1回）、ルート（`invitation.routes.test.ts`: reject でも 201）、統合（`invitation-email-decoupling.integration.test.ts`: 実 DB で Bull の `add` を reject させ招待が pending で保存され、その招待による登録でユーザー作成・ロール付与・招待の used 化が成立。本物のロガーの err シリアライザを通した warn の引数に障害の message と stack が残る）。**RED**: フラグ OFF で単体4件・ルート1件が赤。変異5種（await して catch しない／await して catch する／warn の削除／呼び出しの削除／ログのキーを `error` に戻す）はいずれも赤（独立レビューが再現）。backend 単体 5771 件・統合（auth / invitation）・type-check・lint 緑。E2E `invitations.spec.ts` 16 件緑で、Mailpit に招待メール3通が届き登録 URL を含むことを確かめた。`check:req-coverage` は本スペックの受入基準 364→365/388、`check:req-coverage:selftest` 81/81
  - **独立レビューの差し戻し（1回）**: 当初の警告ログは `error` キーで渡しており、logger の設定が `err` キーにだけシリアライザを当てるため本番の出力が `"error":{}` になって障害の中身が失われていた。`err` キーへ改め、本物のシリアライザでの検証を加えた
  - **影響の確認（独立レビュー）**: `new EmailService()` は生成ごとに同名キュー `email-queue` と処理関数を登録するが、本番では既に3インスタンスが同じ構成で動いており、Bull は同名キューの処理関数を競合するワーカーとして扱うためジョブの二重処理は起きない（Redis 接続が約3本増える）
  - **上流への申し送り**: 被覆印で上流の鮮度宣言 `featureless-headers-resolvable-by-own-feature-after-115308` が 586→587 へ動いたため、親が site-survey 115.334 へ追記した
  - **範囲外の観測（起票はしていない）**: `e2e/specs/auth/invitations.spec.ts` は REQ-1.3 / 1.6 を名乗るがメール送信は主張していない。`requestPasswordReset` はキュー投入の失敗で `RESET_TOKEN_INVALID` を返す（条文24.8 の外。35.5 の 25.6 で扱う）。`rbac.service.ts` 等にも `{ error }` キーの warn が残る
  - **上流待ちの解除（2026-09-27）**: site-survey 115.334 は `b36ea8ce` で解決し、`check:req-exclusions:selftest`・`check:design-measurement-freshness`・`check:design-measurement-freshness:selftest` がいずれも EXIT=0 に戻ったことを親が確かめたため `[x]` とした。解除前の注記: site-survey スペックの Task 115.334（本項の被覆印に由来する `featureless-headers-resolvable-by-own-feature-after-115308` 586→587 を含む。親が上流の tasks.md へ追記済み）の解決待ち。実装そのものは承認・コミット済み。`[x]` は 115.334 の解決後に当該宣言が緑へ戻ったことを確かめてから付けること

- [x] 35.5 認証系の書き込みの原子性を実装し、失敗注入で検証する
  - 実測（25.1 / 25.2）: `auth.service.ts:130` の `$transaction` は実在する。単体の `auth.service.test.ts:147` は `$transaction` を `mockResolvedValue` で置き換えてコールバックを実行しない。統合の `auth.integration.test.ts:337` は結果だけを見て、`database.integration.test.ts:278` は Prisma 一般のロールバックを見るだけ
  - 実測（25.3）: `user-role.service.ts:382` の `addRolesToUser` は docstring で「トランザクション」と述べるが、`addRoleToUser` を 1 件ずつループしておりトランザクションは無い（`:403` の `removeRolesFromUser` も同じ）
  - 実測（25.5）: `user-role.service.ts:91` の `userRole.create` と `:104-105` の監査ログ、`role-permission.service.ts:89` の `create` と `:107-108` の監査ログ、`:204` の `delete` と `:219-220` の監査ログはいずれも別々の書き込み。`role-permission.service.ts` に `$transaction` は 0 件
  - 実測（25.6）: `password.service.ts:277-310` の `requestPasswordReset` はトークン作成（`:293`）とメール投入（`:302`）がトランザクション外で、ログの記録も無い。**外部への副作用（メール）を DB トランザクションとどう組むか（コミット後の投入か outbox か）を design.md で決めてから着手すること**
  - 実測（25.7）: ロール・権限の紐付け変更に、変更前後の整合性検証もトランザクションも無い
  - 検証: 実 DB の統合テストで、各フローの途中の書き込み（監査ログを含む）を失敗させ、全変更がロールバックされることを主張する。トランザクションを外す変異で赤くなることを実測する
  - 大きいのでフローごとに 35.5a〜e へ分割してよい
  - _Requirements: 25.1, 25.2, 25.3, 25.5, 25.6, 25.7_
  - _Boundary: AuthService / UserRoleService / RolePermissionService / PasswordService / AuditLogService の書き込み経路と、その統合検証_
  - **処遇（HEAD `cec9756a` の作業ツリー、2026-09-27 にリポジトリルートで実測）**: 25.1 / 25.2 は `AuthService.register` の `$transaction` が既に満たしており実装は変えていない。25.3 / 25.5 / 25.7 は `UserRoleService` と `RolePermissionService` の書き込みを1件・一括とも1つの `$transaction` にまとめ、変更前の検証・紐付けの書き込み・監査ログ（`AuditLogService.createLog` の任意の第2引数に tx を渡す）を同じトランザクションで行うようにした。途中で失敗すれば業務エラーを含めて全件をロールバックする（着手前は途中まで確定していた）。アラートと権限キャッシュの無効化はコミットの後に行う。**25.6 は利用者の裁定（2026-09-27「(A) コミット後に投入」）に従った**——`PasswordService.requestPasswordReset` はリセットトークンの作成と監査ログ `PASSWORD_RESET_REQUESTED`（実行者・対象とも本人）を1つの `$transaction` で記録し、コミット後にメールを投入する。投入の失敗は `err` キーの warn に残して Ok を返す（着手前は `RESET_TOKEN_INVALID` を返していた）。DB が失敗すれば `RESET_TOKEN_INVALID` を返し投入しない。未登録のアドレスは何も作らずに同じ成功を返す（ユーザー列挙の防止は不変）。キューは DB のトランザクションに参加できないため条文の「メール送信をトランザクション内で」からは逸脱し、DB の整合性を保証してメールはコミット後に高々1回とした。「ログ記録」は同じトランザクションの監査ログと読んだ。決定は design.md の RBACService 節に日付付きで追記した
  - **境界外の変更（独立レビューが正当と判定）**: 一括メソッドが本番から一度も呼ばれていなかったため、25.3 / 25.7 を本番の API から働かせるのに必要な最小限の結線として、ロール追加 API（POST /users/:id/roles）と権限追加 API を1件ずつのループから一括メソッドの1回の呼び出しへ改め、権限削除 API（DELETE /roles/:id/permissions/:permissionId）が実行者を渡すようにした（これが無いと本番の権限削除で 25.5 が空振りする。これにより権限削除の監査ログが新たに記録される）
  - **検証**: `backend/src/__tests__/integration/auth-write-atomicity.integration.test.ts`（20件、`@requirement user-authentication/REQ-25.1` / `25.2` / `25.3` / `25.5` / `25.6` / `25.7`）で、実 DB の PostgreSQL トリガー（テスト固有の ID に限定し beforeEach / afterEach / afterAll で DROP）により途中の書き込みと監査ログの保存を失敗させ、コミット時点の失敗は遅延制約トリガーで起こし、全変更のロールバックとロールバック時にメールが投入されないことを主張した。25.6 は単体3件（`password.service.test.ts`）も置いた。**RED**: 実装前は統合 (a)〜(d) が 13 failed / 1 passed（登録は既に原子的）、25.6 は単体3件・統合3件が赤。変異10種（各 `$transaction` の撤去5種、監査ログに tx を渡さない3種、投入をコミット前へ移す1種、監査ログの撤去1種）はいずれも赤（独立レビューが3種を再現）。backend 単体 5775 件、統合の全件 936 件、type-check、lint、E2E（password-reset 27件、管理系 55件、data-integrity 5件）緑。`check:req-coverage` は本スペックの受入基準 365→371/388。鮮度の関門の赤の集合は着手前と同一（新しい赤は無い）。test DB に障害注入のトリガーは残っていない
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test -- password user-role role-permission audit-log roles` 175/175、type-check EXIT=0
  - **範囲外の観測（起票はしていない）**: (i) `removeRoleFromUser` は監査ログを記録していない（要件22.3）。(ii) ロールの CRUD の監査ログはトランザクション外で書かれている。(iii) フロントの `UserManagement.tsx` は POST /users/:id/roles に `{roleId}` を送るが、ルートは `roleIds` を要求する（着手前からの食い違い）。(iv) パスワードリセットはコミット後の投入を await しており、Redis 無応答時に応答が止まりうる（35.4 の招待は待たない方式で方針がそろっていない。着手前も await）。(v) コミット後の処理が例外を投げるとコミット済みでも DATABASE_ERROR を返す（着手前と同じ）

- [x] 35.6 書き込みの ACID 特性を定め検証する
  - 条文 25.4 は「ACID特性を保証」とだけ述べる。取り下げた除外の description は「READ COMMITTED 以上」を掲げていたが条文には無い
  - 実測: 認証領域のテスト・実装に `isolationLevel` / READ COMMITTED を扱う箇所は 0 件（`git grep -nE 'isolationLevel|READ COMMITTED' -- backend/src` の当たりは `estimate-draft.service.ts:429` の注釈 1 件のみ。追跡対象外の生成コード `backend/src/generated/prisma/` には Prisma 自身の `isolationLevel` の定義がある）
  - 保証の内容（分離レベルを明示するか既定値に依拠するか）を design.md で定め、実 DB で検証する
  - _Requirements: 25.4_
  - _Boundary: 設計の決定と、それを主張する統合検証_
  - **処遇（HEAD `2ac1b697` の作業ツリー、2026-09-27 にリポジトリルートで実測）**: 条文 25.4 の「ACID特性を保証」を、PostgreSQL の ACID をアプリケーションが弱めずに使うことと定めた（design.md の RBACService 節へ「認証系の書き込みの ACID 特性（要件25.4）」として日付付きで追記）。原子性は各フローの `$transaction`（35.5）、一貫性は DB の制約と同じトランザクション内の事前の検証（並行する重複は一意制約）、分離性は既定の READ COMMITTED に依拠して分離レベルを指定しない、永続性は既定の `fsync` / `synchronous_commit` が on であることに依拠する
  - **write skew の是正（独立レビューの差し戻し1回目を受け、利用者の裁定「35.6 の中で直す」に従った）**: 最後の管理者の保護は件数を数えてから削除しており、READ COMMITTED では異なる2人の管理者からの並行する削除が双方とも通って**管理者が0人になった（実測）**。admin ロールの `roles` の行を `SELECT ... FOR NO KEY UPDATE` でロックしてから判定し直列化した（判定ごとに同じ1行を取り合い、外部キーの検査が取る `FOR KEY SHARE` とは衝突しない）。適用はロールの1件の削除・一括の削除とユーザーの削除（DELETE /api/v1/users/:id のトランザクション外での数え上げを `UserRoleService.deleteUser` へ移した）。admin を含むすべての経路で roles の行を最初に取り（一括の削除はループの前にロック）、`deleteUser` との間のデッドロックを避ける。ロールの削除（admin はシステムロールで削除不可）と admin の `*:*` 権限の削除（常に拒否）には該当しない。design.md 1715 行の担当を 35.6（直列化）と 35.7（楽観的ロック）に改めた
  - **独立レビューの差し戻し2回目**: ユーザー削除をサービスへ移した際に Prisma の例外が一律の 500 に変わっていた（実装者は「応答は不変」と誤って報告していた）。`deleteUser` は業務上の結果（`USER_NOT_FOUND` / `LAST_ADMIN_PROTECTED`）だけを `Err` で返し DB の例外は投げる形へ改め、ルートは HEAD と同じく `next(error)` へ渡すので、Prisma の例外の分類（P2025→404、P2028→500 Transaction Timeout、その他の既知→400、初期化・panic→503）と 404 / 400 の本文は HEAD と逐語一致する。ルートの分岐に検証が無かった点も補った
  - **検証**: `backend/src/__tests__/integration/auth-write-acid.integration.test.ts`（8件、`@requirement user-authentication/REQ-25.4`、並行の削除の1件は 25.7 も）で実 DB に対し、(1) アプリのクライアントの分離レベルと永続性の設定、(2) 認証系の各フローの書き込みが read committed であること（トリガーで観測）、(3) ダーティリードが無いことと一意制約による並行する重複の防止、(4) X からの admin の削除をコミット前に止めたまま Y からの一括の削除または Y のユーザーの削除を行うと後続がロックで待ち（`pg_stat_activity` で観測）、`LAST_ADMIN_PROTECTED` で失敗して管理者が1人残ること、を主張した。単体ではロックが件数・紐付けの削除より前であること、ルートの単体（`user-roles.routes.test.ts`、本物の errorHandler）では DELETE /api/v1/users/:id の 204 / 404 / 400（最後の管理者・自分自身）と P2028→500・P2025→404 を主張した
  - **RED**: フラグ OFF で (4) の2件が赤（後続が成功し管理者 0 人）。変異（分離レベルの指定／`transactionOptions` に SERIALIZABLE／`synchronous_commit=off`／一意索引の DROP／ロックの撤去／ループ前のロックの撤去／例外を包んで投げ直す／ルートの各対応づけの撤去）はいずれも赤で、すべて元へ戻しハッシュの一致を確認した（独立レビューが主要な変異を再現）
  - **結果**: 統合の全件 57 ファイル・944 件（独立レビューが実行）、backend 単体 5782 件、type-check、lint、E2E（管理系と data-integrity の36件）は緑。`check:req-coverage` は本スペックの受入基準 371→372/388。鮮度の関門と `check:design-path-refs` は前後で出力が同一。test DB に注入の残骸は無く、admin の割り当ては実行前と一致
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test -- user-role user-roles` 45/45、type-check EXIT=0

- [x] 35.7 楽観的ロックの競合処理を実装する
  - 実測: 認証領域のサービス（auth / user-role / role-permission / role / invitation / password / audit-log / rbac / session / two-factor）に楽観的ロックの実装は 0 件。先例は取引先管理の `trading-partner.service.ts`（`:409-421` の JSDoc が方式を説明し、`:456` の `expectedUpdatedAt` の比較と `:459` の `TradingPartnerConflictError` の送出が実装）
  - 対象（ユーザープロフィール更新、ロール更新など）を design.md で決める
  - 検証: 同じ版からの並行更新で片方がリトライされるか 409 を返すことを、実 DB の並行リクエストで主張する
  - _Requirements: 25.8_
  - _Boundary: 対象エンティティの更新経路と、その統合検証_
  - **処遇（HEAD `ebeb3677` の作業ツリー、2026-09-27 にリポジトリルートで実測）**: 利用者の裁定「任意・バックエンドのみ」（2026-09-27）に従い、対象を PATCH /api/v1/roles/:id と PATCH /api/v1/auth/me とした。要求に任意の `expectedUpdatedAt`（オフセット付き ISO 8601）を受け、送られたときは `updateMany({ where: { id, updatedAt } })` の条件付きの更新で版を検出し、0 件なら読み直して 404（`ROLE_NOT_FOUND` / `USER_NOT_FOUND`）か 409 Problem Details（`ROLE_CONFLICT` / `PROFILE_CONFLICT`、`expectedUpdatedAt` と `actualUpdatedAt` を添える）を返す。送られないときの経路は HEAD と同じ（応答に `updatedAt` を足したのみ。GET / PATCH の `/auth/me` は版を返すようになった）。スキーマはルートから `backend/src/schemas/auth-update.schema.ts` へ移し、既存の項目と制限は逐語一致。プロフィールの版は `users.updatedAt` を流用するため、ログイン等でも進み偽の 409 がありうる（design.md に明記）。決定は design.md の「楽観的ロックの競合（要件25.8）」に日付付きで追記した。フロントエンドの結線は 35.10 へ起票した
  - **検証**: `@requirement user-authentication/REQ-25.8` を付けた単体（`auth-update.schema.test.ts`、`auth-me-update.routes.test.ts`、`role.service.optimistic-lock.test.ts`、`auth.service.update-profile.test.ts`、`roles.routes.test.ts` に5件）と統合（`role-profile-optimistic-lock.integration.test.ts` 6件: 順次、advisory lock のトリガーと `pg_stat_activity` で揃えた並行、HTTP の往復）。**RED**: フラグ OFF で単体 11 件・統合 5 件が赤。変異8種が赤（独立レビューが「読んでから比べる」方式への置換＝並行のみ赤、プロフィールの WHERE から updatedAt を外す＝3件赤、の2種を再現しハッシュの一致を確認）。独立レビューは `updateMany` が `@updatedAt` を進めること、`+09:00` 表記・マイクロ秒表記の送り返しが一致することを実 DB で確かめた。backend 単体 5818 件、統合 950 件、E2E 31 件緑。`check:req-coverage` は本スペックの受入基準 372→373/388
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test -- auth-update.schema auth-me-update role.service auth.service roles.routes auth.routes` 211/211、統合 `role-profile-optimistic-lock` 6/6、type-check EXIT=0
  - **範囲外の観測（独立レビュー、起票はしていない）**: 版だけを送り更新項目を送らない要求は書き込まずに 200 を返す（版は進まない）。ロールの存在確認・名前の重複確認は条件付きの更新のトランザクションの外にあり、並行する名前の重複の P2002 は HEAD と同じく 500
  - **上流への申し送り**: `backend/src/__tests__/unit/routes/roles.routes.test.ts` の機能名なしのヘッダー（4行目）が、今回の被覆印で自機能で解決可能な側へ移り、上流の鮮度宣言 `featureless-headers-resolvable-by-own-feature-after-115308` が 587→588 へ動いた（独立レビューが HEAD との全ファイル比較で特定）。親が site-survey 115.334 へ追記した
  - **上流待ちの解除（2026-09-27）**: site-survey 115.334 は `b36ea8ce` で解決し、`check:req-exclusions:selftest`・`check:design-measurement-freshness`・`check:design-measurement-freshness:selftest` がいずれも EXIT=0 に戻ったことを親が確かめたため `[x]` とした。解除前の注記: site-survey スペックの Task 115.334（本項の被覆印に由来する `featureless-headers-resolvable-by-own-feature-after-115308` 587→588 を含む。親が上流の tasks.md へ追記済み）の解決待ち。実装そのものは承認・コミット済み。`[x]` は 115.334 の解決後に当該宣言が緑へ戻ったことを確かめてから付けること

- [x] 35.8 DB 接続を確立できないときに 503 を返す
  - 条文 24.1（逐語）: 「IF データベース接続がタイムアウト以内に確立できない THEN Authentication Serviceは503 Service Unavailableエラーを返さなければならない」
  - 実測（2026-09-26、タスク35.2 の `RetryingPool` に `connectionTimeoutMillis: 200` を与え到達しない宛先 10.255.255.1:5432 へ PrismaClient 経由で `findFirst`）: 1000 / 2000 / 4000ms の再試行の後、約 8000ms で失敗する。Prisma から投げられるのは素の `Error`（message「Connection terminated due to connection timeout」、code・meta 無し）で、`PrismaClientKnownRequestError` / `PrismaClientInitializationError` / `PrismaClientUnknownRequestError` のいずれでもない
  - 実測: `backend/src/middleware/errorHandler.middleware.ts` は 503 を `PrismaClientInitializationError` / `PrismaClientRustPanicError` に限って返す（:121-141）。上の素の `Error` は末尾の既定の分岐に落ちる見込み（コードの読解。HTTP での実測は本項の検証で行う）
  - 実装: 接続タイムアウトを示すエラー（`db.ts` の `isConnectionTimeoutError` と同じ判定。ETIMEDOUT はアダプタが `DriverAdapterError`（kind: SocketTimeout）で包む場合がありうるので、その形も確かめる）を errorHandler で 503「Service Unavailable」へ対応づける
  - 検証: 接続タイムアウトのエラーを投げるルートへの要求が 503 と Problem Details を返すことを主張し、対応づけを外すと赤くなることを変異で実測する
  - _Requirements: 24.1_
  - _Boundary: `backend/src/middleware/errorHandler.middleware.ts` とその単体検証_
  - **処遇（HEAD `036baf69` の作業ツリー、2026-09-27 にリポジトリルートで実測）**: `errorHandler.middleware.ts` に `isDatabaseConnectionTimeout` を足し、既知エラーの分岐より前で判定して 503「Service Unavailable」の Problem Details を返す（既存の初期化エラー・パニックの 503 と応答処理を `respondDatabaseUnavailable` に共通化し、ログ・Sentry・本文は HEAD と同じ）。対象は (a) pg-pool の素の Error「Connection terminated due to connection timeout」「timeout exceeded when trying to connect」（完全一致）、(b) `code === 'ETIMEDOUT'`、(c) `@prisma/adapter-pg` が syscall・errno を伴う ETIMEDOUT を `SocketTimeout` に包み Prisma が変換する P1008 の `PrismaClientKnownRequestError`（**着手前は 400「Database Error」だった。独立レビューが P1008 に 400 を期待する検証・契約が他に無いことを確認**）。判定は `db.ts` から `backend/src/utils/db-connection-timeout.ts` へ移し `db.ts` は再輸出する（境界外。`db.js` を丸ごとモックする単体 28 件がエラー経路で export 欠落により落ちるのを避けるため。判定は同一）
  - **利用者の裁定「限定してコミット＋後続起票」（2026-09-27）**: 独立レビューの差し戻し（1回）で、**実際の認証エンドポイントは errorHandler に届かない**ことが判明した——`auth.service.ts` などのサービス（auth / permission / role-permission / role / session / user-role）は DB 例外を `Err({ type: 'DATABASE_ERROR' })` に変え、`auth.routes.ts`（:353 / :887 / :1000 など）が自前で 500 を返す。当初の検証は実在しない `/api/auth/me` の偽ルートで `@requirement user-authentication/REQ-24.1` を名乗り被覆を過大に数えていた。裁定に従い本項は errorHandler の対応づけに限り、**要件24.1 の被覆は名乗らない**（偽ルートを `/__test__/db-timeout` へ改名し、印7件を撤去。本スペックの受入基準は 373/388 のままで 24.1 は未被覆）。実エンドポイントへの到達は 35.11、対話型トランザクションの P2028 は 35.12 へ起票した
  - **検証**: 単体 `errorHandler.test.ts` に 8 件（正例4、無関係な一般エラー・部分一致・ECONN を 500 に保つ負例3、supertest 経由1）、統合 `db-connection-timeout-503.integration.test.ts`（応答しない TCP サーバーに本物の `RetryingPool`・`PrismaPg`・`PrismaClient` と errorHandler を通し、503 と Problem Details と経過 7000ms 以上を主張、約 9 秒）。**RED**: フラグ OFF で単体 5 件・統合が赤。変異（対応づけの撤去／判定を既知エラーの分岐の後へ／P1008 判定の撤去／部分一致・ECONN への拡大）はいずれも赤（独立レビューが2種を再現しハッシュの一致を確認）。backend 単体 5826 件、統合 951 件、type-check、lint 緑。鮮度宣言 `featureless-headers-resolvable-by-own-feature-after-115308` は 588 のまま
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test -- errorHandler db env` 74/74、統合 `db-connection-timeout-503` 1/1、type-check EXIT=0
  - **範囲外の観測（独立レビュー、起票はしていない）**: `code === 'ETIMEDOUT'` は発生元を問わず 503「Database connection error」になり、DB 以外（SMTP・S3 など）のタイムアウトが素のまま届くと誤分類されうる（タスク本文の指定どおりの判定）。P1001（ECONNREFUSED・ENOTFOUND）は 400「Database Error」のまま。`e2e/requirement-exclusions.json` の REQ-24.1 の除外（:64）が代替検証に挙げる chaos-engineering / Toxiproxy はリポジトリに実体が無い

- [x] 35.9 DB 接続の再試行回数を環境変数 `DATABASE_RETRY_COUNT` で与えるかを決めて実装する
  - 要件の環境変数表（requirements.md :47、列の空白を詰めて引用）: 「| `DATABASE_RETRY_COUNT` | データベース接続リトライ回数 | `3` | 任意 | 整数値（0-10） |」
  - 実測（2026-09-26）: `backend/.env.example:44-46` に `DATABASE_RETRY_COUNT=3` があるが、コードからは読まれていない（`git grep -l DATABASE_RETRY_COUNT` の当たりは requirements.md・`.env.example`・タスク35.2 で足した design.md の注記のみ）。タスク35.2 は条文 24.6 どおり回数を 3 回に固定した（`backend/src/db.ts` の `DB_CONNECT_RETRY_DELAYS_MS = [1000, 2000, 4000]` の要素数が回数を決める）
  - 条文 24.6 は間隔を 1秒・2秒・4秒の 3 つだけ挙げる。4 回目以降（最大 10 回）の間隔を 1000 × 2^(n−1) へ延ばすか、表の上限を 3 に揃えるか、0 回（再試行なし）を許すかを design.md で決めてから実装すること
  - 実装: `backend/src/config/env.ts` に 0〜10 の整数として検証を置き（既定 3）、DB クライアントの生成時にも同じ解析関数を通して `RetryingPool` の回数と間隔列を決める
  - 検証: 未設定で 3 回（1000 / 2000 / 4000ms）、設定値 0 で再試行なし、設定値 5 で決めた間隔どおりに 5 回、範囲外（11・-1・非数値）を拒否することを偽の時計で主張し、既定値や上限の変異で赤くなることを実測する
  - _Requirements: 24.6_
  - _Boundary: `backend/src/config/env.ts`、`backend/src/db.ts` とその単体検証_
  - **処遇（HEAD `8c585a05` の作業ツリー、2026-09-27 にリポジトリルートで実測）**: 利用者の裁定「0〜10 を受け、間隔を倍々で延ばす」（2026-09-27）に従い、`backend/src/config/env.ts` に `parseDatabaseRetryCount`（`^[0-9]+$` かつ 10 以下、未設定は 3。11・-1・1.5・非数値・空文字は拒否）を置き、`validateEnv` のスキーマと `getPrismaClient` の両方が同じ関数を通す。`backend/src/db.ts` の `dbConnectRetryDelaysMs(n)` が n 回目の間隔 1000 × 2^(n−1) ms の列を返し、`RetryingPool` は設定の `retryCount`（省略時 3）から間隔を決める。0 は再試行なし。未設定時の間隔 1000 / 2000 / 4000ms と打ち切りの条件は HEAD と同じ。決定は design.md の「データベース接続タイムアウト時の再試行（要件24.6）」に日付付きで追記した（上限 10 回では待ちの総和 1023000ms に接続タイムアウト 5000ms × 11 試行が加わり、失敗が返るまで約 18 分）
  - **検証**: `@requirement user-authentication/REQ-24.6` を付けた `env.test.ts`（既定 3、0 / 5 / 10 の受理、11 / -1 / 1.5 / abc / 3回 の拒否）と `db.test.ts`（偽の時計で試行の時刻差を測り、省略・0・5・10 回と `getPrismaClient` の未設定・0・5・拒否を主張）。**RED**: フラグ OFF で 19 件が赤。変異6種（既定値・上限・上限判定・間隔の式・`retryCount` の受け渡し・コンストラクタの既定値）はいずれも赤（独立レビューが3種を再現しハッシュの一致を確認）。backend 単体 5847 件、統合 `db-connection-timeout-503`、type-check、lint、`check:design-path-refs` 緑。`check:req-coverage` は本スペック 373/388 で不変（24.6 は 35.2 で被覆済み）、鮮度宣言は 588 のまま
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test -- env db` 72/72、type-check EXIT=0
  - **範囲外の観測（独立レビュー、起票はしていない）**: `DB_CONNECT_RETRY_DELAYS_MS` はコードから参照されなくなったが、design.md :3443 が名前で引くため既定の列として残した。design.md :3446 の「3 回に固定する」は 35.2 時点の記述で、:3447 の追記と字面上は食い違う。上限 10 回（約 18 分）では Railway などの HTTP プロキシの上限が短いと 503 が届く前に切られうる。`RetryingPool` のコンストラクタは `retryCount` を検証しない（本番の経路は必ず `parseDatabaseRetryCount` を通る）。Railway のダッシュボードの `DATABASE_RETRY_COUNT` の値はリポジトリの外で確認できない（リポジトリ内の env / compose には `.env.example` の `=3` のみ）

- [x] 35.10 プロフィール更新の画面から版を送り、409 の競合を表示する
  - 起票元: タスク35.7（利用者の裁定「任意・バックエンドのみ」、2026-09-27）。バックエンドは `expectedUpdatedAt` を任意で受け、GET / PATCH の `/auth/me` の応答に `updatedAt` を返す
  - 実測（2026-09-27）: `frontend/src/api/auth.ts:85` の `apiClient.patch<UserProfile>('/api/v1/auth/me', data)` は版を送らない。ロールの更新（PATCH /api/v1/roles/:id）を呼ぶフロントエンドのコードは 0 件（`git grep -n "apiClient.patch" -- frontend/src` の当たりに roles は無い）。**訂正（2026-09-28）**: この実測は誤り。確認の grep の出力を途中で切り詰めて見落としており、`frontend/src/pages/UserManagement.tsx:184` がロールの編集で PATCH を呼んでいる。後続はタスク36.7
  - 実装: `Profile.tsx` / `ProfileForm.tsx` が取得時の `updatedAt` を保持して送り、409 `PROFILE_CONFLICT` を受けたら最新の内容の再取得を促す表示を出す。ロールの更新画面を作るかは本項の範囲外
  - 検証: E2E で、2つのページから同じ版で順に更新し、後の方が競合の表示になることと保存値が先の方であることを主張する。版を送らない変異で赤くなることを実測する
  - _Requirements: 25.8_
  - _Boundary: `frontend/src/api/auth.ts`、`frontend/src/pages/Profile.tsx`、`frontend/src/components/ProfileForm.tsx` とその単体・E2E 検証_
  - _Depends: 35.7_
  - **処遇（HEAD `e7ec0637` の作業ツリー、2026-09-27 にリポジトリルートで実測。利用者の裁定「35.10 を実装する」に従った）**: `frontend/src/api/auth.ts` に `UpdateProfileRequest`（任意の `expectedUpdatedAt`）と `isProfileConflictError`（409 かつ `code: 'PROFILE_CONFLICT'`）を足した。`frontend/src/pages/Profile.tsx` は画面を開いたときに `getCurrentUser()` で表示名と版を取得し（取得中は保存不可、編集中の入力は上書きしない、取得に失敗したら版なしで保存）、保存は `updateProfile` で版を送り、成功したら応答の表示名と `updatedAt` を採用する（連続保存が 409 にならない）。409 `PROFILE_CONFLICT` では `role="alert"` の競合の表示（ログインなどの操作でも版が進みうることを添え、他の利用者を責めない文言）と「最新の内容を読み込む」ボタンを出す。変更検知の基準は保存済みの表示名に改めた（保存後に保存ボタンが無効へ戻る）。`frontend/src/components/ProfileForm.tsx` はどのルートからも描画されない（参照は stories と単体テストのみ）ため変えていない
  - **検証**: 単体 `Profile.optimistic-lock.test.tsx`（7 件）、`auth.test.ts`（+3 件）、`Profile.2fa.test.tsx`（画面を開いたときの取得の部分モックの追加のみで主張の弱化なし、独立レビューが確認）。E2E `e2e/specs/auth/profile.spec.ts` の describe「プロフィール更新の楽観的ロック（要件25.8）」2 件（`@requirement user-authentication/REQ-25.8`）: 2 画面から同じ版で順に保存し後の方が 409 と競合の表示、DB の値が先の方、再読み込み後の保存が成功／同一画面の連続保存がどちらも 200。**RED**: フラグ OFF で単体 7 件が赤。版を送らない変異は E2E（実装者が本番ビルドを作り直して再現）と単体 3 件（独立レビューが再現しハッシュの一致を確認）で赤。frontend 単体 11868 件、type-check、lint、format:check、E2E（profile 18・two-factor 17・security-accessibility 19・navigation 17・sessions 6）緑。`check:req-coverage` は本スペック 374/388 で不変（25.8 は 35.7 で被覆済み）、鮮度宣言は 588 のまま
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix frontend run test -- Profile auth` 133/133、frontend type-check EXIT=0
  - **範囲外の観測（独立レビュー、起票はしていない）**: 保存後にヘッダーなど AuthContext の表示名は更新されない（HEAD と同じ）。画面を開いたときの取得が /auth/me を1回増やす。取得にかかる数ミリ秒の間に入力を始め、かつ context の表示名がサーバーより古いと、利用者が見ていない表示名の版で保存しうる。再読み込みの失敗の分岐には単体テストが無い
  - **前提との関係**: 前提の 35.7 は実装・コミット済みだが site-survey 115.334 の解決待ちで `[ ]` のまま。本項は鮮度宣言を動かしておらず上流の関門に依存しないため `[x]` とした

- [x] 35.11 認証系のエンドポイントで DB 接続タイムアウトを 503 として返す
  - 起票元: タスク35.8（独立レビューの差し戻しと利用者の裁定「限定してコミット＋後続起票」、2026-09-27）
  - 実測（HEAD `036baf69` と 35.8 の作業ツリー）: `git grep -ln DATABASE_ERROR -- backend/src/services` の当たりは auth / permission / role-permission / role / session / user-role の 6 サービスで、DB 例外を `Err({ type: 'DATABASE_ERROR' })` に変える。`auth.routes.ts` の :353 / :887 / :1000 などはそれを受けて自前で 500 を返し、ログインの :353-360 は Problem Details でない本文の `detail` に `error.message` をそのまま載せる。35.8 の errorHandler の対応づけ（`isDatabaseConnectionTimeout`）には届かない
  - 実装: 接続タイムアウト（`backend/src/utils/db-connection-timeout.ts` の判定と P1008）をサービス層で飲み込まずに投げ直すか、ルートで 503 の Problem Details へ変換するかを design.md で決めてから実装する
  - 検証: 実在のエンドポイント（少なくともログイン・GET /api/v1/auth/me・トークンの更新）が DB 接続タイムアウトで 503 と Problem Details を返すことを、35.8 の統合検証と同じ無応答の TCP サーバーで主張し、`@requirement user-authentication/REQ-24.1` を付ける。変異で赤くなることを実測する
  - _Requirements: 24.1_
  - _Boundary: 上記 6 サービスと認証系のルートの DATABASE_ERROR の経路、その単体・統合検証_
  - _Depends: 35.8_
  - **処遇（HEAD `727bd8b1` の作業ツリー、2026-09-27 にリポジトリルートで実測）**: サービス層で投げ直す方式を採った（ルートで変換すると DATABASE_ERROR を個別に扱うルートと汎用の 500 のルートの両方に分岐が要り、503 の応答の形が errorHandler と二重になるため）。`backend/src/utils/db-connection-timeout.ts` に判定 `isDatabaseConnectionTimeout`（pg-pool の2文言の完全一致・`ETIMEDOUT`・P1008）と `rethrowIfDatabaseConnectionTimeout` を置き、6 サービスの DATABASE_ERROR を返す catch 24 か所（auth 8・permission 3・role-permission 3・role 4・session 3・user-role 3）の先頭で呼ぶ。タイムアウト以外の DB 例外のログ・`Err`・応答は HEAD と同じ。catch はいずれも `$transaction` のコールバックの外にありロールバックの意味は変わらない。タイムアウト時はサービスの文脈付きログの代わりに errorHandler のログと Sentry に残る。errorHandler の判定は同じモジュールからの import に置き換えた（境界外。判定の中身は同一）。決定は design.md の Error Handling に日付付きで追記した
  - **被覆の範囲（独立レビューの承認の条件）**: 24.1 の被覆印は、本物のアプリを応答しない DB へ向けて実在の認証の中核 6 エンドポイント（ログイン・GET /api/v1/auth/me・トークンの更新・ログアウト・全デバイスからのログアウト・登録。いずれも `$transaction` より先に DB へ問い合わせる）が 503 と Problem Details を返すことによる。**次の経路が残る間、条文24.1 は完全には充足していない**: (a) 最初の DB 到達が対話型トランザクションの開始である書き込み（P2028 → 500、35.12）、(b) `requirePermission` を通る roles / permissions / user-roles（`authorize.middleware.ts:91-96` が DB 例外を捕まえ自前の 500 を返す、35.13）
  - **検証**: 単体 `db-connection-timeout-rethrow.test.ts`（106 件: 24 か所 × {pg-pool のタイムアウト・P1008 は投げ直し／一般 Error・P1001 は DATABASE_ERROR} と判定の正例4・負例6）、統合 `auth-db-connection-timeout-503.integration.test.ts`（6 件、`@requirement user-authentication/REQ-24.1`。`DATABASE_RETRY_COUNT=0`・`DATABASE_CONNECTION_TIMEOUT=200` で本物の app.js を動的 import）。**RED**: フラグ OFF で単体 52 件・統合 6 件が赤（login・me・refresh・register は 500、logout・logout-all は 400）。変異（getCurrentUser の投げ直しの削除／判定の P1001・部分一致・全 Error への拡大）はいずれも赤（独立レビューが2種を再現しハッシュの一致を確認）。backend 単体 5953 件、統合 957 件、type-check、lint、E2E auth 123 件緑。`check:req-coverage` は本スペックの受入基準 373→374/388、鮮度宣言は 588 のまま
  - **独立レビューの差し戻し（1回）**: 統合検証の `beforeAll` が app.js の読み込み（コールド時 約10〜11秒）を既定の hookTimeout 20000ms の中で払い、backend-test の再起動直後に「Hook timed out in 20000ms」で赤になった（レビューが再現）。`beforeAll` に 60000ms の上限を渡し、再起動直後とウォームの両方で 6/6 緑を実装者とレビューがそれぞれ確かめた
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test -- db-connection-timeout errorHandler` 129/129、統合 `auth-db-connection-timeout-503` 6/6、type-check EXIT=0
  - **後続の候補（起票はしていない）**: `e2e/requirement-exclusions.json` の REQ-24.1 の除外（:64）は代替検証に実体の無い chaos-engineering / Toxiproxy を挙げたままで、本項の統合検証へ向け直すか取り下げるかを決める必要がある。ログインの `detail: error.message` の露出はタイムアウト以外の DB 例外で残る

- [x] 35.12 対話型トランザクションの開始が DB 接続タイムアウトで打ち切られる経路を 503 にする
  - 起票元: タスク35.8（実装者の懸念と独立レビューの再現、2026-09-27）
  - 実測: 到達しない DB に対する `prisma.$transaction(async tx => ...)` は Prisma の `maxWait` 既定 2000ms が `RetryingPool` の再試行の予算（1000 / 2000 / 4000ms）より短いため、約 2.1〜2.9 秒で P2028「Unable to start a transaction in the given time.」となり、`errorHandler.middleware.ts` の P2028 の分岐（:139）で 500「Transaction Timeout」を返す。認証系の書き込みはタスク35.5 でトランザクション化済みのため、書き込みの経路では 24.1 の 503 が成り立たない
  - 制約: P2028 の 500 は estimate-creation の design.md（:4336、要件42.3）とタスク57.6 の約束であり、他スペックの振る舞いを変えないこと。認証系の `$transaction` に `maxWait` を明示するか、開始の待ちの打ち切りを接続タイムアウトとして区別するかを design.md で決め、estimate-creation への影響を確かめてから実装する
  - 検証: 認証系の書き込みのエンドポイントが DB 接続タイムアウトで 503 を返すこと、estimate-creation の P2028 の既存の検証が緑のままであることを主張する
  - _Requirements: 24.1_
  - _Boundary: 認証系のサービスのトランザクションの設定（または errorHandler の P2028 の判定）とその統合検証_
  - _Depends: 35.11_
  - **処遇（HEAD `886898f2` の作業ツリー、2026-09-27 にリポジトリルートで実測）**: 認証系の対話型トランザクションのうち最初の DB 到達が開始である 7 か所（`AuthService.register`、`RoleService.updateRole` の版つき、`RolePermissionService` の add / removePermissions、`UserRoleService` の add / removeRoles と `deleteUser`）に、`maxWait` として「接続の再試行の予算 + Prisma 既定の 2000ms」を渡す。新設 `backend/src/utils/db-connect-budget.ts` の `dbConnectBudgetMs(n, t)`（間隔の総和 + (n+1) × t）と `connectBudgetTransactionOptions()`（`parseDatabaseRetryCount` / `parseDatabaseConnectionTimeout` を呼び出しの時点で通す）が値を決め、`dbConnectRetryDelaysMs` は `db.ts` から移して再輸出した。`timeout` は既定のまま。実測（Prisma 7.9.1 + adapter-pg + 応答しない TCP）で、`maxWait` なしでは約 2.3 秒で P2028（`meta` 空）、予算を覆う `maxWait` では pg-pool の接続タイムアウトの素の Error が届き 35.11 の投げ直しで 503 になることを確かめた。P2028 は原因を持たずプールの満杯でも同じ文言で出るため区別する方式は採らず、errorHandler の P2028 の分岐・PrismaClient の既定の `transactionOptions`・estimate-creation の `ESTIMATE_SAVE_TRANSACTION_OPTIONS` は変えていない。PasswordService・TwoFactorService の対話型トランザクションは先に DB へ問い合わせるため対象外（独立レビューが確認）。決定は design.md の Error Handling に日付付きで追記した
  - **振る舞いの変化（開示）**: プールが満杯のとき、7 か所の書き込みは従来の約 2 秒の P2028 → 500 に代えて、予算の内（既定で最長 27 秒、`DATABASE_RETRY_COUNT=10` で約 18 分）待って成功するか 503 を返す。トランザクションを使わない問い合わせと同じ扱い（独立レビューは退行でないと判断）
  - **検証**: 単体 `auth-transaction-connect-budget.test.ts`（21 件: 7 か所 × 2 と予算の関数）、統合 `auth-transaction-db-connection-timeout-503.integration.test.ts`（5 件、POST / DELETE のユーザーのロール、DELETE のユーザー、POST / DELETE のロールの権限）。5 件とも `requirePermission` を通るため `RBACService.prototype.hasPermission` だけを差し替え、ルート・サービス・PrismaClient・RetryingPool・errorHandler は本物。`@requirement user-authentication/REQ-24.1` の各印に「hasPermission を差し替えた前提。35.13 の完了まで実運用では 500」と添えた（独立レビューの推奨に従い親が注記のみ追加）。**RED**: フラグ OFF で単体 17 件・統合 5 件が赤（約 2.0〜2.7 秒の P2028 で 500）。変異（`deleteUser` の options の撤去＝統合1・単体2 件赤、予算の `(n+1)` を `n` に＝単体 20 件赤）を独立レビューが再現しハッシュの一致を確認。後者は統合では検出されない（2000ms の余裕が覆う）ため、式の正しさは単体が守る。backend 単体 5974 件、統合 962 件（estimate-draft-save 36 件を含む）、コールド実行、type-check、lint 緑。`check:req-coverage` は本スペック 374/388 で不変、鮮度宣言は 588 のまま
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test -- auth-transaction-connect-budget db-connection-timeout` 127/127、統合 `auth-transaction-db-connection-timeout-503` 5/5（注記の追加後）、type-check EXIT=0、lint EXIT=0

- [x] 35.13 権限の確認が DB 接続タイムアウトを 503 として返す
  - 起票元: タスク35.11（独立レビューの承認の条件、2026-09-27）
  - 実測（HEAD `727bd8b1`）: `backend/src/middleware/authorize.middleware.ts:91-96` の `requirePermission` の catch は RBAC の DB 例外をすべて捕まえ、`logger.error({ error, ... })` の後に `res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to check permissions' })` を返す。権限キャッシュに当たらないと判定が DB を引くため、roles / permissions / user-roles の実エンドポイントは DB 接続タイムアウトで 503 にならない。ログのキーが `error` のため、pino の `err` シリアライザが効かず障害の中身が失われる（35.4 と同じ問題）
  - 実装: 接続タイムアウト（`backend/src/utils/db-connection-timeout.ts` の `isDatabaseConnectionTimeout`）は `next(error)` で errorHandler の 503 へ渡し、自前の 500 はそれ以外の例外に限る。ログのキーを `err` にするかもあわせて決める
  - 検証: 権限キャッシュに当たらない状態で roles / permissions / user-roles の実エンドポイントが DB 接続タイムアウトで 503 と Problem Details を返すことを統合で主張し（35.11 の統合検証と同じ方式）、タイムアウト以外の例外が従来どおり 500 を返すことと、渡しを外す変異で赤くなることを実測する
  - _Requirements: 24.1_
  - _Boundary: `backend/src/middleware/authorize.middleware.ts` とその単体・統合検証_
  - _Depends: 35.11_
  - 追記（タスク35.12 の独立レビュー、2026-09-27）: `backend/src/__tests__/integration/auth-transaction-db-connection-timeout-503.integration.test.ts` は `RBACService.prototype.hasPermission` を差し替えて 503 を主張している。本項で authorize.middleware がタイムアウトを errorHandler へ渡すようになったら、この差し替えを外し差し替えなしで 503 を主張するよう改め、各印に添えた「35.13 の完了まで実運用では 500」の注記も除くこと
  - **処遇（HEAD `38976854` の作業ツリー、2026-09-27 にリポジトリルートで実測）**: `requirePermission` の catch は、権限の判定（RBACService の `hasPermission` → `getUserPermissions` → `prisma.user.findUnique`。DB 例外の catch は無い）が投げた例外のうち `isDatabaseConnectionTimeout` が真のものを `next(error)` で errorHandler の 503 へ渡し、それ以外は HEAD と同じ 500 `{ error: 'INTERNAL_ERROR', message: 'Failed to check permissions' }` を返す。ログのキーは同じファイルの2つの catch（`requirePermission` と `recordPermissionCheckFailure`）とも `err` に改めた（本物の pino のシリアライザで `error` キーは `{}`、`err` キーは message と stack が残ることを実測）。`requirePermission` は認証系の外の 32 のルートファイルでも使われ、それらも権限の判定の DB 接続タイムアウトで 503 を返すようになる（他スペックに authorize の DB 例外で 500 を期待する検証・記述は無いことを独立レビューが確認）。決定は design.md の Error Handling に日付付きで追記し、35.11 / 35.12 の節の「権限の確認の 500 が先に返る」の記述に 35.13 で改めた旨を添えた（独立レビューの推奨を親が反映）
  - **追記への対応**: `auth-transaction-db-connection-timeout-503.integration.test.ts` の印つきの 5 件から `hasPermission` の差し替えと注記を外し、差し替えなしで 503 を主張する。差し替えを外すと 503 は authorize の段階で返り 35.12 の `maxWait` の経路を通らなくなる（`deleteUser` の予算を外す変異でも緑のままになることを実測）ため、**親の判断で**、`hasPermission` を差し替えた印なしの describe「トランザクションの開始の経路の退行検出」を同じファイルに残した（被覆の名乗りではない）
  - **検証**: 単体 `authorize.middleware.test.ts` に 9 件（タイムアウト4種は `next(error)`、一般 Error・P1001・部分一致の文言は同じ本文の 500、2つの catch の `err` キー）。統合 `authorize-db-connection-timeout-503.integration.test.ts`（GET /api/v1/roles・/roles/:id/permissions・/permissions・/users・/users/:id/roles が差し替えなしで 503、`@requirement user-authentication/REQ-24.1`）。**RED**: フラグ OFF で単体 6 件・統合 10 件が赤。変異（渡しの撤去＝単体4・統合10 件赤、印なしの describe は緑のまま／35.12 の `addRoles`・`removePermissions`・`deleteUser` の予算の撤去＝印なしの describe の該当 1 件ずつが赤）を独立レビューが再現しハッシュの一致を確認。backend 単体 5983 件、統合 967 件、コールド実行 15/15、type-check、lint 緑。`check:req-coverage` は本スペック 374/388 で不変、ラチェット（ヘッダー 1996・名乗り 5054）は上限ちょうどで超えていない、鮮度宣言は 588 のまま
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test -- authorize` 22/22、統合 `authorize-db-connection-timeout-503 auth-transaction-db-connection-timeout-503` 15/15、type-check EXIT=0

_起票元: タスク33.1（利用者の裁定「取り下げて後続を起票」、2026-09-26）_

## タスク36: 機能検証（2026-09-28）の NO-GO の是正

_起票元: `/kiro-validate-impl user-authentication`（2026-09-28、HEAD `6393c643`）の NO-GO と、利用者の指示「1〜8をタスク36として起票して」。行番号はいずれも HEAD `6393c643` での実測_

- [x] 36.1 管理画面からのロールの追加を API の契約へ揃える
  - 実測: `frontend/src/pages/UserManagement.tsx:115` は `apiClient.post(`/api/v1/users/${userId}/roles`, { roleId })` を送るが、`backend/src/routes/user-roles.routes.ts:31` は `roleIds: z.array(z.string().min(1)).min(1, ...)` を必須にするため、`/admin/users` のセレクトからの追加は必ず 400 になり「ロール追加に失敗しました」と表示される。単体 `frontend/src/__tests__/pages/UserManagement.test.tsx` は apiClient をモックし `roleId: 'role-3'` を期待して欠陥を固定している。E2E（`e2e/specs/admin/user-role.spec.ts` ほか）は API を直接呼ぶだけで画面の操作を通していない（35.5 の範囲外の観測 (iii) で既知）
  - 実装: 画面が `{ roleIds: [roleId] }` を送る。単体の期待値を契約へ改める
  - 検証: 管理画面のセレクトからロールを追加し、成功の表示と DB の割り当てを主張する E2E を足す（`@requirement user-authentication/REQ-20.1`）。`roleId` を送る変異で赤くなることを実測する
  - _Requirements: 20.1_
  - _Boundary: `frontend/src/pages/UserManagement.tsx` とその単体・E2E 検証_
  - **処遇（2026-09-28）**: `handleAddRoleToUser` が `{ roleIds: [roleId] }` を送るよう改め、単体 `UserManagement.test.tsx` の期待値を契約へ揃えた。`e2e/specs/admin/user-role.spec.ts` に「管理者は管理画面のセレクトからユーザーにロールを追加できる」（`@requirement user-authentication/REQ-20.1`）を足し、セレクトの操作 → POST の 204（パス基準で観測）・成功の表示・失敗の表示 0 件・`userRole` の行を主張する。修正前の `{ roleId }` の送信で frontend を作り直すと E2E は 400 で赤くなることを実測した。user-role.spec.ts 9/9、frontend 単体の全体 11868 件が緑。独立レビューは APPROVED

- [x] 36.2 権限のキャッシュを本番の権限確認の経路で使う
  - 実測: `backend/src/middleware/authorize.middleware.ts:61` の `requirePermission` は `rbacService || new RBACService(client)` で Redis を渡さずに都度生成し、ルートからの注入は 0 件。`RBACService.getUserPermissions`（`rbac.service.ts:40`）を本番で呼ぶのは `hasPermission`（`:147`）だけで、それを呼ぶのは authorize だけである。Redis を渡す RBACService は `roles.routes.ts:27` / `user-roles.routes.ts:24` にあるがキャッシュの無効化にしか使われない。このため条文 21.9「権限情報を適切なキャッシュ機構に保存」・24.2「キャッシュ接続が失敗する THEN データベースから直接権限情報を取得」・24.7「キャッシュ障害時にフォールバック処理が実行される THEN 警告ログを記録」は、被覆印（35.3 ほか）があっても本番の経路では働かない（design.md の 35.12 の節も「Redis を持たない RBACService を都度生成するため権限のキャッシュに当たらず」と記す）。24.7 の警告（`rbac.service.ts:54` / `:120` ほか）はログのキーが `{ error }` で、本番の出力では障害の中身が失われる
  - 実装: `requirePermission` が Redis を持つ RBACService を使う（共有インスタンスの注入か生成の方針を design.md で決める）。キャッシュの無効化（ロール・権限の変更時）と整合させる。24.7 の警告のキーを `err` にする。35.12 / 35.13 の統合検証（応答しない DB での 503）が、キャッシュに当たる場合と当たらない場合でどう振る舞うかを確かめ直す
  - 検証: 実 Redis を使う統合検証で、2 回目の権限確認が DB を引かないこと（21.9）、Redis の障害時に DB から取得して応答が成り立つこと（24.2）と警告ログが `err` 付きで残ること（24.7）を、本物の `requirePermission` の経路で主張する。既存の 24.2 / 24.7 / 21.9 の印の妥当性を見直す
  - _Requirements: 21.9, 24.2, 24.7_
  - _Boundary: `backend/src/middleware/authorize.middleware.ts`、`backend/src/services/rbac.service.ts`、それらの生成箇所と統合検証_
  - **処遇（2026-09-28）**: 共有インスタンスの注入を採った。`getSharedRBACService()` が唯一の RBACService を生成し、`requirePermission` とキャッシュを無効化する `roles.routes.ts` / `user-roles.routes.ts` が同じインスタンスを使う。Redis のクライアントは呼び出しの時点で解決し、状態が `ready` のときだけ読み書きする。24.7 の警告のキーは `err` に改めた。HEAD のルートは `initRedis()` より前のモジュール読み込みの時点で `getClient()` を評価していたため、**ロール・権限の変更時のキャッシュの無効化は本番で何もしていなかった**（独立レビューが `backend/src/index.ts` の初期化順で確認）。本項で解消した。ユーザーの削除の後にも、そのユーザーのキャッシュを無効化する（`user-role.service.ts`、キャッシュが効くようになったため削除済みユーザーの有効なトークンが残りのキャッシュで通らないように）。ロールの削除は割り当て中なら拒否され、権限の削除の本番コードは無いため無効化は不要。API を通さない DB の直接の変更、Redis 障害中の無効化の失敗、cache-aside の競合は TTL（15 分）で上限が付く。これは design.md の「無効化の限界」に記した。E2E `admin/rbac.spec.ts` の REQ-21.9 の印はキャッシュを観測していないため外した（21.9 は統合で被覆）。決定は design.md の「キャッシング戦略」と Error Handling の 35.12 / 35.13 の項に日付付きで追記した
  - **検証**: 統合 `rbac-permission-cache.integration.test.ts`（5 件、実 Redis・実 DB・本物の `requirePermission`）。21.9 は、2 回目は DB の権限を直接消しても 200 のままで、キーを消すと 403 になることで主張する。24.2 は、Redis を切断すると DB の権限で 200 になることで主張する。24.7 は、警告がちょうど 1 回 `{ err, userId }` で残り、本物の pino のシリアライザを通した後も message と stack が残ることで主張する。35.12 / 35.13 の 503 の統合検証は、キャッシュに当たる場合と当たらない場合の両方へ改めた（当たる側に 403 の対照を置いた）。**RED**（変異はすべて元に戻して cmp で確認）: (A) Redis なしの `new RBACService(client)` と `{ error }` キー＝キャッシュの検証 5/5 が赤（独立レビューも再現）。(B) ルートを読み込み時の `getClient()` に戻す＝無効化の検証が赤（独立レビューも再現）。(C) deleteUser の無効化の撤去＝1 件が赤。(D) `ready` でないときの分岐のキーを `error` にする＝24.7 が赤。(E) deleteUser の `maxWait` の撤去＝500 で赤。backend 単体 5994 件、統合 984 件、type-check、lint が緑。`check:req-coverage` の未被覆は 142→141（REQ-24.2）。REQ-24.2 は除外にも残っており二重の状態のため、36.5 で揃える。`check:design-measurement-freshness` の `t13-anchor-references-after-115303`（expected 1415 / actual 1416）と `check:req-coverage` の赤は、HEAD でも同じであることを独立レビューが確かめた（本項の外）
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test:unit` 5994/5994、統合 `rbac-permission-cache authorize-db-connection-timeout-503 auth-transaction-db-connection-timeout-503` 27/27、type-check EXIT=0、lint EXIT=0

- [x] 36.3 パスワードと二要素認証の経路で DB 接続タイムアウトを 503 として返す
  - 実測: PasswordService の catch は DB 例外を `RESET_TOKEN_INVALID` に変える（`password.service.ts:339` / `:473` / `:539`）。`/password/change` は「Current password is incorrect」の 400、`/password/reset` は「Invalid reset token」の 400、`/password/reset-request` は 200 を返す。TwoFactorService の catch（`two-factor.service.ts:386` / `:469` / `:581` / `:650` / `:707` / `:764`）は DB 例外を `INVALID_TOTP_CODE` / `INVALID_PASSWORD` / `USER_NOT_FOUND` などに変え、400 / 404 を返す。2FA のログイン（`AuthService.verify2FA`）は検証の途中のタイムアウトを検証の失敗として扱い、失敗回数を加算する。利用者には DB 障害が「パスワード／コードが違う」と見える。design.md の 35.11 の節はこの 2 サービスを対象外としたが起票していなかった
  - 実装: 35.11 と同じく `rethrowIfDatabaseConnectionTimeout` で投げ直し、errorHandler の 503 へ届ける。2FA の失敗回数をタイムアウトで加算しない
  - 検証: 35.11 と同じ方式（応答しない TCP サーバーと本物のアプリ）で、パスワード変更・リセットの要求と確定・2FA の有効化・無効化・ログインの検証が 503 と Problem Details を返し、失敗回数が増えないことを主張する（`@requirement user-authentication/REQ-24.1`）。タイムアウト以外の DB 例外の応答は変えない
  - _Requirements: 24.1_
  - _Boundary: `backend/src/services/password.service.ts`、`backend/src/services/two-factor.service.ts`、`AuthService.verify2FA` の該当の catch と、その単体・統合検証_
  - **処遇（2026-09-28）**: PasswordService の catch 3 か所（リセットの要求・確定・パスワードの変更）と TwoFactorService の catch 7 か所（設定の開始・TOTP の検証・バックアップコードの検証・有効化・無効化・バックアップコードの状態の取得・再生成）の先頭で `rethrowIfDatabaseConnectionTimeout` を呼ぶ。`setupTwoFactor` は実測の一覧に無かったが同じく DB 例外を 404 へ変えるため含めた。2FA のログインは、検証の中のタイムアウトが外側の catch（35.11）へ直接届くため失敗回数を加算しない。`verify2FA` と兄弟の `verify2FABackupCode` の失敗回数の更新を囲む内側の catch もタイムアウトを投げ直す。先行の問い合わせの後に接続が失われるとトランザクションの開始が既定の `maxWait` で P2028 になることを実測したため、2 サービスの対話型トランザクション 6 か所に `connectBudgetTransactionOptions()` を渡した（配列形式の `$transaction` は変えない）。決定は design.md の Error Handling に日付付きで追記し、35.12 の除外の文に改めた旨を添えた。独立レビューの指摘（リセットの要求の応答の差の列挙の観点）は親が design.md に一文で記録した
  - **検証**: 単体 `password-two-factor-db-connection-timeout.test.ts`（77 件）、統合 `password-two-factor-db-connection-timeout-503.integration.test.ts`（14 件）と `password-two-factor-transaction-db-connection-timeout-503.integration.test.ts`（4 件）を追加した。実データベースへの TCP の中継 `switchable-database-relay.ts` で無応答を切り替える。**RED**: 投げ直しのフラグ OFF で単体 41 件・統合 12 件が赤（400 / 200 / 404 / 401）、HEAD では検証の途中のタイムアウトで失敗回数が 1 に増えることを確認した。maxWait のフラグ OFF で単体 6 件・統合 4 件が約 2.1〜2.4 秒の P2028 で赤。独立レビューが変異 4 つ（verify2FA の失敗回数の更新の投げ直し、changePassword・verifyTOTP の投げ直し、setupTwoFactor の maxWait の撤去）を再現し、新しい統合の 2 ファイルを 2 回実行してどちらも 18/18 だった。backend 単体 6071 件、統合 1002 件、type-check、lint が緑。`check:req-coverage` は被覆印の区間が 3017→3034 になっただけで、本スペック 375/388 とラチェットは不変。`check:design-measurement-freshness` の出力は変更前後で同じ
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test:unit` 6071/6071、統合 `password-two-factor` 18/18、type-check EXIT=0、lint EXIT=0

- [x] 36.4 ロールの作成・更新・削除と割り当ての削除を監査ログへ同じトランザクションで記録する
  - 実測: `UserRoleService.removeRoleInTransaction`（`user-role.service.ts:384`）は監査ログを記録しない。`USER_ROLE_REVOKED` は `backend/src/types/audit-log.types.ts:113` の型にあるだけで、どこでも書かれていない。ロールの監査ログは `roles.routes.ts:151` の `ROLE_CREATED` だけで、しかも書き込みのトランザクションの外にある。`ROLE_UPDATED` / `ROLE_DELETED` を記録する本番コードは 0 件。`e2e/specs/admin/audit-log.spec.ts` の `@requirement user-authentication/REQ-22.3`（「割り当て・削除時」）は割り当てしか主張していない（35.5 の範囲外の観測 (i)(ii) で既知）
  - 実装: ロールの割り当ての削除に `USER_ROLE_REVOKED`、ロールの更新・削除に監査ログを記録し、ロールの作成・更新・削除の監査ログを書き込みと同じ `$transaction` に入れる（35.5 と同じ作法。`AuditLogService.createLog` の第2引数に tx）
  - 検証: 実 DB の統合検証で、各操作の監査ログが記録されることと、監査ログの失敗で書き込みごとロールバックされることを主張する。E2E の 22.3 の検証に削除時の監査ログを加える
  - _Requirements: 22.1, 22.3, 25.5_
  - _Boundary: `backend/src/services/user-role.service.ts`、`backend/src/services/role.service.ts`、`backend/src/routes/roles.routes.ts` の監査ログの経路と、その統合・E2E 検証_
  - **処遇（2026-09-28）**: `RoleService` が監査ログのサービスを受け取り、`createRole` / `updateRole` / `deleteRole` が `ROLE_CREATED` / `ROLE_UPDATED` / `ROLE_DELETED` を書き込みと同じ `$transaction` の中で `createLog(..., tx)` により記録する。作成・版なしの更新・削除は新たにトランザクションとし `connectBudgetTransactionOptions()` を渡した（適用箇所 7→10）。版なしの更新は変更前の値を同じトランザクション内で `FOR NO KEY UPDATE` で読む。`removeRoleInTransaction` は紐付けの削除の直後に同じ tx で `USER_ROLE_REVOKED` を記録する。`roles.routes.ts` のトランザクション外の `ROLE_CREATED` は撤去し、実行者をサービスへ渡す。`user-roles.routes.ts` の DELETE も実行者を渡す（1 行。無いと本番で `USER_ROLE_REVOKED` が 1 件も記録されないことを独立レビューが E2E の赤で確認した）。実行者の無い呼び出しは記録しない（既存の `addRoleToUser` と同じ規則、design.md に記載）。決定は design.md に日付付きで追記した
  - **検証**: 統合 `role-audit-log-atomicity.integration.test.ts`（19 件、実 DB。トリガーによる監査ログの保存失敗とコミット時点の失敗（遅延制約トリガー）で書き込みごと残らないことを主張）。E2E `admin/audit-log.spec.ts` に更新（22.1）と割り当ての削除（22.3）の監査ログを追加。**RED**: サービスを HEAD に戻すと統合 12/19 が赤、tx を渡さない変異で 7/19 が赤、ルートを HEAD に戻すと単体 5 件が赤、backend を HEAD に戻すと E2E の `ROLE_UPDATED` / `USER_ROLE_REVOKED` が null で赤（独立レビューも tx の変異と actorId の撤去を再現）。backend 単体 6083 件、統合、type-check、lint、E2E 11/11 が緑。`check:req-coverage` と `check:design-measurement-freshness` の赤は HEAD と同じ（本項の外）。独立レビューの提案（`IRoleService` / `IUserRoleService` に `actorId?` を宣言していない。全呼び出し元が具象クラスのため実害なし）は見送った
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test:unit` 6083/6083、統合 `role-audit-log-atomicity auth-write-atomicity` 39/39、type-check EXIT=0、lint EXIT=0、E2E `admin/audit-log.spec.ts` 11/11

- [x] 36.5 障害耐性の除外（REQ-24.1 / 24.2）を実際の検証へ揃える
  - 実測: `e2e/requirement-exclusions.json` の REQ-24.1（:64）と REQ-24.2（:78）は、代替検証にリポジトリに実体の無い chaos-engineering / Toxiproxy を挙げたまま除外に残っている。24.1 は 35.11〜35.13 の統合検証の印で被覆にも数えられ、除外と被覆が二重になっている。24.2 の被覆は 36.2 の後に本物の経路で成り立つ。33.1 / 35.3 / 35.8 / 35.11 の記録が「後続の候補」としたまま起票していなかった
  - 実装: 24.1 の除外を取り下げるか、代替検証を実在の統合検証（`backend/src/__tests__/integration/auth-db-connection-timeout-503.integration.test.ts` ほか）へ書き直す。24.2 は 36.2 の結果に合わせる。除外の件数を錨にする site-survey の鮮度宣言（`requirement-exclusions-total` など）が動く場合は、site-survey の tasks.md へ起票して本項を `_Blocked:` にする（下流は上流の文書・宣言を書き換えない）
  - 検証: `npm run check:req-exclusions` と `:selftest`、`npm run check:req-coverage`、`npm run check:design-measurement-freshness`
  - _Requirements: 24.1, 24.2_
  - _Boundary: `e2e/requirement-exclusions.json` の REQ-24.1 / 24.2 の項目_
  - _Depends: 36.2_
  - **処遇（2026-09-28）**: 取り下げではなく、代替検証の書き直しを採った。24.1 は `integration-test` / `Vitest / Supertest` とし、`auth-db-connection-timeout-503`・`authorize-db-connection-timeout-503`（権限のキャッシュに当たる場合と当たらない場合）・`auth-transaction-db-connection-timeout-503`・`password-two-factor-db-connection-timeout-503`・`password-two-factor-transaction-db-connection-timeout-503` の統合検証を挙げた。24.2 は 36.2 の `rbac-permission-cache.integration.test.ts` の「Redis の接続が失われているとき、権限を DB から取得して応答し、err 付きの警告ログを残す」を挙げた。実体の無い chaos-engineering / Toxiproxy の記述は消した。DB の無応答や Redis の切断は E2E では作れないため、除外（E2E 範囲外）には残す。前例は 32.2 の REQ-31.6 の書き直し（`8546b446`）で、33.1 の取り下げは代替検証が実在しなかった場合にあたる。同居の禁止の検査は `e2e/specs` の印だけが対象のため、統合検証の印との同居は違反にならない（HEAD でも 29 件ある通常の形）。取り下げると site-survey の錨 `requirement-exclusions-total`（143）が 141 に動き上流への起票が要るが、書き直しでは動かない。トップレベルの `lastUpdated` は過去のコミットでも更新がまちまちで、検査の要件でもないため据え置いた
  - **検証**: `check:req-exclusions` と `:selftest`（70/70）は前後とも緑で、出力も同じ。`check:req-coverage` は前後とも HEAD の未被覆（5.6 / 11.3 ほか、36.6）で赤。差は除外の監査の「リポジトリ外の代替検証」32→30 と「リポジトリ内検証あり」29→31 の 2 行だけで、「掲げるが不在」は 82 件のまま動かない（検査器が 2 項目を実在の検証として認めた）。`check:design-measurement-freshness` は前後とも HEAD からの t13（1415 / 1416）だけで赤。独立レビューが HEAD の一時 worktree で比べ、参照先の各ファイルの `@requirement` の印と主張の中身を開いて確かめた。独立レビューは APPROVED
  - **検証（親が承認後に新鮮な証拠で再実行）**: `check:req-exclusions` EXIT=0、`:selftest` EXIT=0、`check:req-coverage` EXIT=1（監査は外 30 / 内あり 31、HEAD からの赤）、`check:design-measurement-freshness` EXIT=1（t13 の 1415 / 1416 のみ、HEAD から）

- [x] 36.6 未被覆の受入基準 5.6 と 11.3 を検証する
  - 条文 5.6（逐語）: 「WHEN トークンにユーザー情報を含める THEN Authentication ServiceはユーザーID、メールアドレス、ロール情報を含めなければならない」。条文 11.3（逐語）: 「WHEN ユーザーが入力フィールドにフォーカスする THEN Frontend UIは視覚的なフィードバック（アウトライン表示）を提供しなければならない」
  - 実測: `backend/src/services/token.service.ts:121` はペイロードに `roles` を含めるが、条文を主張する検証が無い。2 件は site-survey の 115.188（コミット `86882dd6`）で誤った名乗りが取り下げられて未被覆になり、記録は site-survey が管理する被覆印の裁定記録（115.188 の取り下げの項）にあるだけで本スペックに担当のタスクが無い。`check:req-coverage` の「E2E 適用対象 100% 未満」の要因の一つ
  - 実装・検証: 5.6 は発行したアクセストークンをデコードしユーザー ID・メールアドレス・ロールを含むことを、11.3 はログイン等の入力にフォーカスしたときアウトラインが表示されることを、それぞれ E2E で主張する（`@requirement user-authentication/REQ-5.6` / `REQ-11.3`）。実装に欠けがあれば直す。被覆印の追加が site-survey の鮮度宣言やラチェット（`MAX_FEATURELESS_COVERAGE_HEADERS` / `MAX_DORMANT_HEADER_NAMES`）を動かす場合は上流へ起票する
  - _Requirements: 5.6, 11.3_
  - _Boundary: 該当の E2E 検証（と欠けがあれば `token.service.ts` / 入力の見た目）_
  - **処遇（2026-09-28）**: 5.6 は実装に欠けが無く（`token.service.ts:121` が `userId` / `email` / `roles` を載せ、design.md の TokenPayload と一致）、検証だけを足した。11.3 は**実装が欠けていた**。`LoginForm.tsx` のメール欄・パスワード欄はインラインの `outline: 'none'` だけで、フォーカス時の代わりの表示が全体の CSS にも無く、フォーカスしても何も見えなかった。フォーカス中の欄を状態で持ち、その欄にだけ `2px solid #2563eb`（既存のフォーカス色と同じ、白地とのコントラスト約 5.2:1）のアウトラインを出すよう直した。`onFocus` / `onBlur` のためキーボードでもマウスでも出る
  - **検証**: E2E `auth/token-refresh.spec.ts`（`@requirement user-authentication/REQ-5.6`）は、ロールを 2 つ持つユーザーで画面からログインし、ログインの応答をパスで照合してアクセストークンをデコードし、ユーザー ID・メールアドレス・ロールが DB と一致することと、保存したトークンが応答と同じことを主張する。E2E `auth/login.spec.ts`（`@requirement user-authentication/REQ-11.3`）は、Tab / Shift+Tab でフォーカスした欄にだけ計算済みスタイルのアウトラインが出ることを主張する。単体 `LoginForm.test.tsx` に 1 件を足した。**RED**: 11.3 は直す前の本物のコードで E2E と単体が赤。独立レビューが `FOCUS_OUTLINE` を `'none'` にして再ビルドし E2E（`login.spec.ts:266`）と単体が赤になることを再現した。5.6 は `roles: payload.roles` を消すと E2E が赤（実装者・独立レビューとも）。いずれも元に戻して cmp で一致を確認した。frontend 単体の全体 11869 件（`npm --prefix frontend run test`。repo のルートから起動すると CSS の相対パスで 2 件が ENOENT になる）、E2E 27/27、type-check、lint、`check:e2e-guards`、`check:e2e-selfjudge` が緑。`check:req-coverage` で本スペックは 375→377/388、E2E 適用対象 100%（全体の赤は他機能の既存の未達）。`check:design-measurement-freshness` の出力は前後で同じで、site-survey の鮮度宣言・ラチェットは動かない
  - **範囲外の観測（未起票）**: (i) `RegisterForm`・`PasswordResetForm`・`TwoFactorSetupForm`・`TwoFactorVerificationForm` も `outline: 'none'` のままでフォーカス表示が無い。要件 11 は「ログイン画面」でタスクの境界の外だが、ログイン中の 2FA の確認欄は同じ流れの一部とも読める。(ii) 新しい `FOCUS_OUTLINE`（outlineOffset 1px）は既存の `FOCUS_VISIBLE_STYLES`（`frontend/src/utils/keyboard-navigation.ts`、outlineOffset 2px）を再利用していない。(iii) `login.spec.ts:200` の既存の Tab のテスト（REQ-11.11）の説明に素の文「要件11.3: フォーカス時の視覚的フィードバック」が残る。検査器は印として数えない。独立レビューは APPROVED
  - **検証（親が承認後に新鮮な証拠で再実行）**: 単体 `LoginForm.test.tsx` 17/17、E2E `auth/login.spec.ts` と `auth/token-refresh.spec.ts` 27/27、ルートと frontend の type-check EXIT=0

- [x] 36.7 ロールの編集画面から版を送り、409 の競合を表示する
  - 実測: `frontend/src/pages/UserManagement.tsx:184` の `apiClient.patch(`/api/v1/roles/${editingRole.id}`, input)` はロールの編集画面から版を送らない。35.7 のバックエンドは任意の `expectedUpdatedAt` を受け、409 `ROLE_CONFLICT` を返す。35.10 の起票の実測（「ロールの更新を呼ぶフロントエンドのコードは 0 件」）は誤りで、確認の grep の出力を途中で切り詰めて見落としていた（35.10 に訂正を追記済み）
  - 実装: ロールの一覧・取得の `updatedAt` を保持して送り、409 `ROLE_CONFLICT` で競合の表示と最新の内容の再読み込みを出す（35.10 のプロフィールと同じ作法）
  - 検証: 2 画面から同じ版で順にロールを編集し後の方が競合の表示になること、保存値が先の方であること、同一画面の連続保存が成功することを E2E で主張する（`@requirement user-authentication/REQ-25.8`）。版を送らない変異で赤くなることを実測する
  - _Requirements: 25.8_
  - _Boundary: `frontend/src/pages/UserManagement.tsx` のロールの編集とその単体・E2E 検証_
  - **保留の解除（2026-09-28）**: 利用者の指示「115.335を実施して、36.7をレビューしてコミットして」により、上流の貼り直し（site-survey の Task 115.335）を本項の直後に実施する。元の保留の記載: 追加した E2E（`e2e/specs/admin/role-management.spec.ts`）が、site-survey の鮮度宣言 `t13-anchor-references-after-115303`（リポジトリ全体の e2e の「肯定側から指す参照」の件数）を 1416 → 1423（+7）へ動かす。上流の貼り直しを site-survey の Task 115.335 へ起票した。HEAD の +1（1415→1416）は 36.1（`eeee7977`）に由来することもデバッグ調査で特定し、同じ起票に帰属させた
  - **経過（2026-09-28）**: 実装は済み、作業ツリーに未コミットで残す（`frontend/src/pages/UserManagement.tsx`、`frontend/src/__tests__/pages/UserManagement.optimistic-lock.test.tsx`（新規 8 件）、`e2e/specs/admin/role-management.spec.ts`（`@requirement user-authentication/REQ-25.8` の 2 件））。一覧の `updatedAt` を `expectedUpdatedAt` として送り、成功時は応答の新しい版を採用し、409 `ROLE_CONFLICT` ではダイアログに入力を残したまま競合の表示と「最新の内容を読み込む」を出す（`ROLE_NAME_CONFLICT` は従来の失敗の表示のまま）。実装者の報告では frontend 単体 11877 件・E2E `admin/` 58/58 が緑、版を送らない変異で E2E 2 件が赤。**独立レビューは未実施**（上流の解決後、レビューから再開する）。デバッグ調査は、名前を正規表現や testid へ書き換えて件数を避けることは錨を弱める退行で不当と判断した
  - **検証（独立レビュー）**: APPROVED。バックエンドは `expectedUpdatedAt` を `new Date(...)` にして `updatedAt` と等値比較し、ISO 文字列（ミリ秒精度）の往復で一致する（実 DB の E2E で確認）。409 は `ApiError` の `statusCode === 409` かつ `response.code === 'ROLE_CONFLICT'` のときだけ競合とし、`ROLE_NAME_CONFLICT` は従来の表示のまま。保存後の一覧の再取得は PATCH の完了後に始まるため古い版へ戻らない。入力の拒否は足していない（IME への影響なし）。レビューが版を送らない変異を再現し、単体 3 件と E2E 2 件（2 件目は serial のため単独実行）が赤、復元後に cmp で一致しバンドルのハッシュが元へ戻ることを確かめた。frontend 単体 11877 件、E2E `admin/role-management.spec.ts` 9/9・`admin/` 58/58、type-check、lint が緑
  - **範囲外の観測（未起票）**: (i) ロールの編集の保存ボタンに保存中の無効化が無く（HEAD 以前から）、連打すると同じ版の 2 つ目の PATCH が 409 になる（ダイアログは 1 つ目の成功で閉じるため利用者には見えない）。(ii) ダイアログの通知の色を文言「最新の内容を読み込みました」との比較で決めている。(iii) 既存の失敗の表示の `error?.response?.data?.message` は `ApiError` の形と合わず常に既定の文言になる（HEAD と同じ）
  - **検証（親が承認後に新鮮な証拠で再実行）**: 単体 `UserManagement` 2 ファイル 30/30、E2E `admin/role-management.spec.ts` 9/9（配信中のバンドル `index-DQ4x0VVM.js` は変更を含む版）、frontend type-check EXIT=0

- [x] 36.8 ログのキー・全体に効く変更の記載・spec.json を整える
  - 実測: 認証領域のサービスに `{ error }` キーの警告・エラーログが残る（two-factor 10・rbac 4・role 4・role-permission 3・user-role 3・permission 3・session 1 か所ほか。pino の `err` シリアライザが効かず本番の出力で中身が失われる）。全体に効く変更（35.2 / 35.9 の `RetryingPool` と接続の再試行、35.8 の P1008 の 400→503、35.12 の `maxWait`、35.13 の `requirePermission` の 503）が steering（`tech.md` / `structure.md` の utils 一覧）に記されていない。design.md :3443 は `RetryingPool` が `DB_CONNECT_RETRY_DELAYS_MS` を使うと記すが、実際は `dbConnectRetryDelaysMs(retryCount)` を使う。`spec.json` は `phase: tasks-generated`・`pending_sub_tasks: 6`・`requirements_count: 35` で実態（37 要件）と食い違う
  - 実装: 上記のログのキーを `err` に改める（36.2 で扱う rbac の分を除く）。steering の追記は `/kiro-steering` の手順で行う。design.md の該当の記述を実装へ揃える。`spec.json` の metadata を実態へ更新する
  - 検証: 本物の pino のシリアライザでキーの変更を主張する単体検証、`npm run check:steering-refs` ほか steering の関門、`check:design-path-refs` / `check:design-code-refs`
  - _Requirements: 24.7（ログ）_
  - _Boundary: 認証領域のサービスのログ呼び出し、`.kiro/steering/tech.md` / `structure.md`、本スペックの design.md と spec.json_
  - **処遇（2026-09-28）**: 認証領域のサービスで Error を `{ error }` / `{ updateError }` に載せていた 25 か所を `{ err: … }` に改めた（two-factor 10・role 4・role-permission 3・user-role 3・permission 3・session 1・auth 2。auth の 2 か所は実測の一覧に無かったが、本番の出力で `updateError: {}` になり中身が失われるため含めた。rbac は 36.2 で対応済み、password と invitation は元から `err`）。token / session の `error: error.message` は文字列を載せる形でシリアライザで失われないため対象外とした。steering は `/kiro-steering` の規則（追記のみ）に従い、`tech.md` に「接続障害への耐性（backend 全体に効く規約）」の節（`RetryingPool` と `dbConnectRetryDelaysMs()`、P1008 を含む接続のタイムアウトを Prisma の分岐より前で 503 にすること、`rethrowIfDatabaseConnectionTimeout()`、`connectBudgetTransactionOptions()` の `maxWait`、`requirePermission()` の 503 と `getSharedRBACService()`、pino の `err` キー）を、`structure.md` に utils の `db-connect-budget.ts` / `db-connection-timeout.ts` と注記を足した。design.md の `RetryingPool` の記述を `dbConnectRetryDelaysMs(retryCount)` へ揃えた。spec.json は `phase: implementation-in-progress`（前例の無い値。読むスクリプトは無い）、`total_major_tasks` 36・`total_sub_tasks` 110・`pending_sub_tasks` 1（36.7）・`requirements_count` 37 とし、数え方と `requirements_coverage` の意味（`check:req-coverage` の実測とは別の指標）を `counting_method` に記した
  - **検証**: 単体 `auth-area-log-err-key.test.ts`（27 件）は 26 か所の catch へ実際に到達させ、ログの第 1 引数を本物の pino のシリアライザ（`importActual` の `Symbol('pino.serializers')`）に通し、`err` が投げた Error であることと JSON に message / stack が残ることを主張する（1 件は `{ error }` が `{}` になる対照）。**RED**: 変更前に 26 failed / 1 passed。独立レビューが 2 か所を `{ error }` に戻す変異で該当の 2 件が赤になることを再現した。backend 単体 6110 件、type-check、lint、steering の関門 5 本、`check:design-path-refs` / `check:design-code-refs` が緑。`check:design-measurement-freshness` の赤は t13（1415 / 1423、36.7 の未コミットの E2E に由来し 115.335 へ起票済み）だけで、本項による新しい赤は無い。`check:req-coverage` の赤は着手前と同じ。@requirement の印は付けていない（条文 24.7 はキャッシュ障害時の警告で、被覆は 36.2 の統合検証が持つ）
  - **範囲外の観測（未起票）**: (i) `backend/src/routes/auth.routes.ts` の 2 か所（独立レビューの実測で :888 / :1001）に `logger.error({ error }, …)` が残る（ルートは境界の外）。(ii) `backend/src/db.ts` の `DB_CONNECT_RETRY_DELAYS_MS` は本番コードから参照されない再輸出。(iii) steering の 2 文書は HEAD の時点で既に prettier の検査に通らない。独立レビューは APPROVED
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test:unit` 6110/6110、type-check EXIT=0、lint EXIT=0、`check:steering-*` 5 本と `check:design-path-refs` / `check:design-code-refs` が EXIT=0、`check:design-measurement-freshness` は t13 の 1 件のみ。親が検証の途中で誤って `check:design-path-refs:update` を実行し `scripts/design-path-exemption-baseline.json` を書き換えたため、同ファイルを HEAD へ戻し、`design-path-candidate-recorded` の赤が消えることを確かめた

## タスク37: 機能検証（2026-09-28）の GO に残った指摘の是正

_起票元: `/kiro-validate-impl user-authentication`（2026-09-28、HEAD `a476852e`）の GO に残った指摘 1〜3 と、利用者の指示「1〜3をタスク37として起票して」。行番号はいずれも HEAD `a476852e` での実測_

- [x] 37.1 ロールの削除の使用中の確認と削除を同じトランザクションで行う
  - 実測: `RoleService.deleteRole` は使用中の確認 `this.prisma.userRole.count`（`backend/src/services/role.service.ts:335`）をトランザクションの外で行い、その後の `$transaction`（`:345`）の中で `tx.role.delete` する。`UserRole.role` は `onDelete: Cascade`（`backend/prisma/schema.prisma:132`）のため、確認から削除までの間に割り当てがコミットされると、条文 17.5 が拒否を求める「割り当てのあるロールの削除」が成立し、その割り当てはカスケードで黙って消える。消えた割り当てには `USER_ROLE_REVOKED` の監査ログ（22.3）が残らず、そのユーザーの権限キャッシュも無効化されない（21.8。design.md の「キャッシング戦略」の 36.2 の項は「ロールの削除は割り当て中なら拒否されるため無効化は不要」を前提にする）。36.4 より前から在る競合で、36.4 が削除をトランザクションにしたときに確認を中へ移していなかった（機能検証の設計と結合の観点が検出し、親がコードで確認）
  - 実装: 使用中の確認と削除を同じトランザクションの中で行い、並行する割り当てと直列化する（例: ロールの行を `FOR UPDATE` でロックしてから数える。割り当ての挿入は外部キーの検査でロールの行に `FOR KEY SHARE` を取るため、削除のトランザクションと衝突する。外部キーを `Restrict` に改める案もある）。方式と、割り当ての側が負けたときの応答は design.md に日付付きで決める。`connectBudgetTransactionOptions()` と `rethrowIfDatabaseConnectionTimeout` の作法（35.11〜35.13・36.4）は保つ
  - 検証: 実 DB の統合検証で、使用中の確認の直後・削除の前に割り当てをコミットさせる競合を再現し、削除が拒否される（または割り当ての側が失敗して割り当ても監査ログも矛盾しない）ことを主張する（`@requirement user-authentication/REQ-17.5`）。確認をトランザクションの外へ戻す変異で赤くなることを実測する
  - _Requirements: 17.5, 21.8, 22.3_
  - _Boundary: `backend/src/services/role.service.ts` の `deleteRole`（と、方式によっては `user-role.service.ts` の割り当て・`schema.prisma` の関係）とその統合検証_
  - **処遇（2026-09-29）**: `deleteRole` は一つの `$transaction` の中で、存在の確認 → システムロールの判定 → `SELECT id FROM roles WHERE id = … FOR UPDATE`（0 行なら `ROLE_NOT_FOUND`）→ `tx.userRole.count` → 削除 → 監査ログの順に行う。業務上の拒否（不在・システムロール・使用中）は新しい `RoleRollback`（`UserRoleRollback` と同じ作法）でトランザクションを打ち切り、外で `Err` に戻す（500 にしない）。割り当ての側（`assignRoleInTransaction`）は存在の確認の前に同じ行を `FOR KEY SHARE` でロックする（`lockRoleForAssignment`）。削除が先にロックを取っていれば割り当てはそのコミットまで待ち、`ROLE_NOT_FOUND`（404）で失敗して割り当ても監査ログもロールバックされる（このロックが無いと挿入の外部キーの検査が P2003 の `DATABASE_ERROR` になる）。外部キーの `Restrict` への変更はマイグレーションが要り、競合の結果が汎用の DB 例外になるため採らなかった。決定は design.md の 36.4 の節に「削除の使用中の確認の直列化」として日付付きで追記し、「キャッシング戦略」の 36.2 の項の前提（使用中のロールの削除は拒否されるので無効化は不要）が保たれる旨を記した。独立レビューがデッドロックを検討し、新しい `FOR KEY SHARE` は外部キーの検査が取っていたロックを前へ出しただけで、`lockAdminRoleForLastAdminCheck` の `FOR NO KEY UPDATE` とは衝突せず、新しい循環は生じないと確かめた
  - **検証**: 統合 `role-delete-in-use-race.integration.test.ts`（2 件、実 DB、`@requirement user-authentication/REQ-17.5`）は、PrismaClient の Proxy で `userRole.count` の直後に割り当てを差し込み `pg_stat_activity` のロック待ちを観測して進める（10 秒の期限内に成立しなければ例外で失敗）。(i) 確認の直後に始まった割り当ては `ROLE_NOT_FOUND` で失敗し割り当てが残らない、(ii) 未コミットの割り当てがあるうちに始めた削除は待ったうえで `ROLE_IN_USE` になる。**RED**: フラグ OFF（旧経路）で 2 件とも赤（削除も割り当ても成功し割り当てがカスケードで消えた）。変異は M1（`FOR UPDATE` を外す）2 件赤、M2（件数をトランザクションの外へ）2 件赤、M3（割り当ての `FOR KEY SHARE` を外す）(i) が P2003 の `DATABASE_ERROR` で赤（M2・M3 は独立レビューも再現）。競合の検証は 5 回繰り返して 5 回とも緑。backend 単体 6111 件、統合の全件 1023 件（独立レビュー）、type-check、lint、`check:design-measurement-freshness` / `check:design-path-refs` / `check:design-code-refs` が緑。独立レビューは APPROVED
  - **範囲外の観測（未起票）**: (i) テストの `countLockWaiters` は DB 全体のロック待ちを数えるため、統合をファイル並列で走らせると待機の条件が早く成立しうる（正しい実装での結果は決定的で、弱まるのは変異の検出力だけ）。(ii) 削除の `FOR UPDATE` の待ちは対話型トランザクションの本体の timeout（5 秒）に算入され、超えると P2028 の 500（35.12 の既存の方針どおり）。(iii) 並行する権限の追加（`role_permissions` の挿入）とロールの削除の競合は、外部キー違反の 500 のまま（以前から）
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test:unit` 6111/6111、統合 `role-delete-in-use-race role-audit-log-atomicity auth-write-acid auth-write-atomicity` 49/49、type-check EXIT=0、lint EXIT=0、`check:design-measurement-freshness` / `check:design-path-refs` / `check:design-code-refs` EXIT=0

- [x] 37.2 権限キャッシュの無効化を、読み込みとの競合・Redis の未接続・コミット後の処理の失敗に対して確実にする
  - 実測: (i) 読み込み側の cache-aside（`backend/src/services/rbac.service.ts:104` の DB 読み出しから `:162` の `redis.setex` まで）の間に、別の操作のコミットと無効化（`user-role.service.ts:606`、`role-permission.service.ts:435`）が入ると、無効化の後に古い権限が書き戻され TTL（15 分）の間残る。design.md の「無効化の限界」は API を通さない変更・Redis 障害中の無効化の失敗・cache-aside の競合を TTL で上限が付くとまとめるが、この書き戻しを防ぐ手立ては無い。(ii) 読み込み側は `redis.status === 'ready'`（`:79`）を確かめるが、`invalidateUserPermissionsCache`（`:278`）と `invalidateUserPermissionsCacheForRole`（`:304`）は確かめずに `del` を送る。再接続中は ioredis のオフラインキューに積まれて変更の API の応答が遅れ、`maxRetriesPerRequest: 3`（`backend/src/redis.ts:29`）を使い切って失敗すると障害前のエントリが TTL まで残る。steering（`tech.md` の「接続障害への耐性」）は読み込み側しか述べていない。(iii) `UserRoleService.afterCommit`（`user-role.service.ts:541`〜`:607`）は、admin ロールの変更で `prisma.user.findMany`（`:561`）と `emailService.sendAdminRoleChangedAlert` を待ってから無効化（`:606`）する。これは `addRoles` / `removeRoles` の try（`:241` / `:274`）の中にあるため、どちらかが投げると、コミット済みなのに `DATABASE_ERROR`（500。接続のタイムアウトなら 503）を返し、無効化も飛ばす
  - 実装: (i) 無効化の後の古い書き戻しを防ぐ方式（世代のキーを読んで書き込みの前に照合する、など）を design.md で決めて実装する。(ii) 無効化の経路の Redis の未接続時の振る舞い（待たずに警告して TTL に任せるか、オフラインキューを使わない呼び出しにするか）を決めて実装し、steering の記述を揃える。(iii) コミット後の処理は無効化を先に行い、アラートの送信の失敗は警告ログに留めて、コミット済みの変更を失敗として返さない。21.8 / 24.2 / 24.7 の既存の検証（36.2 の `rbac-permission-cache.integration.test.ts` ほか）を壊さない
  - 検証: 実 Redis・実 DB の統合検証で、(i) 読み込みの DB 読み出しと書き込みの間に無効化を挟むと、次の権限確認が新しい権限で判定されること、(ii) Redis が `ready` でないとき無効化が変更の応答を待たせず警告を残すこと、(iii) アラートの送信が投げても割り当ての変更が成功として返り、キャッシュが無効化されることを主張する（`@requirement user-authentication/REQ-21.8` ほか）。それぞれの是正を戻す変異で赤くなることを実測する
  - _Requirements: 21.8, 24.2, 24.7_
  - _Boundary: `backend/src/services/rbac.service.ts` の無効化と cache-aside、`backend/src/services/user-role.service.ts` の `afterCommit`、その統合検証、design.md の「キャッシング戦略」、`.kiro/steering/tech.md` の該当の記述_
  - **処遇（2026-09-29）**: (i) ユーザーごとの世代のキー `rbac:permissions-generation:{userId}` を設けた。無効化はキャッシュの削除・世代の INCR・EXPIRE（15 分）を 1 本の Lua（`EVAL`）で不可分に行い、ロール単位の無効化は対象ユーザーのキーの組を 1 回の `EVAL` で処理する。読み込みはキャッシュに無いとき DB の前に世代を読み、「世代が読んだときのままなら `SET … EX`」の Lua で書き込む。キャッシュのキー・値の形式・TTL は変えていない。WATCH/MULTI（共有の 1 本の接続では他の要求のコマンドと混ざる）と値に世代を埋め込む方式（既存の検証の値の形式と両立しない）を採らなかった理由は design.md に記した。(ii) 2 つの無効化の経路は Redis が `ready` でないときコマンドを送らず、`err` 付きの警告を残して続行する（ロール単位は DB の問い合わせもしない）。残るエントリは TTL の 15 分で消え、この上限を design.md と `tech.md`（追記のみ）に記した。(iii) `afterCommit` は無効化を先に行い、その後にアラート（管理者の一覧・メール・Sentry。新しいメソッド `sendAdminRoleChangedAlert` に切り出し）を送る。アラートと無効化の失敗は `err` 付きの警告に留め、コミット済みの変更を失敗として返さない。決定は design.md の「キャッシング戦略」に小項目「無効化の確かさ（要件21.8 / 24.2 / 24.7）」として日付付きで記した
  - **検証**: 統合 `rbac-permission-cache-invalidation.integration.test.ts`（7 件、実 Redis・実 DB。(i)(iii) に `@requirement user-authentication/REQ-21.8`、(ii) に `REQ-24.7`）。(i) は権限の問い合わせの結果を得た後に割り当ての削除・ロールからの権限の取り消しを割り込ませ、キャッシュが空で次の確認が 403 になること、(ii) は応答しない TCP サーバーへつないだ ioredis で 204 が 5 秒以内に返り警告がちょうど 1 回残ること、(iii) はアラートが投げても結果が Ok でキャッシュが無効化されることを主張する（アラートは `NODE_ENV=test` で抑制されるため呼び出しの間だけ `development` にし、直後と `afterEach` で戻す）。**RED**: フラグ OFF で統合 6 件が赤（1 件は割り込みの無い対照）、サービスを HEAD に戻すと単体 16 件が赤。変異は M1（世代を DB の後に読む）・M2（アラートを無効化より先に）・M3（ロール単位を DEL だけに）が赤で、独立レビューが M1・M2 に加え M4（`ready` の確認の撤去で (ii) が約 5 秒の待ちで赤）・M5（アラートの失敗の投げ直しで (iii) が赤）を再現した。36.2 の `rbac-permission-cache.integration.test.ts` は緑のまま。backend 単体 6120 件、統合、type-check、lint、steering と設計の関門、`check:design-measurement-freshness` とその自己検査が緑。独立レビューは APPROVED
  - **途中の赤の原因（独立レビューが再現で確定）**: design.md の検証の行の「ロールからの権限の削除」の「削除」が `scripts/check-design-path-references.ts` の `ABSENCE_MARKERS` に当たり、同じ行で名指した実在の新しいテストのパスが免除機構の面に +1 入って `check:design-path-refs` が exit 1 になった。同じ赤を自己検査の `checkReachReportedBySubprocess` が拾って最終行が「❌ 1/53」になり、鮮度の宣言 `design-path-refs-selftest-total-after-115305` の抽出が空になって赤になった（派生の赤で揺らぎではない）。操作は `PERMISSION_REVOKED` なので「権限の取り消し」と言い換えた（検査の案内の (a)、site-survey 115.215 の前例と同じ。基準は変えていない）
  - **範囲外の観測（未起票）**: (i) 世代のキーの ABA（確認が世代 1 を読む → 世代のキーが失効する → 別の無効化の INCR で再び 1 → 照合が一致して古い値を書く）は design.md に書かれていない。失効と再度の無効化が確認の読み出しの間に両方入る必要があり、起きても TTL の 15 分で上限が付く（世代のキーの TTL をキャッシュの TTL より長くする案がある）。(ii) 統合検証の片付けは世代のキーを消さない（テスト用の Redis に最大 15 分残るだけ）。(iii) 複数キーの `EVAL` は Redis Cluster では CROSSSLOT で失敗する（本構成は単一の Redis）
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test:unit` 6120/6120、統合 `rbac-permission-cache-invalidation rbac-permission-cache role-delete-in-use-race` 14/14、type-check EXIT=0、lint EXIT=0、`check:steering-refs` / `check:steering-idents` / `check:design-measurement-freshness` / `check:design-path-refs` / `check:design-code-refs` EXIT=0、`scripts/` は無変更

- [x] 37.3 ロールの保存・削除の失敗の表示が API の応答の内容を読むようにする
  - 実測: `frontend/src/pages/UserManagement.tsx:287` と `:338` は `error?.response?.data?.message` を表示に使うが、`ApiError.response` は応答の本文そのもの（`frontend/src/api/client.ts:6-15`）で `data` を持たない。バックエンドの本文は `{ error, code }`（ロール名の重複の 409 `ROLE_NAME_CONFLICT` は `backend/src/routes/roles.routes.ts:142-147` / `:249-254`、削除の拒否の `SYSTEM_ROLE_PROTECTED` / `ROLE_IN_USE` は `:332-345`）で、`message` も無い。このため条文 17.2 のロール名の重複も、17.5 / 17.6 の削除の拒否も、画面では常に既定の「ロールの保存に失敗しました」「ロール削除に失敗しました」になり、理由が伝わらない。36.7 の独立レビューと機能検証が検出した（36.7 の範囲外の観測 (iii)）
  - 実装: `ApiError` の `response` の `code` / `error` を読み、ロール名の重複と削除の拒否（システムロール・使用中）を利用者に分かる文言で表示する。36.7 の `ROLE_CONFLICT` の判定（`UserManagement.tsx:47-57`）と同じ読み方に揃える
  - 検証: 管理画面から既存の名前でロールを作成・更新したとき、使用中のロールとシステムロールを削除したときに、それぞれの理由の表示が出ることを E2E で主張する（`@requirement user-authentication/REQ-17.2` / `REQ-17.5` / `REQ-17.6`）。単体の期待値も揃える。`data?.message` を読む形へ戻す変異で赤くなることを実測する。名前で要素を指す E2E を足すと site-survey の宣言 `t13-anchor-references-after-115303` が動くため、`check:design-measurement-freshness` の前後の差を測り、動けば site-survey へ起票する（Implementation Notes）
  - _Requirements: 17.2, 17.5, 17.6_
  - _Boundary: `frontend/src/pages/UserManagement.tsx` のロールの保存・削除の失敗の表示とその単体・E2E 検証_
  - **保留の解除（2026-09-29）**: 利用者の指示「115.336を実施して、37.3をレビューしてコミットして」により、上流の貼り直し（site-survey の Task 115.336）を本項の直後に実施する。元の保留の記載: 追加した E2E（`e2e/specs/admin/role-management.spec.ts`）が、site-survey の鮮度宣言 `t13-anchor-references-after-115303` を 1423 → 1430（+7）へ動かす。上流の貼り直しを site-survey の Task 115.336 へ起票した（36.7 / 115.335 と同じ種類。根本原因は Implementation Notes の 36.7 の項のとおりで、新たなデバッグ調査は行っていない）
  - **経過（2026-09-29）**: 実装は済み、作業ツリーに未コミットで残す（`frontend/src/pages/UserManagement.tsx`、単体 `UserManagement.role-errors.test.tsx`（新規）・`UserManagement.test.tsx`・`UserManagement.optimistic-lock.test.tsx`、E2E `admin/role-management.spec.ts`）。`readRoleErrorBody` が `ApiError` の `statusCode` と `response` から `code` / `details` を読み、409 `ROLE_NAME_CONFLICT`・404 `ROLE_NOT_FOUND`・400 `SYSTEM_ROLE_PROTECTED`・400 `ROLE_IN_USE`（`details.userCount` があれば人数を添える）の理由を表示する（36.7 の `ROLE_CONFLICT` の分岐は先に判定するため変わらない）。画面はシステムロールの行に削除ボタンを出さず、`isSystem` は API から変えられないため、17.6 の理由の表示は単体だけで検証し、E2E はシステムロールの行に削除ボタンが無いことを主張する（応答の差し替えによる偽装はしていない）。実装者の報告では、フラグ OFF で単体 9 件・E2E 3 件が赤、`data?.message` を読む形へ戻す変異で E2E 3 件が赤、frontend 単体 11888 件・E2E `admin/` 62/62 が緑。**独立レビューは未実施**（上流の解決後、レビューから再開する）
  - **独立レビュー 1 回目（REJECTED）**: 保存の失敗（`ROLE_NAME_CONFLICT`）をダイアログを開いたままページ上部の `role="alert"` に出しており、`position: fixed; zIndex: 50` の半透明の覆いとダイアログの裏になっていた。1280×720 では理由の部分「同じ名前のロールが既に存在します」がダイアログの裏に隠れ、375×667 では文言全体が隠れた（`elementFromPoint` が覆いかダイアログを返し、`click({ trial: true })` が重なりでタイムアウト、スクリーンショットで確認）。E2E の `toBeVisible` は重なりを判定しないため緑になっていた
  - **是正（2026-09-29）**: ダイアログ専用の状態 `roleSaveError` を設け、保存の失敗をダイアログの中の赤い `role="alert"`（`aria-live="assertive"`）に出す（36.7 の競合の表示と同じ置き場所の作法）。失敗してもダイアログは開いたままにし、ページ上部には出さない（二重に出さない）。作成・編集で開くとき、閉じるとき、保存し直すときに消す。削除の失敗（17.5）はダイアログを開いていないので従来どおりページ上部に出る。E2E の補助関数 `expectSaveFailureInDialog` は、ダイアログの中の文言が 1 件だけで `role="alert"` にあり、表示の中心の `elementFromPoint` がその要素か子孫で、`click({ trial: true })` が通ることを主張する（作成・更新・375×667 の作成の 3 件）。単体は `within(screen.getByRole('dialog'))` で主張し、開き直し・保存し直しで消えることも主張する
  - **検証（独立レビュー 2 回目、APPROVED）**: 一時的な Playwright のプローブで 1280×720 と 375×667 のスクリーンショットを撮り、文言がダイアログの最前面でビューポートに収まって読めることを目で確かめた（プローブは削除済み）。レビューがページ上部へ戻す変異で E2E 3 件が赤になることを再現した。実装者は `data?.message` を読む変異と、ダイアログの白い箱の裏へ `zIndex: -1` で回す変異（`toBeVisible` は通る形）でも 3 件が赤になることを確かめた。frontend 単体 11890 件、E2E `admin/role-management.spec.ts` 14/14・`admin/` 63/63、type-check、lint、`check:e2e-guards`（自己検査 210/210）、`check:e2e-selfjudge` が緑。`check:design-measurement-freshness` の赤は t13（1423 / 1430、115.336 で貼り直す）だけ
  - **範囲外の観測（未起票）**: (i) 保存の前の入力の検証「ロール名を入力してください」は今もページ上部に出ており、ダイアログの裏になりうる（着手前から同じ。API の応答の失敗の表示ではない）。(ii) 375 幅ではアプリのヘッダーがダイアログの覆いの上端を少し覆う（既存の挙動、警告の表示には影響しない）
  - **検証（親が承認後に新鮮な証拠で再実行）**: 単体 `UserManagement` 3 ファイル 43/43、E2E `admin/role-management.spec.ts` 14/14（配信中のバンドル `index-DzJTqIYN.js` は是正を含む版）、frontend とルートの type-check EXIT=0、`--accessible-names` の肯定側 1430 件 / 相異なる名前 284 件

## タスク38: 本番のビルドでメールのテンプレートが配置されない状態を正す

**経緯**: construction-schedule の Task 18.5 のレビュー（2026-09-29）が、本番のビルドの出力にメールのテンプレートが含まれないことを実測した。利用者の判断（2026-09-29、「起票して修正」）により本スペックで起票し、直す。

**測った事実**（2026-09-29、HEAD `5dec01d9`）:

- `backend/src/services/email.service.ts` は、招待・パスワードリセット・二要素認証の有効化・管理者ロール変更の通知のメール本文を、実行時に `join(__dirname, '../templates/<name>.hbs')` を `readFileSync` で読んで組み立てる（287・316・346・371 行付近）。テンプレートは `backend/src/templates/*.hbs` の 4 本
- `backend/package.json` の `build` は `npm run prisma:generate && tsc && npm run docs:generate` で、`tsc` は `.hbs` を出力へ複製しない。`npm --prefix backend run build` の後の `dist` に `.hbs` は 0 件（レビューの実測）
- 本番の `backend/Dockerfile` の最終段は `COPY --from=build /app/dist ./dist` だけを運ぶ。**本番のイメージではテンプレートが見つからず、メールの送信が失敗すると推定される**（本番のログでの確認はしていない）
- 開発・テストの環境は `tsx` でソースを直接実行するため `src/templates` が読め、単体・統合・E2E では検出されない

- [x] 38.1 本番のビルドの出力にメールのテンプレートを含め、本番と同じ形で読めることを検証する
  - ビルドの出力（`dist`）からテンプレートが読める形にする。方法（`build` にテンプレートの複製を足す、テンプレートを TS のモジュールにする、Dockerfile で複製する等）は、本番（Docker・Railway）と開発（tsx）の両方で同じパスの解決が成り立つかを比べて決め、理由を報告に書くこと。**テンプレートの読み出しの失敗が、メールを送らないまま成功として扱われていないか**も併せて確かめること
  - 挙動の修正であるため RED → GREEN で進めること。`npm --prefix backend run build` の後の `dist` から `email.service` を読み込み、4 種のテンプレートが実際に描画できることを主張する検証（ビルドの出力を対象とする検証）を置き、現状で赤になることを先に示す。通常の `npm test` の所要時間を大きく延ばさないこと。必要ならビルドの出力を検査する専用のスクリプトを用意し、CI か pre-push のどちらで走らせるかを報告すること
  - 本番の Dockerfile でイメージを作り、コンテナの中にテンプレートがあることを実測できるなら行うこと（できなければ理由を書く）
  - _Requirements: 1.6_
  - _Boundary: backend のビルドの出力へのメールのテンプレートの配置と、その検証_

## タスク39: 共通ヘッダがモバイル幅で文書全体を水平にはみ出させる状態を正す

**経緯**: construction-photo の Task 20.8 の後の機能レベル検証（2026-10-02、HEAD `2503b7d3`）が、共通ヘッダ由来の文書全体の水平スクロールを実測した。利用者の判断（2026-10-02、「共通ヘッダを直す」）により本スペックへ起票する。共通ヘッダ `frontend/src/components/Navigation/AppHeader.tsx` は本スペックの design.md が定義する（導入はコミット `058aa97c`）

**測った事実**（同検証、test 環境の実ブラウザ）:

- admin で 375 幅の画面を開くと、文書が 400/375 になり横へ 25px 動く。320 幅では 80px 動き、400 幅以上で解消する。はみ出すのは利用者メニューである
- user ロールは 375 幅で 375/375 に収まるが、320 幅では 350/320 になる
- 下流の画面の `<main>` 自体は収まっている。construction-photo の要件 19.1 の E2E は、この理由で文書全体を主張に使えていない（同スペックの Task 19.2 の完了時の注記）

- [x] 39.1 共通ヘッダが 320 幅以上で文書全体を水平にはみ出させないようにする
  - 共通ヘッダ（`AppHeader.tsx` / `AppHeader.css`）を、admin と user の双方で、320・375 幅の文書全体（`document.documentElement` の scrollWidth と clientWidth）が一致する形にすること。方法（折り返す、項目を畳む、名前を省略表示する等）は、要件 28 の受入基準 21・22 が課すリンクとメニューの到達性を保つ範囲で選ぶ。長い表示名（区切りの無い英数字一語・長い和文）でも破れないこと
  - 挙動（表示）の修正であるため RED → GREEN で進めること。E2E で admin と user、320 幅と 375 幅について、前提（ヘッダが表示され利用者メニューを開ける）を主張したうえで文書全体の水平のはみ出しが無いこと（許容誤差 1px）と、メニューの各項目が画面幅の内側にあることを主張する。是正前に赤になることを実測すること
  - 共通ヘッダは保護された全画面に出る。デスクトップ幅（1280）の表示が変わらないことを是正の前後の実測で示し、ヘッダを操作する既存の E2E（`e2e/specs/navigation/app-header.spec.ts`・`e2e/specs/auth/navigation.spec.ts` ほか）を回すこと
  - _Requirements: 15.1, 28.21, 28.22_
  - _Boundary: 共通ヘッダ（AppHeader）のモバイル幅の表示_
  - **【完了時の注記（2026-10-02）】** `AppHeader.css` だけを変えた（TSX は不変）。原因は、モバイル幅でも各項目が固定幅で縮まなかったことである（ロゴ 36、リンク 50×4、管理メニュー 42、ユーザーメニュー 58、間隔 8、左余白 24 で、右端は admin が 400、user が 350）。既存の `@media (max-width: 768px)` の中で nav とリンクを縮められる形にし、`@media (max-width: 480px)` で左右の余白と間隔を詰めた。一行のまま全リンクと両メニューが見えて押せる形を選んだ（二段の折り返しは sticky ヘッダの高さが全画面で変わり、畳む案はリンクが隠れる）。文書全体（/dashboard、既定の表示名）は、admin の 320 幅が 400/320 から 320/320 へ、375 幅が 400/375 から 375/375 へ、user の 320 幅が 350/320 から 320/320 へ動いた。独立レビューが 320〜768 の 20 幅 × 2 ロール × 3 状態を掃引し、全件で一致、項目の重なり無し、320 幅の admin（リンク 35×38）で 4 リンクと両メニューの項目へタップで到達できることを実測した。769・1024・1280 幅は是正の前後で全要素の矩形が一致する。E2E 12 件（2 ロール × 3 通りの表示名 × 2 幅）は、是正を外す変異で 9 件が赤になる（user の 375 幅の 3 件は是正前から収まっている）。**長い表示名は /profile で測っている**——/dashboard は見出しの側がはみ出すためで（タスク40 の 40.3）、ヘッダ配下の要素は長い名前でも画面内に収まることをレビューが /dashboard で確かめている。**本項の見出しの「320 幅以上」は、是正と検証の範囲としてはモバイル幅（320〜768）である**——769〜約 808 幅の admin の長い表示名ではヘッダ自身がはみ出す（タスク40 の 40.1）。site-survey が所有する宣言 `t13-anchor-references-after-115303` が 1454 から 1461 へ動いたため、同じコミットで貼り直した
  - **追記（2026-10-03）**: 本項が足した E2E の、管理メニューの主張を `if (role.isAdmin)` の内側に置いた 1 箇所が、pre-push の関門 `check:e2e-guards` の `T1-conditional-expect` に当たっていた（完了時にこの関門を回していなかった）。construction-photo の Task 21.6 が、管理メニューのボタンの集合の件数を役割ごとの期待値で主張してから同じ本体を回す形へ改めた。主張の中身と題名は変わらず、26 件が緑である

## タスク40: タスク39 の実装と独立レビューで判明した、共通ヘッダとダッシュボードの既存の欠陥（起票は 2026-10-02、着手は利用者の判断〔2026-10-05〕による）

**経緯**: Task 39.1 の実装と独立レビュー（2026-10-02、起点 `116b4ddb`）が、同タスクの境界の外に既存の欠陥を 3 件実測した。いずれも 39.1 の是正の前後で同じ値であり、39.1 が持ち込んだものではない

- [x] 40.1 タブレット幅で共通ヘッダが崩れる状態を扱う
  - admin で長い表示名（英数字一語 60 文字）のとき、ヘッダ自身が文書を水平にはみ出させる。/profile で 769 幅が 804/769（+35px）、789 幅が +15px、809 幅以上で 0 になる。はみ出すのは `.app-header-nav` / `.app-header-user-trigger` である。既定の表示名「Admin User」での余裕は約 5px しかない。user ロールは長い表示名でも 769/769 に収まる
  - あわせて admin は 769〜約 1100 幅で、リンクの文言が縦に折り返して nav の高さがヘッダの 64px を超える（769 幅でリンクの高さ 177.5 / 155 / 87.5 / 110、nav 178px、管理メニューのボタン 66×144）
  - _Requirements: 15.1_
  - **利用者の判断（2026-10-05）**: 着手する。構成は「文言を隠す閾値を上げる」——モバイル幅と同じアイコンのみの表示を、リンクの文言が一行に収まらない幅（約 1100px 以下）まで広げ、ユーザー名は省略表示にする
  - _Boundary: 共通ヘッダ（AppHeader）のタブレット幅の表示_
  - **【完了時の注記（2026-10-05）】** `AppHeader.css` に `@media (max-width: 1199px)` を設け、リンクと管理メニューのボタンの文言を隠す規則を 768 のブロックから移した（TSX は不変）。上限は是正前の実測（/profile、文言が一行に収まるのは管理者の長い表示名で 1148px から、既定の表示名で 1100px 前後から）にフォントの差の余裕を足した値で、利用者の判断の「約 1100px」より広いのは長い表示名の実測による。値は `frontend/src/utils/responsive.ts` の `APP_HEADER_ICON_ONLY_MAX_WIDTH` に置き、CSS との一致を単体 `AppHeader.css.test.ts` が突き合わせる（CSS は TS の定数を読めない。既存の 768 / 480 も `MEDIA_QUERIES` とずれた前例がある）。769〜1199 幅のユーザー名は隠さず、既存の上限幅 120px と省略表示で出す。E2E `app-header.spec.ts` に「タブレット幅の表示」36 件（2 ロール × 3 通りの表示名 × 769・789・900・1024・1199・1200 幅）を足した。高さは同じ画面の 1280 幅の実測と比べ（フォント依存の固定値を使わない）、文書全体のはみ出し・各項目の画面内と到達性は 39.1 の主張を共有のヘルパーへ移して回す。共有の `expectReachableWithinViewport` は、省略表示で切り取られた文字をはみ出しと数えないよう、要素から下の overflow の祖先で右端を切るようにした。是正を外す変異で 21 件が赤（両ロールの 769・789・900 と管理者の 1024）。独立レビューは同じ変異で 21 件の赤を再現し、39.1 の縮めを外す変異でモバイル幅の 9 件が赤のまま（検出力が落ちていない）、切り取られない名前を作る変異で 24 件が赤になることを確かめた。1200・1280・1600 幅と 375・600・768 幅のヘッダ配下の全要素の矩形は是正の前後で一致する。frontend の単体の全件（12154 件）、型検査・lint、`check:e2e-guards` / `check:e2e-selfjudge` / `check:design-path-refs` / `check:steering-idents` / `check:steering-refs` が緑。`check:design-measurement-freshness` の赤は既知の site-survey の 1 件だけで、宣言 `t13-anchor-references-after-115303` は動いていない
  - **範囲外の観測（未起票）**: `expectHeaderSingleRow` の基準の 1280 幅の寸法は、それ自体が一行であることを主張していない（1280 でも折り返すほど広いフォントの環境では比較が素通りしうる。現状の余裕は約 130px）

- [x] 40.2 アイコンのみの表示（1199px 以下）で共通ヘッダのリンクと管理メニューのボタンがアクセシブルネームを持たない状態を扱う
  - 768px 以下では文言の span が `display: none`、SVG が `aria-hidden` のため、375 幅で `getByRole('link', { name: 'ダッシュボード' })` と `getByRole('button', { name: '管理メニュー' })` はともに 0 件である（1280 幅では各 1 件）。スクリーンリーダーの利用者はリンクの行き先を知れない。要件 15 の受入基準 4（aria-label）に当たる
  - 名前を復活させると、他スペックのモバイル幅の E2E で、名前による参照が strict 違反になりうる。着手時に全 E2E の該当箇所を測ること。39.1 の E2E はこのためにリンクを href と構造で指している
  - _Requirements: 15.4_
  - **利用者の判断（2026-10-05）**: 着手する。全 E2E の名前による参照への影響を測ったうえで是正する
  - _Boundary: 共通ヘッダ（AppHeader）のモバイル幅のアクセシブルネーム_
  - **範囲の拡大（2026-10-05、40.1 の独立レビューによる）**: 40.1 で文言を隠す上限が 1199px になったため、同じ欠落は 769〜1199 幅にも及ぶ。本項はアイコンのみの表示の全範囲（`APP_HEADER_ICON_ONLY_MAX_WIDTH` 以下）を扱う
  - **【完了時の注記（2026-10-05）】** `AppHeader.css` だけを変えた（TSX は不変）。1199px 以下のリンクと管理メニューのボタンの文言、768px 以下のロゴの文言とユーザー名を、`display: none` から見た目だけ隠す指定（position:absolute・1px・margin -1px・overflow hidden・clip・clip-path・nowrap・border 0・padding 0）に替えた。見えている文言がそのまま名前になるため、名前は全幅でデスクトップと同じになる（aria-label で文字列を二重に持たない。WCAG 2.5.3）。同じ欠陥で同じ境界にあるロゴのリンク（768px 以下で名前が空）とユーザーメニューのボタン（768px 以下で名前がイニシャルだけ）も直した。是正の前に e2e の名前による参照（link / button の getByRole 約 2350 件）をヘッダの名前に照合し、1199px 以下でページ全体から名前で指す参照が 0 件であることを測った（是正後の実行でも壊れた参照は無い）。E2E `app-header.spec.ts` に「アイコンのみの表示のアクセシブルネーム」12 件（2 ロール × 320・375・768・1024・1199・1280 幅）を足し、文言が幅どおりに隠れていることを前提に主張したうえで、ヘッダの中で各名前の link / button が 1 件ずつあることを主張する。是正を外す変異で 1199px 以下の 10 件が赤（1280 の対照 2 件は緑）。独立レビューは変異を再現し、2 ロール × 2 通りの表示名（既定・区切りの無い英数字 100 文字）× 2 画面 × 320〜1280 の 7 幅の全組で文書の水平のはみ出しが無いこと、375・1024 幅の名前がデスクトップと一致することを確かめた。ヘッダの全要素の矩形は、隠した文言の要素（0×0 → 1×1）を除いて是正の前後で一致する。宣言 `t13-anchor-references-after-115303` が 1600 から 1601 へ動いたため、同じコミットで貼り直した（増分は本項の「管理メニュー」の参照 1 件）。frontend の単体の全件（12155 件）、型検査・lint、`check:e2e-guards` / `check:e2e-selfjudge` / `check:design-path-refs` が緑。`check:design-measurement-freshness` の赤は既知の site-survey の 1 件だけ
  - **範囲外の観測（未起票）**: (i) ユーザーメニューのボタンの名前はアバターのイニシャルが前に付く（例「AU Admin User」）。見えている文言を含むため WCAG 2.5.3 には反しないが、冗長な読み上げを避けるならアバターを aria-hidden にする余地がある（TSX の変更）。(ii) Playwright は 1×1 の要素を可視と判定するため、768px 以下のユーザー名などへ `not.toBeVisible()` を向ける E2E は通らない（現状そういう参照は無い。本項の E2E は箱の大きさで判定する）

- [x] 40.3 ダッシュボードの見出しが長い表示名で文書を水平にはみ出させる状態を扱う
  - `frontend/src/pages/Dashboard.tsx` の h1「ようこそ、{displayName}さん」が、区切りの無い英数字 60 文字の表示名で、320・375・768 幅の文書を 983〜991 幅にする（admin / user とも）。長い和文では起きない。表示名は backend が最大 100 文字まで許す。construction-photo の Task 20 と同じ型（折り返しの指定が無い）である
  - _Requirements: 15.1_
  - **利用者の判断（2026-10-05）**: 着手する
  - _Boundary: ダッシュボードの見出しのモバイル幅の表示_
  - **【完了時の注記（2026-10-05）】** `Dashboard.tsx` の h1 に `overflowWrap: 'anywhere'` を与えた（construction-photo の Task 20 と同じ型）。ダッシュボードで利用者の入力を出すのは h1 だけで、他は固定文言である。E2E `e2e/specs/auth/dashboard-responsive.spec.ts`（2 ロール × 3 通りの表示名〔既定・区切りの無い英数字 100 文字・和文 100 文字〕× 320・375・768 幅の 18 件）は、前提（見出しの可視と表示名の到達、幅の設定）を主張したうえで、文書全体の水平のはみ出しが無いこと（許容誤差 1px）と見出しの箱・文字の右端が画面内にあることを主張する。是正を外す変異で英数字 100 文字の 6 件が赤（scrollWidth 1628 / 1636）、是正で 18 件が緑。単体 1 件を足した。独立レビューは変異を自ら再現し、既定の表示名で 769・1024・1280 幅のダッシュボードの全要素の矩形が是正の前後で一致することを確かめて承認した。frontend の単体の全件（12151 件）、型検査・lint、`check:e2e-guards` / `check:e2e-selfjudge` が緑。`check:design-measurement-freshness` の赤は site-survey の `nonexistent-paths-by-git-index`（16 対 18）だけで本項の前から赤であり、宣言 `t13-anchor-references-after-115303` は動いていない（見出しを名前でなく level で指すため）

## タスク41: 機能検証（2026-10-05、HEAD `e43b89c5`、NO-GO）の指摘の是正

**経緯**: 40.1〜40.3 の完了後の機能検証は、テスト・ビルド・E2E（本スペックの 23 ファイルと他スペックの狭い幅の 6 ファイル、518 件）・スモークが全件緑のまま、設計文書が共通ヘッダの全画面に効く決定を記録していないことなどを指摘して NO-GO とした。利用者の判断（2026-10-06）: 境界値は 480 だけを `MEDIA_QUERIES` に揃え、768 は現状のまま観測として記録する。宣言 `t13-anchor-references-after-115303` が動いたときは同じコミットで貼り直す運用を正とする

- [x] 41.1 共通ヘッダの最も狭い幅の境界を `MEDIA_QUERIES.isSmallMobile` に揃える
  - `AppHeader.css` の `@media (max-width: 480px)` を 479px にし、`AppHeader.css.test.ts` で `responsive.ts` の値と突き合わせる。768 と `isMobile`（767）のずれは変えず、範囲外の観測として記録する
  - _Requirements: 15.1_
  - _Boundary: 共通ヘッダ（AppHeader）の境界値_
  - **【完了時の注記（2026-10-06）】** `AppHeader.css` の最も狭い幅のブロックを `@media (max-width: 479px)` にした（39.1 が設けた 480 から）。表示が変わるのは 480 幅ちょうどだけで、左右の余白と間隔が詰まらなくなる（余白 12px → 24px、間隔 4px → 8px。両ロールとも文書のはみ出しと項目の重なりは無い）。単体 `AppHeader.css.test.ts` は最も狭い `max-width` のブロックを `MEDIA_QUERIES.isSmallMobile` の値と比べ、詰めの規則がそのブロックにあることを主張する（480 で 2 件赤。独立レビューはブロックを消す変異でも赤になり素通りしないことを確かめた）。単体 59 件、E2E `app-header.spec.ts` 74 件が緑
  - **範囲外の観測（未起票）**: (i) 768 のブロックは `MEDIA_QUERIES.isMobile`（767）と 1px ずれたまま（利用者の判断で据え置き。既存の E2E が 768 幅をモバイルとして扱う）。(ii) 単体の比較は「最も狭いブロック」を対象にするため、将来 479 より狭いブロックを足すときは比較の対象を詰めの規則を持つブロックへ改める必要がある

- [x] 41.2 共通ヘッダの応答性の設計決定を design.md に記録し、関連する記載を現況へ揃える
  - design.md「共通ヘッダーナビゲーション」に、1199px 以下のアイコンのみの表示（`APP_HEADER_ICON_ONLY_MAX_WIDTH`）、768px 以下のロゴの文字とユーザー名の非表示と高さ、479px 以下の詰め、見た目だけ隠す指定でアクセシブルネームをデスクトップの文言と同じに保つこと（WCAG 2.5.3）、769〜1199px のユーザー名の省略表示、CSS と定数の一致の検証を記す。古い TSX の下書きには実装を正とする旨を記す
  - tasks.md のタスク40 の見出しと 40.1〜40.3 の題名の「（起票のみ）」を外し、40.2 の題名を範囲（1199px 以下）に合わせる。Implementation Notes の t13 の項を「同じコミットで貼り直す」に改める。spec.json の tasks_summary を現況へ
  - `responsive.ts` と `app-header.spec.ts` の注記の「隠す」を見た目だけ隠すことが分かる文言にし、`audit-log.spec.ts` の行番号による参照を describe と題名で指す形にし、REQ-15.1 の名乗りの添え書きを検証する幅（768 を含む）に合わせる
  - _Requirements: 15.1, 15.4_
  - _Boundary: user-authentication の設計文書・タスク文書と、共通ヘッダの検証の注記_
  - **【完了時の注記（2026-10-06）】** design.md「共通ヘッダーナビゲーション」に小節「レスポンシブ表示とアクセシブルネーム」を足し、1199px 以下のアイコンのみの表示、768px 以下の非表示と高さ（768 は利用者の判断による `isMobile` からの例外）、479px 以下の詰め、見た目だけ隠す指定による名前の保持、769〜1199px のユーザー名の省略表示、検証の所在を記した。下書きの節には実装を正とする旨を記した。`responsive.ts` と `app-header.spec.ts` の注記を見た目だけ隠す現況へ揃え、`audit-log.spec.ts` の行番号による参照をテストの題名で指す形にし、REQ-15.1 の名乗りの添え書きを検証する幅へ合わせた（モバイルの側は 320・375 幅だけで既に正しく、ずれていたのはタブレットの側だった）。tasks.md のタスク40 の題名・Implementation Notes の t13 の項・spec.json の tasks_summary を現況へ揃えた。独立レビューは 1 巡目で、spec.json に追記した計数の経緯（113 の由来）が git の履歴と食い違うことを指摘し、是正後の 2 巡目で承認した。設計文書の関門（design-path-refs / design-refs / design-code-refs / design-component-reqs / trace-coverage）は緑、`check:design-measurement-freshness` の赤は既知の site-survey の 1 件だけ

## Implementation Notes

- 宣言 `t13-anchor-references-after-115303` はリポジトリ全体の e2e の「肯定側から指す参照」（名前を文字列リテラルで与える `getByRole(..., { name })` / `getByLabel` など）を数える。本スペックで名前で指す E2E を足すと必ず動くため、E2E を足すタスクは `check:design-measurement-freshness` の前後の差を測り、動けば同じコミットで宣言を貼り直し、増分の帰属を記す（利用者の判断 2026-10-06。39.1・40.2 と construction-photo の 27.1 の前例に従う）。正規表現・testid への書き換えで避けるのは不当（36.7）
- 検証の変異を戻すときの frontend の作り直しは `--force-recreate` とバンドルのハッシュの変化で確かめる。frontend の単体は `npm --prefix frontend run test` で起動する（repo のルートから vitest を起動すると CSS の相対パスで ENOENT の偽の赤が出る）（36.6）
- design.md の行に「削除」「撤去」「旧」など `ABSENCE_MARKERS` の語があると、同じ行で名指した実在のパスが免除機構の面に数えられ `check:design-path-refs` が赤になり、自己検査経由で鮮度の宣言 `design-path-refs-selftest-total-after-115305` も赤になる。現存のものを指す行では操作を正確な別の語で言う（基準の `:update` で逃がさない）（37.2）
