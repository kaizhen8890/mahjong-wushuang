import { fileURLToPath } from 'node:url';
import { runPythonTool } from './python-tool.mjs';
runPythonTool(fileURLToPath(new URL('../tools/build/apk_verify.py', import.meta.url)), process.argv.slice(2));
