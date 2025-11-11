import type { PasswordStrengthResult, PasswordRequirements } from '../types/auth.types';

interface PasswordStrengthIndicatorProps {
  result: PasswordStrengthResult;
  requirements: PasswordRequirements;
}

/**
 * パスワード強度インジケーター
 *
 * パスワードの強度を視覚的に表示し、要件達成状況とフィードバックを提供します。
 */
function PasswordStrengthIndicator({ result, requirements }: PasswordStrengthIndicatorProps) {
  // 強度レベルに応じた表示テキスト
  const strengthLabels: Record<
    PasswordStrengthResult['strength'],
    { text: string; color: string }
  > = {
    weak: { text: '弱い', color: '#dc2626' }, // red-600
    fair: { text: '普通', color: '#f59e0b' }, // amber-500
    good: { text: '良い', color: '#3b82f6' }, // blue-500
    strong: { text: '強い', color: '#10b981' }, // emerald-500
    'very-strong': { text: '非常に強い', color: '#059669' }, // emerald-600
  };

  const strengthInfo = strengthLabels[result.strength];

  // 要件チェックリスト項目
  const requirementItems = [
    {
      key: 'minLength',
      label: '12文字以上',
      met: requirements.minLength,
    },
    {
      key: 'hasUppercase',
      label: '大文字を含む',
      met: requirements.hasUppercase,
    },
    {
      key: 'hasLowercase',
      label: '小文字を含む',
      met: requirements.hasLowercase,
    },
    {
      key: 'hasNumber',
      label: '数字を含む',
      met: requirements.hasNumber,
    },
    {
      key: 'hasSpecialChar',
      label: '特殊文字を含む',
      met: requirements.hasSpecialChar,
    },
    {
      key: 'complexity',
      label: '3種類以上の文字種を含む',
      met: requirements.complexity,
    },
  ];

  return (
    <div style={{ marginTop: '1rem' }}>
      {/* パスワード強度表示 */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.25rem',
          }}
          aria-label={`パスワード強度: ${strengthInfo.text}`}
        >
          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>パスワード強度:</span>
          <span
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: strengthInfo.color,
            }}
          >
            {strengthInfo.text}
          </span>
        </div>

        {/* 強度バー */}
        <div
          style={{
            height: '0.5rem',
            backgroundColor: '#e5e7eb',
            borderRadius: '0.25rem',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${(result.score / 4) * 100}%`,
              backgroundColor: strengthInfo.color,
              transition: 'width 0.3s ease-in-out',
            }}
          />
        </div>
      </div>

      {/* パスワード要件チェックリスト */}
      <div style={{ marginBottom: '0.75rem' }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>
          パスワード要件:
        </p>
        <ul
          role="list"
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}
        >
          {requirementItems.map((item) => (
            <li
              key={item.key}
              className={item.met ? 'requirement-met' : 'requirement-unmet'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                color: item.met ? '#10b981' : '#6b7280',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '1rem',
                  height: '1rem',
                }}
                aria-hidden="true"
              >
                {item.met ? '✓' : '○'}
              </span>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* フィードバックメッセージ */}
      {result.feedback.length > 0 && (
        <div
          className="feedback-section"
          style={{
            padding: '0.75rem',
            backgroundColor: '#fef3c7',
            borderRadius: '0.375rem',
            borderLeft: '4px solid #f59e0b',
          }}
        >
          <p
            style={{
              fontSize: '0.875rem',
              fontWeight: 500,
              marginBottom: '0.5rem',
              color: '#92400e',
            }}
          >
            改善提案:
          </p>
          <ul
            style={{
              listStyle: 'disc',
              paddingLeft: '1.25rem',
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            {result.feedback.map((message, index) => (
              <li
                key={index}
                style={{
                  fontSize: '0.875rem',
                  color: '#78350f',
                }}
              >
                {message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default PasswordStrengthIndicator;
