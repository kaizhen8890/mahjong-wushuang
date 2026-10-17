"""Failure injection for the actual build gates (no Android SDK required)."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/build'))
from common import digest, ledger, read_json, require_ledger, run, sha, under, write_json
from apk_verify import structure, web_assets, size_report
from android_build import publish, snapshot
from content_contract import check, resolve_content, validate_bundle
from gates import manifest, media_report, sync_assets, package_ledger


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='麻将 build ')
        self.p=Path(self.tmp.name)
    def tearDown(self): self.tmp.cleanup()
    def zip(self, entries=None, prefix=b''):
        p=self.p/'test.apk'
        p.write_bytes(prefix)
        with zipfile.ZipFile(p,'a') as z:
            for name,data in (entries or [('assets/public/index.html',b'web')]): z.writestr(name,data)
        return p
    def test_stderr_is_diagnostic_and_real_failure_wins(self):
        out,err=run([sys.executable,'-c',"import sys;print('ok');sys.stderr.write('diagnostic')"],self.p,self.p/'good')
        self.assertIn('diagnostic',err)
        with self.assertRaises(RuntimeError):
            run([sys.executable,'-c',"print('success Verifies');raise SystemExit(7)"],self.p,self.p/'bad')
        self.assertEqual(read_json(self.p/'bad.json')['exitCode'],7)
        self.assertFalse(read_json(self.p/'bad.json')['passed'])
    def test_missing_output_and_executable_fail(self):
        with self.assertRaises(RuntimeError): run([sys.executable,'-c','pass'],self.p,self.p/'missing',expected=[self.p/'absent'])
        with self.assertRaises(OSError): run([str(self.p/'no-such-tool')],self.p,self.p/'launch')
        self.assertFalse(read_json(self.p/'launch.json')['passed'])
    def test_timeout_is_failure(self):
        with self.assertRaises(subprocess.TimeoutExpired): run([sys.executable,'-c','import time;time.sleep(10)'],self.p,self.p/'timeout',timeout=.1)
        self.assertTrue(read_json(self.p/'timeout.json')['interruptedOrTimedOut'])
    @unittest.skipUnless(os.name=='nt','Windows batch quoting')
    def test_batch_path_with_spaces_and_chinese(self):
        p=self.p/'tool 中文.cmd';p.write_text('@echo off\necho diagnostic 1>&2\nexit /b 0\n')
        _,err=run([p,'two words','中文'],self.p,self.p/'batch')
        self.assertIn('diagnostic',err)
    def test_valid_zip_and_legal_signing_block(self):
        p=self.zip();self.assertEqual(structure(p)['unaccountedBytes'],0)
        data=p.read_bytes();end=data.rfind(b'PK\x05\x06');cd=struct.unpack_from('<I',data,end+16)[0]
        # A well-formed block is accounted for structurally; cryptographic
        # acceptance is deliberately a separate real apksigner check.
        pair=struct.pack('<QI',8,0x42726577)+b'\0'*4
        length=24+len(pair);block=struct.pack('<Q',length)+pair+struct.pack('<Q',length)+b'APK Sig Block 42'
        edited=bytearray(data[:cd]+block+data[cd:]);struct.pack_into('<I',edited,end+len(block)+16,cd+len(block))
        p.write_bytes(edited)
        self.assertEqual(structure(p)['signingBlockBytes'],len(block))
    def test_trailing_data_duplicate_and_unaccounted_region_rejected(self):
        p=self.zip();p.write_bytes(p.read_bytes()+b'junk')
        with self.assertRaisesRegex(ValueError,'Trailing'): structure(p)
        p.unlink();p=self.zip([('assets/public/index.html',b'a'),('assets/public/index.html',b'b')])
        with self.assertRaisesRegex(ValueError,'Duplicate'): structure(p)
        p.unlink();p=self.zip(prefix=b'X'*300000)
        with self.assertRaisesRegex(ValueError,'Unaccounted'): structure(p)
    def test_local_header_mismatch_rejected(self):
        p=self.zip();data=bytearray(p.read_bytes());data[30]=ord('X');p.write_bytes(data)
        with self.assertRaisesRegex(ValueError,'path mismatch'): structure(p)
    def test_missing_extra_and_one_byte_changed_assets(self):
        p=self.zip();expected={'index.html':{'bytes':3,'sha256':hashlib.sha256(b'web').hexdigest()}}
        self.assertEqual(web_assets(p,expected)['files'],1)
        for bad in ({}, {**expected,'lost.png':expected['index.html']},{'index.html':{'bytes':3,'sha256':hashlib.sha256(b'Web').hexdigest()}}):
            with self.assertRaisesRegex(ValueError,'resource mismatch'): web_assets(p,bad)
    def test_size_budgets_and_retirement(self):
        p=self.zip()
        with self.assertRaises(ValueError): size_report(p,{'maxApkBytes':1})
        with self.assertRaises(ValueError): size_report(p,{'maxApkBytes':99999,'baselineBytes':1,'maxGrowthRatio':.05})
        # Decreased entry counts have no artificial lower bound.
        self.assertEqual(web_assets(p,{'index.html':{'bytes':3,'sha256':hashlib.sha256(b'web').hexdigest()}})['files'],1)
    def media_fixture(self):
        web=self.p/'dist/client';source=self.p/'public'
        for root in (web,source):
            (root/'cinematics').mkdir(parents=True);(root/'cinematics/a.mp4').write_bytes(b'movie')
        row={'file':'cinematics/a.mp4','sourceBytes':5,'packageBytes':5,'sourceSha256':sha(source/'cinematics/a.mp4'),'packageSha256':sha(web/'cinematics/a.mp4'),'fps':30,'ssim':1}
        report=self.p/'media.json';write_json(report,{'profile':{'v':1},'encoder':'ffmpeg test','files':[row]})
        return web,source,report
    def test_missing_stale_and_incomplete_compression_report(self):
        web,source,report=self.media_fixture()
        self.assertEqual(media_report(web,source,report,{'v':1},'ffmpeg test')['files'],1)
        for profile,encoder in [({'v':2},'ffmpeg test'),({'v':1},'different ffmpeg')]:
            with self.assertRaises(ValueError):media_report(web,source,report,profile,encoder)
        (web/'cinematics/a.mp4').write_bytes(b'altered')
        with self.assertRaises(ValueError):media_report(web,source,report,{'v':1},'ffmpeg test')
        (web/'cinematics/a.mp4').write_bytes(b'movie');(web/'cinematics/b.mp4').write_bytes(b'new')
        with self.assertRaises(ValueError):media_report(web,source,report,{'v':1},'ffmpeg test')
        report.unlink()
        with self.assertRaises(FileNotFoundError):media_report(web,source,report,{'v':1},'ffmpeg test')
    def test_manifest_and_sync_freshness(self):
        web=self.p/'web';web.mkdir();(web/'index.html').write_text('index')
        write_json(web/'precache-manifest.json',{'assets':['/index.html']});expected=manifest(web)
        native=self.p/'native';shutil.copytree(web,native)
        for n in ('cordova.js','cordova_plugins.js'):(native/n).touch()
        native_expected=sync_assets(expected,native)
        (native/'index.html').write_text('stale')
        with self.assertRaises(ValueError):sync_assets(expected,native)
        with self.assertRaises(ValueError):require_ledger(native,native_expected)
        (web/'index.html').write_text('after manifest')
        with self.assertRaises(ValueError):require_ledger(web,expected)
        (web/'new.png').write_bytes(b'new')
        with self.assertRaises(ValueError):manifest(web)
    def test_only_known_build_metadata_is_excluded(self):
        records={'.assetsignore':{},'.vite/manifest.json':{},'index.html':{}}
        self.assertEqual(package_ledger(records),{'index.html':{}})
        with self.assertRaises(ValueError):package_ledger({**records,'.unexpected-private-data':{}})
    @unittest.skipUnless(os.name=='nt','Windows directory junction boundary')
    def test_linked_asset_cannot_escape_root(self):
        outside=self.p/'outside';outside.mkdir();(outside/'keep.txt').write_text('keep')
        generated=self.p/'generated';generated.mkdir();link=generated/'linked'
        result=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',
            'New-Item -ItemType Junction -Path $env:MW_TEST_LINK -Target $env:MW_TEST_TARGET | Out-Null'],
            env={**os.environ,'MW_TEST_LINK':str(link),'MW_TEST_TARGET':str(outside)},capture_output=True)
        self.assertEqual(result.returncode,0)
        try:
            with self.assertRaises(ValueError):under(generated,'linked/keep.txt')
            with self.assertRaises(ValueError):ledger(generated)
            self.assertEqual((outside/'keep.txt').read_text(),'keep')
        finally:
            # Remove only this test-owned junction, never its target directory.
            os.rmdir(link)
    def test_failed_delivery_never_published_and_old_delivery_preserved(self):
        apk=self.zip();delivery=self.p/'delivery'
        with self.assertRaises(ValueError):publish(apk,{'passed':False,'sha256':sha(apk)},delivery)
        self.assertFalse(delivery.exists())
        valid={'passed':True,'sha256':sha(apk)};publish(apk,valid,delivery)
        old=sha(delivery/'mahjong-wushuang.apk')
        apk.write_bytes(apk.read_bytes()+b'changed')
        with self.assertRaises(ValueError):publish(apk,valid,self.p/'other-delivery')
        with self.assertRaises(ValueError):publish(apk,{'passed':True,'sha256':sha(apk)},delivery)
        self.assertEqual(sha(delivery/'mahjong-wushuang.apk'),old)
    def test_paths_and_existing_stage_are_rejected(self):
        for p in ('../outside','/absolute','x/../../y','C:/outside','a\\b'):
            with self.assertRaises(ValueError):under(self.p,p)
        source=self.p/'source';source.mkdir();(source/'x').write_text('x');stage=self.p/'stage'
        snapshot(source,stage)
        with self.assertRaises(FileExistsError):snapshot(source,stage)
    def content_fixture(self):
        root=self.p/'source';(root/'public/audio').mkdir(parents=True)
        for name in ('riichi-cue.wav','win-reveal.mp3','win-thunder.mp3'):(root/'public/audio'/name).write_bytes(b'sound')
        emotes=[]
        (root/'public/emotes').mkdir()
        for e in emotes:(root/('public'+e['src'])).write_text('<svg/>')
        registry={'cards':[{'code':'MW-005','action':'music','skillId':40}]};art={'cards':[]}
        write_json(root/'data/emotes.json',emotes);write_json(root/'data/nfc-card-registry.json',registry)
        write_json(root/'data/riichi-music.json',[]);write_json(root/'public/skill-cards/manifest.json',art)
        policy={'emotes':emotes,'registry':registry,'artManifest':art,'publicFiles':ledger(root/'public')}
        write_json(root/'config/public-content.json',policy)
        return root,policy
    def test_empty_public_emotes_and_orphan_ledger_entries(self):
        root,policy=self.content_fixture()
        self.assertEqual(check(root,'public')['emotes'],0)
        orphan=root/'public/emotes/unused.svg';orphan.write_text('<svg/>')
        # Even an asset added to the approved file ledger must have a catalog reference.
        policy['publicFiles']=ledger(root/'public');write_json(root/'config/public-content.json',policy)
        with self.assertRaisesRegex(ValueError,'orphan'):check(root,'public')
    def test_private_emotes_overlay_empty_public_catalog(self):
        root,policy=self.content_fixture()
        bundle=self.p/'bundle';image=bundle/'files/public/emotes/2000.png'
        image.parent.mkdir(parents=True);image.write_bytes(b'private-image')
        b={'schemaVersion':1,'profile':'private','emoteMode':'replace',
           'emotes':[{'id':'2000','label':'Private','src':'/emotes/2000.png'}],
           'files':[{'path':'public/emotes/2000.png','bytes':image.stat().st_size,'sha256':sha(image)}],
           'nfcOverrides':[],'artAdditions':[]}
        write_json(bundle/'bundle.json',b)
        from android_build import apply_private
        apply_private(root,bundle/'bundle.json')
        self.assertEqual(check(root,'private',bundle/'bundle.json')['emotes'],1)
        with self.assertRaises(ValueError):check(root,'public')
    def test_public_private_contracts_detect_leak_missing_media_and_identity_drift(self):
        root,policy=self.content_fixture();self.assertTrue(check(root,'public')['passed'])
        leak=root/'public/audio/private.mp3';leak.write_bytes(b'private')
        with self.assertRaises(ValueError):check(root,'public')
        leak.unlink()
        bundle=self.p/'bundle';(bundle/'files/public/audio/nfc').mkdir(parents=True)
        music=bundle/'files/public/audio/nfc/music.mp3';music.write_bytes(b'private')
        row={'path':'public/audio/nfc/music.mp3','bytes':7,'sha256':sha(music)}
        b={'schemaVersion':1,'profile':'private','emoteMode':'replace','emotes':policy['emotes'],'files':[row],
           'nfcOverrides':[{'code':'MW-005','skillId':40,'action':'music','media':{'audioSrc':'/audio/nfc/music.mp3'}}],'artAdditions':[]}
        write_json(bundle/'bundle.json',b);resolved=resolve_content(policy,b)
        (root/'public/audio/nfc').mkdir();shutil.copy2(music,root/'public/audio/nfc/music.mp3')
        write_json(root/'data/nfc-card-registry.json',resolved['registry'])
        self.assertTrue(check(root,'private',bundle/'bundle.json')['passed'])
        with self.assertRaises(ValueError):check(root,'public',bundle/'bundle.json')
        (root/'public/audio/nfc/music.mp3').unlink()
        with self.assertRaises(ValueError):check(root,'private',bundle/'bundle.json')
        music.write_bytes(b'changed')
        with self.assertRaises(ValueError):validate_bundle(bundle/'bundle.json')
        b['nfcOverrides'][0]['skillId']=41
        with self.assertRaises(ValueError):resolve_content(policy,b)
    def test_first_failure_does_not_skip_final_or_render_test(self):
        first=self.p/'first.test.ts';last=self.p/'last.test.ts';render=self.p/'render.test.tsx'
        first.write_text("throw Error('injected first failure');")
        last.write_text("console.log('last executed');")
        render.write_text("console.log('render executed');")
        report=self.p/'suite/result.json'
        result=subprocess.run([shutil.which('node'),'scripts/run-tests.mjs',str(first),str(last),str(render),'--report',str(report)],cwd=ROOT,capture_output=True)
        self.assertEqual(result.returncode,1)
        rows=read_json(report)['results']
        self.assertEqual([r['passed'] for r in rows],[False,True,True]);self.assertEqual(read_json(report)['notExecuted'],[])


if __name__=='__main__':unittest.main()
