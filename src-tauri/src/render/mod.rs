//! Voidbound 渲染数据层
//!
//! M1 阶段只负责把 .bin 图集加载到内存,返回给前端 WebGL 加载器。
//! 真正像素 → 屏幕的合成在 `src/render/atlas.ts` 完成。

pub mod atlas;

pub use atlas::{AtlasLoadError, AtlasRegistry, LoadedAtlas};
pub use voidbound_atlas_parser::SpriteMeta;