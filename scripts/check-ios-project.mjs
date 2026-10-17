import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// Use the pinned Capacitor CLI's parsers to validate the actual project and plist.
const require = createRequire(import.meta.url);
const cliRequire = createRequire(require.resolve('@capacitor/cli/package.json'));
const xcode = cliRequire('xcode');
const plist = cliRequire('plist');
const project = xcode.project('ios/App/App.xcodeproj/project.pbxproj');
project.parseSync();
const objects = project.hash.project.objects;
const clean = value => String(value).replace(/^"|"$/g, '');
const refs = objects.PBXFileReference;
const sourceIds = Object.values(objects.PBXSourcesBuildPhase).filter(value => value?.files).flatMap(value => value.files.map(file => file.value));
const sourceNames = sourceIds.map(id => clean(refs[objects.PBXBuildFile[id].fileRef].path));
for (const file of ['AppDelegate.swift', 'SceneDelegate.swift', 'MahjongViewController.swift', 'LanRoomPlugin.swift', 'VirtualTableDisplayPlugin.swift', 'FileExportPlugin.swift']) {
  assert(sourceNames.includes(file), `${file} is missing from the App Sources build phase`);
  assert(existsSync(path.join('ios/App/App', file)));
}
for (const item of Object.values(objects.XCBuildConfiguration).filter(value => value?.buildSettings)) {
  if (item.buildSettings.IPHONEOS_DEPLOYMENT_TARGET) assert.equal(clean(item.buildSettings.IPHONEOS_DEPLOYMENT_TARGET), '16.4');
}
const packages = Object.values(objects.XCLocalSwiftPackageReference).filter(value => value?.relativePath);
assert(packages.some(value => clean(value.relativePath) === '../NativeTransport'));
for (const value of packages) assert(existsSync(path.join('ios/App', clean(value.relativePath), 'Package.swift')));
const products = objects.XCSwiftPackageProductDependency;
const frameworks = Object.values(objects.PBXFrameworksBuildPhase).filter(value => value?.files).flatMap(value => value.files);
assert(frameworks.some(file => {
  const product = products[objects.PBXBuildFile[file.value].productRef];
  return product && clean(product.productName) === 'LanTransport';
}), 'Native transport package must be linked, not just listed');

const info = plist.parse(readFileSync('ios/App/App/Info.plist', 'utf8'));
assert(info.NSLocalNetworkUsageDescription?.length > 10);
assert(info.NSBonjourServices.includes('_mws-mahjong._tcp'));
assert(!info.NSAppTransportSecurity?.NSAllowsArbitraryLoads, 'No global ATS bypass');
const controller = readFileSync('ios/App/App/MahjongViewController.swift', 'utf8');
for (const plugin of ['LanRoomPlugin', 'VirtualTableDisplayPlugin', 'FileExportPlugin']) {
  assert(controller.includes(`registerPluginInstance(${plugin}())`));
}
assert(readFileSync('ios/App/App/SceneDelegate.swift', 'utf8').includes('rootViewController = MahjongViewController()'));
assert(readFileSync('ios/App/App/Base.lproj/Main.storyboard', 'utf8').includes('customClass="MahjongViewController"'));
const manifest = JSON.parse(readFileSync('ios/App/App/public/precache-manifest.json', 'utf8'));
for (const asset of manifest.assets) {
  assert(asset.startsWith('/') && !asset.includes('..'));
  assert(existsSync(path.join('ios/App/App/public', asset.slice(1))), `Missing offline asset ${asset}`);
}
const config = JSON.parse(readFileSync('ios/App/App/capacitor.config.json', 'utf8'));
assert.equal(config.appId, 'com.mahjongwushuang.table');
assert.equal(config.webDir, 'dist/client');
const dependencies = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(dependencies.devDependencies['@capacitor/ios'], dependencies.dependencies['@capacitor/core']);
console.log(`PASS iOS project structure, source membership, plugin registration, deployment target, permissions and ${manifest.assets.length} offline resources`);
console.log('This is structural validation only. Swift compilation and iOS runtime behavior require Xcode.');

