// Atlas PNG 上传为 WebGL2 texture (RGBA, NEAREST, CLAMP_TO_EDGE)
// pngBytes: 已解码的 RGBA 像素 (来自 ImageBitmap → ImageData.data)
// width, height: 像素尺寸

export function uploadRgbaTexture(
  gl: WebGL2RenderingContext,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): WebGLTexture {
  if (rgba.length !== width * height * 4) {
    throw new Error(`RGBA 长度不匹配: ${rgba.length} vs ${width * height * 4}`);
  }
  const tex = gl.createTexture();
  if (!tex) throw new Error('createTexture 失败');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // 画布顶部 = 纹理顶部: FLIP_Y 让行 0 到 v=1, 否则整图上下颠倒 (HD 艺术接入后暴露)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    rgba,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

// 把 base64 PNG 解码为 RGBA bytes (使用 HTMLImageElement + Canvas2D)
// Tauri webview 的 createImageBitmap 在某些版本会返回 0x0, 用经典 Image 路径更稳
export async function decodePngToRgba(base64Png: string): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(new Error(`PNG 解码失败: ${String(e)}`));
    img.src = `data:image/png;base64,${base64Png}`;
  });
  if (img.naturalWidth === 0 || img.naturalHeight === 0) {
    throw new Error(`PNG 尺寸为 0: ${img.naturalWidth}x${img.naturalHeight}`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas2D 不可用 (decodePngToRgba)');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
  return { rgba: data.data, width: img.naturalWidth, height: img.naturalHeight };
}