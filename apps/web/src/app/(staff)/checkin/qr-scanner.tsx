"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { CameraOff } from "lucide-react";

// BarcodeDetector is not in the TS DOM lib yet; declare the tiny surface we use.
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};
declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): BarcodeDetectorLike;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

/** Debounce window so one physical scan doesn't fire many times in a row. */
const SAME_CODE_COOLDOWN_MS = 2500;

/**
 * Rear-camera QR scanner. Prefers the native BarcodeDetector (fast, Android/
 * Chrome) and falls back to jsQR decoding canvas frames (iOS Safari, etc.).
 * Calls onScan with the decoded value, debounced against repeats. Fully
 * client-side; the camera stream never leaves the device.
 */
export function QrScanner({
  active,
  onScan,
}: {
  active: boolean;
  onScan: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const lastRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let cancelled = false;

    const emit = (value: string) => {
      const now = Date.now();
      const trimmed = value.trim();
      if (!trimmed) return;
      if (trimmed === lastRef.current.value && now - lastRef.current.at < SAME_CODE_COOLDOWN_MS) {
        return;
      }
      lastRef.current = { value: trimmed, at: now };
      onScanRef.current(trimmed);
    };

    const tick = async () => {
      const video = videoRef.current;
      if (cancelled || !video || video.readyState < video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(() => void tick());
        return;
      }
      try {
        if (detectorRef.current) {
          const codes = await detectorRef.current.detect(video);
          if (codes[0]?.rawValue) emit(codes[0].rawValue);
        } else {
          const canvas = (canvasRef.current ??= document.createElement("canvas"));
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (w && h) {
            canvas.width = w;
            canvas.height = h;
            const cctx = canvas.getContext("2d", { willReadFrequently: true });
            if (cctx) {
              cctx.drawImage(video, 0, 0, w, h);
              const img = cctx.getImageData(0, 0, w, h);
              const found = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
              if (found?.data) emit(found.data);
            }
          }
        }
      } catch {
        // Transient decode error — keep scanning.
      }
      if (!cancelled) rafRef.current = requestAnimationFrame(() => void tick());
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        if (typeof window !== "undefined" && window.BarcodeDetector) {
          try {
            const formats = (await window.BarcodeDetector.getSupportedFormats?.()) ?? [];
            if (!formats.length || formats.includes("qr_code")) {
              detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
            }
          } catch {
            detectorRef.current = null;
          }
        }
        rafRef.current = requestAnimationFrame(() => void tick());
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        setError(
          name === "NotAllowedError"
            ? "Permita o acesso à câmera para escanear."
            : name === "NotFoundError"
              ? "Nenhuma câmera encontrada neste dispositivo."
              : "Não foi possível abrir a câmera.",
        );
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      detectorRef.current = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };
  }, [active]);

  if (!active) return null;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface p-6 text-center text-body text-ink-soft">
        <CameraOff className="size-6 text-ink-muted" />
        {error}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-black">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="aspect-square w-full object-cover"
        aria-label="Câmera de leitura de QR"
      />
      {/* Aiming frame */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="size-2/3 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
    </div>
  );
}
