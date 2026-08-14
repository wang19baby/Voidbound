// Multi-atlas resource holder; 每个 sprite 通过 atlasName 字段决定 texture 来源
// atlasName ∈ {'characters','ui','particles','icons'}

import type { LoadedAtlas, SpriteMeta } from '../ipc/atlas';
import { decodePngToRgba, uploadRgbaTexture } from './gl/textures';

export type { SpriteMeta };

export interface AtlasBundle {
  atlas: LoadedAtlas;
  texture: WebGLTexture;
  sprites: Map<string, SpriteMeta>;
}

export interface RenderResources {
  atlases: Map<string, AtlasBundle>;
  /** 启动时声明已加载的所有 atlasName → 主循环断言 sprite 必属于其一 */
  loaded: Set<string>;
  /** icons 图集整图 ImageBitmap (Canvas2D overlay 画图标用, 城镇面板/药水按钮) */
  iconBitmap: ImageBitmap | null;
}

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function buildRenderResources(
  gl: WebGL2RenderingContext,
  atlases: LoadedAtlas[],
): Promise<RenderResources> {
  const out = new Map<string, AtlasBundle>();
  for (const atlas of atlases) {
    const { rgba, width, height } = await decodePngToRgba(atlas.image_png_b64);
    if (width !== atlas.width || height !== atlas.height) {
      throw new Error(`PNG 尺寸不匹配 ${atlas.name}: ${width}x${height} vs ${atlas.width}x${atlas.height}`);
    }
    const texture = uploadRgbaTexture(gl, rgba, width, height);
    const sprites = new Map<string, SpriteMeta>();
    for (const s of atlas.sprites) sprites.set(s.name, s);
    out.set(atlas.name, { atlas, texture, sprites });
  }
  // icons 图集 → ImageBitmap (overlay 图标用; 仅此一个图集需要)
  let iconBitmap: ImageBitmap | null = null;
  const iconsAtlas = atlases.find(a => a.name === 'icons');
  if (iconsAtlas) {
    try {
      iconBitmap = await createImageBitmap(b64ToBlob(iconsAtlas.image_png_b64, 'image/png'));
    } catch (e) {
      console.warn('icons ImageBitmap 创建失败 (overlay 图标不可用):', e);
    }
  }
  return { atlases: out, loaded: new Set(out.keys()), iconBitmap };
}

/**
 * 唯一 sprite 表: 'atlasName.spriteName' → {atlas, sprite}
 * 提供跨 atlas 唯一 key, 避免 ui.btn 与 icons.btn 冲突
 */
export interface ResolvedSprite {
  atlasName: string;
  sprite: SpriteMeta;
}

export function resolveSprite(
  res: RenderResources,
  atlasName: string,
  spriteName: string,
): ResolvedSprite | null {
  const bundle = res.atlases.get(atlasName);
  if (!bundle) return null;
  const sprite = bundle.sprites.get(spriteName);
  if (!sprite) return null;
  return { atlasName, sprite };
}

export function spriteUv(
  s: SpriteMeta,
  atlasW: number,
  atlasH: number,
): [number, number, number, number] {
  // 纹理上传 UNPACK_FLIP_Y_WEBGL=true (gl/textures.ts): 画布顶部 → v=1。
  // sprite 元数据 y 是 PNG 坐标 (顶部=0) → 采样区间 v 镜像: v0' = 1 - (y+h)/H。
  // 不镜像时矮 sprite (如 world 图集 128px wall/decor 混排 384px floor) 会采样到
  // 镜像后的空白区 → 全透明不可见 (碰撞仍在) — 2026-08-13 修复。
  return [
    s.x / atlasW,
    1 - (s.y + s.frame_height) / atlasH,
    s.frame_width / atlasW,
    s.frame_height / atlasH,
  ];
}