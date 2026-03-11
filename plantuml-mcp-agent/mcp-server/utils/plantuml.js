'use strict';

const { execFile } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const JAR_PATH = process.env.PLANTUML_JAR_PATH
  ? path.resolve(process.env.PLANTUML_JAR_PATH)
  : path.resolve(__dirname, '../../plantuml/plantuml.jar');

const USE_REMOTE = process.env.PLANTUML_USE_REMOTE === 'true';
const REMOTE_URL = (process.env.PLANTUML_REMOTE_URL || 'https://www.plantuml.com/plantuml').replace(/\/$/, '');

/**
 * Encode DSL for plantuml.com remote API using pako + base64url
 */
async function encodeDslForRemote(dsl) {
  const { deflateRaw } = require('pako');
  const compressed = deflateRaw(dsl, { level: 9 });
  // plantuml.com uses a custom base64 encoding table
  const encode64Char = (b) => {
    if (b < 10) return String.fromCharCode(48 + b);
    b -= 10;
    if (b < 26) return String.fromCharCode(65 + b);
    b -= 26;
    if (b < 26) return String.fromCharCode(97 + b);
    b -= 26;
    if (b === 0) return '-';
    if (b === 1) return '_';
    return '?';
  };
  const encode64 = (data) => {
    let r = '';
    for (let i = 0; i < data.length; i += 3) {
      if (i + 2 === data.length) {
        r += encode64Char((data[i] >> 2) & 0x3F);
        r += encode64Char(((data[i] & 0x3) << 4) | ((data[i + 1] >> 4) & 0xF));
        r += encode64Char(((data[i + 1] & 0xF) << 2) & 0x3C);
      } else if (i + 1 === data.length) {
        r += encode64Char((data[i] >> 2) & 0x3F);
        r += encode64Char(((data[i] & 0x3) << 4) & 0x30);
      } else {
        r += encode64Char((data[i] >> 2) & 0x3F);
        r += encode64Char(((data[i] & 0x3) << 4) | ((data[i + 1] >> 4) & 0xF));
        r += encode64Char(((data[i + 1] & 0xF) << 2) | ((data[i + 2] >> 6) & 0x3));
        r += encode64Char(data[i + 2] & 0x3F);
      }
    }
    return r;
  };
  return encode64(compressed);
}

/**
 * Fetch diagram from plantuml.com remote API
 */
async function renderRemote(dsl, format) {
  const fetch = (await import('node-fetch')).default;
  const encoded = await encodeDslForRemote(dsl);
  const url = `${REMOTE_URL}/${format}/${encoded}`;
  const response = await fetch(url, { timeout: 15000 });
  if (!response.ok) {
    throw new Error(`Remote PlantUML returned HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return base64;
}

/**
 * Inject theme directive into DSL after @startuml
 */
function injectTheme(dsl, theme) {
  if (!theme || theme === 'default') return dsl;
  return dsl.replace(/(@startuml[^\n]*\n)/, `$1!theme ${theme}\n`);
}

/**
 * Render diagram using local PlantUML JAR
 */
async function renderLocal(dsl, format, theme) {
  const processedDsl = injectTheme(dsl, theme);
  const tmpDir = os.tmpdir();
  const tmpInput = path.join(tmpDir, `plantuml_${Date.now()}_${Math.random().toString(36).slice(2)}.puml`);
  const tmpOutput = tmpInput.replace('.puml', `.${format}`);

  await fs.writeFile(tmpInput, processedDsl, 'utf8');

  try {
    await execFileAsync('java', [
      '-jar', JAR_PATH,
      `-t${format}`,
      tmpInput
    ], { timeout: 15000 });

    const outputData = await fs.readFile(tmpOutput);
    return outputData.toString('base64');
  } finally {
    await fs.unlink(tmpInput).catch(() => {});
    await fs.unlink(tmpOutput).catch(() => {});
  }
}

/**
 * Check whether the local JAR is available and java is on PATH
 */
async function isLocalAvailable() {
  try {
    await fs.access(JAR_PATH);
    await execFileAsync('java', ['-version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Main render function — tries local JAR first, falls back to remote.
 * @param {string} dsl - PlantUML DSL source
 * @param {string} format - 'png' | 'svg'
 * @param {string} theme - Optional theme name
 * @returns {{ data: string, format: string, mimeType: string }}
 */
async function renderDiagram(dsl, format = 'png', theme = 'default') {
  const mimeType = format === 'svg' ? 'image/svg+xml' : 'image/png';

  if (!USE_REMOTE) {
    const localAvailable = await isLocalAvailable();
    if (localAvailable) {
      try {
        const data = await renderLocal(dsl, format, theme);
        return { data, format, mimeType };
      } catch (err) {
        if (err.message && err.message.includes('Syntax Error')) {
          throw Object.assign(new Error('PlantUML syntax error: ' + err.message), { code: 'SYNTAX_ERROR' });
        }
        // Fall through to remote
        console.warn('Local render failed, attempting remote fallback:', err.message);
      }
    }
  }

  // Remote fallback
  const processedDsl = injectTheme(dsl, theme);
  const data = await renderRemote(processedDsl, format);
  return { data, format, mimeType };
}

/**
 * Validate DSL without rendering — returns syntax errors if any
 */
async function validateDsl(dsl) {
  const tmpDir = os.tmpdir();
  const tmpInput = path.join(tmpDir, `plantuml_validate_${Date.now()}.puml`);

  await fs.writeFile(tmpInput, dsl, 'utf8');
  try {
    const { stdout, stderr } = await execFileAsync('java', [
      '-jar', JAR_PATH,
      '-syntax',
      tmpInput
    ], { timeout: 10000 });

    const output = stdout + stderr;
    const hasError = output.toLowerCase().includes('error') || output.toLowerCase().includes('syntax');
    return {
      valid: !hasError,
      errors: hasError ? output.trim() : null
    };
  } catch (err) {
    return { valid: false, errors: err.message };
  } finally {
    await fs.unlink(tmpInput).catch(() => {});
  }
}

module.exports = { renderDiagram, validateDsl };
