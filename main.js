const BUILTIN_FONTS = [
  {
    id: "Clunsois",
    label: "Clun'sois (défaut)",
    url: "./polices/clunsois_complet.ttf",
    format: "truetype",
    mime: "font/ttf",
  },
  {
    id: "Zagoth",
    label: "Zagoth",
    url: "./polices/zagoth_complet.ttf",
    format: "truetype",
    mime: "font/ttf",
  },
];

const SYSTEM_FONTS = [
  { id: "serif", label: "Serif (système)" },
  { id: "sans-serif", label: "Sans-serif (système)" },
  { id: "monospace", label: "Monospace (système)" },
];

const DEFAULTS = {
  buque: "Buque",
  fams: "Fam'ss",
  proms: "Prom'ss",
  bande: "Bande",
  boquette: "Boquette",
  bouls: ["Boul'ss"],
  boulsCols: "auto",
  rightSideText: "",
  leftSideOrientation: "-90",
  rightSideOrientation: "90",
  hideBouls: false,
  buqueFont: "Clunsois",
  famsFont: "Clunsois",
  secondaryFont: "Clunsois",
  buqueSize: 18,
  famsSize: 5,
  famsGap: -1,
  textSize: 5,
  width: 100,
  height: 50,
  textColor: "#000000",
  cornerColor: "#000000",
  bgColor: "#ffffff",
  transparentBg: true,
  showCorners: true,
};

// Map<fontId, { id, label, dataUrl?, url?, format }>
const fontRegistry = new Map();
let boulsList = [...DEFAULTS.bouls];
let importedSvgGraphic = null; // { viewBox, innerMarkup }
let famsLogo = null; // { type: 'svg' | 'image', aspectRatio, viewBox?, innerMarkup?, dataUrl? }
let lastLayoutMetrics = {
  totalWidth: DEFAULTS.width,
  effectiveHeight: DEFAULTS.height,
  colOffsets: [],
};
let dragSourceIndex = null;

document.addEventListener("DOMContentLoaded", async () => {
  initFontSelectors();
  renderBoulsEditor();
  bindEvents();
  renderSignature();

  await loadBuiltinFonts();
  renderSignature();
});

function initFontSelectors() {
  BUILTIN_FONTS.forEach((f) => {
    fontRegistry.set(f.id, { ...f });
  });
  SYSTEM_FONTS.forEach((f) => {
    fontRegistry.set(f.id, { ...f, isSystem: true });
  });
  refreshFontDropdowns();
}

function refreshFontDropdowns() {
  const selectors = [
    { el: document.getElementById("buqueFont"), fallback: DEFAULTS.buqueFont },
    { el: document.getElementById("famsFont"), fallback: DEFAULTS.famsFont },
    { el: document.getElementById("secondaryFont"), fallback: DEFAULTS.secondaryFont },
  ];

  selectors.forEach(({ el, fallback }) => {
    const prev = el.value || fallback;
    el.innerHTML = "";
    for (const font of fontRegistry.values()) {
      const opt = document.createElement("option");
      opt.value = font.id;
      opt.textContent = font.label;
      el.appendChild(opt);
    }
    el.value = fontRegistry.has(prev) ? prev : fallback;
  });
}

async function loadBuiltinFonts() {
  await Promise.all(
    BUILTIN_FONTS.map(async (font) => {
      try {
        const res = await fetch(font.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        await registerFontBuffer(font.id, font.label, buffer, font.format, font.mime);
      } catch (err) {
        // Fallback for file:// where fetch may be blocked by CORS
        const face = new FontFace(font.id, `url('${font.url}')`);
        try {
          await face.load();
          document.fonts.add(face);
        } catch {
          console.warn(`Impossible de charger la police ${font.id}:`, err);
        }
      }
    })
  );
}

async function registerFontBuffer(id, label, buffer, format, mime) {
  const base64 = arrayBufferToBase64(buffer);
  const dataUrl = `data:${mime};base64,${base64}`;
  const face = new FontFace(id, buffer);
  await face.load();
  document.fonts.add(face);

  fontRegistry.set(id, {
    id,
    label,
    dataUrl,
    format,
    mime,
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function getFontFormatInfo(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  switch (ext) {
    case "otf":
      return { format: "opentype", mime: "font/otf" };
    case "woff":
      return { format: "woff", mime: "font/woff" };
    case "woff2":
      return { format: "woff2", mime: "font/woff2" };
    case "ttf":
    default:
      return { format: "truetype", mime: "font/ttf" };
  }
}

function bindEvents() {
  const form = document.getElementById("signatureForm");
  form.addEventListener("input", () => {
    syncRangeLabels();
    renderSignature();
  });
  form.addEventListener("change", () => {
    syncRangeLabels();
    renderSignature();
  });
  form.addEventListener("submit", (e) => e.preventDefault());

  document.getElementById("addBoulsBtn").addEventListener("click", () => {
    boulsList.push("");
    renderBoulsEditor();
    const inputs = document.querySelectorAll("#boulsList input[type='text']");
    if (inputs.length) inputs[inputs.length - 1].focus();
    renderSignature();
  });

  document.getElementById("rightSideText").addEventListener("input", (e) => {
    if (e.target.value.trim().length > 0) {
      document.getElementById("hideBouls").checked = true;
    }
  });
  document.getElementById("customFontInput").addEventListener("change", handleCustomFontUpload);
  document.getElementById("famsLogoInput").addEventListener("change", handleFamsLogoUpload);
  document.getElementById("removeFamsLogoBtn").addEventListener("click", () => {
    clearFamsLogo();
    renderSignature();
    setStatus("Logo Fam'ss retiré.");
  });
  document.getElementById("importSvgInput").addEventListener("change", handleSvgImport);
  document.getElementById("removeImportedSvgBtn").addEventListener("click", () => {
    clearImportedSvg();
    renderSignature();
    setStatus("Motif SVG retiré.");
  });
  document.getElementById("resetBtn").addEventListener("click", resetParameters);
  document.getElementById("downloadSvgBtn").addEventListener("click", exportSVG);
  document.getElementById("downloadPngBtn").addEventListener("click", exportPNG);
  document.getElementById("downloadPdfBtn").addEventListener("click", exportPDF);
}

function renderBoulsEditor() {
  const container = document.getElementById("boulsList");
  container.innerHTML = "";

  boulsList.forEach((value, index) => {
    const row = document.createElement("div");
    row.className = "bouls-item";
    row.draggable = true;

    row.addEventListener("dragstart", () => {
      dragSourceIndex = index;
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      dragSourceIndex = null;
      row.classList.remove("dragging");
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      if (dragSourceIndex === null || dragSourceIndex === index) return;
      const [moved] = boulsList.splice(dragSourceIndex, 1);
      boulsList.splice(index, 0, moved);
      dragSourceIndex = null;
      renderBoulsEditor();
      renderSignature();
    });

    const handle = document.createElement("span");
    handle.className = "bouls-drag-handle";
    handle.textContent = "⋮⋮";
    handle.title = "Glisser pour réorganiser";

    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.placeholder = `Boul'ss ${index + 1}`;
    input.addEventListener("input", () => {
      boulsList[index] = input.value;
      renderSignature();
    });

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "btn-icon";
    upBtn.textContent = "↑";
    upBtn.title = "Monter";
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", () => moveBoulsItem(index, -1));

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "btn-icon";
    downBtn.textContent = "↓";
    downBtn.title = "Descendre";
    downBtn.disabled = index === boulsList.length - 1;
    downBtn.addEventListener("click", () => moveBoulsItem(index, 1));

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-icon btn-remove";
    removeBtn.textContent = "×";
    removeBtn.title = "Supprimer";
    removeBtn.addEventListener("click", () => {
      boulsList.splice(index, 1);
      renderBoulsEditor();
      renderSignature();
    });

    row.append(handle, input, upBtn, downBtn, removeBtn);
    container.appendChild(row);
  });
}

function moveBoulsItem(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= boulsList.length) return;
  [boulsList[index], boulsList[target]] = [boulsList[target], boulsList[index]];
  renderBoulsEditor();
  renderSignature();
}

function syncRangeLabels() {
  document.getElementById("buqueSizeVal").textContent = document.getElementById("buqueSize").value;
  document.getElementById("famsSizeVal").textContent = document.getElementById("famsSize").value;
  document.getElementById("famsGapVal").textContent = document.getElementById("famsGap").value;
  document.getElementById("textSizeVal").textContent = document.getElementById("textSize").value;
  document.getElementById("importedSvgScaleVal").textContent = document.getElementById("importedSvgScale").value;
  document.getElementById("importedSvgOpacityVal").textContent = document.getElementById("importedSvgOpacity").value;
  const w = clampNumber(document.getElementById("sigWidth").value, 60, 250, DEFAULTS.width);
  const h = clampNumber(document.getElementById("sigHeight").value, 35, 150, DEFAULTS.height);
  document.getElementById("dimensionsBadge").textContent = `${w} × ${h} mm`;
}

async function handleCustomFontUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  try {
    setStatus("Chargement de la police...");
    const buffer = await file.arrayBuffer();
    const rawName = file.name.replace(/\.[^.]+$/, "");
    const safeId = `Custom_${rawName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${Date.now().toString(36)}`;
    const { format, mime } = getFontFormatInfo(file.name);

    await registerFontBuffer(safeId, `${rawName} (importée)`, buffer, format, mime);
    refreshFontDropdowns();
    document.getElementById("buqueFont").value = safeId;
    renderSignature();
    setStatus(`Police « ${rawName} » ajoutée pour la Buque.`);
  } catch (err) {
    console.error(err);
    setStatus("Erreur lors du chargement du fichier de police.", true);
  } finally {
    e.target.value = "";
  }
}

function clearImportedSvg() {
  importedSvgGraphic = null;
  document.getElementById("importedSvgControls").style.display = "none";
}

async function handleSvgImport(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "image/svg+xml");
    if (doc.querySelector("parsererror") || !doc.documentElement || doc.documentElement.tagName.toLowerCase() !== "svg") {
      setStatus("Fichier SVG invalide.", true);
      return;
    }

    const svgEl = doc.documentElement;
    svgEl.querySelectorAll("script").forEach((s) => s.remove());

    const isGeneratedSig =
      Boolean(doc.getElementById("signature-gadz")) ||
      Boolean(doc.getElementById("text-buque"));

    if (isGeneratedSig) {
      const readText = (id) => {
        const el = doc.getElementById(id);
        return el ? el.textContent.trim() : null;
      };

      const buque = readText("text-buque");
      const fams = readText("text-fams");
      const proms = readText("text-proms");
      const bande = readText("text-bande");
      const boquette = readText("text-boquette");
      const rightSide = readText("text-right-side");

      if (buque !== null) document.getElementById("buque").value = buque;
      if (fams !== null) document.getElementById("fams").value = fams;
      if (proms !== null) document.getElementById("proms").value = proms;
      if (bande !== null) document.getElementById("bande").value = bande;
      if (boquette !== null) document.getElementById("boquette").value = boquette;
      if (rightSide !== null) document.getElementById("rightSideText").value = rightSide;

      const boulsCols = Array.from(svgEl.querySelectorAll("[id^='text-bouls']"));
      if (boulsCols.length > 0) {
        const extracted = [];
        boulsCols.forEach((colEl) => {
          const tspans = colEl.querySelectorAll("tspan");
          if (tspans.length > 0) {
            tspans.forEach((ts) => extracted.push(ts.textContent.trim()));
          } else if (colEl.textContent.trim()) {
            extracted.push(colEl.textContent.trim());
          }
        });
        if (extracted.length > 0) {
          boulsList = extracted;
          renderBoulsEditor();
        }
      }

      const vb = svgEl.getAttribute("viewBox");
      if (vb) {
        const parts = vb.trim().split(/[\s,]+/).map(Number);
        if (parts.length === 4 && parts[2] >= 60 && parts[3] >= 35) {
          document.getElementById("sigHeight").value = Math.min(150, Math.round(parts[3]));
        }
      }

      clearImportedSvg();
      syncRangeLabels();
      renderSignature();
      setStatus(`Signature « ${file.name} » importée.`);
    } else {
      let viewBox = svgEl.getAttribute("viewBox");
      if (!viewBox) {
        const wAttr = parseFloat(svgEl.getAttribute("width")) || 100;
        const hAttr = parseFloat(svgEl.getAttribute("height")) || 100;
        viewBox = `0 0 ${wAttr} ${hAttr}`;
      }
      const serializer = new XMLSerializer();
      const innerMarkup = Array.from(svgEl.childNodes)
        .map((node) => serializer.serializeToString(node))
        .join("");

      importedSvgGraphic = { viewBox, innerMarkup };
      document.getElementById("importedSvgControls").style.display = "grid";
      syncRangeLabels();
      renderSignature();
      setStatus(`Motif SVG « ${file.name} » importé.`);
    }
  } catch (err) {
    console.error(err);
    setStatus("Erreur lors de l'import du fichier SVG.", true);
  } finally {
    e.target.value = "";
  }
}

function clearFamsLogo() {
  famsLogo = null;
  document.getElementById("removeFamsLogoBtn").style.display = "none";
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Erreur de lecture du fichier"));
    reader.readAsDataURL(file);
  });
}

async function handleFamsLogoUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  try {
    const isSvg =
      file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");

    if (isSvg) {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "image/svg+xml");
      if (doc.querySelector("parsererror") || !doc.documentElement || doc.documentElement.tagName.toLowerCase() !== "svg") {
        setStatus("Fichier logo SVG invalide.", true);
        return;
      }
      const svgEl = doc.documentElement;
      svgEl.querySelectorAll("script").forEach((s) => s.remove());

      let viewBox = svgEl.getAttribute("viewBox");
      let vbW = 100;
      let vbH = 100;
      if (viewBox) {
        const parts = viewBox.trim().split(/[\s,]+/).map(Number);
        if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
          vbW = parts[2];
          vbH = parts[3];
        }
      } else {
        vbW = parseFloat(svgEl.getAttribute("width")) || 100;
        vbH = parseFloat(svgEl.getAttribute("height")) || 100;
        viewBox = `0 0 ${vbW} ${vbH}`;
      }

      const serializer = new XMLSerializer();
      const innerMarkup = Array.from(svgEl.childNodes)
        .map((node) => serializer.serializeToString(node))
        .join("");

      famsLogo = {
        type: "svg",
        viewBox,
        innerMarkup,
        aspectRatio: vbW / vbH,
      };
    } else {
      const dataUrl = await readFileAsDataURL(file);
      const dims = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || 100, h: img.naturalHeight || 100 });
        img.onerror = () => reject(new Error("Format d'image non supporté"));
        img.src = dataUrl;
      });
      famsLogo = {
        type: "image",
        dataUrl,
        aspectRatio: dims.w / dims.h,
      };
    }

    document.getElementById("removeFamsLogoBtn").style.display = "block";
    renderSignature();
    setStatus(`Logo Fam'ss « ${file.name} » appliqué.`);
  } catch (err) {
    console.error(err);
    setStatus("Erreur lors du chargement du logo Fam'ss.", true);
  } finally {
    e.target.value = "";
  }
}

function resetParameters() {
  document.getElementById("boulsCols").value = DEFAULTS.boulsCols;
  document.getElementById("rightSideText").value = DEFAULTS.rightSideText;
  document.getElementById("leftSideOrientation").value = DEFAULTS.leftSideOrientation;
  document.getElementById("rightSideOrientation").value = DEFAULTS.rightSideOrientation;
  document.getElementById("hideBouls").checked = DEFAULTS.hideBouls;
  document.getElementById("buqueFont").value = DEFAULTS.buqueFont;
  document.getElementById("famsFont").value = DEFAULTS.famsFont;
  document.getElementById("secondaryFont").value = DEFAULTS.secondaryFont;
  document.getElementById("buqueSize").value = DEFAULTS.buqueSize;
  document.getElementById("famsSize").value = DEFAULTS.famsSize;
  document.getElementById("famsGap").value = DEFAULTS.famsGap;
  document.getElementById("textSize").value = DEFAULTS.textSize;
  document.getElementById("sigWidth").value = DEFAULTS.width;
  document.getElementById("sigHeight").value = DEFAULTS.height;
  document.getElementById("textColor").value = DEFAULTS.textColor;
  document.getElementById("cornerColor").value = DEFAULTS.cornerColor;
  document.getElementById("bgColor").value = DEFAULTS.bgColor;
  document.getElementById("transparentBg").checked = DEFAULTS.transparentBg;
  document.getElementById("showCorners").checked = DEFAULTS.showCorners;
  clearImportedSvg();
  clearFamsLogo();

  syncRangeLabels();
  renderSignature();
  setStatus("Paramètres réinitialisés.");
}

function getState() {
  return {
    buque: document.getElementById("buque").value,
    fams: document.getElementById("fams").value,
    proms: document.getElementById("proms").value,
    bande: document.getElementById("bande").value,
    boquette: document.getElementById("boquette").value,
    bouls: document.getElementById("hideBouls").checked
      ? []
      : boulsList.map((s) => s.trim()).filter(Boolean),
    boulsCols: document.getElementById("boulsCols").value || DEFAULTS.boulsCols,
    rightSideText: document.getElementById("rightSideText").value,
    leftSideOrientation: document.getElementById("leftSideOrientation").value || DEFAULTS.leftSideOrientation,
    rightSideOrientation: document.getElementById("rightSideOrientation").value || DEFAULTS.rightSideOrientation,
    hideBouls: document.getElementById("hideBouls").checked,
    buqueFont: document.getElementById("buqueFont").value || DEFAULTS.buqueFont,
    famsFont: document.getElementById("famsFont").value || DEFAULTS.famsFont,
    secondaryFont: document.getElementById("secondaryFont").value || DEFAULTS.secondaryFont,
    buqueSize: clampNumber(document.getElementById("buqueSize").value, 8, 34, DEFAULTS.buqueSize),
    famsSize: clampNumber(document.getElementById("famsSize").value, 3, 16, DEFAULTS.famsSize),
    famsGap: clampNumber(document.getElementById("famsGap").value, -6, 10, DEFAULTS.famsGap),
    textSize: clampNumber(document.getElementById("textSize").value, 3, 9, DEFAULTS.textSize),
    importedSvgScale: clampNumber(document.getElementById("importedSvgScale").value, 10, 100, 60),
    importedSvgOpacity: clampNumber(document.getElementById("importedSvgOpacity").value, 10, 100, 100),
    width: clampNumber(document.getElementById("sigWidth").value, 60, 250, DEFAULTS.width),
    height: clampNumber(document.getElementById("sigHeight").value, 35, 150, DEFAULTS.height),
    textColor: document.getElementById("textColor").value,
    cornerColor: document.getElementById("cornerColor").value,
    bgColor: document.getElementById("bgColor").value,
    transparentBg: document.getElementById("transparentBg").checked,
    showCorners: document.getElementById("showCorners").checked,
  };
}

function clampNumber(val, min, max, fallback) {
  const num = parseFloat(val);
  if (Number.isNaN(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildFontStyleBlock(usedFontIds) {
  const rules = [];
  for (const id of new Set(usedFontIds)) {
    const font = fontRegistry.get(id);
    if (!font || font.isSystem) continue;
    const src = font.dataUrl
      ? `url('${font.dataUrl}') format('${font.format}')`
      : font.url
        ? `url('${font.url}') format('${font.format}')`
        : null;
    if (src) {
      rules.push(`@font-face { font-family: '${font.id}'; src: ${src}; font-weight: normal; font-style: normal; }`);
    }
  }
  if (rules.length === 0) return "";
  return `<style type="text/css"><![CDATA[\n${rules.join("\n")}\n]]></style>`;
}

function buildCornersMarkup(W, H, color, scale = 1) {
  const strokeStyle = `fill:none;stroke:${color};stroke-width:0.820208;stroke-linecap:round;stroke-linejoin:bevel;stroke-opacity:1;paint-order:markers stroke fill`;
  const cornerPaths = `
      <path style="${strokeStyle}" d="m 6,18 v -8 h 4 V 6 h 8" />
      <path style="${strokeStyle}" d="M 8,14 V 8 h 6" />`;

  return `
    <g id="equerres">
      <g id="ekr-tl" transform="scale(${scale})">${cornerPaths}
      </g>
      <g id="ekr-tr" transform="translate(${W}, 0) scale(${-scale}, ${scale})">${cornerPaths}
      </g>
      <g id="ekr-bl" transform="translate(0, ${H}) scale(${scale}, ${-scale})">${cornerPaths}
      </g>
      <g id="ekr-br" transform="translate(${W}, ${H}) scale(${-scale}, ${-scale})">${cornerPaths}
      </g>
    </g>`;
}

function computeBoulsLayout(state) {
  const { bouls, boulsCols, textSize, height } = state;
  const n = bouls.length;
  if (n === 0) {
    return { columns: [], effectiveHeight: height, lineHeight: textSize * 1.25 };
  }

  const lineHeight = textSize * 1.25;
  const maxRowsBase = Math.max(1, Math.floor((height - 12) / lineHeight));

  let numCols;
  if (boulsCols === "auto") {
    if (n <= maxRowsBase) numCols = 1;
    else if (n <= maxRowsBase * 2) numCols = 2;
    else numCols = 3;
  } else {
    numCols = Math.min(3, Math.max(1, parseInt(boulsCols, 10) || 1));
  }
  numCols = Math.min(numCols, n);

  const rowsPerCol = Math.ceil(n / numCols);
  const neededH = rowsPerCol * lineHeight + 12;
  const effectiveHeight = Math.max(height, Math.ceil(neededH));

  const columns = [];
  for (let c = 0; c < numCols; c++) {
    const slice = bouls.slice(c * rowsPerCol, (c + 1) * rowsPerCol);
    if (slice.length) columns.push(slice);
  }

  return { columns, effectiveHeight, lineHeight };
}

function buildBoulsMarkup(columns, colOffsets, defaultX, cy, lineHeight, style) {
  if (!columns.length) return "";
  return columns
    .map((items, colIdx) => {
      const x = colOffsets[colIdx] !== undefined ? colOffsets[colIdx] : defaultX;
      const startY = cy - ((items.length - 1) * lineHeight) / 2;
      const tspans = items
        .map((item, rowIdx) => `<tspan x="${x}" y="${startY + rowIdx * lineHeight}">${escapeXml(item)}</tspan>`)
        .join("");
      return `<text id="text-bouls-col-${colIdx}" x="${x}" y="${startY}" text-anchor="start" dominant-baseline="central" style="${style}">${tspans}</text>`;
    })
    .join("\n    ");
}

function buildSignatureSVGString(
  state,
  {
    forceOpaqueBg = false,
    frameWidth = null,
    frameHeight = null,
    totalWidth = null,
    cornerScale = 1,
    colOffsets = [],
    positions = null,
  } = {}
) {
  const {
    buque,
    fams,
    proms,
    bande,
    boquette,
    rightSideText,
    leftSideOrientation,
    rightSideOrientation,
    buqueFont,
    famsFont,
    secondaryFont,
    buqueSize,
    famsSize,
    textSize,
    importedSvgScale,
    importedSvgOpacity,
    width: baseW,
    textColor,
    cornerColor,
    bgColor,
    transparentBg,
    showCorners,
  } = state;

  const { columns, effectiveHeight: boulsH, lineHeight } = computeBoulsLayout(state);
  const W = frameWidth && frameWidth > 0 ? frameWidth : baseW;
  const H = frameHeight && frameHeight > 0 ? frameHeight : boulsH;
  const exportW = totalWidth && totalWidth > W ? totalWidth : W;
  const fontStyle = buildFontStyleBlock([buqueFont, famsFont, secondaryFont]);
  const bgMarkup =
    !transparentBg || forceOpaqueBg
      ? `<rect id="bg-rect" x="0" y="0" width="${exportW}" height="${H}" fill="${transparentBg ? "#ffffff" : bgColor}" />`
      : "";
  const cornersMarkup = showCorners ? buildCornersMarkup(W, H, cornerColor, cornerScale) : "";

  let importedMotifMarkup = "";
  if (importedSvgGraphic) {
    const motifW = (W * importedSvgScale) / 100;
    const motifH = (H * importedSvgScale) / 100;
    const motifX = (W - motifW) / 2;
    const motifY = (H - motifH) / 2;
    const opacity = (importedSvgOpacity / 100).toFixed(2);
    importedMotifMarkup = `<svg id="imported-svg-motif" x="${motifX}" y="${motifY}" width="${motifW}" height="${motifH}" viewBox="${escapeXml(importedSvgGraphic.viewBox)}" preserveAspectRatio="xMidYMid meet" opacity="${opacity}">${importedSvgGraphic.innerMarkup}</svg>`;
  }

  const cx = W / 2;
  const cy = H / 2;
  const hasFamsLogo = Boolean(famsLogo);
  const hasFams = hasFamsLogo || fams.trim().length > 0;
  const bandeY = positions ? positions.bandeY : 6.5;
  const boquetteY = positions ? positions.boquetteY : H - 6.5;
  const buqueY = positions ? positions.buqueY : hasFams ? cy - famsSize * 0.55 : cy;
  const famsY = positions
    ? positions.famsY
    : Math.min(buqueY + buqueSize * 0.45 + famsSize * 0.55 + 0.5, H - 9.5);
  const promsX = positions ? positions.promsX : 6.5 * cornerScale;
  const rightSideX = positions ? positions.rightSideX : W - 6.5 * cornerScale;
  const boulsStartX = W - 6 * cornerScale;
  const hasRightSide = rightSideText.trim().length > 0;
  const leftTransform =
    leftSideOrientation !== "0" ? ` transform="rotate(${leftSideOrientation}, ${promsX}, ${cy})"` : "";
  const rightTransform =
    rightSideOrientation !== "0" ? ` transform="rotate(${rightSideOrientation}, ${rightSideX}, ${cy})"` : "";

  const commonSecondary = `font-family:'${secondaryFont}',sans-serif;font-size:${textSize}px;fill:${textColor};`;
  const buqueStyle = `font-family:'${buqueFont}',sans-serif;font-size:${buqueSize}px;fill:${textColor};`;
  const famsStyle = `font-family:'${famsFont}',sans-serif;font-size:${famsSize}px;fill:${textColor};`;
  const boulsMarkup = buildBoulsMarkup(
    columns,
    colOffsets,
    boulsStartX,
    cy,
    lineHeight,
    commonSecondary
  );

  let famsMarkup = "";
  if (hasFamsLogo) {
    const logoH = famsSize;
    const logoW = logoH * famsLogo.aspectRatio;
    const logoX = cx - logoW / 2;
    const logoY = famsY - logoH / 2;
    famsMarkup =
      famsLogo.type === "svg"
        ? `<svg id="fams-logo" x="${logoX}" y="${logoY}" width="${logoW}" height="${logoH}" viewBox="${escapeXml(famsLogo.viewBox)}" preserveAspectRatio="xMidYMid meet">${famsLogo.innerMarkup}</svg>`
        : `<image id="fams-logo" x="${logoX}" y="${logoY}" width="${logoW}" height="${logoH}" href="${famsLogo.dataUrl}" preserveAspectRatio="xMidYMid meet" />`;
  } else if (hasFams) {
    famsMarkup = `<text id="text-fams" x="${cx}" y="${famsY}" text-anchor="middle" dominant-baseline="central" style="${famsStyle}">${escapeXml(fams)}</text>`;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${exportW}mm" height="${H}mm" viewBox="0 0 ${exportW} ${H}" version="1.1">
  <defs>
    ${fontStyle}
  </defs>
  <g id="signature-gadz">
    ${bgMarkup}
    ${importedMotifMarkup}
    ${cornersMarkup}
    <text id="text-bande" x="${cx}" y="${bandeY}" text-anchor="middle" dominant-baseline="central" style="${commonSecondary}">${escapeXml(bande)}</text>
    <text id="text-buque" x="${cx}" y="${buqueY}" text-anchor="middle" dominant-baseline="central" style="${buqueStyle}">${escapeXml(buque)}</text>
    ${famsMarkup}
    <text id="text-proms" x="${promsX}" y="${cy}" text-anchor="middle" dominant-baseline="central"${leftTransform} style="${commonSecondary}">${escapeXml(proms)}</text>
    ${hasRightSide ? `<text id="text-right-side" x="${rightSideX}" y="${cy}" text-anchor="middle" dominant-baseline="central"${rightTransform} style="${commonSecondary}">${escapeXml(rightSideText)}</text>` : ""}
    ${boulsMarkup}
    <text id="text-boquette" x="${cx}" y="${boquetteY}" text-anchor="middle" dominant-baseline="central" style="${commonSecondary}">${escapeXml(boquette)}</text>
  </g>
</svg>`;
}

function safeGetBBox(svg, id) {
  const el = svg && svg.getElementById(id);
  if (!el) return { width: 0, height: 0 };
  try {
    return el.getBBox();
  } catch {
    return { width: 0, height: 0 };
  }
}

function renderSignature() {
  const state = getState();
  const { columns, effectiveHeight: boulsH } = computeBoulsLayout(state);
  const container = document.getElementById("svgContainer");

  // Pass 1 : rendu initial pour mesurer les tailles réelles des textes
  container.innerHTML = buildSignatureSVGString(state);
  const svg = container.querySelector("svg");

  const bandeBox = safeGetBBox(svg, "text-bande");
  const buqueBox = safeGetBBox(svg, "text-buque");
  const famsBox = famsLogo
    ? { width: state.famsSize * famsLogo.aspectRatio, height: state.famsSize }
    : safeGetBBox(svg, "text-fams");
  const promsBox = safeGetBBox(svg, "text-proms");
  const rightBox = safeGetBBox(svg, "text-right-side");
  const boquetteBox = safeGetBBox(svg, "text-boquette");

  const colBoxes = columns.map((_, c) => safeGetBBox(svg, `text-bouls-col-${c}`));
  const colWidths = colBoxes.map((b) => b.width);
  const boulsContentH = colBoxes.length ? Math.max(...colBoxes.map((b) => b.height)) : 0;

  const hasFams = Boolean(famsLogo) || state.fams.trim().length > 0;
  const famsGap = hasFams ? state.famsGap : 0;
  const centerBlockH = Math.max(
    buqueBox.height,
    buqueBox.height + (hasFams ? famsGap + famsBox.height : 0)
  );

  // Calcul des dimensions du cadre pour éviter toute superposition
  let cornerScale = clampNumber(
    Math.min(state.width / 100, state.height / 50),
    0.85,
    1.5,
    1
  );
  let frameW = state.width;
  let frameH = Math.max(state.height, boulsH);

  for (let pass = 0; pass < 2; pass++) {
    const ekrReach = 18 * cornerScale;
    const ekrMargin = ekrReach + 2.5;
    const isLeftVertical = state.leftSideOrientation !== "0";
    const promsThickness = isLeftVertical ? promsBox.height : promsBox.width;
    const promsLength = isLeftVertical ? promsBox.width : promsBox.height;
    const promsX = Math.max(6.5 * cornerScale, promsThickness / 2 + 2.5);
    const hasRightSide = state.rightSideText.trim().length > 0;
    const isRightVertical = state.rightSideOrientation !== "0";
    const rightThickness = hasRightSide ? (isRightVertical ? rightBox.height : rightBox.width) : 0;
    const rightLength = hasRightSide ? (isRightVertical ? rightBox.width : rightBox.height) : 0;
    const rightMargin = Math.max(6.5 * cornerScale, rightThickness / 2 + 2.5);
    const leftClearance = Math.max(ekrMargin, promsX + promsThickness / 2 + 4);
    const rightClearance = Math.max(ekrMargin, rightMargin + rightThickness / 2 + 4);

    const minWForBande = bandeBox.width + 2 * ekrMargin;
    const minWForBoquette = boquetteBox.width + 2 * ekrMargin;
    const minWForCenter = Math.max(buqueBox.width, famsBox.width) + leftClearance + rightClearance;
    frameW = Math.max(state.width, Math.ceil(Math.max(minWForBande, minWForBoquette, minWForCenter)));

    const topZoneH = 4 + bandeBox.height + 3;
    const bottomZoneH = 4 + boquetteBox.height + 3;
    const minHForCenter = topZoneH + centerBlockH + bottomZoneH;
    const minHForProms = promsLength + 2 * ekrMargin;
    const minHForRightSide = hasRightSide ? rightLength + 2 * ekrMargin : 0;
    const minHForBouls = boulsContentH > 0 ? boulsContentH + 2 * ekrMargin : 0;
    frameH = Math.max(
      state.height,
      boulsH,
      Math.ceil(Math.max(minHForCenter, minHForProms, minHForRightSide, minHForBouls))
    );

    cornerScale = clampNumber(Math.min(frameW / 100, frameH / 50), 0.85, 1.5, 1);
  }

  // Positions verticales centrées sans superposition
  const bandeY = 4 + bandeBox.height / 2;
  const boquetteY = frameH - 4 - boquetteBox.height / 2;
  const areaTop = 4 + bandeBox.height + 3;
  const areaBottom = frameH - 4 - boquetteBox.height - 3;
  const areaCy = (areaTop + areaBottom) / 2;
  const buqueY = hasFams ? areaCy - (famsGap + famsBox.height) / 2 : areaCy;
  const famsY = buqueY + buqueBox.height / 2 + famsGap + famsBox.height / 2;
  const isLeftVertical = state.leftSideOrientation !== "0";
  const promsThickness = isLeftVertical ? promsBox.height : promsBox.width;
  const promsX = Math.max(6.5 * cornerScale, promsThickness / 2 + 2.5);
  const hasRightSide = state.rightSideText.trim().length > 0;
  const isRightVertical = state.rightSideOrientation !== "0";
  const rightThickness = hasRightSide ? (isRightVertical ? rightBox.height : rightBox.width) : 0;
  const rightSideX = frameW - Math.max(6.5 * cornerScale, rightThickness / 2 + 2.5);

  // Colonnes de boul'ss à droite du cadre (décalées si un texte côté droit est présent)
  const colOffsets = [];
  let cursorX = hasRightSide
    ? Math.max(frameW + 2, rightSideX + rightThickness / 2 + 4)
    : frameW - 6 * cornerScale;
  const colGap = 4;
  colWidths.forEach((w) => {
    colOffsets.push(cursorX);
    cursorX += w + colGap;
  });
  const totalW =
    columns.length > 0 ? Math.max(frameW, Math.ceil(cursorX - colGap + 3)) : frameW;

  const positions = { bandeY, boquetteY, buqueY, famsY, promsX, rightSideX };
  lastLayoutMetrics = {
    frameWidth: frameW,
    frameHeight: frameH,
    totalWidth: totalW,
    cornerScale,
    colOffsets,
    positions,
  };

  // Pass 2 : rendu final avec cadre, équerres et positions ajustées
  container.innerHTML = buildSignatureSVGString(state, lastLayoutMetrics);

  const badge = document.getElementById("dimensionsBadge");
  const resized = totalW > state.width || frameH > state.height;
  badge.textContent = resized
    ? `${totalW} × ${frameH} mm (base ${state.width} × ${state.height})`
    : `${state.width} × ${state.height} mm`;
}

function getExportFilename(ext) {
  const raw = document.getElementById("buque").value.trim() || "gadz";
  const slug = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `signature-${slug || "gadz"}.${ext}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setStatus(msg, isError = false) {
  const el = document.getElementById("statusMsg");
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

function exportSVG() {
  const state = getState();
  const svgString = buildSignatureSVGString(state, lastLayoutMetrics);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  triggerDownload(blob, getExportFilename("svg"));
  setStatus("SVG téléchargé.");
}

async function renderSvgToCanvas(state, { pxPerMm = 12, forceOpaqueBg = false } = {}) {
  const exportWidth = Math.max(state.width, lastLayoutMetrics.totalWidth || state.width);
  const exportHeight = Math.max(state.height, lastLayoutMetrics.frameHeight || state.height);
  const svgString = buildSignatureSVGString(state, {
    ...lastLayoutMetrics,
    forceOpaqueBg,
    totalWidth: exportWidth,
    frameHeight: exportHeight,
  });
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Échec du rendu SVG vers image"));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(exportWidth * pxPerMm);
    canvas.height = Math.round(exportHeight * pxPerMm);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { canvas, exportWidth, exportHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function exportPNG() {
  try {
    setStatus("Génération du PNG...");
    const state = getState();
    const { canvas } = await renderSvgToCanvas(state, { pxPerMm: 12 });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Impossible de créer le PNG");
    triggerDownload(blob, getExportFilename("png"));
    setStatus("PNG téléchargé.");
  } catch (err) {
    console.error(err);
    setStatus("Erreur lors de l'export PNG.", true);
  }
}

async function exportPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    setStatus("Librairie PDF indisponible (vérifiez votre connexion internet).", true);
    return;
  }

  try {
    setStatus("Génération du PDF...");
    const state = getState();
    const { canvas, exportWidth, exportHeight } = await renderSvgToCanvas(state, {
      pxPerMm: 15,
      forceOpaqueBg: true,
    });
    const pngDataUrl = canvas.toDataURL("image/png");

    const { jsPDF } = window.jspdf;
    const orientation = exportWidth >= exportHeight ? "landscape" : "portrait";
    const doc = new jsPDF({
      orientation,
      unit: "mm",
      format: [exportWidth, exportHeight],
    });

    doc.addImage(pngDataUrl, "PNG", 0, 0, exportWidth, exportHeight);
    doc.save(getExportFilename("pdf"));
    setStatus("PDF téléchargé.");
  } catch (err) {
    console.error(err);
    setStatus("Erreur lors de l'export PDF.", true);
  }
}
