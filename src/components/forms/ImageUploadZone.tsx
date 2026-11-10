import { Camera, CheckCircle2, ImageUp, Loader2, RefreshCcw, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { MAX_PHOTO_BYTES, PHOTO_COMPRESSION } from '@/constants';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errors';
import { compressPhoto, formatBytes, type CompressedPhoto } from '@/utils/photoCompressor';
import { Button } from '../ui/Button';

interface ImageUploadZoneProps {
  value: CompressedPhoto | null;
  onChange: (photo: CompressedPhoto | null) => void;
  label?: string;
  /** Opens the rear camera directly on phones. */
  capture?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Select → compress → preview → attach. Images are downscaled client-side
 * (≤ 1280 px, ~150 KB) before upload, and the compressed size is shown. Files
 * still over 500 KB after compression are rejected.
 */
export function ImageUploadZone({ value, onChange, label = 'Take after-wash photo', capture = true, disabled, className }: ImageUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!value) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const accept = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError(`That file is ${formatBytes(file.size)}. Choose a photo under ${formatBytes(MAX_PHOTO_BYTES)}.`);
      return;
    }
    setBusy(true);
    try {
      onChange(await compressPhoto(file));
    } catch (e) {
      onChange(null);
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) void accept(e.dataTransfer.files[0]);
  };

  const open = () => inputRef.current?.click();
  const locked = disabled || busy;

  return (
    <div className={cn('space-y-2', className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={capture ? 'environment' : undefined}
        className="sr-only"
        aria-label={label}
        aria-describedby={statusId}
        data-testid="photo-input"
        disabled={locked}
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {preview && value ? (
        <div>
          <img src={preview} alt="After-wash photo preview" className="aspect-[4/3] w-full rounded-lg object-cover ring-1 ring-navy-200" />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-success-700" data-testid="compressed-size">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Compressed: {formatBytes(value.bytes)}
              {value.originalBytes > value.bytes && <span className="font-normal text-navy-500">(from {formatBytes(value.originalBytes)})</span>}
            </p>
            <div className="flex gap-1">
              <Button variant="ghost" size="lg" icon={<RefreshCcw className="h-4 w-4" />} onClick={open} disabled={locked}>
                Retake
              </Button>
              <Button variant="ghost" size="lg" icon={<X className="h-4 w-4" />} onClick={() => onChange(null)} disabled={locked}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={open}
          disabled={locked}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-navy-600',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60',
            dragging ? 'border-brand bg-brand-50 text-brand' : 'border-navy-300 bg-navy-50 hover:border-brand hover:text-brand',
          )}
        >
          {busy ? <Loader2 className="h-8 w-8 animate-spin" aria-hidden /> : capture ? <Camera className="h-8 w-8" aria-hidden /> : <ImageUp className="h-8 w-8" aria-hidden />}
          <span className="text-sm font-semibold">{busy ? 'Compressing photo…' : label}</span>
          <span className="text-xs text-navy-500">
            Resized to {PHOTO_COMPRESSION.maxDimension}px, about {formatBytes(PHOTO_COMPRESSION.targetBytes)}
          </span>
        </button>
      )}
      <p id={statusId} role={error ? 'alert' : undefined} className={cn('text-xs', error ? 'font-medium text-danger-700' : 'sr-only')}>
        {error ?? (value ? `Photo attached, ${formatBytes(value.bytes)}` : 'No photo attached')}
      </p>
    </div>
  );
}
