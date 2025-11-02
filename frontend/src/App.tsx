import { useState, useEffect } from 'react';
import { apiClient, ApiError } from './api/client';
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
        const data = await apiClient.get<ApiData>('/api');
        setApiData(data);
        setApiStatus('connected');
      } catch (error) {
        console.error('API connection failed:', error);
        if (error instanceof ApiError) {
          console.error('Status:', error.statusCode);
          console.error('Response:', error.response);
        }
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
