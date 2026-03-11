import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

interface ScannerProps {
  onScan: (decodedText: string) => void;
  isActive: boolean;
}

export function Scanner({ onScan, isActive }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [statusMsg, setStatusMsg] = useState<string>("カメラを準備中...");
  const [scanAttempts, setScanAttempts] = useState<number>(0);
  const controlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    let isComponentMounted = true;

    if (!isActive) {
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
      return;
    }

    setStatusMsg("Zxingスキャナー起動中...");

    // 負荷を下げて高速化するため、JANコード（EAN_13, EAN_8）のみに絞り込む
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8
    ]);
    // TRY_HARDERは認識率は上がるが処理が重くなるため、速度優先の場合はオフにするのも手だが、
    // フォーマットを2つに絞ったことで十分軽くなるため維持する。
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatReader(hints);

    const startScanner = async () => {
      if (!videoRef.current || !isComponentMounted) return;
      try {
        const videoElement = videoRef.current;

        // デバイスのカメラを取得して映像を流し、デコードを開始する
        // 解像度を指定（HD以上）することで小さなバーコードも認識しやすくする
        controlsRef.current = await reader.decodeFromConstraints(
          { 
            audio: false, 
            video: { 
              facingMode: "environment",
              width: { min: 640, ideal: 1280, max: 1920 },
              height: { min: 480, ideal: 720, max: 1080 }
            } 
          },
          videoElement,
          (result, error) => {
            if (!isComponentMounted) return;
            
            if (result) {
              const text = result.getText();
              setStatusMsg(`読取成功: ${text}`);
              
              // 連続読み取りを防ぐために一時的にストップ
              if (controlsRef.current) {
                  controlsRef.current.stop();
                  controlsRef.current = null;
              }
              
              // App側へスキャン結果を通知
              onScan(text);
            }
            if (error) {
              // NotFoundException が毎フレーム飛んでくるためカウントする
              setScanAttempts(prev => prev + 1);
              setStatusMsg("バーコードを探しています...");
            }
          }
        );
        if (isComponentMounted) {
            setStatusMsg("カメラ起動完了。画面タップでピント調整。");
        }
      } catch (err) {
        console.error("Zxing setup failed:", err);
        if (isComponentMounted) {
            setStatusMsg(`カメラ起動失敗: ${err}`);
        }
      }
    };

    // DOMマウント完了を待つために少し遅延
    const timerId = setTimeout(() => {
        startScanner();
    }, 500);

    return () => {
      isComponentMounted = false;
      clearTimeout(timerId);
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
    };
  }, [isActive, onScan]);

  // タップしてピントを合わせる（フォーカスを再トリガー）
  const handleVideoClick = async () => {
    if (!videoRef.current) return;
    
    try {
        const stream = videoRef.current.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;

        // focusMode がサポートされている場合は、再設定してフォーカスを促す
        if (capabilities.focusMode) {
            await track.applyConstraints({
                advanced: [{ focusMode: 'continuous' } as any]
            });
            setStatusMsg("ピントを再調整しました。");
            setTimeout(() => setStatusMsg("バーコードを探しています..."), 2000);
        } else {
            setStatusMsg("この端末はフォーカス制御に非対応です。");
        }
    } catch (e) {
        console.error("Failed to focus:", e);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: '400px', margin: '0 auto', textAlign: 'center', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px', backgroundColor: '#e9ecef', borderRadius: '4px', marginBottom: '8px', fontSize: '0.85rem', flexShrink: 0 }}>
        <strong>状態:</strong> {statusMsg} <br/>
        <small style={{ color: '#6c757d' }}>解析フレーム数: {scanAttempts}</small>
      </div>
      <div 
        style={{ 
          position: 'relative', 
          width: '100%', 
          flex: 1,
          minHeight: '200px',
          maxHeight: 'calc(100dvh - 300px)', // ヘッダー、ナビ、ボタン、余白を考慮
          backgroundColor: '#000', 
          overflow: 'hidden', 
          cursor: 'pointer', 
          borderRadius: '8px' 
        }}
        onClick={handleVideoClick}
      >
        <video 
          ref={videoRef} 
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
          playsInline 
          muted 
          autoPlay
        />
        {/* ガイド枠（UIのみで機能には影響しない） */}
        <div style={{
          position: 'absolute', top: '25%', left: '10%', right: '10%', bottom: '25%',
          border: '2px solid rgba(0, 255, 0, 0.5)', borderRadius: '8px', boxShadow: '0 0 0 4000px rgba(0,0,0,0.4)',
          pointerEvents: 'none'
        }}></div>
      </div>
    </div>
  );
}
