import {z} from 'zod';

export const captionAnimationSchema=z.object({
  mode:z.enum(['subtle','fade','none']).default('subtle'),
  fadeInFrames:z.number().int().min(0).max(12).default(2),
  fadeOutFrames:z.number().int().min(0).max(12).default(0),
  riseFrames:z.number().int().min(0).max(12).default(3),
  risePx:z.number().min(0).max(20).default(7),
});
