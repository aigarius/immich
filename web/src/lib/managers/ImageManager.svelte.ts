import { getAssetUrlForKind, ImageKinds, type ImageKind } from '$lib/utils';
import { cancelImageUrl } from '$lib/utils/sw-messaging';
import { type AssetResponseDto } from '@immich/sdk';

class ImageManager {
  preload(asset: AssetResponseDto | undefined, kind: ImageKind = 'preview') {
    if (!asset) {
      return;
    }
    this.preloadImageUrl(getAssetUrlForKind(asset, kind));
  }

  preloadImageUrl(src: string | undefined) {
    if (!src) {
      return;
    }
    const img = new Image();
    img.src = src;
  }

  cancel(asset: AssetResponseDto | undefined, kind: ImageKind | 'all' = 'preview') {
    if (!asset) {
      return;
    }

    const kinds = kind === 'all' ? (Object.keys(ImageKinds) as ImageKind[]) : [kind];
    for (const k of kinds) {
      const url = getAssetUrlForKind(asset, k);
      if (url) {
        cancelImageUrl(url);
      }
    }
  }

  cancelPreloadUrl(url: string | undefined) {
    if (url) {
      cancelImageUrl(url);
    }
  }
}

export const imageManager = new ImageManager();
