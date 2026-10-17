"""Single Android delivery pipeline. Every invocation owns a fresh build directory."""
from pathlib import Path
import argparse
import datetime
import os
import re
import shutil
import sys
import uuid
from common import digest, files, ledger, read_json, require_ledger, run, sha, under, write_json
from content_contract import check, resolve_content, validate_bundle
from gates import manifest, media_report, sync_assets, package_ledger
from apk_verify import verify
from storage_guard import exclusive, no_links, preflight, cache_budget

GENERATED={'android/capacitor.settings.gradle','android/app/capacitor.build.gradle','android/local.properties'}
SKIP_ROOT={'.git','node_modules','dist','.next','.vinext','.wrangler','.tmp','.gradle','.gradle-cache','.github-android-home','outputs','work','ios','__pycache__'}


def source_files(root):
    root=Path(root).resolve(strict=True)
    def walk(folder):
        for p in sorted(folder.iterdir()):
            rel=p.relative_to(root).as_posix(); parts=p.relative_to(root).parts
            if parts[0] in SKIP_ROOT or '__pycache__' in parts: continue
            if parts[0]=='android' and ('build' in parts or '.gradle' in parts or 'assets' in parts or 'capacitor-cordova-android-plugins' in parts): continue
            if rel in GENERATED or p.name.startswith('.env') or p.suffix in ('.log','.jks','.keystore','.pyc') or p.name=='tsconfig.tsbuildinfo': continue
            if p.is_symlink() or p.is_junction(): raise ValueError(f'Unexpected source link: {p}')
            if p.is_dir(): yield from walk(p)
            elif p.is_file(): yield p
    return list(walk(root))


def source_ledger(root):
    root=Path(root).resolve(strict=True)
    return {p.relative_to(root).as_posix():{'bytes':p.stat().st_size,'sha256':sha(p)} for p in source_files(root)}


def snapshot(root, stage):
    expected=source_ledger(root)
    stage.mkdir(parents=True,exist_ok=False)
    for relative, record in expected.items():
        src=under(root,relative); dst=under(stage,relative); dst.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(src,dst)
        if sha(dst)!=record['sha256']: raise ValueError(f'Source changed during snapshot: {relative}')
    if source_ledger(root)!=expected: raise ValueError('Source changed during snapshot; retry with a fresh build')
    return expected


def dependency_link(stage, dependencies):
    target=stage/'node_modules'
    if target.exists(): raise ValueError('Dependency target already exists')
    if os.name=='nt':
        # A dedicated junction is the sole allowed external link in stage. Never
        # recurse into it for copying, cleanup or source hashing.
        result=__import__('subprocess').run(['powershell.exe','-NoProfile','-NonInteractive','-Command',
            "New-Item -ItemType Junction -Path $env:MW_DEP_LINK -Target $env:MW_DEP_TARGET | Out-Null"],
            env={**os.environ,'MW_DEP_LINK':str(target),'MW_DEP_TARGET':str(dependencies)},capture_output=True)
        if result.returncode: raise RuntimeError(result.stderr.decode(errors='replace'))
    else: target.symlink_to(dependencies,target_is_directory=True)
    if target.resolve()!=dependencies.resolve(): raise ValueError('Dependency link verification failed')


def apply_private(stage, bundle_path):
    bundle=validate_bundle(bundle_path)
    expected=resolve_content(read_json(stage/'config/public-content.json'),bundle)
    for row in bundle['files']:
        source=under(bundle_path.parent/'files',row['path']); dest=under(stage,row['path'])
        dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
    write_json(stage/'data/emotes.json',expected['emotes'])
    write_json(stage/'data/nfc-card-registry.json',expected['registry'])
    write_json(stage/'public/skill-cards/manifest.json',expected['artManifest'])


def publish(apk, verification, delivery):
    """Only a freshly hashed, accepted artifact can acquire the delivery name."""
    if not verification.get('passed') or sha(apk)!=verification.get('sha256'):
        raise ValueError('Unverified or changed APK cannot enter delivery')
    delivery=Path(delivery)
    if delivery.exists(): raise ValueError('Never overwrite a previous delivery')
    pending=delivery.with_name('delivery-pending')
    pending.mkdir(exist_ok=False)
    target=pending/'mahjong-wushuang.apk';shutil.copy2(apk,target)
    if sha(target)!=verification['sha256']: raise ValueError('Delivery copy integrity failure')
    write_json(pending/'verification.json',verification)
    pending.rename(delivery)


def version_gate(code, minimum, validation=False):
    if code < minimum or (code == minimum and not validation):
        raise ValueError('Validation code cannot be older; delivery requires a newer versionCode. Use --validation explicitly for verification only.')


def _build(source, config_path, profile, validation=False):
    if sys.version_info < (3,12): raise RuntimeError('Python 3.12+ required (safe Windows junction handling)')
    source=Path(source).resolve(strict=True); config_path=Path(config_path).resolve(strict=True)
    config=local_config(config_path)
    required={'buildRoot','cinematicCache','certificateSha256','minimumVersionCode'}
    if required-config.keys(): raise ValueError(f'Missing local config fields: {sorted(required-config.keys())}')
    if not re.fullmatch(r'[a-fA-F0-9]{64}',config['certificateSha256']): raise ValueError('certificateSha256 must be a full SHA-256 fingerprint')
    allowed={'buildRoot','node','javaHome','androidSdk','androidUserHome','ffmpeg','cinematicCache','privateBundle','certificateSha256','minimumVersionCode','jdkJavaOptions'}
    if config.keys()-allowed: raise ValueError(f'Unknown config keys: {sorted(config.keys()-allowed)}')
    if profile=='public' and config.get('privateBundle'): raise ValueError('Public config must not contain privateBundle')
    build_root=no_links(Path(config['buildRoot']))
    if build_root==source or build_root.is_relative_to(source) or source.is_relative_to(build_root):
        raise ValueError('Build root must be outside the source tree and not its ancestor')
    build_root.mkdir(parents=True,exist_ok=True)
    if build_root.is_symlink() or build_root.is_junction(): raise ValueError('Build root cannot be a link')
    source_bytes=sum(p.stat().st_size for p in source_files(source))
    private_bytes=sum(f['bytes'] for f in validate_bundle(config['privateBundle'])['files']) if profile=='private' else 0
    space=preflight(build_root,source_bytes,private_bytes)
    space['cache']=cache_budget(config['cinematicCache'])
    run_root=build_root/(datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+profile+'-'+uuid.uuid4().hex[:8])
    run_root.mkdir(exist_ok=False)
    write_json(run_root/'owner.json',{'tool':'mahjong-android-build','schemaVersion':1,'source':str(source)})
    report={'schemaVersion':1,'passed':False,'profile':profile,'purpose':'validation' if validation else 'delivery','runRoot':str(run_root),'space':space,'steps':[]}
    reports=run_root/'reports'; reports.mkdir()
    print(f'BUILD_DIRECTORY={run_root}',flush=True)
    try:
        env=os.environ.copy();env['PYTHONUTF8']='1'
        node=str(Path(config.get('node') or shutil.which('node')).resolve(strict=True))
        java=Path(config.get('javaHome') or env.get('JAVA_HOME','')).resolve(strict=True)
        sdk=Path(config.get('androidSdk') or env.get('ANDROID_HOME') or env.get('ANDROID_SDK_ROOT','')).resolve(strict=True)
        ffmpeg=str(Path(config.get('ffmpeg') or shutil.which('ffmpeg')).resolve(strict=True))
        env.update(JAVA_HOME=str(java),ANDROID_HOME=str(sdk),ANDROID_SDK_ROOT=str(sdk))
        if config.get('androidUserHome'): env['ANDROID_USER_HOME']=config['androidUserHome']
        if 'jdkJavaOptions' in config: env['JDK_JAVA_OPTIONS']=config['jdkJavaOptions']
        env['PATH']=str(java/'bin')+os.pathsep+str(Path(node).parent)+os.pathsep+env.get('PATH','')
        bt=sorted([p for p in (sdk/'build-tools').iterdir() if re.fullmatch(r'\d+\.\d+\.\d+',p.name)],key=lambda p:tuple(map(int,p.name.split('.'))))[-1]
        tools_report={}
        for name,argv in [('node',[node,'--version']),('java',[java/'bin/java','-version']),('ffmpeg',[ffmpeg,'-version'])]:
            out,err=run(argv,source,reports/('preflight-'+name),env=env,timeout=30)
            executable=Path(argv[0]); executable=executable.with_suffix('.exe') if os.name=='nt' and not executable.suffix else executable
            lines=(out or err).splitlines()
            version=next((line for line in lines if re.match(r'^(java|openjdk) version ',line)),lines[0]) if name=='java' else lines[0]
            tools_report[name]={'version':version,'path':str(executable),'sha256':sha(executable)}
        if not re.search(r'\bversion "21[.\-\"]',tools_report['java']['version']): raise ValueError('JDK 21 is required by this Android project')
        run([node,'--input-type=module','-e',"import {registerHooks} from 'node:module'; if(typeof registerHooks!=='function') process.exit(1)"],source,reports/'node-api',env=env,timeout=30)
        for name in ('aapt.exe','apksigner.bat','zipalign.exe','dexdump.exe') if os.name=='nt' else ('aapt','apksigner','zipalign','dexdump'):
            tools_report[name]={'path':str(bt/name),'sha256':sha(bt/name)}
        tools_report['apksigner.jar']={'path':str(bt/'lib/apksigner.jar'),'sha256':sha(bt/'lib/apksigner.jar')}
        tools_report['python']={'path':sys.executable,'version':sys.version,'sha256':sha(sys.executable)}
        dependencies=(source/'node_modules').resolve(strict=True)
        # Match the installed dependency lock to the current source lock before
        # sharing an existing installation. Record both, fail on stale installs.
        installed=dependencies/'.pnpm/lock.yaml'
        if sha(installed)!=sha(source/'pnpm-lock.yaml'): raise ValueError('Installed dependencies do not match pnpm-lock.yaml; run pnpm install --frozen-lockfile')
        check(source,'public')
        stage=run_root/'stage'
        input_files=snapshot(source,stage)
        report['sourceSnapshotSha256']=digest(input_files)
        write_json(run_root/'input-manifest.json',{'source':str(source),'files':input_files,'snapshotSha256':digest(input_files)})
        bundle_path=None
        if profile=='private':
            if not config.get('privateBundle'): raise ValueError('Private profile requires privateBundle')
            original=Path(config['privateBundle']).resolve(strict=True);validate_bundle(original)
            bundle_dir=run_root/'private-input';bundle_dir.mkdir()
            bundle_path=bundle_dir/'bundle.json';shutil.copy2(original,bundle_path)
            for row in read_json(original)['files']:
                dst=bundle_dir/'files'/row['path'];dst.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(under(original.parent/'files',row['path']),dst)
            validate_bundle(bundle_path)
            apply_private(stage,bundle_path)
        package=read_json(stage/'package.json');base_version=package['version']
        gradle=(stage/'android/app/build.gradle').read_text(encoding='utf8')
        version_match=re.search(r'versionName\s+"([^"]+)"',gradle);code_match=re.search(r'versionCode\s+(\d+)',gradle)
        if not version_match or not code_match or version_match[1]!=base_version or base_version.endswith('-private'): raise ValueError('Source package/Android version mismatch')
        code=int(code_match[1])
        version_gate(code,int(config['minimumVersionCode']),validation)
        version=base_version+('-private' if profile=='private' else '')+('-validation' if validation else '')
        if profile=='private' or validation:
            package['version']=version;write_json(stage/'package.json',package)
            (stage/'android/app/build.gradle').write_text(gradle.replace(f'versionName "{base_version}"',f'versionName "{version}"'),encoding='utf8')
        report['versionName']=version;report['versionCode']=code
        immutable=source_ledger(stage)
        dependency_link(stage,dependencies)
        policy=read_json(stage/f'config/build-profiles/{profile}.json')
        verification_config={**policy,'buildTools':str(bt),'certificateSha256':config['certificateSha256'],
                             'versionName':version,'versionCode':code}
        write_json(reports/'verification-config.json',verification_config)
        inputs={'source':digest(immutable),'config':digest(config),'profile':profile,'purpose':report['purpose'],'policy':digest(policy),
                'tools':tools_report,'bundle':sha(bundle_path) if bundle_path else None,'installedLock':sha(installed)}
        write_json(reports/'build-inputs.json',inputs)
        context=digest(inputs)
        # Vinext otherwise picks a random UUID and embeds it in client chunks,
        # making identical inputs produce different asset names on every run.
        def step(name,argv,expected=(),timeout=900,cwd=stage):
            print(f'STEP {name}',flush=True)
            run(argv,cwd,reports/name,env=env,timeout=timeout,expected=expected)
            record={'name':name,'inputContextSha256':context,'processReportSha256':sha(reports/(name+'.json')),
                    'outputs':{str(p):sha(p) for p in expected}}
            report['steps'].append(record)
            write_json(run_root/'build-report.json',report)
        core=reports/'core/results.json'
        step('core-tests',[node,'scripts/test-core.mjs','--report',core],[core])
        if not read_json(core)['passed']: raise ValueError('Core summary not successful')
        contract=reports/'content-contract.json'
        argv=[sys.executable,'tools/build/content_contract.py','--root',stage,'--profile',profile,'--report',contract]
        if bundle_path: argv+=['--bundle',bundle_path]
        step('content-contract',argv,[contract])
        step('build-fault-tests',[sys.executable,'-m','unittest','discover','-s','tests/build','-p','test_*.py'],timeout=240)
        step('types',[node,'node_modules/typescript/bin/tsc','--noEmit'])
        step('web',[node,'node_modules/vinext/dist/cli.js','build'],[stage/'dist/client/index.html'])
        step('prepare',[node,'scripts/prepare-package-assets.mjs'])
        png=reports/'png-lossless.json'
        step('png',[sys.executable,'tools/packaging/lossless_png.py','--root','dist/client','--report',png],[png],timeout=900)
        cinematic=reports/'cinematic-compression.json'
        step('cinematics',[sys.executable,'tools/packaging/compress_cinematics.py','--ffmpeg',ffmpeg,'--cache',config['cinematicCache'],'--report',cinematic],[cinematic],timeout=7200)
        sys.path.insert(0,str(stage/'tools/packaging'))
        from compress_cinematics import PROFILE, cache_lock
        web=stage/'dist/client'
        encoder=tools_report['ffmpeg']['version']
        media_report(web,stage/'public',cinematic,PROFILE,encoder)
        png_report=read_json(png)
        for row in png_report['files']:
            if sha(under(web,row['file']))!=row['packageSha256']: raise ValueError('Stale PNG report')
        step('manifest',[node,'scripts/build-offline-manifest.mjs'],[web/'precache-manifest.json'])
        media_report(web,stage/'public',cinematic,PROFILE,encoder)
        web_ledger=manifest(web);write_json(reports/'web-ledger.json',web_ledger)
        step('android-sync',[node,'scripts/capacitor-cli.cjs','sync','android'])
        require_ledger(web,web_ledger)
        native=stage/'android/app/src/main/assets/public'
        native_ledger=sync_assets(web_ledger,native)
        apk_ledger=package_ledger(native_ledger);write_json(reports/'apk-web-ledger.json',apk_ledger)
        apk=stage/'android/app/build/outputs/apk/debug/app-debug.apk'
        gradlew=stage/'android'/('gradlew.bat' if os.name=='nt' else 'gradlew')
        # Capacitor projects live under the shared dependency junction. Their
        # Gradle output is shared too, so one build must not clean another's files.
        print('STEP native-dependency-lock',flush=True)
        with cache_lock(dependencies/'.mahjong-native-build.lock',timeout=1800):
            step('android-clean-build',[gradlew,'clean',':app:assembleDebug','--no-daemon','--console=plain'],[apk],timeout=1800,cwd=stage/'android')
        require_ledger(web,web_ledger);require_ledger(native,native_ledger)
        media_report(web,stage/'public',cinematic,PROFILE,encoder)
        if source_ledger(stage)!=immutable: raise ValueError('Frozen stage source changed during build')
        if sha(installed)!=inputs['installedLock']: raise ValueError('Dependency installation changed during build')
        verification=verify(apk,verification_config,apk_ledger,reports/'apk-verification.json',env)
        report['verification']=verification
        report['counts']={'precacheEntries':len(read_json(web/'precache-manifest.json')['assets']),
                          'webFiles':len(package_ledger(web_ledger)),'webBuildMetadataFiles':len(web_ledger)-len(package_ledger(web_ledger)),
                          'apkWebFiles':len(apk_ledger)}
        report['steps'].append({'name':'apk-verification','inputContextSha256':context,'reportSha256':sha(reports/'apk-verification.json'),
                                'webLedgerSha256':sha(reports/'web-ledger.json'),'apkLedgerSha256':sha(reports/'apk-web-ledger.json')})
        publish(apk,verification,run_root/'delivery')
        report['passed']=True
        print(f'VERIFIED_APK={run_root / "delivery/mahjong-wushuang.apk"}',flush=True)
    except BaseException as error:
        report['error']=str(error) or type(error).__name__
        raise
    finally:
        write_json(run_root/'build-report.json',report)
    return report


def local_config(path):
    path=Path(path).resolve(strict=True)
    config=read_json(path)
    for key in ('buildRoot','node','javaHome','androidSdk','androidUserHome','ffmpeg','cinematicCache','privateBundle'):
        if config.get(key):
            value=Path(config[key])
            config[key]=os.path.abspath(path.parent/value) if not value.is_absolute() else str(value)
    return config


def build(source, config_path, profile, validation=False):
    source=Path(source).resolve(strict=True)
    config=local_config(config_path)
    root=no_links(config['buildRoot'])
    if root==source or root.is_relative_to(source) or source.is_relative_to(root):
        raise ValueError('Build root must be separate from source')
    root.mkdir(parents=True,exist_ok=True)
    with exclusive(root/'.build.lock'):
        return _build(source,config_path,profile,validation)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',required=True,help='Local environment JSON (keep outside public source)')
    parser.add_argument('--profile',required=True,choices=['public','private'])
    parser.add_argument('--validation',action='store_true',help='Reuse current code; full checks; never archive as a delivered release')
    args=parser.parse_args()
    build(Path(__file__).resolve().parents[2],args.config,args.profile,args.validation)
