import { useRegisterSW } from 'virtual:pwa-register/react';
import './index.css'; // スタイル用

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // 登録成功時のログ（必要に応じて）
      console.log('SW Registered: ', r);
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div className="ReloadPrompt-container">
      {(offlineReady || needRefresh) && (
        <div className="ReloadPrompt-toast card">
          <div className="ReloadPrompt-message">
            {offlineReady ? (
              <span>アプリをオフラインで利用できるようになりました。</span>
            ) : (
              <span>新しいバージョンのアプリが利用可能です！更新してください。</span>
            )}
          </div>
          <div className="ReloadPrompt-buttons form-actions" style={{ marginTop: '1rem' }}>
            {needRefresh && (
              <button 
                className="btn btn-primary" 
                onClick={() => updateServiceWorker(true)}
              >
                今すぐ更新して再起動
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => close()}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
