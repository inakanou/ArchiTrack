/**
 * ユーザー管理画面
 *
 * 要件17: 動的ロール管理
 * 要件18: 権限管理
 * 要件19: ロールへの権限割り当て
 * 要件20: ユーザーへのロール割り当て
 * 要件21: 権限チェック機能
 */

import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import type {
  Role,
  Permission,
  UserWithRoles,
  CreateRoleInput,
  UpdateRoleInput,
} from '../types/role.types';

export function UserManagement() {
  // タブ選択
  type Tab = 'users' | 'roles' | 'permissions';
  const [activeTab, setActiveTab] = useState<Tab>('users');

  // ユーザー管理
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // ロール管理
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [rolePriority, setRolePriority] = useState(50);

  // 権限管理
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [rolePermissions, setRolePermissions] = useState<Permission[]>([]);

  // メッセージ・エラー
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // モバイル判定
  const isMobile = window.innerWidth < 768;

  /**
   * ユーザー一覧を取得
   */
  const fetchUsers = async () => {
    setUsersLoading(true);
    setError('');

    try {
      const data = await apiClient.get<UserWithRoles[]>('/api/v1/users');
      setUsers(data);
    } catch {
      setError('ユーザー一覧を取得できませんでした');
    } finally {
      setUsersLoading(false);
    }
  };

  /**
   * ロール一覧を取得
   */
  const fetchRoles = async () => {
    setRolesLoading(true);
    setError('');

    try {
      const data = await apiClient.get<Role[]>('/api/v1/roles');
      setRoles(data);
    } catch {
      setError('ロール一覧を取得できませんでした');
    } finally {
      setRolesLoading(false);
    }
  };

  /**
   * 権限一覧を取得
   */
  const fetchPermissions = async () => {
    setPermissionsLoading(true);
    setError('');

    try {
      const data = await apiClient.get<Permission[]>('/api/v1/permissions');
      setPermissions(data);
    } catch {
      setError('権限一覧を取得できませんでした');
    } finally {
      setPermissionsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    fetchPermissions();
  }, []);

  /**
   * ユーザーにロールを追加
   */
  const handleAddRoleToUser = async (userId: string, roleId: string) => {
    setMessage('');
    try {
      await apiClient.post(`/api/v1/users/${userId}/roles`, { roleId });
      setMessage('ロールを追加しました');
      await fetchUsers();
    } catch {
      setMessage('ロール追加に失敗しました');
    }
  };

  /**
   * ユーザーからロールを削除
   */
  const handleRemoveRoleFromUser = async (userId: string, roleId: string) => {
    setMessage('');
    if (!confirm('このロールを削除してもよろしいですか？')) {
      return;
    }

    try {
      await apiClient.delete(`/api/v1/users/${userId}/roles/${roleId}`);
      setMessage('ロールを削除しました');
      await fetchUsers();
    } catch {
      setMessage('ロール削除に失敗しました');
    }
  };

  /**
   * ロール作成ダイアログを開く
   */
  const handleOpenCreateRoleDialog = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDescription('');
    setRolePriority(50);
    setShowRoleDialog(true);
  };

  /**
   * ロール編集ダイアログを開く
   */
  const handleOpenEditRoleDialog = (role: Role) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description);
    setRolePriority(role.priority);
    setShowRoleDialog(true);
  };

  /**
   * ロール作成/更新を実行
   */
  const handleSaveRole = async () => {
    setMessage('');

    if (!roleName.trim()) {
      setMessage('ロール名を入力してください');
      return;
    }

    try {
      if (editingRole) {
        // 更新
        const input: UpdateRoleInput = {
          name: roleName,
          description: roleDescription,
          priority: rolePriority,
        };
        await apiClient.patch(`/api/v1/roles/${editingRole.id}`, input);
        setMessage('ロールを更新しました');
      } else {
        // 作成
        const input: CreateRoleInput = {
          name: roleName,
          description: roleDescription,
          priority: rolePriority,
        };
        await apiClient.post('/api/v1/roles', input);
        setMessage('ロールを作成しました');
      }

      setShowRoleDialog(false);
      await fetchRoles();
      await fetchUsers(); // ユーザーのロール情報を更新
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setMessage(error?.response?.data?.message || 'ロールの保存に失敗しました');
    }
  };

  /**
   * ロール削除
   */
  const handleDeleteRole = async (roleId: string, roleName: string) => {
    setMessage('');
    if (!confirm(`ロール「${roleName}」を削除してもよろしいですか？`)) {
      return;
    }

    try {
      await apiClient.delete(`/api/v1/roles/${roleId}`);
      setMessage('ロールを削除しました');
      await fetchRoles();
      await fetchUsers();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setMessage(error?.response?.data?.message || 'ロール削除に失敗しました');
    }
  };

  /**
   * ロールの権限一覧を取得
   */
  const fetchRolePermissions = async (roleId: string) => {
    try {
      // ロールの詳細から権限を取得
      // （注: 実際のAPIエンドポイントに応じて調整が必要）
      const role = roles.find((r) => r.id === roleId);
      if (role) {
        // 簡易実装: 全権限から選択済みをフィルタ
        // 実運用ではGET /api/v1/roles/:id/permissionsを実装すべき
        setRolePermissions([]);
      }
    } catch {
      setMessage('権限一覧を取得できませんでした');
    }
  };

  /**
   * ロールに権限を追加
   */
  const handleAddPermissionToRole = async (permissionId: string) => {
    setMessage('');
    if (!selectedRole) {
      setMessage('ロールを選択してください');
      return;
    }

    try {
      await apiClient.post(`/api/v1/roles/${selectedRole}/permissions`, {
        permissionId,
      });
      setMessage('権限を追加しました');
      await fetchRolePermissions(selectedRole);
    } catch {
      setMessage('権限追加に失敗しました');
    }
  };

  /**
   * ロールから権限を削除
   */
  const handleRemovePermissionFromRole = async (permissionId: string) => {
    setMessage('');
    if (!selectedRole) {
      return;
    }

    if (!confirm('この権限を削除してもよろしいですか？')) {
      return;
    }

    try {
      await apiClient.delete(`/api/v1/roles/${selectedRole}/permissions/${permissionId}`);
      setMessage('権限を削除しました');
      await fetchRolePermissions(selectedRole);
    } catch {
      setMessage('権限削除に失敗しました');
    }
  };

  useEffect(() => {
    if (selectedRole) {
      fetchRolePermissions(selectedRole);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole]);

  return (
    <div
      data-testid="user-management-container"
      className={isMobile ? 'mobile-optimized' : ''}
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: isMobile ? '1rem' : '2rem',
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>
        ユーザー・ロール管理
      </h1>

      {/* エラーメッセージ */}
      {error && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            padding: '0.75rem',
            borderRadius: '0.375rem',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {/* メッセージ */}
      {message && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            padding: '0.75rem',
            borderRadius: '0.375rem',
            backgroundColor: message.includes('失敗') ? '#fee2e2' : '#d1fae5',
            color: message.includes('失敗') ? '#991b1b' : '#065f46',
            marginBottom: '1rem',
          }}
        >
          {message}
        </div>
      )}

      {/* タブ */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '2rem',
          borderBottom: '2px solid #e5e7eb',
        }}
      >
        {[
          { key: 'users', label: 'ユーザー' },
          { key: 'roles', label: 'ロール' },
          { key: 'permissions', label: '権限' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as Tab)}
            aria-label={`${tab.label}タブ`}
            aria-selected={activeTab === tab.key}
            role="tab"
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'transparent',
              color: activeTab === tab.key ? '#3b82f6' : '#6b7280',
              borderBottom: activeTab === tab.key ? '2px solid #3b82f6' : 'none',
              marginBottom: '-2px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === tab.key ? 600 : 500,
              fontSize: '1rem',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ユーザータブ */}
      {activeTab === 'users' && (
        <div>
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
            }}
          >
            ユーザー一覧
          </h2>

          {usersLoading && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              読み込み中...
            </div>
          )}

          {!usersLoading && users.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              ユーザーがいません
            </div>
          )}

          {!usersLoading && users.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              {users.map((user) => (
                <div
                  key={user.id}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    marginBottom: '1rem',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '1rem' }}>{user.displayName}</div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{user.email}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                      作成日: {new Date(user.createdAt).toLocaleDateString('ja-JP')}
                    </div>
                  </div>

                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong style={{ fontSize: '0.875rem' }}>ロール:</strong>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        marginTop: '0.5rem',
                      }}
                    >
                      {user.roles.map((role) => (
                        <div
                          key={role.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.25rem 0.75rem',
                            backgroundColor: '#eff6ff',
                            color: '#1e40af',
                            borderRadius: '9999px',
                            fontSize: '0.875rem',
                          }}
                        >
                          {role.name}
                          {!role.isSystem && (
                            <button
                              onClick={() => handleRemoveRoleFromUser(user.id, role.id)}
                              aria-label={`${role.name}を削除`}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#dc2626',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                padding: 0,
                              }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: '0.75rem' }}>
                    <label
                      htmlFor={`role-select-${user.id}`}
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        marginBottom: '0.5rem',
                        display: 'block',
                      }}
                    >
                      ロールを追加:
                    </label>
                    <select
                      id={`role-select-${user.id}`}
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddRoleToUser(user.id, e.target.value);
                          e.target.value = '';
                        }
                      }}
                      style={{
                        padding: '0.5rem',
                        borderRadius: '0.375rem',
                        border: '1px solid #d1d5db',
                        fontSize: '0.875rem',
                        width: '100%',
                      }}
                    >
                      <option value="">ロールを選択...</option>
                      {roles
                        .filter((role) => !user.roles.some((ur) => ur.id === role.id))
                        .map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ロールタブ */}
      {activeTab === 'roles' && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>ロール一覧</h2>
            <button
              onClick={handleOpenCreateRoleDialog}
              aria-label="新しいロールを作成"
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                borderRadius: '0.375rem',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              + ロール作成
            </button>
          </div>

          {rolesLoading && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              読み込み中...
            </div>
          )}

          {!rolesLoading && roles.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  backgroundColor: 'white',
                  borderRadius: '0.5rem',
                  overflow: 'hidden',
                }}
              >
                <thead style={{ backgroundColor: '#f3f4f6' }}>
                  <tr>
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>
                      ロール名
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>説明</th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>
                      優先順位
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>
                      ユーザー数
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600 }}>
                      アクション
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                        {role.name}
                        {role.isSystem && (
                          <span
                            style={{
                              marginLeft: '0.5rem',
                              padding: '0.125rem 0.5rem',
                              backgroundColor: '#dbeafe',
                              color: '#1e40af',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem',
                            }}
                          >
                            システム
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                        {role.description}
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.875rem' }}>{role.priority}</td>
                      <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                        {role.userCount ?? 0}
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => handleOpenEditRoleDialog(role)}
                            aria-label={`${role.name}を編集`}
                            style={{
                              padding: '0.25rem 0.75rem',
                              backgroundColor: '#f3f4f6',
                              color: '#374151',
                              borderRadius: '0.375rem',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                            }}
                          >
                            編集
                          </button>
                          {!role.isSystem && (
                            <button
                              onClick={() => handleDeleteRole(role.id, role.name)}
                              aria-label={`${role.name}を削除`}
                              style={{
                                padding: '0.25rem 0.75rem',
                                backgroundColor: '#fee2e2',
                                color: '#991b1b',
                                borderRadius: '0.375rem',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                              }}
                            >
                              削除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 権限タブ */}
      {activeTab === 'permissions' && (
        <div>
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
            }}
          >
            ロール・権限管理
          </h2>

          <div style={{ marginBottom: '2rem' }}>
            <label
              htmlFor="role-select-permissions"
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 500,
              }}
            >
              ロールを選択:
            </label>
            <select
              id="role-select-permissions"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
              }}
            >
              <option value="">ロールを選択してください</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          {selectedRole && (
            <>
              <h3
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  marginBottom: '1rem',
                }}
              >
                割り当て済み権限
              </h3>

              {rolePermissions.length === 0 && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '2rem',
                    color: '#6b7280',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.5rem',
                    marginBottom: '2rem',
                  }}
                >
                  権限が割り当てられていません
                </div>
              )}

              {rolePermissions.length > 0 && (
                <div
                  style={{
                    marginBottom: '2rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  {rolePermissions.map((permission) => (
                    <div
                      key={permission.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        backgroundColor: '#eff6ff',
                        color: '#1e40af',
                        borderRadius: '0.375rem',
                      }}
                    >
                      {permission.resource}:{permission.action}
                      <button
                        onClick={() => handleRemovePermissionFromRole(permission.id)}
                        aria-label={`${permission.resource}:${permission.action}を削除`}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#dc2626',
                          cursor: 'pointer',
                          fontSize: '1rem',
                          padding: 0,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <h3
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  marginBottom: '1rem',
                }}
              >
                利用可能な権限
              </h3>

              {permissionsLoading && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '2rem',
                    color: '#6b7280',
                  }}
                >
                  読み込み中...
                </div>
              )}

              {!permissionsLoading && permissions.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  {permissions
                    .filter((p) => !rolePermissions.some((rp) => rp.id === p.id))
                    .map((permission) => (
                      <button
                        key={permission.id}
                        onClick={() => handleAddPermissionToRole(permission.id)}
                        aria-label={`${permission.resource}:${permission.action}を追加`}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#f3f4f6',
                          color: '#374151',
                          borderRadius: '0.375rem',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                        }}
                      >
                        + {permission.resource}:{permission.action}
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ロール作成/編集ダイアログ */}
      {showRoleDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 50,
          }}
        >
          <div
            role="dialog"
            aria-labelledby="role-dialog-title"
            style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              padding: '2rem',
              maxWidth: '500px',
              width: '100%',
            }}
          >
            <h3
              id="role-dialog-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                marginBottom: '1rem',
              }}
            >
              {editingRole ? 'ロール編集' : 'ロール作成'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label
                  htmlFor="role-name"
                  style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: 500,
                  }}
                >
                  ロール名 *
                </label>
                <input
                  type="text"
                  id="role-name"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="role-description"
                  style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: 500,
                  }}
                >
                  説明
                </label>
                <textarea
                  id="role-description"
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="role-priority"
                  style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: 500,
                  }}
                >
                  優先順位 (0-100)
                </label>
                <input
                  type="number"
                  id="role-priority"
                  value={rolePriority}
                  onChange={(e) => setRolePriority(Number(e.target.value))}
                  min={0}
                  max={100}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '1rem',
                justifyContent: 'flex-end',
                marginTop: '1.5rem',
              }}
            >
              <button
                onClick={() => setShowRoleDialog(false)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveRole}
                aria-label={editingRole ? 'ロールを更新' : 'ロールを作成'}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {editingRole ? '更新' : '作成'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
