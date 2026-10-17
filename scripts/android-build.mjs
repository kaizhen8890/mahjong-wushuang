import { fileURLToPath } from 'node:url';
import { runPythonTool } from './python-tool.mjs';
runPythonTool(fileURLToPath(new URL('../tools/build/android_build.py', import.meta.url)), process.argv.slice(2));
