// Quad VBO/IBO + program; shader 编译失败 throw gl.getShaderInfoLog

export interface QuadResources {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  uPos: WebGLUniformLocation;
  uSize: WebGLUniformLocation;
  uUv: WebGLUniformLocation;
  uTex: WebGLUniformLocation;
  uFlip: WebGLUniformLocation;
  uRot: WebGLUniformLocation;
  uColor: WebGLUniformLocation;
  uViewport: WebGLUniformLocation;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string, label: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error(`${label}: createShader 失败`);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? '';
    gl.deleteShader(sh);
    throw new Error(`${label} 编译失败:\n${log}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error('createProgram 失败');
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? '';
    gl.deleteProgram(prog);
    throw new Error(`Program 链接失败:\n${log}`);
  }
  return prog;
}

export function createQuadBuffer(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): QuadResources {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, 'Vertex Shader');
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, 'Fragment Shader');
  const program = link(gl, vs, fs);

  // Quad: 4 vertices (xy in [0,1], uv)
  // 0=(0,0) uv=(0,1)  1=(1,0) uv=(1,1)  2=(1,1) uv=(1,0)  3=(0,1) uv=(0,0)
  const verts = new Float32Array([
    0, 0,  0, 1,
    1, 0,  1, 1,
    1, 1,  1, 0,
    0, 1,  0, 0,
  ]);
  const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);

  const vao = gl.createVertexArray();
  if (!vao) throw new Error('createVertexArray 失败');
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, 'a_pos');
  const aUv = gl.getAttribLocation(program, 'a_uv');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(aUv);
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

  gl.bindVertexArray(null);

  const uPos = gl.getUniformLocation(program, 'u_pos');
  const uSize = gl.getUniformLocation(program, 'u_size');
  const uUv = gl.getUniformLocation(program, 'u_uv');
  const uTex = gl.getUniformLocation(program, 'u_tex');
  const uFlip = gl.getUniformLocation(program, 'u_flip');
  const uRot = gl.getUniformLocation(program, 'u_rot');
  const uColor = gl.getUniformLocation(program, 'u_color');
  const uViewport = gl.getUniformLocation(program, 'u_viewport');
  if (!uPos || !uSize || !uUv || !uTex || !uFlip || !uRot || !uColor || !uViewport) throw new Error('uniform 缺失');

  return { program, vao, uPos, uSize, uUv, uTex, uFlip, uRot, uColor, uViewport };
}