"""Shared deterministic spin phase for geometry, motion audit and sound.
No game randomness; the caller supplies an already decided heads/tails ending.
"""
import math
FLIGHT_START=3.0
FLIGHT_END=9.5
EXTRA_TURNS=46
RAMP_SECONDS=.24

def smooth(u):
 u=max(0,min(1,u));return u*u*(3-2*u)

def extra_phase(t):
 x=max(0,min(6.5,t-FLIGHT_START));r=RAMP_SECONDS
 def primitive(z):
  q=z/r;return r*(q**3-.5*q**4)
 if x<r:area=primitive(x)
 elif x<=6.5-r:area=x-r/2
 else:area=6.5-r-primitive(6.5-x)
 return EXTRA_TURNS*area/(6.5-r)

def phase(t):
 u=max(0,min(1,(t-FLIGHT_START)/6.5))
 return 6.3*u+.30*math.sin(math.tau*u)+extra_phase(t)

def speed(t):
 if t<FLIGHT_START or t>FLIGHT_END:return 0
 return (phase(t+.0001)-phase(t-.0001))/.0002

def trail_strength(t):
 return smooth((t-3.01)/.16)*(1-smooth((t-9.25)/.23))

def pose(t,result='heads'):
 if t<2:return (0,0,1.12+.40*smooth(t/2)),(math.pi*.36,0,.08)
 if t<3:
  u=smooth(t-2);return (0,0,1.52+1.38*u),(math.pi*.36+.40*u,.09*u,.08)
 if t<=9.5:
  u=(t-3)/6.5;contact=.84+1.70*abs(math.sin(math.pi*.36+.40+math.tau*6.3))
  z=2.9+(contact-2.9)*u+13.8*math.sin(math.pi*u)**.88
  return (.5*math.sin(math.tau*u),.26*math.sin(math.pi*u),z),(math.pi*.36+.40+math.tau*phase(t),.12*math.sin(math.pi*u),.08+.4*math.sin(math.tau*u))
 end=0 if result=='heads' else math.pi
 base=math.pi*.36+.40+math.tau*52.3;landing=math.tau*53+end
 if t<10.14:
  u=(t-9.5)/.64;angle=base+(landing-base)*smooth(u)
  return (0,0,.84+1.7*abs(math.sin(angle))+.85*math.sin(math.pi*u)),(angle,.08*math.sin(math.pi*u),.08*(1-u))
 u=t-10.14;wobble=.29*math.exp(-u*2.9)*math.sin(u*22)
 return (0,0,.86+abs(wobble)*1.4),(landing+wobble,wobble*.4,0)
