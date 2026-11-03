#!/bin/sh
# Remakes the kit's grain tile and sound effects from ffmpeg's own tone and
# noise generators, so they're ours to license (MIT, like the rest).
set -eu
cd "$(dirname "$0")"
A="-ar 48000 -ac 1 -c:a pcm_s16le"
ffmpeg -v error -y -f lavfi -i "color=c=0x808080:s=384x384,noise=alls=48:allf=u" -frames:v 1 -pix_fmt gray grain.png
mkdir -p sfx && cd sfx
# Air past the mic: pink noise, band-limited, swelling and dying.
ffmpeg -v error -y -f lavfi -i "anoisesrc=d=0.7:c=pink:a=0.9:seed=7" -af "highpass=f=250,lowpass=f=4500,afade=t=in:st=0:d=0.38:curve=exp,afade=t=out:st=0.38:d=0.32:curve=qsin,volume=1.6" $A whoosh.wav
# A bubble: a tone that falls fast and decays in a fifth of a second.
ffmpeg -v error -y -f lavfi -i "aevalsrc='0.9*sin(2*PI*t*(520+1400*exp(-t*40)))*exp(-t*28)':d=0.18:s=48000" -af "afade=t=in:d=0.003" $A pop.wav
# A tick for counters: two high partials, gone in 50 ms.
ffmpeg -v error -y -f lavfi -i "aevalsrc='0.6*sin(2*PI*2400*t)*exp(-t*260)+0.3*sin(2*PI*5200*t)*exp(-t*400)':d=0.05:s=48000" $A tick.wav
# A hit: a sub tone dropping in pitch under a burst of brown noise.
ffmpeg -v error -y -f lavfi -i "aevalsrc='0.95*sin(2*PI*t*(48+70*exp(-t*9)))*exp(-t*4.5)':d=1.1:s=48000" -f lavfi -i "anoisesrc=d=0.25:c=brown:a=0.7:seed=3" -filter_complex "[1]lowpass=f=900,afade=t=out:d=0.25[n];[0][n]amix=inputs=2:normalize=0,afade=t=in:d=0.004,alimiter=limit=0.95" $A impact.wav
# A riser: a rising sweep with hiss that grows, for the second before a reveal.
ffmpeg -v error -y -f lavfi -i "aevalsrc='0.35*sin(2*PI*t*(180+520*t*t))*(t/1.4)':d=1.4:s=48000" -f lavfi -i "anoisesrc=d=1.4:c=white:a=0.5:seed=5" -filter_complex "[1]highpass=f=2500,volume='t/1.4':eval=frame[n];[0][n]amix=inputs=2:normalize=0,afade=t=out:st=1.3:d=0.1" $A riser.wav
# A shimmer: three bell partials with a flutter and an echo, under a title.
ffmpeg -v error -y -f lavfi -i "aevalsrc='0.22*(sin(2*PI*1760*t)+sin(2*PI*2637*t)+sin(2*PI*3520*t))*exp(-t*3.2)*(1+0.3*sin(2*PI*14*t))':d=0.9:s=48000" -af "afade=t=in:d=0.02,aecho=0.6:0.5:60|110:0.3|0.2,volume=10dB,alimiter=limit=0.8" $A shimmer.wav
# A click: 35 ms of filtered noise.
ffmpeg -v error -y -f lavfi -i "aevalsrc='(random(0)*2-1)*exp(-t*160)':d=0.035:s=48000" -af "highpass=f=1800,lowpass=f=7000,volume=6,alimiter=limit=0.8" $A click.wav
