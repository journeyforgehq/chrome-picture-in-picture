#!/usr/bin/env bash
# =============================================================================
# Regenerate static/sample-clip.webm and its poster.
# =============================================================================
#
# The clip on the welcome page is not decoration. It is the ACTIVATION moment
# (the first pop-out happens without leaving the page, with the pin instruction
# still in the same viewport) and a LIVE SELF-TEST of the detection algorithm:
# if this clip does not pop out on our own page, detection is broken and we
# learn it on day one rather than through reviews.
#
# So it is authored against extension/src/pip/entry.ts's real filter, and every
# number below is one of that filter's thresholds. Read entry.ts before changing
# any of them:
#
#   duration 12s     — entry.ts drops anything that is not `duration > 5`.
#                      Also comfortably clear of the R-14 advert penalty, which
#                      only fires on a MUTED clip under 65s; this clip is never
#                      muted, so it is never eligible for it.
#   1280x720         — videoWidth/videoHeight must be non-zero, and the RENDERED
#                      rect must be at least 100x100. The page caps display at
#                      720px wide with a 16/9 box, so even a 320px viewport
#                      renders 320x180.
#   silent stereo    — an audio track, so the element is genuinely
#     Opus track       unmuted-CAPABLE and scores entry.ts's +200 unmuted bonus.
#                      SILENT on purpose: the user presses play on a welcome
#                      page and must not be shouted at.
#   VP9              — Chrome decodes it natively and it is licence-clean for a
#                      hosted page. This page only ever loads inside Chrome.
#
# The visible countdown is deliberate: it is how a user (and a reviewer) can
# tell at a glance that the floating window is really playing and not a frozen
# poster frame.
#
# Requires ffmpeg (`brew install ffmpeg`). Run from welcome-page/:
#   ./scripts/make-sample-clip.sh
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="static/sample-clip.webm"
POSTER="static/sample-clip-poster.jpg"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found — brew install ffmpeg" >&2; exit 1; }

ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "gradients=size=1280x720:duration=12:rate=24:c0=0x0b1220:c1=0x1677ff:speed=0.06:x0=120:y0=120:x1=1160:y1=600" \
  -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=48000" \
  -filter_complex "[0:v]\
drawtext=font=Helvetica:text='Picture in Picture':fontsize=76:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-70,\
drawtext=font=Helvetica:text='sample clip':fontsize=38:fontcolor=0xdbe6f5:x=(w-text_w)/2:y=(h-text_h)/2+30,\
drawtext=font=Helvetica:text='%{eif\:12-t\:d}s':fontsize=30:fontcolor=0xdbe6f5:x=(w-text_w)/2:y=h-110[v]" \
  -map "[v]" -map 1:a -shortest -t 12 \
  -c:v libvpx-vp9 -b:v 500k -crf 36 -pix_fmt yuv420p -row-mt 1 \
  -c:a libopus -b:a 24k \
  "$OUT"

# Poster: the frame at 1s. Without one the element paints black until the first
# frame decodes, which reads as "broken" on the first page a new install sees.
ffmpeg -y -hide_banner -loglevel error -ss 1 -i "$OUT" -frames:v 1 -q:v 4 "$POSTER"

echo "wrote $OUT ($(wc -c <"$OUT" | tr -d ' ') bytes) and $POSTER"
echo "Captions live in static/sample-clip.vtt and are hand-written — not regenerated here."
