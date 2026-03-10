import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface ScannerProps {
  onScan: (decodedText: string) => void;
  isActive: boolean;
}

export function Scanner({ onScan, isActive }: ScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader";

  useEffect(() => {
    if (!isActive) {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
      return;
    }

    const html5Qrcode = new Html5Qrcode(containerId);
    scannerRef.current = html5Qrcode;

    const startScanner = async () => {
      try {
        await html5Qrcode.start(
          { facingMode: "environment" }, // 背面カメラを指定
          {
            fps: 10,
            qrbox: { width: 250, height: 100 }, // バーコードに適した長方形の読取領域
            aspectRatio: 1.0,
          },
          (decodedText) => {
            onScan(decodedText);
          },
          () => {
            // スキャン失敗時は特に何もしない（リアルタイムで何度も呼ばれるため）
          }
        );
      } catch (err) {
        console.error("Failed to start scanner", err);
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [isActive, onScan]);

  return <div id={containerId} style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}></div>;
}
