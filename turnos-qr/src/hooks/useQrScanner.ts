import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const SCANNER_ID = 'dc-qr-reader';

interface UseQrScannerOptions {
  onScan: (text: string) => void;
}

/** Control de cámara con html5-qrcode */
export function useQrScanner({ onScan }: UseQrScannerOptions) {
  const [active, setActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastTextRef = useRef('');
  const lastAtRef = useRef(0);

  const stop = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    setActive(false);
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch {
      /* noop */
    }
  }, []);

  const start = useCallback(async () => {
    setCameraError(null);
    await stop();

    const scanner = new Html5Qrcode(SCANNER_ID);
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
        (decoded) => {
          const text = decoded.trim();
          if (!text) return;
          const now = Date.now();
          if (text === lastTextRef.current && now - lastAtRef.current < 1500) return;
          lastTextRef.current = text;
          lastAtRef.current = now;
          onScan(text);
        },
        () => {
          /* sin lectura en este frame */
        },
      );
      setActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo activar la cámara.';
      setCameraError(msg);
      await stop();
    }
  }, [onScan, stop]);

  useEffect(() => () => {
    void stop();
  }, [stop]);

  return {
    scannerId: SCANNER_ID,
    active,
    cameraError,
    start,
    stop,
  };
}
