"""Independent semantic checks: speed, pose continuity, result and trail cutoff."""
import json,math,argparse
from pathlib import Path
from motion import pose,phase,speed,trail_strength
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args()
angles=[phase(3+i*6.5/6500) for i in range(6501)]
assert abs(angles[-1]-52.3)<1e-10
assert min(b-a for a,b in zip(angles,angles[1:]))>0
assert min(speed(3.25+i*.001) for i in range(6001))>8
for f in range(286):assert pose(f/30,'heads')==pose(f/30,'tails')
for t in [3,9.5]:
 left,right=pose(t-1e-7),pose(t+1e-7)
 assert max(abs(a-b) for a,b in zip(left[0],right[0]))<.002
 assert abs(left[1][0]-right[1][0])<.002
stable={}
for result,expected in [('heads',1),('tails',-1)]:
 rx,ry,rz=pose(389/30,result)[1];normal=math.cos(rx)*math.cos(ry)
 assert normal*expected>.999;stable[result]=normal
 assert trail_strength(9.5)==0 and trail_strength(11.25)==0
rates=[speed(3.25+i*.001) for i in range(6001)]
report={'passed':True,'airborneSeconds':6.5,'turns':52.3,'previousTurns':6.3,'averageSpeedMultiplier':52.3/6.3,'cruiseTurnsPerSecond':[min(rates),max(rates)],'sharedOpeningFrames':286,'continuousFlipAngleAtLaunchAndLanding':True,'afterimagesGoneBeforeImpact':True,'finalFaceNormal':stable,'durationSeconds':13,'revealSeconds':11.25}
Path(a.out).write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
