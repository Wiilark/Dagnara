const { spawn } = require('child_process');
const path = require('path');

const proc = spawn('npx', ['expo', 'start', '--tunnel', '--port', '8081'], {
  cwd: path.join(__dirname),
  shell: true,
  stdio: 'inherit',
});

proc.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT',  () => proc.kill('SIGINT'));
process.on('SIGTERM', () => proc.kill('SIGTERM'));
