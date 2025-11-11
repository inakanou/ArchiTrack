/**
 * FocusManagerコンポーネントのProps
 */
export interface FocusManagerProps {
  /** モーダルのコンテンツ */
  children: React.ReactNode;
  /** モーダルが開いているか */
  isOpen: boolean;
  /** モーダルを閉じる関数 */
  onClose: () => void;
  /** Escapeキーでモーダルを閉じるか。デフォルト: true */
  closeOnEscape?: boolean;
  /** モーダル外のクリックでモーダルを閉じるか。デフォルト: false */
  closeOnOutsideClick?: boolean;
  /** 初期フォーカスを当てる要素のdata-autofocus属性。デフォルト: 最初のフォーカス可能要素 */
  initialFocusRef?: React.RefObject<HTMLElement>;
  /** モーダルを閉じた後にフォーカスを戻す要素のRef。デフォルト: モーダルを開く前のフォーカス要素 */
  returnFocusRef?: React.RefObject<HTMLElement>;
}
