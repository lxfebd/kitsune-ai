import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { TailFiles } from './tailFiles.js'

describe('TailFiles 增量尾部读取', () => {
  let dir;
  let file;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tailfiles-'));
    file = path.join(dir, 'trace.jsonl');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const tail = () => new TailFiles();

  it('首次调用只建基线，不产出内容', async () => {
    fs.writeFileSync(file, '{"a":1}\n{"a":2}\n');
    const result = await tail().readNewLines(file);
    expect(result).toEqual({ lines: [], truncated: false });
  });

  it('追加行按 offset 增量产出', async () => {
    fs.writeFileSync(file, '{"a":1}\n');
    const t = tail();
    await t.readNewLines(file); // 基线

    fs.appendFileSync(file, '{"a":2}\n{"a":3}\n');
    const result = await t.readNewLines(file);
    expect(result.lines).toEqual(['{"a":2}', '{"a":3}']);
    expect(result.truncated).toBe(false);
  });

  it('无新增时返回空', async () => {
    fs.writeFileSync(file, '{"a":1}\n');
    const t = tail();
    await t.readNewLines(file);
    const result = await t.readNewLines(file);
    expect(result).toEqual({ lines: [], truncated: false });
  });

  it('半行跨多次写入：按 \n 拆行，未完结片段缓冲到下轮', async () => {
    fs.writeFileSync(file, '');
    const t = tail();
    await t.readNewLines(file); // 基线（size 0）

    fs.appendFileSync(file, '{"a":1,"msg":"hel');
    let result = await t.readNewLines(file);
    expect(result.lines).toEqual([]); // 未完整行，缓冲

    fs.appendFileSync(file, 'lo"}\n{"a":2}\n');
    result = await t.readNewLines(file);
    expect(result.lines).toEqual(['{"a":1,"msg":"hello"}', '{"a":2}']);
  });

  it('CRLF 行尾剥掉 \\r', async () => {
    fs.writeFileSync(file, '{"a":1}\r\n');
    const t = tail();
    await t.readNewLines(file);
    fs.appendFileSync(file, '{"a":2}\r\n');
    const result = await t.readNewLines(file);
    expect(result.lines).toEqual(['{"a":2}']);
  });

  it('文件被归零重写（truncate）时标记 truncated 并重置', async () => {
    fs.writeFileSync(file, 'old line 1\nold line 2\n');
    const t = tail();
    await t.readNewLines(file); // 基线在旧内容末尾

    fs.writeFileSync(file, ''); // 清空重写
    let result = await t.readNewLines(file);
    expect(result.truncated).toBe(true); // 检测到归零，偏移重置
    expect(result.lines).toEqual([]);

    fs.writeFileSync(file, 'new line 1\nnew line 2\n');
    result = await t.readNewLines(file);
    expect(result.lines).toEqual(['new line 1', 'new line 2']); // 重写后的全部产出
  });

  it('文件被删除后重建：旧记录清除，新文件从头建基线', async () => {
    fs.writeFileSync(file, '{"a":1}\n');
    const t = tail();
    await t.readNewLines(file);

    fs.rmSync(file);
    let result = await t.readNewLines(file);
    expect(result.truncated).toBe(true); // 不可读 → 清记录

    fs.writeFileSync(file, '{"b":2}\n');
    result = await t.readNewLines(file);
    expect(result).toEqual({ lines: [], truncated: false }); // 重建后从头基线，不产出旧内容

    fs.appendFileSync(file, '{"c":3}\n');
    result = await t.readNewLines(file);
    expect(result.lines).toEqual(['{"c":3}']);
  });

  it('多个文件互不干扰', async () => {
    const fileB = path.join(dir, 'b.jsonl');
    fs.writeFileSync(file, '{"x":1}\n');
    fs.writeFileSync(fileB, '{"y":1}\n');
    const t = tail();
    await t.readNewLines(file);
    await t.readNewLines(fileB);

    fs.appendFileSync(file, '{"x":2}\n');
    fs.appendFileSync(fileB, '{"y":2}\n');
    const [ra, rb] = await Promise.all([
      t.readNewLines(file),
      t.readNewLines(fileB),
    ]);
    expect(ra.lines).toEqual(['{"x":2}']);
    expect(rb.lines).toEqual(['{"y":2}']);
  });
});
