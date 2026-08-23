// ---- Seedet tilfeldighet (samme bane for alle, samme dag) ----

function lagRng(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tallFraTekst(tekst) {
  let h = 0;
  for (let i = 0; i < tekst.length; i++) {
    h = (Math.imul(31, h) + tekst.charCodeAt(i)) | 0;
  }
  return h;
}

function dagensDatoStreng() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function erAprilSnarr() {
  const d = new Date();
  return d.getMonth() === 3 && d.getDate() === 1;
}

// ---- Matter.js oppsett ----

const { Engine, Render, Runner, Bodies, Body, Composite, Constraint, Events, Vector } = Matter;

const BAKKE_Y = 480;
const START_X = 100;
const PIKSLER_PER_METER = 22;
const TYNGDEKRAFT = erAprilSnarr() ? -1.1 : 1.0;

const engine = Engine.create({ gravity: { x: 0, y: TYNGDEKRAFT } });
const world = engine.world;

const canvas = document.getElementById("spill");
const render = Render.create({
  canvas,
  engine,
  options: {
    width: window.innerWidth,
    height: window.innerHeight,
    wireframes: false,
    background: "transparent",
    pixelRatio: window.devicePixelRatio || 1,
  },
});

function tilpassStorrelse() {
  render.options.width = window.innerWidth;
  render.options.height = window.innerHeight;
  render.canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
  render.canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
  render.canvas.style.width = window.innerWidth + "px";
  render.canvas.style.height = window.innerHeight + "px";
}
tilpassStorrelse();
window.addEventListener("resize", tilpassStorrelse);

// ---- Flibber ----

const flibber = Bodies.circle(START_X, BAKKE_Y - 100, 22, {
  label: "flibber",
  restitution: 0.55,
  friction: 0.06,
  frictionAir: 0.0012,
  density: 0.004,
  render: { fillStyle: "#fdcb6e", strokeStyle: "#e17055", lineWidth: 3 },
});
Composite.add(world, flibber);

// ---- Banegenerering (deterministisk per dag) ----

function lagSegmenter(seedTekst) {
  const rng = lagRng(tallFraTekst(seedTekst));
  const segmenter = [];
  let x = 0;
  let y = BAKKE_Y;

  segmenter.push({ x1: x, x2: x + 600, y, type: "vanlig" });
  x += 600;

  for (let i = 0; i < 60; i++) {
    // Vanskelighetsgraden trappes opp gradvis de første segmentene, så man
    // rekker å lære seg kontrollene før banen blir virkelig kaotisk.
    const opptrapping = Math.min(1, i / 8);
    const gapMaks = 60 + opptrapping * 130;
    const hoydeMaks = 40 + opptrapping * 150;

    x += 45 + rng() * gapMaks;
    const bredde = 130 + rng() * 200;
    y = Math.min(560, Math.max(300, y + (rng() - 0.5) * hoydeMaks));

    const terning = rng();
    let type = "vanlig";
    if (i >= 3) {
      if (terning < 0.16) type = "trampoline";
      else if (terning < 0.28) type = "vippe";
      else if (terning < 0.4 && i >= 6) type = "sag";
      else if (terning < 0.54) type = "tonne";
    }

    const harFlibbekraft = i >= 5 && rng() < 0.045;

    segmenter.push({ x1: x, x2: x + bredde, y, type, harFlibbekraft });
    x += bredde;
  }
  return segmenter;
}

function byggBane(segmenter) {
  const kropper = [];
  for (const seg of segmenter) {
    const midtX = (seg.x1 + seg.x2) / 2;
    const bredde = seg.x2 - seg.x1;

    if (seg.type === "trampoline") {
      const plattform = Bodies.rectangle(midtX, seg.y, bredde, 22, {
        isStatic: true,
        label: "trampoline",
        restitution: 1.7,
        friction: 0.02,
        render: { fillStyle: "#00b894" },
      });
      kropper.push(plattform);
    } else if (seg.type === "vippe") {
      const pol = Bodies.circle(midtX, seg.y, 8, { isStatic: true, render: { fillStyle: "#636e72" } });
      const plank = Bodies.rectangle(midtX, seg.y - 14, bredde, 18, {
        label: "platform",
        density: 0.002,
        friction: 0.3,
        render: { fillStyle: "#a29bfe" },
      });
      const ledd = Constraint.create({
        bodyA: pol,
        bodyB: plank,
        pointB: { x: 0, y: 0 },
        length: 14,
        stiffness: 1,
      });
      kropper.push(pol, plank, ledd);
    } else if (seg.type === "sag") {
      const plattform = Bodies.rectangle(midtX, seg.y, bredde, 20, {
        isStatic: true,
        label: "platform",
        render: { fillStyle: "#6c5ce7" },
      });
      const sagX = midtX + (Math.random() - 0.5) * bredde * 0.3;
      const sag = Bodies.polygon(sagX, seg.y - 34, 8, 22, {
        isStatic: true,
        label: "sag",
        render: { fillStyle: "#d63031" },
      });
      kropper.push(plattform, sag);
      sagLoopListe.push(sag);
    } else if (seg.type === "tonne") {
      const plattform = Bodies.rectangle(midtX, seg.y, bredde, 20, {
        isStatic: true,
        label: "platform",
        render: { fillStyle: "#6c5ce7" },
      });
      const tonne = Bodies.rectangle(midtX, seg.y - 28, 34, 34, {
        isStatic: true,
        label: "tonne",
        render: { fillStyle: "#e17055" },
      });
      kropper.push(plattform, tonne);
    } else {
      const plattform = Bodies.rectangle(midtX, seg.y, bredde, 20, {
        isStatic: true,
        label: "platform",
        render: { fillStyle: "#6c5ce7" },
      });
      kropper.push(plattform);
    }

    if (seg.harFlibbekraft) {
      const kraft = Bodies.circle(midtX + (Math.random() - 0.5) * bredde * 0.4, seg.y - 70, 15, {
        isStatic: true,
        isSensor: true,
        label: "flibbekraft",
        render: { fillStyle: "#fd79a8", strokeStyle: "#ffeaa7", lineWidth: 4 },
      });
      kropper.push(kraft);
    }
  }
  return kropper;
}

const sagLoopListe = [];
const baneSegmenter = lagSegmenter(dagensDatoStreng());
Composite.add(world, byggBane(baneSegmenter));

// ---- Dødsmeldinger ----

const DODSMELDINGER_GENERELT = [
  "Du flibbet for nær sola.",
  "Det gikk bra helt til det ikke gjorde det.",
  "Flibber tok en beslutning. Det var feil beslutning.",
  "Fysikken ga opp før du gjorde det.",
  "En verdig død. Slags.",
  "Det der så vondt.",
  "Newton ville vært stolt. Og bekymret.",
  "Bra forsøk. Dårlig landing.",
  "Det var ikke slik det var tenkt.",
  "En kort, men kaotisk reise.",
  "RIP Flibber. Til neste flibb.",
  "Fysikkmotoren tok det personlig.",
  "Flibber prøvde å fly. Flibber kan ikke fly.",
];
const DODSMELDINGER_SAG = [
  "Sagen vant denne gangen.",
  "Flibber ble juridisk sett en pannekake.",
  "Det ble to Flibbere. Begge døde.",
  "Skarpt. Bokstavelig talt.",
];
const DODSMELDINGER_FALL = [
  "37 meter. Ingen vet hvordan.",
  "Du fant bunnen. Bokstavelig talt.",
  "Flibber ba om nåde. Nåde kom ikke.",
  "Ned. Bare ned.",
];
const DODSMELDINGER_TONNE = [
  "Tønna hadde andre planer.",
  "Eksplosivt dårlig avgjørelse.",
  "Boom. Flibb. Boom.",
];

function velgTilfeldig(liste) {
  return liste[Math.floor(Math.random() * liste.length)];
}

function dodsmeldingFor(arsak) {
  if (arsak === "sag") return velgTilfeldig(DODSMELDINGER_SAG);
  if (arsak === "fall") return velgTilfeldig(DODSMELDINGER_FALL);
  if (arsak === "tonne") return velgTilfeldig(DODSMELDINGER_TONNE);
  return velgTilfeldig(DODSMELDINGER_GENERELT);
}

// ---- Spilltilstand ----

let spillStartet = false;
let spillerLever = false;
let rotasjonSum = 0;
let antallKollisjoner = 0;
let uovervinneligTil = 0;

const MAKS_HOPP = 3;
let hoppIgjen = MAKS_HOPP;

function nullstillTilstand() {
  rotasjonSum = 0;
  antallKollisjoner = 0;
  hoppIgjen = MAKS_HOPP;
  uovervinneligTil = 0;
  skjulSuperkraftBanner();
  Body.setPosition(flibber, { x: START_X, y: BAKKE_Y - 100 });
  Body.setVelocity(flibber, { x: 0, y: 0 });
  Body.setAngularVelocity(flibber, 0);
}

function erUovervinnelig() {
  return performance.now() < uovervinneligTil;
}

const MAKS_FART_Y_OPP = -11;

function flibb() {
  if (!spillerLever) return;
  if (hoppIgjen <= 0) return; // maks 3 flibb i lufta før du må lande på noe
  if (flibber.velocity.y < MAKS_FART_Y_OPP) return; // allerede i full fart oppover
  hoppIgjen--;
  const styrke = 0.017 * flibber.mass;
  const vinkel = -Math.PI / 2 + (Math.random() - 0.5) * 1.3;
  const kraft = { x: Math.cos(vinkel) * styrke, y: Math.sin(vinkel) * styrke };
  const forskyvning = {
    x: flibber.position.x + (Math.random() - 0.5) * flibber.circleRadius * 1.6,
    y: flibber.position.y + (Math.random() - 0.5) * flibber.circleRadius * 1.6,
  };
  Body.applyForce(flibber, forskyvning, kraft);
}

function beregnDistanse() {
  return Math.max(0, Math.round((flibber.position.x - START_X) / PIKSLER_PER_METER));
}

function beregnMultiplikator() {
  return Math.min(6, 1 + antallKollisjoner * 0.09 + rotasjonSum * 0.012);
}

// ---- Rekorder (localStorage) ----

function dagensNokkel() {
  return `flibber-dagens-${dagensDatoStreng()}`;
}

function hentBeste() {
  return {
    dagens: Number(localStorage.getItem(dagensNokkel()) || 0),
    alltid: Number(localStorage.getItem("flibber-alltid-beste") || 0),
  };
}

function lagreBeste(poeng) {
  const { dagens, alltid } = hentBeste();
  const nyDagensRekord = poeng > dagens;
  const nyAlltidRekord = poeng > alltid;
  if (nyDagensRekord) localStorage.setItem(dagensNokkel(), String(poeng));
  if (nyAlltidRekord) localStorage.setItem("flibber-alltid-beste", String(poeng));
  return { nyDagensRekord, nyAlltidRekord };
}

// ---- Dø ----

function dod(arsak) {
  if (!spillerLever) return;
  spillerLever = false;

  const distanse = beregnDistanse();
  const multiplikator = beregnMultiplikator();
  const poeng = Math.round(distanse * multiplikator);
  const { nyDagensRekord, nyAlltidRekord } = lagreBeste(poeng);

  document.getElementById("doedsmelding").textContent = dodsmeldingFor(arsak);
  document.getElementById("sluttDistanse").textContent = distanse;
  document.getElementById("sluttKaos").textContent = multiplikator.toFixed(1);
  document.getElementById("sluttPoeng").textContent = poeng;

  const rekordEl = document.getElementById("nyRekordTekst");
  if (nyAlltidRekord) {
    rekordEl.textContent = "🎉 Ny alltid-rekord!";
  } else if (nyDagensRekord) {
    rekordEl.textContent = "Ny rekord for dagens Flibb!";
  } else {
    rekordEl.textContent = `Dagens beste: ${hentBeste().dagens} poeng`;
  }

  document.getElementById("hud").classList.add("hidden");
  document.getElementById("doedsskjerm").classList.remove("hidden");
}

// ---- Kollisjon og fysikk-tikk ----

Events.on(engine, "collisionStart", (event) => {
  for (const par of event.pairs) {
    const { bodyA, bodyB } = par;
    const annen = bodyA === flibber ? bodyB : bodyB === flibber ? bodyA : null;
    if (!annen) continue;

    if (annen.label === "flibbekraft") {
      Composite.remove(world, annen);
      aktiverSuperkraft();
      continue;
    }
    if (annen.label === "sag") {
      if (erUovervinnelig()) continue;
      dod("sag");
      return;
    }
    if (annen.label === "tonne") {
      const retning = Vector.normalise(Vector.sub(flibber.position, annen.position));
      Body.applyForce(flibber, flibber.position, {
        x: retning.x * 0.09 * flibber.mass + (Math.random() - 0.5) * 0.05,
        y: retning.y * 0.09 * flibber.mass - 0.02,
      });
      Composite.remove(world, annen);
      antallKollisjoner += 3;
      continue;
    }
    if (annen.label === "trampoline") {
      // Matter sin restitusjon gir ikke et pålitelig sprett ved lav fart inn,
      // så vi setter farten direkte for en garantert, morsom sprett hver gang.
      Body.setVelocity(flibber, { x: flibber.velocity.x + (Math.random() - 0.5) * 2, y: -13 });
      antallKollisjoner += 0.6;
      hoppIgjen = MAKS_HOPP;
      continue;
    }
    if (annen.isStatic === false) {
      // vippe (dynamisk plank) - moderat kaos-bidrag
      antallKollisjoner += 0.4;
      hoppIgjen = MAKS_HOPP;
      continue;
    }
    // vanlig plattform - en landing gir tilbake flibbene dine, men lite kaos
    antallKollisjoner += 0.1;
    hoppIgjen = MAKS_HOPP;
  }
});

const MAKS_FART_X = 5.5;

Events.on(engine, "beforeUpdate", () => {
  if (!spillerLever) return;
  if (flibber.velocity.x < MAKS_FART_X) {
    Body.applyForce(flibber, flibber.position, { x: 0.00028 * flibber.mass, y: 0 });
  }
  rotasjonSum += Math.abs(flibber.angularVelocity);

  for (const sag of sagLoopListe) {
    Body.setAngularVelocity(sag, 0.25);
  }

  if (flibber.position.y > BAKKE_Y + 500 && !erUovervinnelig()) {
    dod("fall");
  }

  if (uovervinneligTil > 0) {
    oppdaterSuperkraftBanner();
  }
});

Events.on(render, "beforeRender", () => {
  Render.lookAt(render, flibber, { x: 260, y: 220 });
});

Events.on(render, "afterRender", () => {
  tegnFlibberAnsikt();
  if (spillerLever) oppdaterHud();
});

// Matter.Render nullstiller canvas-transformen sin før "afterRender" fyres,
// så vi må selv regne om fra verdenskoordinater til skjermkoordinater ut fra
// gjeldende kamera-utsnitt (render.bounds), i stedet for å stole på ctx sin
// egen transform-tilstand.
function verdenTilSkjerm(x, y) {
  const b = render.bounds;
  const skalaX = render.options.width / (b.max.x - b.min.x);
  const skalaY = render.options.height / (b.max.y - b.min.y);
  return { x: (x - b.min.x) * skalaX, y: (y - b.min.y) * skalaY, skala: skalaX };
}

function tegnFlibberAnsikt() {
  const ctx = render.context;
  const punkt = verdenTilSkjerm(flibber.position.x, flibber.position.y);

  ctx.save();
  ctx.translate(punkt.x, punkt.y);
  ctx.scale(punkt.skala, punkt.skala);
  ctx.rotate(flibber.angle);
  ctx.fillStyle = "#2d3436";
  const oyeAvstand = 8;
  ctx.beginPath();
  ctx.arc(-oyeAvstand, -4, 3, 0, Math.PI * 2);
  ctx.arc(oyeAvstand, -4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 6, 7, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#2d3436";
  ctx.stroke();
  ctx.restore();
}

const SUPERKRAFT_VARIGHET = 8000;

function aktiverSuperkraft() {
  uovervinneligTil = performance.now() + SUPERKRAFT_VARIGHET;
  document.getElementById("superkraftBanner").classList.remove("hidden");
  flibber.render.strokeStyle = "#fd79a8";
  flibber.render.lineWidth = 6;
}

function oppdaterSuperkraftBanner() {
  const igjen = Math.max(0, (uovervinneligTil - performance.now()) / 1000);
  if (igjen <= 0) {
    skjulSuperkraftBanner();
    return;
  }
  document.getElementById("superkraftTid").textContent = igjen.toFixed(1);
}

function skjulSuperkraftBanner() {
  document.getElementById("superkraftBanner").classList.add("hidden");
  flibber.render.strokeStyle = "#e17055";
  flibber.render.lineWidth = 3;
}

function oppdaterHud() {
  document.getElementById("distanse").textContent = `${beregnDistanse()} m`;
  const mult = beregnMultiplikator();
  document.getElementById("kaosLabel").textContent = `KAOS x${mult.toFixed(1)}`;
  document.getElementById("kaosFyll").style.width = `${Math.min(100, (mult - 1) * 20)}%`;
}

// ---- Input ----

function trykkFlibb(e) {
  if (e) e.preventDefault();
  if (spillerLever) flibb();
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") trykkFlibb(e);
});
canvas.addEventListener("pointerdown", trykkFlibb);

// ---- Start / prøv igjen ----

function startSpill() {
  document.getElementById("startskjerm").classList.add("hidden");
  document.getElementById("doedsskjerm").classList.add("hidden");
  document.getElementById("hud").classList.remove("hidden");
  nullstillTilstand();
  spillerLever = true;

  if (!spillStartet) {
    spillStartet = true;
    Render.run(render);
    const runner = Runner.create();
    Runner.run(runner, engine);
  }
}

document.getElementById("startKnapp").addEventListener("click", startSpill);
document.getElementById("proveIgjenKnapp").addEventListener("click", startSpill);

const beste = hentBeste();
if (beste.dagens > 0) {
  document.getElementById("dagensBeste").textContent = `Dagens beste: ${beste.dagens} poeng`;
}
