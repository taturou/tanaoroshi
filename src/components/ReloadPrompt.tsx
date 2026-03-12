import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import '../index.css';

const UPDATE_RESULT_KEY = 'tanaoroshi_update_result';

type UpdateResult = 'updated' | 'reloaded';

interface ReloadPromptProps {
  forceUpdateRequestId?: number;
}

export function ReloadPrompt({ forceUpdateRequestId = 0 }: ReloadPromptProps) {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const isForceUpdatingRef = useRef(false);
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration ?? null;
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  useEffect(() => {
    const storedResult = sessionStorage.getItem(UPDATE_RESULT_KEY) as UpdateResult | null;
    if (!storedResult) return;

    sessionStorage.removeItem(UPDATE_RESULT_KEY);
    setUpdateResult(storedResult);
  }, []);

  useEffect(() => {
    if (!needRefresh) return;

    sessionStorage.setItem(UPDATE_RESULT_KEY, 'updated');
    void updateServiceWorker(true);
  }, [needRefresh, updateServiceWorker]);

  useEffect(() => {
    if (forceUpdateRequestId === 0 || isForceUpdatingRef.current) return;

    const forceUpdate = async () => {
      isForceUpdatingRef.current = true;

      try {
        const registration = registrationRef.current ?? await navigator.serviceWorker.getRegistration();
        registrationRef.current = registration ?? null;

        if (!registration) {
          sessionStorage.setItem(UPDATE_RESULT_KEY, 'reloaded');
          window.location.reload();
          return;
        }

        await registration.update();

        if (registration.waiting) {
          sessionStorage.setItem(UPDATE_RESULT_KEY, 'updated');
          await updateServiceWorker(true);
          return;
        }

        window.setTimeout(() => {
          sessionStorage.setItem(UPDATE_RESULT_KEY, 'reloaded');
          window.location.reload();
        }, 1500);
      } catch (error) {
        console.error('SW force update failed:', error);
        alert('アップデートに失敗しました。通信状態を確認して再実行してください。');
      } finally {
        isForceUpdatingRef.current = false;
      }
    };

    void forceUpdate();
  }, [forceUpdateRequestId, updateServiceWorker]);

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
    setUpdateResult(null);
  };

  const message = updateResult === 'updated'
    ? '最新バージョンに更新して再起動しました。'
    : updateResult === 'reloaded'
      ? '最新コードを再取得して再起動しました。'
      : 'アプリをオフラインで利用できるようになりました。';

  return (
    <div className="ReloadPrompt-container">
      {(offlineReady || updateResult) && (
        <div className="ReloadPrompt-toast card">
          <div className="ReloadPrompt-message">
            <span>{message}</span>
          </div>
          <div className="ReloadPrompt-buttons form-actions" style={{ marginTop: '1rem' }}>
            <button className="btn btn-secondary" onClick={close}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
