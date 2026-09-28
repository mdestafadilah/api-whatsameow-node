import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Check, RefreshCw } from "lucide-react";

/**
 * Renders the pairing QR locally.
 *
 * The server sends the raw pairing string; drawing it here keeps the payload
 * small and means the QR is never sent to a third-party image service.
 */
export function QrCanvas({ value, size = 240 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not render QR code.");
      });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (error) {
    return (
      <div className="flex h-60 w-60 items-center justify-center rounded-xl border border-red-200 bg-red-50 p-4 text-center text-xs text-red-700">
        {error}
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div className="flex h-60 w-60 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
        <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt="WhatsApp pairing QR code"
      className="rounded-xl border border-slate-200 bg-white p-2"
    />
  );
}

/** Copy-to-clipboard control used for pairing codes and JIDs. */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is unavailable over plain HTTP on some hosts; the value stays
      // selectable in the DOM so the user can copy manually.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-brand-600" /> : <Copy className="h-3.5 w-3.5" />}
      {label ?? (copied ? "Copied" : "Copy")}
    </button>
  );
}
