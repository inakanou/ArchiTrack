/**
 * RolePermissionManager コンポーネント
 *
 * ロール・権限管理機能を提供します。
 * - ロール一覧表示
 * - ロールCRUD機能
 * - 権限一覧表示
 * - ロール・権限紐付け管理
 */

import React, { useState } from 'react';
import type { Role, Permission, CreateRoleInput } from '../types/role.types';

interface RolePermissionManagerProps {
  /** ロールリスト */
  roles: Role[];
  /** 権限リスト */
  permissions: Permission[];
  /** ローディング状態 */
  loading: boolean;
  /** エラーメッセージ */
  error?: string;
}

const RolePermissionManager: React.FC<RolePermissionManagerProps> = ({
  roles,
  permissions,
  loading,
  error,
}) => {
  const [selectedTab, setSelectedTab] = useState<'roles' | 'permissions'>('roles');
  const [showCreateRoleDialog, setShowCreateRoleDialog] = useState(false);
  const [newRole, setNewRole] = useState<CreateRoleInput>({
    name: '',
    description: '',
    priority: 0,
  });

  const handleCreateRole = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Backend API連携
    console.log('Creating role:', newRole);
    setShowCreateRoleDialog(false);
    setNewRole({ name: '', description: '', priority: 0 });
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        ロール・権限管理
      </h1>

      {error && (
        <div
          role="alert"
          style={{
            backgroundColor: '#ffebee',
            color: '#d32f2f',
            padding: '12px 16px',
            borderRadius: '4px',
            marginBottom: '20px',
          }}
        >
          {error}
        </div>
      )}

      {/* タブ */}
      <div style={{ marginBottom: '20px', borderBottom: '2px solid #e0e0e0' }}>
        <button
          onClick={() => setSelectedTab('roles')}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderBottom: selectedTab === 'roles' ? '3px solid #1976d2' : 'none',
            backgroundColor: 'transparent',
            color: selectedTab === 'roles' ? '#1976d2' : '#666',
            fontWeight: selectedTab === 'roles' ? 'bold' : 'normal',
            fontSize: '16px',
            cursor: 'pointer',
          }}
        >
          ロール
        </button>
        <button
          onClick={() => setSelectedTab('permissions')}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderBottom: selectedTab === 'permissions' ? '3px solid #1976d2' : 'none',
            backgroundColor: 'transparent',
            color: selectedTab === 'permissions' ? '#1976d2' : '#666',
            fontWeight: selectedTab === 'permissions' ? 'bold' : 'normal',
            fontSize: '16px',
            cursor: 'pointer',
          }}
        >
          権限
        </button>
      </div>

      {/* ロール一覧 */}
      {selectedTab === 'roles' && (
        <div>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowCreateRoleDialog(true)}
              style={{
                backgroundColor: '#1976d2',
                color: '#fff',
                padding: '10px 24px',
                border: 'none',
                borderRadius: '4px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              ロール作成
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }} aria-label="読み込み中">
              読み込み中...
            </div>
          ) : roles.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#757575' }}>
              ロールがありません
            </div>
          ) : (
            <div
              style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                overflow: 'auto',
              }}
            >
              <table role="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>
                      ロール名
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>説明</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>
                      ユーザー数
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>
                      権限数
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>
                      アクション
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '12px' }}>{role.name}</td>
                      <td style={{ padding: '12px' }}>{role.description}</td>
                      <td style={{ padding: '12px' }}>{role.userCount || 0}</td>
                      <td style={{ padding: '12px' }}>{role.permissionCount || 0}</td>
                      <td style={{ padding: '12px' }}>
                        {!role.isSystem && (
                          <button
                            style={{
                              backgroundColor: '#fff',
                              color: '#d32f2f',
                              padding: '6px 12px',
                              border: '1px solid #d32f2f',
                              borderRadius: '4px',
                              fontSize: '14px',
                              cursor: 'pointer',
                            }}
                          >
                            削除
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 権限一覧 */}
      {selectedTab === 'permissions' && (
        <div>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }} aria-label="読み込み中">
              読み込み中...
            </div>
          ) : permissions.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#757575' }}>
              権限がありません
            </div>
          ) : (
            <div
              style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                overflow: 'auto',
              }}
            >
              <table role="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>
                      リソース
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>
                      アクション
                    </th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>説明</th>
                  </tr>
                </thead>
                <tbody>
                  {permissions.map((permission) => (
                    <tr key={permission.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '12px' }}>{permission.resource}</td>
                      <td style={{ padding: '12px' }}>{permission.action}</td>
                      <td style={{ padding: '12px' }}>{permission.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ロール作成ダイアログ */}
      {showCreateRoleDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-role-dialog-title"
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
            zIndex: 1000,
          }}
          onClick={() => setShowCreateRoleDialog(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="create-role-dialog-title"
              style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}
            >
              ロール作成
            </h2>
            <form onSubmit={handleCreateRole}>
              <div style={{ marginBottom: '16px' }}>
                <label
                  htmlFor="role-name"
                  style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}
                >
                  ロール名
                </label>
                <input
                  id="role-name"
                  type="text"
                  aria-label="ロール名"
                  value={newRole.name}
                  onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '16px',
                  }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label
                  htmlFor="role-description"
                  style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}
                >
                  説明
                </label>
                <textarea
                  id="role-description"
                  aria-label="説明"
                  value={newRole.description}
                  onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                  required
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '16px',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateRoleDialog(false)}
                  style={{
                    backgroundColor: '#fff',
                    color: '#333',
                    padding: '10px 20px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '16px',
                    cursor: 'pointer',
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  style={{
                    backgroundColor: '#1976d2',
                    color: '#fff',
                    padding: '10px 20px',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  作成
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RolePermissionManager;
