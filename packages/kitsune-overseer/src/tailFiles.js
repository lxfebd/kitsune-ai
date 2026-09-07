'use strict';

const fs = require('node:fs');

/**
 * 文件增量尾部读取器。
 *
 * 取代"每次整读文件再取最后 N 行"的轮询式读法：按已读字节偏移（offset）
 * 只读取新增区间，同时处理两类改变文件系统的写入方式：
 *
 * 1. 追加（append）：size 只增不减，正常按 offset 续读；
 * 2. 归零重写（truncate）：某些工具会清空文件重写（如 `> file` 重定向），
 *    此时 size 回落到旧 offset 之下 —— 判定为 truncated，重置偏移，
 *    下一次读取会把重写后的全部内容当作新增行重新产出。
 *
 * 换行处理：行不以 \n 结尾（写入进行中/半行）时，剩余片段缓存在 carry，
 * 下一次读取拼上新增片段后继续拆行，保证单行跨多次写入不丢不串。
 *
 * 用法：
 *   const tail = new TailFiles();
 *   const { lines, truncated } = await tail.readNewLines(filePath);
 *   // 首次调用自动建立基线（跳过文件已有内容，只记偏移不产出）
 *   // truncated 为 true 时调用方应清空自己的"上一批行"窗口
 */
class TailFiles {
  constructor() {
    /** @type {Map<string, { offset: number, carry: string }>} */
    this._offsets = new Map();
  }

  /**
   * 同步版 readNewLines —— 供调用方在非 async 上下文（如 _check 内的同步读取）使用。
   */
  readNewLinesSync(filePath) {
    let rec = this._offsets.get(filePath);
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      if (rec) this._offsets.delete(filePath);
      return { lines: [], truncated: true };
    }

    const size = stat.size;

    if (!rec) {
      this._offsets.set(filePath, { offset: size, carry: '' });
      return { lines: [], truncated: false };
    }

    if (size < rec.offset) {
      this._offsets.set(filePath, { offset: 0, carry: '' });
      return { lines: [], truncated: true };
    }

    if (size === rec.offset) {
      return { lines: [], truncated: false };
    }

    const buf = Buffer.alloc(size - rec.offset);
    let total = 0;
    const fh = fs.openSync(filePath, 'r');
    try {
      while (total < buf.length) {
        const bytesRead = fs.readSync(fh, buf, total, buf.length - total, rec.offset + total);
        if (bytesRead === 0) break;
        total += bytesRead;
      }
    } finally {
      fs.closeSync(fh);
    }

    const text = rec.carry + buf.toString('utf8', 0, total);
    const next = { offset: rec.offset + total, carry: '' };

    const lines = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') {
        let line = text.slice(start, i);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        lines.push(line);
        start = i + 1;
      }
    }
    if (start < text.length) {
      next.carry = text.slice(start);
    }

    this._offsets.set(filePath, next);
    return { lines, truncated: false };
  }

  /**
   * 读取 filePath 的新增行。
   * @param {string} filePath
   * @returns {Promise<{ lines: string[], truncated: boolean }>}
   *   lines —— 完整行数组（已去除 \n / \r\n）
   *   truncated —— 文件被归零重写过（调用方应重置行窗口）
   */
  async readNewLines(filePath) {
    let rec = this._offsets.get(filePath);
    let stat;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      // 文件不存在或不可读：清掉记录，当作"之后新建从头基线"处理
      if (rec) this._offsets.delete(filePath);
      return { lines: [], truncated: true };
    }

    const size = stat.size;

    // 首次见到该文件：只记基线，跳过已有内容
    if (!rec) {
      this._offsets.set(filePath, { offset: size, carry: '' });
      return { lines: [], truncated: false };
    }

    // 归零重写：size 回落，重置偏移，下次读取产出重写后的全部内容
    if (size < rec.offset) {
      this._offsets.set(filePath, { offset: 0, carry: '' });
      return { lines: [], truncated: true };
    }

    // 无新增
    if (size === rec.offset) {
      return { lines: [], truncated: false };
    }

    // 只读新增区间 [rec.offset, size)
    const buf = Buffer.alloc(size - rec.offset);
    const fh = await fs.promises.open(filePath, 'r');
    let total = 0;
    try {
      // 写入中的文件可能在 stat 之后又被追加，read 返回 0 即当前 EOF，提前收尾
      while (total < buf.length) {
        const { bytesRead } = await fh.read(buf, total, buf.length - total, rec.offset + total);
        if (bytesRead === 0) break;
        total += bytesRead;
      }
    } finally {
      await fh.close();
    }

    const text = rec.carry + buf.toString('utf8', 0, total);
    const next = { offset: rec.offset + total, carry: '' };

    // 按行拆分，最后未以 \n 结尾的片段留作 carry
    const lines = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') {
        let line = text.slice(start, i);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        lines.push(line);
        start = i + 1;
      }
    }
    if (start < text.length) {
      next.carry = text.slice(start);
    }

    this._offsets.set(filePath, next);
    return { lines, truncated: false };
  }
}

module.exports = { TailFiles };