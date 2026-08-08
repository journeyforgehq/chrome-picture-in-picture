/* ============================================================================
 * Fixture harness — plain JS, loaded by fixtures as an ES module in the page.
 * ============================================================================
 *
 * This is the FIRST layer where real layout and real media behaviour exist.
 * The unit tests run under happy-dom, which has no layout engine at all:
 * getBoundingClientRect() is 0x0 for a real <video> and every media property
 * (videoWidth, duration, readyState, paused, muted) is fabricated by the test
 * helper. That layer tests the arithmetic against invented numbers. Here the
 * numbers come from Chromium.
 *
 * Because of that, EVERY FIXTURE ASSERTS ITS OWN PRECONDITIONS — the Phase 0
 * lesson, earned three separate times: an instrument that does not report the
 * conditions under which it measured will eventually report a defect in
 * itself as a fact about the world. Concretely:
 *
 *   - makeVideo() registers a readiness promise for each video it builds and
 *     ready() waits on all of them, so "ready" means the media pipeline
 *     actually delivered frames, not that two frames of wall clock elapsed.
 *   - ready() also stamps data-fixture-state on <html>: a JSON snapshot of
 *     every video's live readyState / paused / muted / videoWidth / duration /
 *     rect at the exact moment the spec is allowed to measure. When a case
 *     fails, that attribute says whether the fixture or the code under test
 *     was wrong.
 *   - Every video that could not reach its declared state records a note
 *     (timeout, play-rejected:NotAllowedError, ...) in that same snapshot
 *     instead of failing silently.
 * ==========================================================================*/

/** Readiness promises, one per makeVideo() call. ready() awaits all of them. */
const pending = [];
/** Live records for the data-fixture-state snapshot. */
const records = [];

/** Bounded so a deliberately never-ready fixture cannot hang the suite. */
const READY_TIMEOUT_MS = 3000;

/**
 * Build an <HTMLVideoElement> fed by an animated canvas capture stream.
 *
 * The canvas is repainted on a 100ms interval with a rotating hue plus the
 * label and a frame counter, so multi-video fixtures are visibly distinct in
 * a screenshot or a headed run.
 *
 * captureStream() naturally reports duration === Infinity, which is also what
 * a live stream reports — that is the real behaviour entry.ts's live-stream
 * branch has to survive, not something faked here.
 *
 * @param {{
 *   width?: number, height?: number, muted?: boolean, playing?: boolean,
 *   duration?: number|null, readyState?: number|null, label?: string
 * }} [opts]
 * @returns {HTMLVideoElement}
 */
export function makeVideo(opts = {}) {
  const {
    width = 640,
    height = 360,
    muted = true,
    playing = true,
    duration = null,
    readyState = null,
    label = "v",
  } = opts;

  // --- the source: an animated canvas ------------------------------------
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  let tick = 0;
  const paint = () => {
    ctx.fillStyle = "hsl(" + ((tick * 7) % 360) + " 70% 45%)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#fff";
    ctx.font = Math.round(height / 6) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label + " " + tick, width / 2, height / 2);
    tick++;
  };
  paint(); // one frame before capture so the stream has something immediately
  const timer = setInterval(paint, 100);

  // --- the element -------------------------------------------------------
  const video = document.createElement("video");
  video.dataset.label = label;
  video.muted = muted;
  video.autoplay = playing;
  video.playsInline = true;
  // Explicit px sizing: entry.ts rejects anything under 100x100 by
  // getBoundingClientRect(), and an unsized <video> with a MediaStream source
  // lays out at its default 300x150 until metadata lands.
  video.style.width = width + "px";
  video.style.height = height + "px";
  video.__pipFixtureTimer = timer;

  // DELIBERATE, DECLARED OVERRIDE — not a fake being hidden.
  // The fixture is stating "for this case, treat the element as having this
  // duration / readyState". It is visible in the fixture source, it is
  // reported in data-fixture-state, and it exists only because a real media
  // element cannot be coaxed into these states from script. Everything not
  // overridden here is whatever Chromium actually produced.
  const overrides = {};
  if (duration !== null) {
    overrides.duration = duration;
    Object.defineProperty(video, "duration", { get: () => duration, configurable: true });
  }
  if (readyState !== null) {
    overrides.readyState = readyState;
    Object.defineProperty(video, "readyState", { get: () => readyState, configurable: true });
  }

  const record = { el: video, label, overrides, notes: [] };
  records.push(record);

  // --- readiness ---------------------------------------------------------
  // Listeners are attached BEFORE srcObject so loadeddata cannot be missed,
  // and the real event is used rather than reading video.readyState, which a
  // fixture may have overridden above.
  pending.push(
    new Promise((resolve) => {
      let settled = false;
      const finish = (note) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (note) record.notes.push(note);
        resolve();
      };
      const timeout = setTimeout(() => finish("timeout"), READY_TIMEOUT_MS);

      video.addEventListener(
        "loadeddata",
        () => {
          if (!playing) {
            video.pause();
            finish();
            return;
          }
          // autoplay="" alone is not enough for unmuted media under Chrome's
          // autoplay policy; call play() and report the rejection if it comes.
          const p = video.play();
          if (p && typeof p.catch === "function") {
            p.catch((err) => {
              record.notes.push("play-rejected:" + (err && err.name ? err.name : "Error"));
              finish();
            });
          }
          if (!video.paused) {
            finish();
            return;
          }
          video.addEventListener("playing", () => finish(), { once: true });
        },
        { once: true }
      );

      video.srcObject = canvas.captureStream(10);
    })
  );

  return video;
}

/**
 * Wrap `el` in `depth` nested OPEN shadow roots and return the outermost host.
 * Open on purpose: entry.ts descends open roots and is documented to be blind
 * to closed ones, which is a separate case with its own fixture.
 *
 * @param {Element} el
 * @param {number} [depth]
 * @returns {HTMLElement} the outermost host, ready to append to the document
 */
export function nestInShadow(el, depth = 1) {
  let inner = el;
  for (let i = 0; i < depth; i++) {
    const host = document.createElement("div");
    host.dataset.shadowHost = String(depth - i);
    host.attachShadow({ mode: "open" }).append(inner);
    inner = host;
  }
  return inner;
}

/**
 * Signal the spec that this fixture is measurable.
 *
 * Waits for every makeVideo() readiness promise, then two nested
 * requestAnimationFrames so layout and the first composited frame are done,
 * then stamps the state snapshot and data-fixture-ready="true".
 *
 * The spec waits on this flag rather than a fixed timeout, so a slow machine
 * cannot turn a real result into a false one.
 *
 * @returns {Promise<void>}
 */
export function ready() {
  return Promise.all(pending).then(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const snapshot = records.map((r) => {
              const rect = r.el.getBoundingClientRect();
              return {
                label: r.label,
                readyState: r.el.readyState,
                paused: r.el.paused,
                muted: r.el.muted,
                videoWidth: r.el.videoWidth,
                videoHeight: r.el.videoHeight,
                // Infinity does not survive JSON.stringify; name it instead.
                duration: r.el.duration === Infinity ? "Infinity" : r.el.duration,
                rect: [Math.round(rect.width), Math.round(rect.height)],
                overrides: r.overrides,
                notes: r.notes,
              };
            });
            document.documentElement.dataset.fixtureState = JSON.stringify(snapshot);
            document.documentElement.dataset.fixtureReady = "true";
            resolve();
          });
        });
      })
  );
}
