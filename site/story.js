/* The Shadow Market: "Walk me through it". A short guided story that drives the real simulator:
   each step sets the scenario, points at one result and explains it in a sentence or two.
   Every number in the text is read from the live simulation, never typed in. */
(function () {
  const SM = (window.SM = window.SM || {});
  const $ = (id) => document.getElementById(id);
  const f1 = (v) => (v > 0 && v < 10 ? v.toFixed(1) : Math.round(v));
  let i = -1, open = false, spot = null;

  const STEPS = [
    { title: "Start with today", target: "sim-readout", go: (A) => A.preset("today"),
      body: (S) => `Today US customs acts on the company groups it has already stopped. That rule flags about <b>${f1(S.flagged.p50)}%</b> of US solar supply, and in a typical future the US loses <b>${f1(S.lost.p50)}%</b> for good.` },
    { title: "Look everywhere", target: "sim-flow", go: (A) => A.preset("everything"),
      body: (S) => `Count every link to forced-labour risk the data can see and the rule flags <b>${f1(S.flagged.p50)}%</b>. Follow the flow: customs releases most stopped shipments once importers show paperwork, so only <b>${f1(S.lost.p50)}%</b> is lost for good.` },
    { title: "Now make customs strict", target: "sim-futures", go: (A) => A.preset("strict"),
      body: (S) => `Customs stops 90% of flagged shipments and accepts the paperwork only a quarter of the time. The US loses <b>${f1(S.lost.p50)}%</b> of its solar supply, and <b>${Math.round(S.lost.pOver)}</b> of these 100 futures are a serious disruption.` },
    { title: "What decides the result", target: "sim-tornado", go: () => {},
      body: (S, A) => { const t = S.sens && S.sens.rows[0]; return t ? `In this scenario the result moves most with <b>${A.INP[t.id].label.toLowerCase()}</b>. Change it across its likely range and the typical loss moves by about ${f1(Math.abs(t.hi - t.lo))} points. The longest bar is where better evidence would matter most.` : "Nothing to test at this reach."; } },
    { title: "Watch it play out", target: "pi-host", next: "Play it out", go: () => {},
      body: () => "This is the heart of the tool. Press <b>Play it out</b> to watch this future month by month: shipments held at the border, stock in US warehouses running down, and new suppliers arriving.", after: (A) => A.play() },
    { title: "Your turn", target: "act-pin", next: "Finish", go: () => {},
      body: () => `Pin any scenario as <b>A</b>, change the settings and compare the two. Or work backwards on <a href="#goal">What would it take?</a>: set a goal and find the rules that reach it.` },
  ];

  function place() {
    if (spot) spot.classList.remove("spot");
    const st = STEPS[i], A = SM.simApi;
    st.go(A);
    const S = A.cur();
    $("story-k").textContent = `Step ${i + 1} of ${STEPS.length}`;
    $("story-title").textContent = st.title;
    $("story-body").innerHTML = st.body(S, A);
    $("story-back").disabled = i === 0;
    $("story-next").textContent = st.next || "Next";
    $("story-dots").innerHTML = STEPS.map((_, k) => `<i class="${k === i ? "on" : k < i ? "done" : ""}"></i>`).join("");
    const t = $(st.target), host = t && (t.closest(".panel") || t.closest(".readout") || t);
    spot = host;
    if (host) {
      host.classList.add("spot");
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const r = host.getBoundingClientRect(), y = r.top + scrollY - Math.max(80, (innerHeight - r.height) / 2 - 80);
      scrollTo({ top: Math.max(0, y), behavior: reduced ? "auto" : "smooth" });
    }
  }
  function exit() {
    open = false; $("story").hidden = true; document.body.classList.remove("story-on");
    if (spot) spot.classList.remove("spot"); spot = null;
  }
  let wired = false;
  function wire() {
    if (wired) return; wired = true;
    $("story-next").addEventListener("click", () => {
      const st = STEPS[i];
      if (st.after) st.after(SM.simApi);
      if (i < STEPS.length - 1) { i++; place(); } else exit();
    });
    $("story-back").addEventListener("click", () => { if (i > 0) { i--; place(); } });
    $("story-x").addEventListener("click", exit);
    document.addEventListener("keydown", (e) => {
      if (!open || !$("theatre").hidden) return;
      if (e.key === "Escape") exit();
      if (e.key === "ArrowRight") $("story-next").click();
      if (e.key === "ArrowLeft") $("story-back").click();
    });
  }
  SM.startStory = function () {
    wire();
    if (!(location.hash || "").startsWith("#simulation")) { location.hash = "#simulation"; setTimeout(SM.startStory, 60); return; }
    SM.simApi.ensure();
    open = true; i = 0; $("story").hidden = false; document.body.classList.add("story-on");
    place();
    $("story-next").focus();
  };
  SM.storyRoute = function (view) { if (open && view !== "simulation") exit(); };
})();
