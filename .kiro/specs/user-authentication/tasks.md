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

- [ ] 24.3 パスワードリセットフローのE2Eテスト検証
  - パスワードリセット要求 → メール送信 → リセット実行 → ログインの一連のフロー確認
  - 無効トークンでのエラー表示確認
  - 期限切れトークンでのエラー表示確認
  - _Requirements: 29.1, 29.2, 29.3_

#### 25. 【Medium】初期管理者セットアップの自動化検証

- [ ] 25.1 prisma/seed.tsの実装確認と検証
  - 初期管理者アカウント作成ロジックの確認（ADMIN_EMAIL, ADMIN_PASSWORD環境変数）
  - システムロール（admin, user）の初期データ挿入確認
  - デフォルト権限（user:read, user:create, user:update, user:delete, user:invite等）の定義確認
  - パスワードがArgon2idでハッシュ化されていることの確認
  - 重複実行時の冪等性（既存ユーザーがある場合はスキップ）の確認
  - _Requirements: 3.1_

---

## 実装状況サマリー

### 完了タスク数
- **Phase 1-3 (Critical/High/Medium)**: 11メジャータスク、47サブタスク完了
- **Phase 4 (実装ギャップ対応)**: 10メジャータスク完了
- **Phase 5 (E2Eテスト修正)**: 1メジャータスク完了
- **Phase 6 (画面遷移・ナビゲーション強化)**: 4サブタスク完了、3サブタスク未完了

**合計**: 25メジャータスク、66サブタスク（3サブタスク未完了）

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
3. `/kiro:validate-impl user-authentication`を実行し、実装品質を検証

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
