import { spawn, spawnSync } from 'node:child_process';

export function runPythonTool(script, args) {
  const child = spawn(process.env.MAHJONG_PYTHON || 'python', [script, ...args], {
    stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1' },
    detached: process.platform !== 'win32',
  });
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    if (!child.pid) return;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      // Let Python's interrupt handler stop the currently running native group
      // and save its failure report before it exits.
      child.kill('SIGINT');
    }
  };
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', (code, signal) => {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    process.exitCode = cancelled || signal ? 1 : (code ?? 1);
  });
}
