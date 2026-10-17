"""Assemble separately rendered tails endings using identical heads common frames."""
import argparse,shutil,json,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--report',required=True);a=p.parse_args();root=Path(a.source);records=[]
for ori in ['landscape','portrait']:
 heads=root/f'heads-{ori}';tails=root/f'tails-{ori}';hm=json.loads((heads/'scene-metadata.json').read_text(encoding='utf-8'));tm=json.loads((tails/'scene-metadata.json').read_text(encoding='utf-8'));assert hm['portrait']==tm['portrait'] and hm['frames']==tm['frames']==330
 for f in range(241,286):assert (tails/'frames'/f'frame-{f:04}.png').exists()
 for f in list(range(1,241))+list(range(286,331)):
  name=f'frame-{f:04}.png';src=heads/'frames'/name;dst=tails/'frames'/name;assert src.exists(),src;shutil.copy2(src,dst)
 records.append({'orientation':ori,'reusedFrames':285,'newOutcomeFrames':45,'total':330})
Path(a.report).write_text(json.dumps(records,indent=2),encoding='utf-8');print(json.dumps(records))
