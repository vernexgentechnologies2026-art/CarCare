import { useQuery } from '@tanstack/react-query';
import { ImageOff } from 'lucide-react';
import { SIGNED_URL_TTL_SECONDS } from '@/constants';
import { qk } from '@/hooks/queryKeys';
import { cn } from '@/utils/cn';
import { useServices } from '@/services';

/**
 * Renders a privately stored photo via a short-lived signed URL. The URL is
 * cached for less than its TTL so an expired link is never rendered.
 */
export function SecurePhoto({ photoId, alt, className }: { photoId: string; alt: string; className?: string }) {
  const { washes } = useServices();
  const { data, isPending, isError } = useQuery({
    queryKey: qk.photoUrl(photoId),
    queryFn: () => washes.getPhotoUrl(photoId),
    staleTime: (SIGNED_URL_TTL_SECONDS - 30) * 1000,
    gcTime: SIGNED_URL_TTL_SECONDS * 1000,
    retry: false,
  });

  if (isPending) return <div aria-hidden className={cn('animate-pulse bg-navy-100', className)} />;
  if (isError || !data) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-1 bg-navy-100 text-xs text-navy-500', className)} role="img" aria-label="Photo unavailable">
        <ImageOff className="h-5 w-5" aria-hidden />
        Unavailable
      </div>
    );
  }
  return <img src={data.url} alt={alt} loading="lazy" className={cn('object-cover', className)} />;
}
