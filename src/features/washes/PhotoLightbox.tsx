import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { SecurePhoto } from '@/components/shared';
import { Modal } from '@/components/ui';
import { PHOTO_RETENTION_DAYS } from '@/constants';

/** Full-size view of a privately stored wash photo. */
export function PhotoLightbox({
  photoId,
  title,
  description,
  alt,
  onClose,
  children,
}: {
  photoId: string | null;
  title: string;
  description?: ReactNode;
  alt: string;
  onClose: () => void;
  /** Extra details below the photo (admin metadata). */
  children?: ReactNode;
}) {
  return (
    <Modal open={photoId !== null} onClose={onClose} title={title} description={description} size="lg">
      {photoId && <SecurePhoto photoId={photoId} alt={alt} className="aspect-[16/10] w-full rounded-lg" />}
      {children}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-navy-500">
        <ShieldCheck className="h-3.5 w-3.5 text-success-700" aria-hidden /> Stored privately and kept for {PHOTO_RETENTION_DAYS} days.
      </p>
    </Modal>
  );
}
