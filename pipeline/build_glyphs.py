"""Build the glyph library (glyphs.json) from three handwritten sample pages.

Usage:
    pdftocairo -svg -f N -l N samples.pdf <svg-dir>/pgN.svg   # for N = 1..3
    python3 build_glyphs.py --svg-dir <svg-dir> --out glyphs.json

Each sample page contains every character once, so every character gets one
variant per page (3 variants). Steps: rows -> characters -> per-row baseline
-> x-height normalisation (0.42 em) -> fixed heights for punctuation ->
smoothing, slant alignment, height pull-in -> glyph fixes -> simplification
-> JSON. See docs/known-issues.md for known problems of this approach.

With --profile NAME the samples and the output path come from the handwriting
profile (see profiles.py).

General rules (same for everyone, documented in docs/rules.md; changed only
through reviewed pull requests; disable all with --no-fixes):
  R1  marks stay as written: small strokes (i-dots, colon, period, ...) are never
      replaced by synthetic dots
  R2  umlaut bodies take the measured size of the writer's own base letters
  R3  letters and digits without a descender end at the baseline: strokes that
      reach more than 0.04 em below it are compressed from their top
  R4  ! and ? stand on the baseline
  R5  confusable variants are not used: a variant that is almost identical to
      another character and far from its own variants is skipped (needs >= 2
      remaining variants; thresholds are an assumption, see docs/rules.md)

Optional personal overrides (profile.json "overrides", normally empty):
  clean_dots, blocked, align_cap_height
"""
import argparse
import json
import os

import numpy as np

from svg_strokes import xclusters
from rows import page_rows, assign_rows, NAMES, EXP

ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument('--svg-dir', default='.', help='directory containing pg1.svg, pg2.svg, pg3.svg')
ap.add_argument('--out', default='glyphs.json', help='output glyph JSON')
ap.add_argument('--no-fixes', action='store_true', help='skip the glyph fixes (reproduces the original output)')
ap.add_argument('--profile', help='profile name or directory: reads its samples and overrides, writes its glyphs.json')
args = ap.parse_args()
import profiles
OVR = profiles.empty_overrides()
SOURCE = 'alphabet-v1'
if args.profile:
    PROF = profiles.load(args.profile)
    OVR = PROF['overrides']
    args.svg_dir = profiles.source_dir(PROF, SOURCE)
    args.out = profiles.glyphs_path(PROF)
    print('profile', PROF['name'], '->', args.out)
FIXES = not args.no_fixes
CLEAN_DOTS = set(OVR['clean_dots'])                         # override: small parts of these become clean dots
BLOCK = {c: [int(v.split(':p')[1]) - 1 for v in vs if v.startswith(SOURCE + ':p')]   # override: page -> variant index
         for c, vs in OVR['blocked'].items()}
ALIGN_CAP = list(OVR['align_cap_height'])                   # override: strokes each span baseline..cap height
DESCENDERS = set('gjpqyfßJQ34579')                          # R3: may go below the baseline (letters; old-style figures 3 4 5 7 9)
NO_DESC = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789äöüÄÖÜ') - DESCENDERS
R3_MIN, R3_PCT = 0.06, 95                                   # R3: tolerance = max(0.06 em, 95th percentile of the writer's own overshoots)
R5_DIST, R5_RATIO = 0.25, 0.5                               # R5: thresholds (assumption, see docs/rules.md)
CH={'lower':'abcdefghijklmnopqrstuvwxyz','upper':'ABCDEFGHIJKLMNOPQRSTUVWXYZ','digit':'0123456789','uml':'äöüÄÖÜß',
    'sym':'.,;-()/+=*%?!"\'<>_[]','arrow':'→⇒↔⊕','ex1':'#~&{}$≠≈≤≥φℕℤℝ','circ':'⓪①②③④⑤⑥⑦⑧⑨','ex2':':✓↑↓|\\^€ℚℂ',
    'acc':'éèà','logic':'∧∨¬∈∉≡‖±','tri':'▷'}
FLAT={'lower':"acemnorsuvwxzbdhiklt",'upper':"ABCDEFGHIKLMNOPRSTUVWXYZ",'digit':"012345678",'uml':"äöüÄÖÜ",'sym':"/[]<>+",
      'arrow':"→⇒↔⊕",'ex1':"#&≠≈≤≥ℕℤℝ",'circ':"⓪①②③④⑤⑥⑦⑧⑨",'ex2':":✓↑↓|\\€ℂ",'acc':"éèà",'logic':None,'tri':'▷'}
def exact(st,idx,n):
    cl=xclusters(st,idx)
    def box(c): 
        a=np.vstack([st[i] for i in c]); return a[:,0].min(),a[:,0].max()
    while len(cl)>n:
        gaps=[]
        for k in range(len(cl)-1):
            a0,a1=box(cl[k]); b0,b1=box(cl[k+1]); gaps.append(max(b0-a1,0)+0.0*(b0-a0))
        k=int(np.argmin(gaps)); cl[k]=sorted(cl[k]+cl[k+1]); del cl[k+1]
    return cl
VAR=[]   # je Variante: {char: [Strichlisten roh]}
for p in (1,2,3):
    st,R=page_rows(p, args.svg_dir)
    names=assign_rows(st,R)                      # detects rows written in swapped order
    D={}
    for r,n in zip(R,names):
        cl=exact(st,r,EXP[n]); assert len(cl)==EXP[n]
        for ch,g in zip(CH[n],cl): D[ch]=(n,[st[i] for i in g])
    VAR.append(D)
print('Varianten',len(VAR),[len(d) for d in VAR])
# --- Grundlinie je Seite/Zeile
def pts(strokes): return np.vstack(strokes)
def baselines(D):
    rowsd={}
    for ch,(n,s) in D.items(): rowsd.setdefault(n,[]).append(ch)
    res={}
    for n,chars in rowsd.items():
        flat=FLAT[n]; 
        xs=[];bs=[]
        use=[c for c in chars if (flat is None) or c in flat]
        for c in use:
            a=pts(D[c][1]); xs.append((a[:,0].min()+a[:,0].max())/2); bs.append(np.percentile(a[:,1],97))
        xs=np.array(xs);bs=np.array(bs);o=np.argsort(xs);xs=xs[o];bs=bs[o]
        if flat is None:
            m,b=np.polyfit(xs,bs,1); r=bs-(m*xs+b); k=np.abs(r)<=max(np.abs(r).std()*1.4,0.3)
            m,b=np.polyfit(xs[k],bs[k],1); xs=np.array([xs.min(),xs.max()]); bs=m*xs+b
        for c in chars:
            a=pts(D[c][1]); xc=(a[:,0].min()+a[:,0].max())/2
            res[c]=np.percentile(a[:,1],97) if (flat is not None and c in flat) else float(np.interp(xc,xs,bs))
    return res
BL=[baselines(D) for D in VAR]
XHP=[np.median([-(pts(D[c][1])[:,1].min()-BL[v][c]) for c in "acemnorsuvwxz"]) for v,D in enumerate(VAR)]
SC=[0.42/x for x in XHP]; print('xh pt je Seite',XHP)
raw=[{c:[np.stack([s[:,0],s[:,1]-BL[v][c]],1)*SC[v] for s in D[c][1]] for c in D} for v,D in enumerate(VAR)]
# Zeilenhöhe über die drei Seiten angleichen (Symbolzeilen wurden unterschiedlich groß geschrieben)
rowof={c:VAR[0][c][0] for c in VAR[0]}
H={}
for v in range(3):
    for n in set(rowof.values()):
        hs=[ (lambda a:a[:,1].max()-a[:,1].min())(pts(raw[v][c])) for c in raw[v] if rowof[c]==n and c!='.']
        H[(n,v)]=float(np.median(hs))
for n in set(rowof.values()):
    tgt=float(np.median([H[(n,v)] for v in range(3)]))
    for v in range(3):
        f=tgt/H[(n,v)]
        for c in raw[v]:
            if rowof[c]==n: raw[v][c]=[s*f for s in raw[v][c]]
        if abs(f-1)>0.12: print('Zeile',n,'Seite',v+1,'Faktor',round(f,2))
# Punkt auf die Grundlinie
for v in range(3):
    a=pts(raw[v]['.']); raw[v]['.']=[s+np.array([0,-a[:,1].max()]) for s in raw[v]['.']]
# feste Höhen für Satz- und Sonderzeichen (in der Probe unterschiedlich hoch geschrieben)
def place(c,anchor,val,maxh=None):
    for v in range(3):
        S_=raw[v][c]; a=pts(S_); lo,hi=a[:,1].min(),a[:,1].max()
        if maxh and hi-lo>maxh:
            f=maxh/(hi-lo); S_=[s*np.array([1,f]) for s in S_]; a=pts(S_); lo,hi=a[:,1].min(),a[:,1].max()
        dy={'bottom':val-hi,'top':val-lo,'center':val-(lo+hi)/2}[anchor]
        raw[v][c]=[s+np.array([0,dy]) for s in S_]
place(',','bottom',0.12,0.26); place(';','bottom',0.12,0.62)
place('-','center',-0.17); place('_','center',0.05)
place("'",'top',-0.66,0.22); place('"','top',-0.66,0.22); place('~','center',-0.22); place('*','top',-0.62,0.34)
place('=','center',-0.22); place('+','center',-0.22)
# ---- Verschönern: Zittern glätten, Neigung der 3 Seiten angleichen, Zeichenhöhen zur Mitte ziehen
from scipy.ndimage import gaussian_filter1d
def smooth(s,sig=1.4):
    if len(s)<25: return s
    q=np.stack([gaussian_filter1d(s[:,0],sig,mode='nearest'),gaussian_filter1d(s[:,1],sig,mode='nearest')],1); q[0]=s[0]; q[-1]=s[-1]; return q
for v in range(3):
    for c in raw[v]: raw[v][c]=[smooth(s) for s in raw[v][c]]
def slope(v):
    sl=[]
    for c in "lhbkdpqtfIHKLTPBD":
        for s in raw[v][c]:
            if len(s)<8: continue
            top=s[np.argmin(s[:,1])]; bot=s[np.argmax(s[:,1])]; hgt=bot[1]-top[1]
            ln=np.sum(np.hypot(*np.diff(s,axis=0).T))
            if hgt>0.4 and np.hypot(*(top-bot))/ln>0.92: sl.append((top[0]-bot[0])/hgt)
    return float(np.median(sl)) if sl else 0.0
SL=[slope(v) for v in range(3)]; tgt=float(np.median(SL))
print('Neigung je Seite (Winkel °)',[round(np.degrees(np.arctan(x)),1) for x in SL],'-> Ziel',round(np.degrees(np.arctan(tgt)),1))
for v in range(3):
    k=SL[v]-tgt
    for c in raw[v]: raw[v][c]=[s+np.stack([k*s[:,1],0*s[:,1]],1) for s in raw[v][c]]
# Zeichenhöhe: 65 % zur Variantenmitte ziehen (gleichmäßigeres, schöneres Schriftbild)
for c in raw[0]:
    hs=[(lambda a:a[:,1].max()-a[:,1].min())(pts(raw[v][c])) for v in range(3)]
    m=float(np.median(hs))
    for v in range(3):
        if hs[v]>0.05 and rowof[c] in ('lower','upper','digit','uml'):
            f=1+0.65*(m/hs[v]-1); raw[v][c]=[s*np.array([f,f]) for s in raw[v][c]]
# ---- general rules R2-R4 (docs/rules.md)
def bbox(S):
    a=pts(S); return a[:,0].min(), a[:,0].max(), a[:,1].min(), a[:,1].max()
if FIXES:
    # R2: umlaut body gets the median width/height of its base letter; dots/dashes keep size and gap
    for u,b in zip('äöüÄÖÜ','aouAOU'):
        hb=float(np.median([bbox(raw[v][b])[3]-bbox(raw[v][b])[2] for v in range(3)]))
        wb=float(np.median([bbox(raw[v][b])[1]-bbox(raw[v][b])[0] for v in range(3)]))
        for v in range(3):
            body=[s for s in raw[v][u] if s[:,1].max()>-0.15]; marks=[s for s in raw[v][u] if s[:,1].max()<=-0.15]
            x0,x1,top,bot=bbox(body); sx=wb/(x1-x0); sy=hb/(bot-top); ntop=bot-(bot-top)*sy
            nb=[np.stack([x0+(s[:,0]-x0)*sx, bot+(s[:,1]-bot)*sy],1) for s in body]
            nm=[s+np.array([x0+((s[:,0].min()+s[:,0].max())/2-x0)*sx-(s[:,0].min()+s[:,0].max())/2, ntop-top]) for s in marks]
            raw[v][u]=nb+nm
    # R3: no-descender characters end at the baseline; strokes reaching further down are compressed from their top.
    # Tolerance comes from the writer's own samples: max(R3_MIN, 95th percentile of all overshoots).
    over=[max(s[:,1].max() for s in raw[v][c]) for c in NO_DESC & set(raw[0]) for v in range(3)]
    R3_TOL=max(R3_MIN,float(np.percentile(over,R3_PCT)))
    r3=[]
    for c in NO_DESC & set(raw[0]):
        for v in range(3):
            S=raw[v][c]
            if max(s[:,1].max() for s in S)<=R3_TOL: continue
            new=[]
            for s in S:
                top,bot=s[:,1].min(),s[:,1].max()
                if bot>R3_TOL and top<0:
                    s=np.stack([s[:,0], top+(s[:,1]-top)*(0-top)/(bot-top)],1)
                new.append(s)
            raw[v][c]=new; r3.append(f'{c}{v+1}')
    # override align_cap_height: every stroke spans baseline (0) .. median cap height
    capt=float(np.median([-bbox(raw[v][c])[2] for v in range(3) for c in 'BDEFHIKLMPRTUVWXZ']))
    for c in ALIGN_CAP:
        for v in range(3):
            raw[v][c]=[np.stack([s[:,0], -capt+(s[:,1]-s[:,1].min())/(s[:,1].max()-s[:,1].min())*capt],1) for s in raw[v][c]]
    # R4: ! and ? stand on the baseline
    place('!','bottom',0.0); place('?','bottom',0.0)
    print('rules: R2 umlauts scaled, R3 tolerance %.3f em, baseline clamp on'%R3_TOL, ' '.join(sorted(r3)) or '-', ', R4 ! ? on baseline')
    if any(OVR.values()): print('overrides:', OVR)
def rdp(P,eps):
    if len(P)<3: return P
    a,b=P[0],P[-1];ab=b-a;n=np.hypot(*ab)
    d=np.abs(ab[0]*(P[:,1]-a[1])-ab[1]*(P[:,0]-a[0]))/n if n>1e-9 else np.hypot(*(P-a).T)
    i=d.argmax()
    if d[i]>eps: return np.vstack([rdp(P[:i+1],eps)[:-1],rdp(P[i:],eps)])
    return np.vstack([a,b])
def pack(strokes,minadv=0.2,bear=0.025,fill=False,ch=None):
    strokes=[s*np.array([0.9,1.0]) for s in strokes]
    a=pts(strokes); x0,x1=a[:,0].min(),a[:,0].max(); w=x1-x0; adv=max(w+2*bear,minadv); off=(adv-w)/2-x0
    ext=lambda s:(np.ptp(s[:,0]),np.ptp(s[:,1]))
    ss=[]
    for s in strokes:
        q=s.copy(); q[:,0]+=off
        w_,h_=ext(q); small=w_<0.14 and h_<0.14
        if FIXES and not fill:
            # R1: marks stay as written; only the clean_dots override turns them into synthetic dots
            small = ch in CLEAN_DOTS and max(w_,h_)<0.22
        if small and not fill:
            c0=q.mean(0) if not FIXES else np.array([(q[:,0].min()+q[:,0].max())/2,(q[:,1].min()+q[:,1].max())/2])
            q=np.array([c0-[0.004,0],c0+[0.004,0]])
        q=rdp(q,0.0035) if len(q)>3 else q
        ss.append([[round(float(x),3),round(float(y),3)] for x,y in q])
    g={'adv':round(float(adv),3),'s':ss}
    if fill: g['f']=1
    return g
out={}
def add(c,v,g): out.setdefault(c,[None,None,None])[v]=g
for v in range(3):
    R=raw[v]
    for c in R:
        if c=='▷': continue
        add(c,v,pack(R[c],minadv=0.17 if c in 'iljI|!' else 0.2,ch=c))
    # gefülltes Dreieck ▶ aus dem Umriss
    a=pts(R['▷']); from scipy.spatial import ConvexHull
    h=a[ConvexHull(a).vertices]; h=np.vstack([h,h[:1]]); add('▶',v,pack([h],minadv=0.2,fill=True))
    dot=R['.']; dw=pts(dot)[:,0]; dotc=[s-np.array([dw.min(),0]) for s in dot]
    sh=lambda S,dx,dy:[s+np.array([dx,dy]) for s in S]
    add('·',v,pack(sh(dotc,0,-0.42*0.5)))
    add('…',v,pack(dotc+sh(dotc,0.09,0)+sh(dotc,0.18,0)))
    # Komma-Paar für „ , Anführung
    cm=R[',']; cw=pts(cm)[:,0]; cmc=[s-np.array([cw.min(),0]) for s in cm]
    add('„',v,pack(cmc+sh(cmc,0.1,0)))
    add('“',v,pack(R['"'])); add('′',v,pack(R["'"]))
    h=R['-']
    for ch,f in (('−',1.0),('–',1.35)): add(ch,v,pack([s*np.array([f,1]) for s in h]))
    pl=R['+']; ctr=pts(pl).mean(0); rot=np.array([[0.7071,0.7071],[-0.7071,0.7071]])
    add('×',v,pack([(s-ctr)@rot+ctr for s in pl]))
if FIXES:
    for c,idx in BLOCK.items():                                                    # override: blocked variants
        for i in idx: out[c][i]=None
    # R5: skip a variant that is almost identical to another character and far from its own variants
    from scipy.ndimage import distance_transform_edt
    RW,RH,RX0,RX1,RY0,RY1=40,56,-0.1,0.9,-1.0,0.4          # raster: 0.025 em per pixel
    def raster(g):
        img=np.zeros((RH,RW),bool); P_=np.array([p for s in g['s'] for p in s]); cx=(P_[:,0].min()+P_[:,0].max())/2
        for s in g['s']:
            s=np.array(s,float); s[:,0]+=0.4-cx
            for a_,b_ in zip(s[:-1],s[1:]) if len(s)>1 else [(s[0],s[0])]:
                for t in np.linspace(0,1,max(2,int(np.hypot(*(b_-a_))*120))):
                    x_,y_=a_+(b_-a_)*t; i_=int((y_-RY0)/(RY1-RY0)*RH); j_=int((x_-RX0)/(RX1-RX0)*RW)
                    if 0<=i_<RH and 0<=j_<RW: img[max(0,i_-1):i_+2,max(0,j_-1):j_+2]=True
        return img
    keys=[(c,v) for c,vs in out.items() if len(c)==1 and c.isalnum() for v,g in enumerate(vs) if g]
    RA={k:raster(out[k[0]][k[1]]) for k in keys}; DT={k:distance_transform_edt(~RA[k]) for k in keys}
    dist=lambda a_,b_:0.5*(DT[b_][RA[a_]].mean()+DT[a_][RA[b_]].mean())
    cand=[]
    for k in keys:
        c,v=k; sib=[x for x in keys if x[0]==c and x!=k]
        own=float(np.mean([dist(k,s) for s in sib])) if sib else 9.0
        dmin,near=min((dist(k,x),x) for x in keys if x[0].lower()!=c.lower())
        if dmin<R5_DIST and dmin<R5_RATIO*own: cand.append((dmin/own,k,near))
    # most out-of-place first (furthest from its own variants); a pair is resolved once one side is dropped
    r5=[]; dropped=set()
    for ratio,k,near in sorted(cand):
        c,v=k
        if near in dropped or sum(1 for g in out[c] if g)<=2: continue    # keep at least 2 variants
        out[c][v]=None; dropped.add(k); r5.append(f'{c}{v+1}~{near[0]}{near[1]+1}')
    print('rules: R5 confusable variants skipped:', ' '.join(r5) or '-')
out={c:[g for g in vs if g] for c,vs in out.items()}
json.dump(out,open(args.out,'w',encoding='utf-8'),separators=(',',':'),ensure_ascii=False)
print(len(out),'glyphs',os.path.getsize(args.out)//1024,'KB')
print(''.join(sorted(out)))
