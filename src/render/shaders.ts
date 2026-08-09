// Voidbound WebGL2 GLSL 源码
// u_flip: vec2(1,1) 正常; (-1,1) 水平翻转
// u_rot: 绕 sprite 中心旋转的弧度 (CW 正方向, Y 向下 screen 坐标系)
// u_color: vec3 tint, 默认 (1,1,1) 不变色, 用于 hit flash 等

export const VERT = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
uniform vec2 u_pos;
uniform vec2 u_size;
uniform vec4 u_uv;
uniform vec2 u_flip;
uniform float u_rot;
out vec2 v_uv;
void main() {
  vec2 c = a_pos - vec2(0.5);
  float s = sin(u_rot);
  float co = cos(u_rot);
  vec2 rotated = vec2(c.x * co - c.y * s, c.x * s + c.y * co) + vec2(0.5);
  vec2 flipped = mix(rotated, vec2(1.0) - rotated, lessThan(u_flip, vec2(0.0)));
  vec2 world = flipped * u_size + u_pos;
  vec2 clip = world / vec2(1280.0, 720.0) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv * u_uv.zw + u_uv.xy;
}
`;

export const FRAG = `#version 300 es
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