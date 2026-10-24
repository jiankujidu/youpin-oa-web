/**
 * 极简 ZIP 打包器（零依赖，STORE 存储法）+ 浏览器下载helper
 * ---------------------------------------------------------------------------
 * 用途：收藏夹「批量下载说明书 / 打包收藏夹」——把多个 PDF 说明书 + 一份清单 CSV
 *      打成单个 zip 交给浏览器落盘。
 *
 * 为什么用 STORE 而不是 deflate：说明书本身已是压缩过的 PDF，再 deflate 几乎不省体积，
 * 而 STORE 只需 CRC32，实现简单、跨浏览器零风险。
 * 目录名走 UTF-8 标志位（0x0800），中文名在 Windows 资源管理器里不乱码。
 */

/* --------------------------------- CRC --------------------------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

class ByteWriter {
  private parts: Uint8Array[] = [];
  len = 0;
  u8(v: number) {
    const b = new Uint8Array(1);
    b[0] = v & 0xff;
    this.parts.push(b);
    this.len += 1;
  }
  u16(v: number) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v >>> 0, true);
    this.parts.push(b);
    this.len += 2;
  }
  u32(v: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0, true);
    this.parts.push(b);
    this.len += 4;
  }
  raw(b: Uint8Array) {
    this.parts.push(b);
    this.len += b.length;
  }
  out(): Uint8Array {
    const res = new Uint8Array(this.len);
    let o = 0;
    for (const p of this.parts) {
      res.set(p, o);
      o += p.length;
    }
    return res;
  }
}

/** ZIP 内的一个文件 */
export interface ZipFile {
  /** zip 内路径（可用 / 分目录；中文名走 UTF-8 标志位） */
  name: string;
  data: Uint8Array;
}

/** 打包成 zip 字节流（STORE 存储法，固定时间戳保证产物稳定） */
export function zipStore(files: ZipFile[]): Uint8Array {
  const enc = new TextEncoder();
  const w = new ByteWriter();
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];
  const dosTime = 0;
  const dosDate = 0x0021; // 2000-01-01
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const offset = w.len;
    w.u32(0x04034b50);
    w.u16(20);
    w.u16(0x0800); // UTF-8 文件名
    w.u16(0);
    w.u16(dosTime);
    w.u16(dosDate);
    w.u32(crc);
    w.u32(f.data.length);
    w.u32(f.data.length);
    w.u16(nameBytes.length);
    w.u16(0);
    w.raw(nameBytes);
    w.raw(f.data);
    central.push({ name: nameBytes, crc, size: f.data.length, offset });
  }
  const cdStart = w.len;
  for (const c of central) {
    w.u32(0x02014b50);
    w.u16(20);
    w.u16(20);
    w.u16(0x0800);
    w.u16(0);
    w.u16(dosTime);
    w.u16(dosDate);
    w.u32(c.crc);
    w.u32(c.size);
    w.u32(c.size);
    w.u16(c.name.length);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u32(0);
    w.u32(c.offset);
    w.raw(c.name);
  }
  const cdSize = w.len - cdStart;
  w.u32(0x06054b50);
  w.u16(0);
  w.u16(0);
  w.u16(central.length);
  w.u16(central.length);
  w.u32(cdSize);
  w.u32(cdStart);
  w.u16(0);
  return w.out();
}

/** 文本 → UTF-8 字节 */
export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** 触发浏览器下载（blob + <a download>） */
export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

/** 打包并下载 */
export function downloadZip(files: ZipFile[], filename: string): void {
  const bytes = zipStore(files);
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  downloadBlob(new Blob([buf], { type: 'application/zip' }), filename);
}
