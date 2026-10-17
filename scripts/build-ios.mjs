import { spawnSync } from 'node:child_process';

// This command builds a simulator app only; it does not sign, upload or distribute.
if (process.platform !== 'darwin') {
  console.error('iOS compilation requires macOS and Xcode. Run pnpm ios:prepare / ios:check here, then build on a Mac.');
  process.exit(1);
}
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('xcodebuild', ['-version']);
run('swift', ['test', '--package-path', 'ios/NativeTransport']);
run('xcodebuild', [
  '-project', 'ios/App/App.xcodeproj', '-scheme', 'App',
  '-configuration', 'Debug', '-sdk', 'iphonesimulator',
  '-destination', 'generic/platform=iOS Simulator',
  '-derivedDataPath', 'ios/DerivedData',
  'CODE_SIGNING_ALLOWED=NO', 'build',
]);

