const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class DarkzSEOAdapter {
  constructor(options = {}) {
    this.spawnProcess = options.spawnProcess || spawn;
    this.python = options.python || process.env.DARKZSEO_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    this.scriptPath = options.scriptPath || this.resolveScriptPath();
    this.timeoutMs = Number(options.timeoutMs || process.env.DARKZSEO_TIMEOUT_MS || 30000);
    this.maxOutputBytes = Number(options.maxOutputBytes || 2 * 1024 * 1024);
  }

  resolveScriptPath() {
    if (process.env.DARKZSEO_PATH) return path.resolve(process.env.DARKZSEO_PATH);
    const siblingCheckout = path.resolve(__dirname, '..', '..', '..', 'darkzseo', 'darkzseo.py');
    return fs.existsSync(siblingCheckout) ? siblingCheckout : null;
  }

  command() {
    const target = this.scriptPath ? [this.scriptPath] : ['-m', 'darkzseo'];
    return {
      executable: this.python,
      args: [...target, '--mode', 'content', '--input-json', '-', '--json-stdout', '--no-html', '--fail-on', 'none']
    };
  }

  childEnvironment() {
    const allowed = [
      'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP',
      'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PYTHONPATH', 'VIRTUAL_ENV'
    ];
    const environment = { PYTHONUTF8: '1' };
    for (const key of allowed) {
      if (process.env[key] !== undefined) environment[key] = process.env[key];
    }
    return environment;
  }

  async audit(contentPackage) {
    const command = this.command();
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess(command.executable, command.args, {
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: this.childEnvironment()
      });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(value);
      };
      const timer = setTimeout(() => {
        child.kill();
        const error = new Error(`DarkzSEO timed out after ${this.timeoutMs}ms`);
        error.code = 'DARKZSEO_TIMEOUT';
        finish(reject, error);
      }, this.timeoutMs);

      child.on('error', error => {
        error.code = error.code === 'ENOENT' ? 'DARKZSEO_UNAVAILABLE' : (error.code || 'DARKZSEO_PROCESS_ERROR');
        finish(reject, error);
      });
      child.stdout.on('data', chunk => {
        stdout += chunk.toString('utf8');
        if (Buffer.byteLength(stdout, 'utf8') > this.maxOutputBytes) {
          child.kill();
          const error = new Error('DarkzSEO returned more output than allowed');
          error.code = 'DARKZSEO_OUTPUT_LIMIT';
          finish(reject, error);
        }
      });
      child.stderr.on('data', chunk => {
        stderr += chunk.toString('utf8');
      });
      child.on('close', code => {
        if (settled) return;
        if (code !== 0) {
          const error = new Error(`DarkzSEO exited with code ${code}${stderr.trim() ? `: ${stderr.trim()}` : ''}`);
          error.code = 'DARKZSEO_FAILED';
          return finish(reject, error);
        }
        try {
          const report = JSON.parse(stdout);
          if (report.schemaVersion !== '1.0' || report.engine?.name !== 'darkzseo' || !Array.isArray(report.findings)) {
            const error = new Error('DarkzSEO returned an unsupported report schema');
            error.code = 'DARKZSEO_SCHEMA_MISMATCH';
            return finish(reject, error);
          }
          return finish(resolve, report);
        } catch (parseError) {
          const error = new Error(`DarkzSEO returned invalid JSON: ${parseError.message}`);
          error.code = 'DARKZSEO_INVALID_JSON';
          return finish(reject, error);
        }
      });

      child.stdin.end(JSON.stringify(contentPackage));
    });
  }
}

module.exports = { DarkzSEOAdapter };
