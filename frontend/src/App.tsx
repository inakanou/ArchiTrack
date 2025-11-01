import { useState, useEffect } from 'react';
import './App.css';

interface ApiData {
  message: string;
  version: string;
}

function App() {
  const [apiStatus, setApiStatus] = useState<string>('checking...');
  const [apiData, setApiData] = useState<ApiData | null>(null);

  useEffect(() => {
    const checkApi = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const response = await fetch(`${apiUrl}/api`);
        const data: ApiData = await response.json();
        setApiData(data);
        setApiStatus('connected');
      } catch (error) {
        console.error('API connection failed:', error);
        setApiStatus('disconnected');
      }
    };

    checkApi();
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>ArchiTrack</h1>
        <p>建築プロジェクト管理システム</p>
      </header>

      <main className="main">
        <div className="status-card">
          <h2>システムステータス</h2>
          <div className="status-item">
            <span>API接続:</span>
            <span className={`status ${apiStatus}`}>{apiStatus}</span>
          </div>
          {apiData && (
            <div className="api-info">
              <p>バージョン: {apiData.version}</p>
              <p>メッセージ: {apiData.message}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
