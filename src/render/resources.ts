// Multi-atlas resource holder; 每个 sprite 通过 atlasName 字段决定 texture 来源
// atlasName ∈ {'characters','ui','particles','icons'}

import type { LoadedAtlas, SpriteMeta } from '../ipc/atlas';

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
}

export async function buildRenderResources(
  gl: WebGL2RenderingContext,
  atlases: LoadedAtlas[],
): Promise<RenderResources> {
  const { decodePngToRgba, uploadRgbaTexture } = await import('./gl/textures');
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
  return { atlases: out, loaded: new Set(out.keys()) };
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
  return [s.x / atlasW, s.y / atlasH, s.frame_width / atlasW, s.frame_height / atlasH];
}