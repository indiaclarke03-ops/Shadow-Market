/* The Shadow Market: inline definitions. The first time a term appears in the explanatory text of a page,
   it gets a dotted underline and a plain-English definition on hover or focus. Runs again whenever a page
   re-renders, and never touches links, buttons, menus or charts. */
(function () {
  const SM = (window.SM = window.SM || {});
  const TERMS = [
    ["UFLPA", "Uyghur Forced Labor Prevention Act (US, in force since June 2022). It presumes goods made wholly or in part in Xinjiang, or by companies on its Entity List, involve forced labour, and bars them unless the importer proves otherwise."],
    ["Uyghur Forced Labor Prevention Act", "US law (June 2022) that presumes goods made wholly or in part in Xinjiang, or by listed companies, involve forced labour, and bars them unless the importer proves otherwise."],
    ["Entity List", "The UFLPA Entity List: companies the US government says use or source from forced labour in Xinjiang. Goods they make are barred from the US."],
    ["CBP", "US Customs and Border Protection, the agency that detains, releases or refuses shipments at the border."],
    ["Xinjiang", "A region in north-west China. US law presumes that goods made there wholly or in part involve forced labour."],
    ["polysilicon", "Purified silicon, the raw material for most solar cells. A large share of the world’s supply has been made in Xinjiang."],
    ["thin-film", "Solar panels made without polysilicon (First Solar uses cadmium telluride), so the main Xinjiang route doesn’t apply to them."],
    ["Sayari", "A commercial database of company ownership and trade records. The tool uses it to trace who supplies whom."],
    ["shadow market", "Supply the law is meant to cover but doesn’t reach in practice: linked to forced-labour risk, with no public customs action on record."],
    ["Monte Carlo", "A way to handle uncertainty: run the same model thousands of times, each with slightly different assumptions drawn from their ranges, and look at the spread of results."],
    ["simulated futures", "Each run of the model with one draw of every uncertain input. 10,000 of them show the range of what could happen."],
    ["reverse stress test", "Start from an outcome you can’t accept and work back to the combinations of conditions that most plausibly produce it."],
    ["HHI", "Herfindahl–Hirschman Index, a measure of concentration from 0 to 10,000. Over 2,500 counts as highly concentrated."],
    ["1260H", "A US Defense Department list of Chinese military companies. Being listed limits Pentagon contracts and purchases."],
    ["Covered List", "The FCC’s list of communications equipment and services deemed a US national-security risk. Listed products can’t get new FCC authorisations."],
    ["FCC", "Federal Communications Commission, the US regulator that authorises communications equipment."],
    ["BOM", "Bill of materials: the parts that go into a product. The exemption tested here depends on how much of a module’s parts value comes from US companies."],
    ["transceiver", "An optical module that turns electrical signals into light and back, linking servers and switches in a data centre."],
    ["S.5548", "A US Senate bill (introduced September 2026) that would restrict optical transceivers from named Chinese companies in federal national-security systems."],
    ["3.2T", "The next generation of data-centre optical transceivers (3.2 terabits per second), expected in volume around 2028. 1.6T and 800G are the current generations."],
  ];
  const DEF = Object.fromEntries(TERMS);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const re = new RegExp("\\b(" + TERMS.map(([t]) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|") + ")\\b");
  const SCOPE = ".lede, .analysis p, .panel-sub, .pr-why li, .cap, .layer .body, .find-list p, .rs-sentence, .pr-ynote, .th-plain, .route-why, .story p, .claim > p, .brief-head .lede, .model-list li";
  const SKIP = "a, button, select, option, svg, script, style, abbr, label, summary, .num, .val";

  function glossify(root) {
    if (!root) return;
    const done = new Set([...root.querySelectorAll("abbr.term")].map((a) => a.dataset.term));
    root.querySelectorAll(SCOPE).forEach((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
      const nodes = []; let n; while ((n = walker.nextNode())) nodes.push(n);
      for (const node of nodes) {
        const m = node.nodeValue.match(re);
        if (!m) continue;
        const key = m[1] === "Uyghur Forced Labor Prevention Act" ? "UFLPA" : m[1];
        if (done.has(key)) continue;
        done.add(key);
        const before = node.nodeValue.slice(0, m.index), after = node.nodeValue.slice(m.index + m[1].length);
        const ab = document.createElement("abbr");
        ab.className = "term"; ab.dataset.term = key; ab.tabIndex = 0; ab.textContent = m[1];
        ab.setAttribute("aria-label", `${m[1]}: ${DEF[m[1]]}`);
        const frag = document.createDocumentFragment();
        if (before) frag.appendChild(document.createTextNode(before));
        frag.appendChild(ab);
        if (after) frag.appendChild(document.createTextNode(after));
        node.parentNode.replaceChild(frag, node);
        if (SM.bindTip) SM.bindTip(ab, () => `<b>${esc(m[1])}</b><br>${esc(DEF[m[1]])}`);
      }
    });
  }
  SM.glossify = glossify;
  // re-run on the visible page after it renders (debounced; our own changes are ignored)
  let t = 0, busy = false;
  const run = () => { if (busy) return; busy = true; try { document.querySelectorAll(".view.on").forEach(glossify); } finally { busy = false; } };
  const mo = new MutationObserver(() => { if (busy) return; clearTimeout(t); t = setTimeout(run, 400); });
  window.addEventListener("load", () => { run(); document.querySelectorAll(".view").forEach((v) => mo.observe(v, { childList: true, subtree: true })); });
  window.addEventListener("hashchange", () => setTimeout(run, 300));
})();
