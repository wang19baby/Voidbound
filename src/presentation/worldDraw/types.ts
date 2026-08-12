// presentation/worldDraw/types.ts — DrawCtx (P1.1: 帧绘制分层)
//
// 帧绘制函数的依赖注入容器; 避免 main.ts 把 530 行绘制代码全堆在 drawFrameToScreen

import type { GameState } from '../../game/state';
import type { InstancedBatch } from '../../render/instanced';
import type { RenderResources } from '../../render/resources';
import type { QuadResources } from '../../render/gl/resources';

export interface DrawCtx {
  state: GameState;
  gl: WebGL2RenderingContext;
  quad: QuadResources;
  res: RenderResources;
  particleBatch: InstancedBatch;
}