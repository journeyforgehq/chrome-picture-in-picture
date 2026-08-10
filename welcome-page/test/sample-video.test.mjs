/* ============================================================================
 * R-15 guard — the sample clip must stay detectable BY OUR OWN DETECTOR.
 * ============================================================================
 *
 * The <video> on the welcome page is not decoration. It is a live self-test:
 * authored to pass `extension/src/pip/entry.ts`'s filter, so that if pop-out
 * fails on our own page we learn it on day one rather than through reviews.
 *
 * That only works while the element still satisfies the filter — and every one
 * of those conditions is a one-word edit away from silently failing. Adding
 * `muted` to buy autoplay, dropping `preload="auto"` back to `metadata`,
 * swapping the clip for a 3-second loop, or letting a rename orphan the file:
 * each leaves a page that looks completely fine and a self-test that proves
 * nothing. So the conditions are asserted here, in the same terms entry.ts
 * states them, and the clip's DURATION and PIXEL DIMENSIONS are read out of the
 * actual media file rather than taken from a comment.
 *
 * Node's built-in runner on purpose — welcome-page has no test framework, and
 * the factory root already standardises on `node --test`. Do not add vitest.
 * ==========================================================================*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = join(root, "src", "child-sections", "SampleVideo.tsx");
const indexPath = join(root, "src", "pages", "index.tsx");
const contentPath = join(root, "src", "content.ts");
const staticDir = join(root, "static");
const publicDir = join(root, "public");

const CLIP = "sample-clip.webm";
const CAPTIONS = "sample-clip.vtt";
const POSTER = "sample-clip-poster.jpg";

/* --------------------------------------------------------------------------
 * A minimal EBML reader, so "the clip is longer than 5 seconds" is a MEASURED
 * fact about the bytes on disk and not a promise in a comment. WebM is EBML:
 * every element is [ID][size][payload], IDs keep their length-marker bit and
 * sizes drop theirs. We descend only the master elements on the path to the two
 * things entry.ts cares about.
 * ------------------------------------------------------------------------*/
const ID = {
  SEGMENT: 0x18538067,
  INFO: 0x1549a966,
  TIMECODE_SCALE: 0x2ad7b1,
  DURATION: 0x4489,
  TRACKS: 0x1654ae6b,
  TRACK_ENTRY: 0xae,
  VIDEO: 0xe0,
  PIXEL_WIDTH: 0xb0,
  PIXEL_HEIGHT: 0xba,
};
const MASTERS = new Set([
  ID.SEGMENT,
  ID.INFO,
  ID.TRACKS,
  ID.TRACK_ENTRY,
  ID.VIDEO,
]);

/** Element ID: keeps its marker bit, 1–4 bytes. */
function readId(buf, pos) {
  const first = buf[pos];
  let len = 1;
  for (let mask = 0x80; len <= 4 && !(first & mask); mask >>= 1) len++;
  if (len > 4) throw new Error(`bad EBML id at ${pos}`);
  let id = 0;
  for (let i = 0; i < len; i++) id = id * 256 + buf[pos + i];
  return { id, len };
}

/** Size VINT: marker bit stripped. `unknown` when all value bits are set. */
function readSize(buf, pos) {
  const first = buf[pos];
  let len = 1;
  let mask = 0x80;
  for (; len <= 8 && !(first & mask); mask >>= 1) len++;
  if (len > 8) throw new Error(`bad EBML size at ${pos}`);
  let value = first & (mask - 1);
  let allOnes = value === mask - 1;
  for (let i = 1; i < len; i++) {
    value = value * 256 + buf[pos + i];
    if (buf[pos + i] !== 0xff) allOnes = false;
  }
  return { size: value, len, unknown: allOnes };
}

/** Walk `buf` from `pos` to `end`, collecting the leaf values we asked for. */
function walk(buf, pos, end, out) {
  while (pos < end) {
    const { id, len: idLen } = readId(buf, pos);
    const { size, len: sizeLen, unknown } = readSize(buf, pos + idLen);
    const body = pos + idLen + sizeLen;
    const stop = unknown ? end : Math.min(body + size, end);

    if (MASTERS.has(id)) {
      walk(buf, body, stop, out);
    } else if (id === ID.DURATION) {
      out.duration = size === 4 ? buf.readFloatBE(body) : buf.readDoubleBE(body);
    } else if (id === ID.TIMECODE_SCALE) {
      out.timecodeScale = Number(buf.subarray(body, body + size).reduce((a, b) => a * 256n + BigInt(b), 0n));
    } else if (id === ID.PIXEL_WIDTH && out.pixelWidth === undefined) {
      out.pixelWidth = Number(buf.subarray(body, body + size).reduce((a, b) => a * 256n + BigInt(b), 0n));
    } else if (id === ID.PIXEL_HEIGHT && out.pixelHeight === undefined) {
      out.pixelHeight = Number(buf.subarray(body, body + size).reduce((a, b) => a * 256n + BigInt(b), 0n));
    }

    if (out.duration !== undefined && out.pixelWidth !== undefined && out.pixelHeight !== undefined) {
      return;
    }
    pos = stop;
  }
}

function probeWebm(file) {
  const buf = readFileSync(file);
  const out = {};
  walk(buf, 0, buf.length, out);
  const scale = out.timecodeScale ?? 1_000_000; // EBML default: 1 ms
  return {
    seconds: out.duration === undefined ? undefined : (out.duration * scale) / 1e9,
    width: out.pixelWidth,
    height: out.pixelHeight,
    bytes: buf.length,
  };
}

/**
 * SampleVideo.tsx explains itself at length, and several of those explanations
 * name the very attributes this file forbids ("NO `muted`, NO `autoplay`").
 * Matching against raw source therefore reports the comment as the defect —
 * measured, on the first run of this file. Strip block and line comments before
 * looking at anything, so the assertions read attributes and not prose.
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Every file under `dir`, recursively. */
function walkDir(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkDir(p));
    else out.push(p);
  }
  return out;
}

/* ==========================================================================
 * 1. The asset exists. This is the failure mode the plan called out by name:
 *    shipping a <video src=...> pointing at a file that is not there.
 * ========================================================================*/
test("asset: the clip, its captions and its poster are all on disk", () => {
  for (const name of [CLIP, CAPTIONS, POSTER]) {
    const p = join(staticDir, name);
    assert.ok(existsSync(p), `welcome-page/static/${name} is missing — the <video> would 404`);
    assert.ok(statSync(p).size > 0, `welcome-page/static/${name} is empty`);
  }
});

/* ==========================================================================
 * 2. entry.ts's MEDIA preconditions, measured from the bytes.
 * ========================================================================*/
test("detector: the clip is longer than 5s and has non-zero pixel dimensions", () => {
  const probe = probeWebm(join(staticDir, CLIP));

  // entry.ts: `if (duration !== Infinity && !(duration > 5)) continue;`
  assert.ok(
    probe.seconds !== undefined,
    "could not read a duration out of the WebM — entry.ts would see NaN and drop the clip"
  );
  assert.ok(
    probe.seconds > 5,
    `clip is ${probe.seconds}s; entry.ts drops anything not > 5s, so our own self-test would find nothing`
  );

  // entry.ts: `if (!el.videoWidth || !el.videoHeight) continue;`
  assert.ok(probe.width > 0 && probe.height > 0, `clip reports ${probe.width}x${probe.height}`);

  // entry.ts rejects a RENDERED rect under 100x100. The page caps display at
  // 720px with aspect-ratio 16/9, so the intrinsic size only has to be large
  // enough that no viewport can shrink it below the floor; 320px (the narrowest
  // phone) renders 320x180.
  assert.ok(
    probe.width >= 640 && probe.height >= 360,
    `clip is ${probe.width}x${probe.height}; it should be at least 640x360`
  );

  // R-14 interaction, asserted rather than assumed: the advert penalty fires on
  // a MUTED clip under 65s. This clip is under 65s, so it must never be muted —
  // test 3 pins that. If the clip were ever made longer than 65s this coupling
  // would relax, which is why the number is named here.
  assert.ok(
    probe.seconds < 65,
    "clip is now over 65s — the R-14 note in SampleVideo.tsx about muting is stale, update it"
  );
});

/* ==========================================================================
 * 3. entry.ts's ELEMENT preconditions, in the source.
 * ========================================================================*/
test("detector: the element is never muted and never autoplays", () => {
  const src = stripComments(readFileSync(componentPath, "utf8"));
  const tag = src.slice(src.indexOf("<video"), src.indexOf("</video>"));
  assert.ok(tag.length > 0, "no <video> element found in SampleVideo.tsx");

  // `muted` would cost the +200 unmuted bonus AND collect R-14's -400 advert
  // penalty: our own sample would be scored as an advert on our own page.
  assert.ok(
    !/(^|\s)muted(\s|=|\/|>)/.test(tag),
    "the sample <video> is muted — it would score as an advert under R-14 (see SampleVideo.tsx)"
  );
  // Chrome refuses gesture-free UNMUTED autoplay, so `autoplay` here is either
  // inert or a lure toward adding `muted` to make it work.
  assert.ok(!/(^|\s)autoPlay/i.test(tag), "the sample <video> autoplays — remove it, see SampleVideo.tsx");
});

test("detector: preload is 'auto', so readyState reaches 2 without a play", () => {
  const src = stripComments(readFileSync(componentPath, "utf8"));
  // entry.ts: `if (el.readyState < 2) { sawNotReady = true; continue; }`.
  // preload="metadata" stops at readyState 1 and the extension would answer
  // "This video hasn't loaded yet" on our own welcome page.
  assert.match(src, /preload="auto"/, 'the sample <video> must set preload="auto" — see SampleVideo.tsx');
  assert.ok(!/preload="metadata"|preload="none"/.test(src), "preload was weakened below auto");
});

test("detector: the rendered box cannot fall under 100x100", () => {
  const src = stripComments(readFileSync(componentPath, "utf8"));
  // entry.ts: `if (rect.width < 100 || rect.height < 100) continue;`
  assert.match(src, /width:\s*"100%"/, "the sample <video> lost its fluid width");
  assert.match(src, /aspectRatio:\s*"16 \/ 9"/, "the sample <video> lost its aspect-ratio box");
  const maxWidth = src.match(/maxWidth:\s*(\d+)/);
  assert.ok(maxWidth, "the sample <video> lost its maxWidth");
  // 16/9 of the narrowest phone viewport still clears the floor by 80px.
  assert.ok(Number(maxWidth[1]) >= 320, `maxWidth ${maxWidth[1]} is too small`);
  for (const hostile of [/display:\s*"none"/, /visibility:\s*"hidden"/, /opacity:\s*0?\.0\d/]) {
    assert.ok(!hostile.test(src), `the sample <video> is hidden by ${hostile} — entry.ts skips it`);
  }
});

/* ==========================================================================
 * 4. Accessibility — §3.6's note. Captions and keyboard operability.
 * ========================================================================*/
test("a11y: the clip carries captions and the native, keyboard-operable controls", () => {
  const src = stripComments(readFileSync(componentPath, "utf8"));
  assert.match(src, /<track\b/, "no <track> — the clip must ship captions");
  assert.match(src, /kind="captions"/, "the <track> is not a captions track");
  assert.match(src, /controls/, "no `controls` — the player would not be keyboard-operable");

  const vtt = readFileSync(join(staticDir, CAPTIONS), "utf8");
  assert.ok(vtt.startsWith("WEBVTT"), "the caption file is not valid WebVTT (must start with WEBVTT)");
  assert.match(vtt, /-->/, "the caption file contains no cues");
});

/* ==========================================================================
 * 5. It is actually MOUNTED, and the hero button points at it.
 * ========================================================================*/
test("wiring: index.tsx renders SampleVideo and tryNow links to its anchor", () => {
  const index = stripComments(readFileSync(indexPath, "utf8")).replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
  assert.match(index, /<SampleVideo\s*\/>/, "SampleVideo is imported but never rendered");
  assert.match(
    index,
    /child-sections\/SampleVideo/,
    "SampleVideo must come from the child-owned directory, not from CORE src/sections/"
  );

  const component = stripComments(readFileSync(componentPath, "utf8"));
  const anchor = component.match(/id="([^"]+)"/);
  assert.ok(anchor, "the SampleVideo <section> lost its id — tryNow.href would dangle");

  // The VALUE, not the file. content.ts's doc comment quotes the old
  // /sample-video route to explain why it went away, so a whole-file search
  // reports that explanation as the defect.
  const content = stripComments(readFileSync(contentPath, "utf8"));
  const tryNowHref = content.match(/tryNow:\s*\{[\s\S]*?href:\s*"([^"]+)"/);
  assert.ok(tryNowHref, "could not find tryNow.href in content.ts");
  assert.equal(
    tryNowHref[1],
    `#${anchor[1]}`,
    `tryNow.href is ${JSON.stringify(tryNowHref[1])}; it must be "#${anchor[1]}" — the clip is on ` +
      `this page now, and the /sample-video route R-15 pointed at never existed`
  );
});

/* ==========================================================================
 * 6. The assertion that actually matters: it reaches what a user is served.
 * ========================================================================*/
test("built: the <video>, its captions and the clip file survive into public/", (t) => {
  if (!existsSync(publicDir)) {
    t.skip(
      "welcome-page/public/ not found — run `npm run build` first. " +
        "This test is advisory locally and strict in CI, where the build runs before it."
    );
    return;
  }

  // Gatsby copies static/ verbatim; if it ever stops, the <video> 404s.
  for (const name of [CLIP, CAPTIONS, POSTER]) {
    assert.ok(
      existsSync(join(publicDir, name)),
      `public/${name} is missing — the served page would reference a file that is not there`
    );
  }

  const html = walkDir(publicDir).filter((f) => extname(f) === ".html");
  const withVideo = html.filter((f) => {
    const body = readFileSync(f, "utf8");
    return body.includes("<video") && body.includes(CLIP);
  });
  assert.ok(
    withVideo.length > 0,
    "no server-rendered HTML under public/ contains the sample <video> — it must be there without JS"
  );

  // Same conditions as tests 3 and 4, against the SERVED markup. The source can
  // be right and the build still drop an attribute.
  const served = readFileSync(withVideo[0], "utf8");
  const tag = served.slice(served.indexOf("<video"), served.indexOf("</video>"));
  assert.ok(!/\smuted[\s=>/]/.test(tag), "the SERVED <video> is muted");
  assert.ok(!/\sautoplay[\s=>/]/i.test(tag), "the SERVED <video> autoplays");
  assert.match(tag, /preload="auto"/, "the SERVED <video> lost preload=auto");
  assert.match(tag, /controls/, "the SERVED <video> lost its controls");
  assert.match(tag, new RegExp(CAPTIONS), "the SERVED <video> lost its captions track");
});
