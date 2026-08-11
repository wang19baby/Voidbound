// B-V3 粒子 instancing: 同 atlas 小尺寸 sprite 合并为单 draw call (ROADMAP M4 性能护栏)
// 5k 粒子 60FPS 合格线: 实例化后 CPU 侧只写 batch buffer, GPU 一次提交
//
// 设计:
//  - v_instance buffer: 每实例 8 float = [pos.x, pos.y, size.w, size.h, u, v, du, dv]
//  - 颜色/混合: additive 粒子常用单色系 → 每实例不带色, 用全局 u_color (按 batch flush 分组)
//  - rot: 砍击/死亡特效旋转 → 每实例带 rot (第 9 float); 无旋转时填 0
//  - 调色: 环境粒子/死亡特效已有主题色, 全局 u_color 足够

import { spriteUv } from './resources';
import type { RenderResources } from './resources';

const INSTANCE_FLOATS = 9; // x, y, w, h, u, v, du, dv, rot

export interface InstBatchEntry {
  x: number;
  y: number;
  w: number;
  h: number;
  u: number;
  v: number;
  du: number;
  dv: number;
  rot: number;
}

/** 纯函数: 单实例写入 Float32Array (测试可直接验证布局) */
export function packInstance(data: Float32Array, offset: number, e: InstBatchEntry): void {
  const o = offset * INSTANCE_FLOATS;
  data[o] = e.x; data[o + 1] = e.y; data[o + 2] = e.w;
  data[o + 3] = e.h; data[o + 4] = e.u; data[o + 5] = e.v;
  data[o + 6] = e.du; data[o + 7] = e.dv; data[o + 8] = e.rot;
}

/** 实例化渲染器: 持有 instance VBO, flush() 一次 drawElementsInstanced */
export class InstancedBatch {
  private gl: WebGL2RenderingContext;
  private vao: WebGLVertexArrayObject;
  private ibo: WebGLBuffer;
  private vbo: WebGLBuffer;
  private iboLen: number;
  private capacity: number;
  private data: Float32Array;
  private count = 0;
  private uViewport: WebGLUniformLocation;
  private uColor: WebGLUniformLocation;
  private uTex: WebGLUniformLocation;
  /** 程序句柄 (main.ts 绑定 texture/color 用) */
  readonly program: WebGLProgram;

  constructor(gl: WebGL2RenderingContext, capacity: number) {
    this.gl = gl;
    this.capacity = Math.max(64, capacity);
    this.data = new Float32Array(this.capacity * INSTANCE_FLOATS);

    // program: 实例化版 vertex shader (render/shaders.ts INST_VERT)
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, INST_VERT);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(vs) ?? '';
      gl.deleteShader(vs);
      throw new Error(`instanced VS 编译失败:\n${log}`);
    }
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, INST_FRAG);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(fs) ?? '';
      gl.deleteShader(fs);
      throw new Error(`instanced FS 编译失败:\n${log}`);
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`instanced program 链接失败:\n${gl.getProgramInfoLog(prog) ?? ''}`);
    }

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    // base quad: 4 顶点 (xy, uv), 每实例 1 个 quad
    const quad = new Float32Array([
      0, 0, 0, 1,
      1, 0, 1, 1,
      1, 1, 1, 0,
      0, 1, 0, 0,
    ]);
    const quadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    const aUv = gl.getAttribLocation(prog, 'a_uv');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

    // instance buffer: 3×vec3 (9 float/实例), stride 36
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const ao = [gl.getAttribLocation(prog, 'a_i0'), gl.getAttribLocation(prog, 'a_i1'), gl.getAttribLocation(prog, 'a_i2')];
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(ao[i]);
      gl.vertexAttribPointer(ao[i], 3, gl.FLOAT, false, INSTANCE_FLOATS * 4, i * 3 * 4);
      gl.vertexAttribDivisor(ao[i], 1);
    }

    this.ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    this.iboLen = 6;

    gl.bindVertexArray(null);

    this.uViewport = gl.getUniformLocation(prog, 'u_viewport')!;
    this.uColor = gl.getUniformLocation(prog, 'u_color')!;
    this.uTex = gl.getUniformLocation(prog, 'u_tex')!;
    this.program = prog;
  }

  /** 设置批量颜色 (同色粒子一次 flush; 变色前先 flush) */
  setColor(r: number, g: number, b: number): void {
    this.gl.uniform3f(this.uColor, r, g, b);
  }

  /** 收集一个粒子 (同 atlas sprites; color 由 flush 统一设置) */
  add(x: number, y: number, w: number, h: number, uv: [number, number, number, number], rot = 0): void {
    if (this.count >= this.capacity) return; // 溢出丢弃 (防御上限)
    packInstance(this.data, this.count, { x, y, w, h, u: uv[0], v: uv[1], du: uv[2], dv: uv[3], rot });
    this.count++;
  }

  /** 提交: 上传 instance buffer → 一次 drawElementsInstanced; 返回实例数 */
  flush(viewport: { w: number; h: number }): number {
    const gl = this.gl;
    const n = this.count;
    if (n === 0) return 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, n * INSTANCE_FLOATS));
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uViewport, viewport.w, viewport.h);
    gl.uniform1i(this.uTex, 0);
    gl.drawElementsInstanced(gl.TRIANGLES, this.iboLen, gl.UNSIGNED_SHORT, 0, n);
    gl.bindVertexArray(null);
    const out = n;
    this.count = 0;
    return out;
  }

  /** 已收集实例数 (供测试/日志) */
  pending(): number {
    return this.count;
  }
}

/** 实例化版 vertex shader: a_inst = [x,y,w,h,u,v,du,dv,rot] (3×vec3, 每实例 9 float) */
const INST_VERT = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
in vec3 a_i0;  // [x, y, w]
in vec3 a_i1;  // [h, u, v]
in vec3 a_i2;  // [du, dv, rot]
uniform vec2 u_viewport;
out vec2 v_uv;
void main() {
  vec2 c = a_pos - vec2(0.5);
  float rot = a_i2[2];
  float s = sin(rot);
  float co = cos(rot);
  vec2 transformed = vec2(c.x * co - c.y * s, c.x * s + c.y * co) + vec2(0.5);
  vec2 world = transformed * vec2(a_i0[2], a_i1[0]) + vec2(a_i0[0], a_i0[1]);
  vec2 clip = world / u_viewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv * vec2(a_i2[0], a_i2[1]) + vec2(a_i1[1], a_i1[2]);
}
`;

const INST_FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec3 u_color;
out vec4 outColor;
void main() {
  vec4 tex = texture(u_tex, v_uv);
  outColor = vec4(tex.rgb * u_color, tex.a);
}
`;

/** 便捷: 从 sprite 元数据取 uv 段 */
export function spriteUvInst(res: RenderResources, atlasName: string, spriteName: string): [number, number, number, number] | null {
  const bundle = res.atlases.get(atlasName);
  if (!bundle) return null;
  const sprite = bundle.sprites.get(spriteName);
  if (!sprite) return null;
  return spriteUv(sprite, bundle.atlas.width, bundle.atlas.height);
}