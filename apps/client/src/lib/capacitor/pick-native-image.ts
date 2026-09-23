import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isCapacitorPluginAvailable, isNativeApp } from './platform.js';

export type NativeImageSource = 'camera' | 'photos';

function formatToMime(format: string | undefined): string {
  const f = (format ?? 'jpeg').toLowerCase();
  if (f === 'png') return 'image/png';
  if (f === 'gif') return 'image/gif';
  if (f === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function extForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export function canUseNativeCamera(): boolean {
  return isNativeApp() && isCapacitorPluginAvailable('Camera');
}

export async function pickNativeImageFile(source: NativeImageSource): Promise<File> {
  const photo = await Camera.getPhoto({
    quality: 85,
    resultType: CameraResultType.Uri,
    source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    correctOrientation: true,
    width: 2400,
    height: 2400,
  });

  if (!photo.webPath) {
    throw new Error('Камера не вернула изображение');
  }

  const res = await fetch(photo.webPath);
  if (!res.ok) {
    throw new Error('Не удалось прочитать снимок');
  }
  const blob = await res.blob();
  const mime = blob.type || formatToMime(photo.format);
  const name = `photo-${Date.now()}.${extForMime(mime)}`;
  return new File([blob], name, { type: mime });
}
