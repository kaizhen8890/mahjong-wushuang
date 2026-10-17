"""Verify the authored coin trajectory independently of Blender and the app."""
import ast,math,json,argparse
from pathlib import Path
from types import SimpleNamespace
p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args()
source=Path(__file__).with_name('build_scene.py');tree=ast.parse(source.read_text(encoding='utf-8'))
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['smooth','pose']]
poses={}
for result in ['heads','tails']:
    env={'math':math,'a':SimpleNamespace(result=result)};exec(compile(ast.Module(body=nodes,type_ignores=[]),str(source),'exec'),env);poses[result]=env['pose']
frames={result:[pose(i/30) for i in range(390)] for result,pose in poses.items()}
assert frames['heads'][:286]==frames['tails'][:286]
angles=[frames['heads'][i][1][0] for i in range(90,286)]
deltas=[b-a for a,b in zip(angles,angles[1:])]
assert min(deltas)>0,'Flight rotation stops or reverses'
seconds=(285-90)/30;assert seconds>=6
end={}
for result,sequence in frames.items():
    rx,ry,rz=sequence[-1][1];normal_z=math.cos(rx)*math.cos(ry)
    assert normal_z>.999 if result=='heads' else normal_z<-.999
    assert max(abs(sequence[i+1][1][0]-sequence[i][1][0]) for i in range(360,389))<.001
    end[result]={'normalZ':normal_z,'finalZ':sequence[-1][0][2]}
result={'passed':True,'durationSeconds':13,'airborneSeconds':seconds,'airborneCompleteRevolutions':(angles[-1]-angles[0])/math.tau,'minimumAngularStepRadians':min(deltas),'identicalOpeningFrames':286,'stableFinalFace':end,'note':'Checks authored trajectory only; does not generate randomness or test a physical Android device.'}
Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
