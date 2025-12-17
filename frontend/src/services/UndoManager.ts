/**
 * UndoManager - 操作履歴管理
 *
 * コマンドパターンによる Undo/Redo 機能を提供する。
 * 注釈編集の操作履歴を管理し、最大50件の履歴を保持する（FIFO）。
 *
 * @see design.md - UndoManager State Management
 * @see requirements.md - 要件11.1, 11.2, 11.4
 */

/**
 * Undoコマンドのインターフェース
 *
 * コマンドパターンに基づき、実行と取り消しを定義する。
 */
export interface UndoCommand {
  /** コマンドの種類（デバッグ・ログ用） */
  type: string;
  /** コマンドを実行する関数 */
  execute: () => void;
  /** コマンドを取り消す関数 */
  undo: () => void;
}

/**
 * UndoManager状態変更時のコールバック引数
 */
export interface UndoManagerState {
  /** Undo可能かどうか */
  canUndo: boolean;
  /** Redo可能かどうか */
  canRedo: boolean;
}

/**
 * UndoManager状態変更時のコールバック関数型
 */
export type OnChangeCallback = (state: UndoManagerState) => void;

/**
 * UndoManagerインターフェース
 *
 * @see design.md - IUndoManager
 */
export interface IUndoManager {
  /** コマンドを実行してUndoスタックに追加する */
  execute(command: UndoCommand): void;
  /**
   * コマンドを実行せずにUndoスタックに追加する
   *
   * Fabric.jsなど外部ライブラリのイベントに連携する際、
   * 既に操作が実行された後にコマンドを履歴に追加するために使用します。
   */
  pushWithoutExecute(command: UndoCommand): void;
  /** 直前のコマンドを取り消す */
  undo(): void;
  /** 取り消したコマンドを再実行する */
  redo(): void;
  /** Undo可能かどうかを返す */
  canUndo(): boolean;
  /** Redo可能かどうかを返す */
  canRedo(): boolean;
  /** UndoスタックとRedoスタックをクリアする */
  clear(): void;
  /**
   * 状態変更時のコールバックを設定する
   * @param callback 状態変更時に呼び出されるコールバック関数（nullで解除）
   */
  setOnChange(callback: OnChangeCallback | null): void;
}

/**
 * UndoManagerクラス
 *
 * - コマンドパターンによる操作履歴管理
 * - 最大50件の履歴保持（FIFO：超過時は最古の履歴から削除）
 * - execute/undo/redo メソッドによる操作制御
 */
export class UndoManager implements IUndoManager {
  /** Undo用のコマンドスタック */
  private undoStack: UndoCommand[] = [];

  /** Redo用のコマンドスタック */
  private redoStack: UndoCommand[] = [];

  /** 履歴の最大保持数 */
  private maxHistorySize: number;

  /** 状態変更時のコールバック */
  private onChange: OnChangeCallback | null = null;

  /**
   * コンストラクタ
   * @param maxHistorySize 履歴の最大保持数（デフォルト: 50）
   */
  constructor(maxHistorySize: number = 50) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * コマンドを実行してUndoスタックに追加する
   *
   * - コマンドのexecute()を呼び出し
   * - Undoスタックに追加
   * - Redoスタックをクリア
   * - 履歴が最大数を超えた場合、最古のコマンドを削除（FIFO）
   *
   * @param command 実行するコマンド
   */
  execute(command: UndoCommand): void {
    // コマンドを実行
    command.execute();

    // 履歴が最大数に達している場合、最古のコマンドを削除（FIFO）
    if (this.undoStack.length >= this.maxHistorySize) {
      this.undoStack.shift();
    }

    // Undoスタックに追加
    this.undoStack.push(command);

    // Redoスタックをクリア（新しいコマンド実行後はRedoできない）
    this.redoStack = [];

    // 状態変更を通知
    this.notifyChange();
  }

  /**
   * コマンドを実行せずにUndoスタックに追加する
   *
   * Fabric.jsなど外部ライブラリのイベントに連携する際、
   * 既に操作が実行された後にコマンドを履歴に追加するために使用します。
   *
   * - execute()を呼び出さずにUndoスタックに追加
   * - Redoスタックをクリア
   * - 履歴が最大数を超えた場合、最古のコマンドを削除（FIFO）
   *
   * @param command 追加するコマンド
   */
  pushWithoutExecute(command: UndoCommand): void {
    // 履歴が最大数に達している場合、最古のコマンドを削除（FIFO）
    if (this.undoStack.length >= this.maxHistorySize) {
      this.undoStack.shift();
    }

    // Undoスタックに追加（execute()は呼び出さない）
    this.undoStack.push(command);

    // Redoスタックをクリア（新しいコマンド追加後はRedoできない）
    this.redoStack = [];

    // 状態変更を通知
    this.notifyChange();
  }

  /**
   * 直前のコマンドを取り消す
   *
   * - Undoスタックから最新のコマンドを取り出し
   * - コマンドのundo()を呼び出し
   * - Redoスタックに追加
   */
  undo(): void {
    const command = this.undoStack.pop();
    if (!command) {
      return;
    }

    // コマンドを取り消し
    command.undo();

    // Redoスタックに追加
    this.redoStack.push(command);

    // 状態変更を通知
    this.notifyChange();
  }

  /**
   * 取り消したコマンドを再実行する
   *
   * - Redoスタックから最新のコマンドを取り出し
   * - コマンドのexecute()を呼び出し
   * - Undoスタックに追加
   */
  redo(): void {
    const command = this.redoStack.pop();
    if (!command) {
      return;
    }

    // コマンドを再実行
    command.execute();

    // Undoスタックに追加
    this.undoStack.push(command);

    // 状態変更を通知
    this.notifyChange();
  }

  /**
   * Undo可能かどうかを返す
   * @returns Undo可能な場合true
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Redo可能かどうかを返す
   * @returns Redo可能な場合true
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * UndoスタックとRedoスタックをクリアする
   *
   * 保存時に呼び出して履歴をリセットする。
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];

    // 状態変更を通知
    this.notifyChange();
  }

  /**
   * Undoスタックのサイズを返す
   * @returns Undoスタックに含まれるコマンド数
   */
  getUndoStackSize(): number {
    return this.undoStack.length;
  }

  /**
   * Redoスタックのサイズを返す
   * @returns Redoスタックに含まれるコマンド数
   */
  getRedoStackSize(): number {
    return this.redoStack.length;
  }

  /**
   * 履歴の最大保持数を返す
   * @returns 最大保持数
   */
  getMaxHistorySize(): number {
    return this.maxHistorySize;
  }

  /**
   * 状態変更時のコールバックを設定する
   * @param callback 状態変更時に呼び出されるコールバック関数
   */
  setOnChange(callback: OnChangeCallback | null): void {
    this.onChange = callback;
  }

  /**
   * 状態変更を通知する（内部メソッド）
   */
  private notifyChange(): void {
    if (this.onChange) {
      this.onChange({
        canUndo: this.canUndo(),
        canRedo: this.canRedo(),
      });
    }
  }
}
