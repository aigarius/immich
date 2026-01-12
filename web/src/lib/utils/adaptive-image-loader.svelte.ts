import type { LoadImageFunction } from '$lib/actions/image-loader.svelte';
import { imageManager } from '$lib/managers/ImageManager.svelte';
import { getAssetUrl, getAssetUrlForKind } from '$lib/utils';
import { type AssetResponseDto, type SharedLinkResponseDto } from '@immich/sdk';

/**
 * Quality levels for progressive image loading
 */
type ImageQuality =
  | 'basic'
  | 'loading-thumbnail'
  | 'thumbnail'
  | 'loading-preview'
  | 'preview'
  | 'loading-original'
  | 'original';

export interface ImageLoaderState {
  previewUrl?: string;
  thumbnailUrl?: string;
  originalUrl?: string;
  quality: ImageQuality;
  hasError: boolean;
  thumbnailImage: ImageStatus;
  previewImage: ImageStatus;
  originalImage: ImageStatus;
}
enum ImageStatus {
  Unloaded = 'Unloaded',
  Success = 'Success',
  Error = 'Error',
}

/**
 * Coordinates adaptive loading of a single asset image:
 * thumbhash → thumbnail → preview → original (on zoom)
 *
 */
export class AdaptiveImageLoader {
  private state = $state<ImageLoaderState>({
    quality: 'basic',
    hasError: false,
    thumbnailImage: ImageStatus.Unloaded,
    previewImage: ImageStatus.Unloaded,
    originalImage: ImageStatus.Unloaded,
  });

  private readonly currentZoomFn?: () => number;
  private readonly onImageReady?: () => void;
  private readonly onError?: () => void;
  private readonly onQualityUpgrade?: (url: string, quality: ImageQuality) => void;
  private readonly imageLoader?: LoadImageFunction;
  private readonly destroyFunctions: (() => void)[] = [];
  readonly thumbnailUrl: string;
  readonly previewUrl: string;
  readonly originalUrl: string;
  asset: AssetResponseDto;
  constructor(
    asset: AssetResponseDto,
    sharedLink: SharedLinkResponseDto | undefined,
    callbacks?: {
      currentZoomFn: () => number;
      onImageReady?: () => void;
      onError?: () => void;
      onQualityUpgrade?: (url: string, quality: ImageQuality) => void;
    },
    imageLoader?: LoadImageFunction,
  ) {
    this.asset = asset;
    this.currentZoomFn = callbacks?.currentZoomFn;
    this.onImageReady = callbacks?.onImageReady;
    this.onError = callbacks?.onError;
    this.onQualityUpgrade = callbacks?.onQualityUpgrade;
    this.imageLoader = imageLoader;

    this.thumbnailUrl = getAssetUrlForKind(asset, 'thumbnail');
    this.previewUrl = getAssetUrl({ asset, sharedLink });
    this.originalUrl = getAssetUrl({ asset, sharedLink, forceOriginal: true });
    this.state.thumbnailUrl = this.thumbnailUrl;
  }

  start() {
    if (!this.imageLoader) {
      throw new Error('Start requires imageLoader to be specified');
    }
    this.destroyFunctions.push(
      this.imageLoader(
        this.thumbnailUrl,
        {},
        () => this.onThumbnailLoad(),
        () => this.onThumbnailError(),
        () => this.onThumbnailStart(),
      ),
    );
  }

  get adaptiveLoaderState(): ImageLoaderState {
    return this.state;
  }

  onThumbnailStart() {
    this.state.quality = 'loading-thumbnail';
  }

  onThumbnailLoad() {
    this.state.quality = 'thumbnail';
    this.state.thumbnailImage = ImageStatus.Success;
    this.onImageReady?.();
    this.onQualityUpgrade?.(this.thumbnailUrl, 'thumbnail');
    this.triggerMainImage();
  }

  onThumbnailError() {
    this.state.thumbnailUrl = undefined;
    this.state.thumbnailImage = ImageStatus.Error;
    this.triggerMainImage();
  }

  triggerMainImage() {
    const wantsOriginal = (this.currentZoomFn?.() ?? 1) > 1;
    return wantsOriginal ? this.triggerOriginal() : this.triggerPreview();
  }

  triggerPreview() {
    if (!this.previewUrl) {
      // no preview, try original?
      this.triggerOriginal();
      return false;
    }
    this.state.previewUrl = this.previewUrl;
    if (this.imageLoader) {
      this.destroyFunctions.push(
        this.imageLoader(
          this.previewUrl,
          {},
          () => this.onPreviewLoad(),
          () => this.onPreviewError(),
          () => this.onPreviewStart(),
        ),
      );
    }
  }

  onPreviewStart() {
    this.state.quality = 'loading-preview';
  }

  onPreviewLoad() {
    this.state.quality = 'preview';
    this.state.previewImage = ImageStatus.Success;
    this.onImageReady?.();
    this.onQualityUpgrade?.(this.previewUrl, 'preview');
  }

  onPreviewError() {
    this.state.previewImage = ImageStatus.Error;
    this.state.previewUrl = undefined;
    // TODO: maybe try original, but only if preview's error isnt due to cancelation
  }

  triggerOriginal() {
    if (!this.originalUrl) {
      this.onError?.();
      return false;
    }
    this.state.originalUrl = this.originalUrl;

    if (this.imageLoader) {
      this.destroyFunctions.push(
        this.imageLoader(
          this.originalUrl,
          {},
          () => this.onOriginalLoad(),
          () => this.onOriginalError(),
          () => this.onOriginalStart(),
        ),
      );
    }
  }

  onOriginalStart() {
    this.state.quality = 'loading-original';
  }

  onOriginalLoad() {
    this.state.quality = 'original';
    this.state.originalImage = ImageStatus.Success;
    this.onImageReady?.();
  }

  onOriginalError() {
    this.state.originalImage = ImageStatus.Error;
    this.state.originalUrl = undefined;
  }

  destroy(): void {
    if (this.imageLoader) {
      for (const destroy of this.destroyFunctions) {
        destroy();
      }
      return;
    }
    imageManager.cancelPreloadUrl(this.thumbnailUrl);
    imageManager.cancelPreloadUrl(this.previewUrl);
    imageManager.cancelPreloadUrl(this.originalUrl);
  }
}
