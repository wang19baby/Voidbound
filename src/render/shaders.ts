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
// V0 画质: 视口尺寸 uniform, 替代硬编码 1280x720 (窗口缩放后 clip 仍正确)
uniform vec2 u_viewport;
out vec2 v_uv;
void main() {
  vec2 c = a_pos - vec2(0.5);
  float s = sin(u_rot);
  float co = cos(u_rot);
  vec2 rotated = vec2(c.x * co - c.y * s, c.x * s + c.y * co) + vec2(0.5);
  vec2 flipped = mix(rotated, vec2(1.0) - rotated, lessThan(u_flip, vec2(0.0)));
  vec2 world = flipped * u_size + u_pos;
  vec2 clip = world / u_viewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv * u_uv.zw + u_uv.xy;
}
`;

export const FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec3 u_color;
uniform float u_hue; // 色相旋转 (度, 0=不变): 元素变体用 — RGB→HSL→旋转→RGB
out vec4 outColor;

vec3 hslToRgb(float h, float s, float l) {
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}

vec3 hueRotate(vec3 c, float deg) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  float d = mx - mn;
  if (d < 0.001) return c; // 灰: 无色相
  float s = d / max(0.0001, 1.0 - abs(2.0 * l - 1.0));
  float h;
  if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
  else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  h = h / 6.0 + deg / 360.0;
  return hslToRgb(mod(h, 1.0), s, l);
}

void main() {
  vec4 tex = texture(u_tex, v_uv);
  vec3 rgb = tex.rgb * u_color;
  if (abs(u_hue) > 0.01) rgb = hueRotate(rgb, u_hue);
  outColor = vec4(rgb, tex.a);
}
`;