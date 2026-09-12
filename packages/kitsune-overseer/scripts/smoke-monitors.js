/* ZCode/Workbuddy monitor 冒烟测试：不依赖 Electron，直接在 Node 里加载并跑一循环 */
const path = require('node:path');
const { ZCodeMonitor } = require('../src/zcodeMonitor');
const { WorkbuddyMonitor } = require('../src/workbuddyMonitor');

const log = (...a) => console.log('[smoke]', ...a);

// 收集发布的事件
const events = [];
const bus = {
  publish: (name, payload) => events.push({ name, payload }),
  subscribe: () => {},
};

const zcode = new ZCodeMonitor({ bus, pollInterval: 120000, watchMode: false, logger: console });
const wb = new WorkbuddyMonitor({ bus, pollInterval: 120000, watchMode: false, logger: console });

async function main() {
  // 相位 1：ZCode
  zcode.start();
  await zcode._check().catch(e => log('zcode._check error:', e.message));
  zcode.stop();

  // 相位 2：Workbuddy
  wb.start();
  await wb._check().catch(e => log('wb._check error:', e.message));
  wb.stop();

  log('== 发布的 bus 事件 ==');
  for (const ev of events) {
    const p = ev.payload;
    console.log(`  [${ev.name}] running=${p.isRunning} activity=${p.activity} signal=${p.detectSignal}${p.lastOutput ? ' output=' + JSON.stringify(String(p.lastOutput).slice(0, 60)) : ''}${p.hasError ? ' ERROR=' + p.errorMessage : ''}`);
  }

  log('== 终态 ==');
  console.log('  zcode:', JSON.stringify(zcode.getStatus()));
  console.log('  wb   :', JSON.stringify(wb.getStatus()));
}

main();