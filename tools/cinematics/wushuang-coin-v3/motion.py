"""Meter-scale ballistic flight; an explicitly authored spin brake at the apex."""
import math
G=9.81
LAUNCH=3.0
IMPACT=6.5
DURATION=10.0
REVEAL=8.25
START_Z=2.9
REST_Z=.86
CONTACT_Z=2.36
V0=(CONTACT_Z-START_Z+.5*G*(IMPACT-LAUNCH)**2)/(IMPACT-LAUNCH)
APEX=LAUNCH+V0/G
APEX_Z=START_Z+V0**2/(2*G)
START_ANGLE=math.pi*.36+.40
STOP_ANGLE=14*math.tau+math.pi/2
TURNS=(STOP_ANGLE-START_ANGLE)/math.tau
RAMP_IN=.16
RAMP_OUT=.28

def smooth(u):
 u=max(0,min(1,u));return u*u*(3-2*u)

def phase(t):
 duration=APEX-LAUNCH;x=max(0,min(duration,t-LAUNCH));area_total=duration-(RAMP_IN+RAMP_OUT)/2
 def integral(x,r):
  q=x/r;return r*(q**3-.5*q**4)
 if x<RAMP_IN:area=integral(x,RAMP_IN)
 elif x<=duration-RAMP_OUT:area=x-RAMP_IN/2
 else:area=area_total-integral(duration-x,RAMP_OUT)
 return TURNS*area/area_total

def speed(t):
 if t<=LAUNCH or t>=APEX:return 0
 return (phase(t+.0001)-phase(t-.0001))/.0002

def trail_strength(t):
 return smooth((t-LAUNCH)/.13)*(1-smooth((t-(APEX-.30))/.30))

def pose(t,result='heads'):
 if t<2:return (0,0,1.12+.40*smooth(t/2)),(math.pi*.36,0,.08)
 if t<LAUNCH:
  u=smooth(t-2);return (0,0,1.52+1.38*u),(START_ANGLE-.40+.40*u,.09*u,.08)
 if t<=IMPACT:
  dt=t-LAUNCH;z=START_Z+V0*dt-.5*G*dt*dt
  return (0,0,z),(START_ANGLE+math.tau*phase(t),.09*(1-smooth(dt/.18)),.08*(1-smooth(dt/.35)))
 end=14*math.tau+(0 if result=='heads' else math.pi)
 if t<7.14:
  dt=t-IMPACT;u=dt/.64;rebound_v=(REST_Z-CONTACT_Z+.5*G*.64**2)/.64
  z=CONTACT_Z+rebound_v*dt-.5*G*dt*dt
  return (0,0,z),(STOP_ANGLE+(end-STOP_ANGLE)*smooth(u),0,0)
 # Existing damped settling and result framing, shifted three seconds earlier.
 u=t-7.14;wobble=.29*math.exp(-u*2.9)*math.sin(u*22)
 return (0,0,REST_Z+abs(wobble)*1.4),(end+wobble,wobble*.4,0)

def old_to_new(t):
 if t<=LAUNCH:return t
 if t<=9.5:return LAUNCH+(t-LAUNCH)*3.5/6.5
 return t-3

CAMERA_SHOTS=[
 (3.0,(2.8,-9,4.4),(0,0,3),42),
 (3.50,(1,-15,12),(0,0,10),36),
 (4.35,(-5,-23,20),(0,0,9.7),26),
 (6.52,(-5,-23,20),(0,0,9.7),26),
 (7.20,(-3.2,-12,10.8),(0,0,2.8),38),
 (8.0,(-.7,-5,9),(0,0,.84),46)]

def camera_pose(t):
 for left,right in zip(CAMERA_SHOTS,CAMERA_SHOTS[1:]):
  ta,pa,qa,la=left;tb,pb,qb,lb=right
  if ta<=t<=tb:
   u=smooth((t-ta)/(tb-ta));return tuple(x+(y-x)*u for x,y in zip(pa,pb)),tuple(x+(y-x)*u for x,y in zip(qa,qb)),la+(lb-la)*u
 return CAMERA_SHOTS[-1][1:]

