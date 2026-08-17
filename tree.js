/* ============================================================
   tree.js — Render Pohon Keluarga (2 Mode: Horizontal, Radial)
   ============================================================ */

let treeMode  = 'horizontal'; // 'horizontal' | 'radial'
let treeScale = 1, treeX = 0, treeY = 0;
let lastTreeRootId = null;

/* ===== Mode switching ===== */
function setTreeMode(mode) {
  treeMode = mode;
  const treeBtn   = document.getElementById('treeBtn');
  const radialBtn = document.getElementById('radialBtn');
  if (treeBtn)   treeBtn.classList.toggle('active', mode === 'horizontal');
  if (radialBtn) radialBtn.classList.toggle('active', mode === 'radial');
  // Reset transform saat ganti mode
  treeScale = 1; treeX = 0; treeY = 0;
  renderTreeView();
}

/* ===== Kontrol zoom/pan (shared) ===== */
function treeZoom(factor, clientX, clientY) {
  const wrap = document.getElementById('treeViewWrap');
  const rect = wrap.getBoundingClientRect();
  const px   = clientX !== undefined ? clientX - rect.left : rect.width  / 2;
  const py   = clientY !== undefined ? clientY - rect.top  : rect.height / 2;
  const newScale = Math.min(3, Math.max(0.2, treeScale * factor));
  treeX = px - (px - treeX) * (newScale / treeScale);
  treeY = py - (py - treeY) * (newScale / treeScale);
  treeScale = newScale;
  updateTreeTransform();
}

function updateTreeTransform() {
  const canvas = document.getElementById('treeViewCanvas');
  if (canvas) canvas.style.transform = `translate(${treeX}px, ${treeY}px) scale(${treeScale})`;
}

/* ===== Event pan & zoom (mouse/touch) ===== */
(function initTreeEvents() {
  let isPanning = false, lastX = 0, lastY = 0;
  let lastTouchDist = 0;

  document.addEventListener('DOMContentLoaded', () => {
    const wrap = document.getElementById('treeViewWrap');
    if (!wrap) return;

    wrap.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      isPanning = true; lastX = e.clientX; lastY = e.clientY;
      wrap.classList.add('panning');
    });
    document.addEventListener('mousemove', e => {
      if (!isPanning) return;
      treeX += e.clientX - lastX; treeY += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      updateTreeTransform();
    });
    document.addEventListener('mouseup', () => {
      isPanning = false;
      document.getElementById('treeViewWrap')?.classList.remove('panning');
    });
    wrap.addEventListener('wheel', e => {
      e.preventDefault();
      treeZoom(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY);
    }, { passive: false });
    wrap.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.hypot(dx, dy);
      } else if (e.touches.length === 1) {
        isPanning = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
      }
    }, { passive: true });
    wrap.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dx   = e.touches[0].clientX - e.touches[1].clientX;
        const dy   = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (lastTouchDist > 0) treeZoom(dist / lastTouchDist);
        lastTouchDist = dist;
      } else if (e.touches.length === 1 && isPanning) {
        treeX += e.touches[0].clientX - lastX;
        treeY += e.touches[0].clientY - lastY;
        lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
        updateTreeTransform();
      }
    }, { passive: false });
    wrap.addEventListener('touchend', () => {
      isPanning = false; lastTouchDist = 0;
    });

    // Tombol zoom
    document.getElementById('treeZoomIn')?.addEventListener('click',   () => treeZoom(1.2));
    document.getElementById('treeZoomOut')?.addEventListener('click',  () => treeZoom(0.8));
    document.getElementById('treeZoomReset')?.addEventListener('click', () => {
      treeScale = 1; treeX = 0; treeY = 0; updateTreeTransform();
    });

    // Toggle collapse per node (event delegation)
    document.getElementById('treeViewCanvas')?.addEventListener('click', e => {
      const toggle = e.target.closest('[data-toggle]');
      if (toggle) {
        e.stopPropagation();
        const id = toggle.dataset.toggle;
        if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
        renderTreeView();
        return;
      }
      const node = e.target.closest('[data-id]');
      if (node) { e.stopPropagation(); openDetail(node.dataset.id); }
      const gNode = e.target.closest('[data-group-key]');
      if (gNode) {
        e.stopPropagation();
        navigateToGroup(gNode.dataset.groupPerson, gNode.dataset.groupKey);
        render();
      }
    });
  });
})();

/* ============================================================
   MODE 1: HORIZONTAL (org-chart klasik, cabang ke bawah/kanan)
   Cocok untuk desktop dengan banyak kolom
   ============================================================ */
function buildHorizontalNode(id, isRoot) {
  const p      = people[id];
  const kids   = childrenOf(id);
  const isOpen = isRoot || expanded.has(id);
  const gen    = getGeneration(id);
  const words  = p.name.trim().split(/\s+/);
  const line1  = escapeHtml(words[0] || '');
  const line2  = escapeHtml(words.slice(1).join(' '));
  const groups = getSpouseGroups(id);
  const branchHtml = groups
    ? groups.map(g => buildHorizontalGroupNode(id, g)).join('')
    : kids.map(kid => buildHorizontalNode(kid, false)).join('');
  return `<li>
    <div class="org-node" data-id="${id}" style="--gen-color:${genColors[(gen - 1) % genColors.length]}">
      <div class="org-name">
        <span>${line1}</span>
        ${line2 ? `<span>${line2}</span>` : ''}
      </div>
      ${kids.length ? `<span class="org-toggle" data-toggle="${id}" title="${isOpen ? 'Tutup' : 'Buka'}">${isOpen ? '−' : '+'}</span>` : ''}
    </div>
    ${kids.length && isOpen ? `<ul>${branchHtml}</ul>` : ''}
  </li>`;
}

function buildHorizontalGroupNode(personId, group) {
  const label    = group.ambiguous ? group.label : ('Bersama ' + group.label);
  const groupKey = 'grp:' + personId + ':' + group.key;
  return `<li>
    <div class="org-node org-node-spouse-group${group.ambiguous ? ' org-node-warn' : ''}"
         data-group-key="${groupKey}" data-group-person="${personId}"
         style="--gen-color:${genColors[3]}">
      <div class="org-name">
        <span>${group.ambiguous ? '⚠️' : '💍'}</span>
        <span>${escapeHtml(label)}</span>
      </div>
    </div>
    ${group.kids.length ? `<ul>${group.kids.map(kid => buildHorizontalNode(kid, false)).join('')}</ul>` : ''}
  </li>`;
}

function renderHorizontalTree(currentId) {
  const canvas = document.getElementById('treeViewCanvas');
  canvas.className = 'tree-view-canvas tree-canvas-horizontal';
  canvas.innerHTML = `<ul class="org-tree">${buildHorizontalNode(currentId, true)}</ul>`;
}

/* ============================================================
   MODE 2: RADIAL (spiral dari tengah, elegan untuk presentasi)
   Akar di tengah, anak-anak melingkar ke luar per generasi
   ============================================================ */
function buildRadialTree(rootId) {
  // Kumpulkan node dan posisi
  const nodes  = [];
  const edges  = [];
  const nodeMap = {};

  function collectNodes(id, parentId, depth, angleStart, angleEnd) {
    const mid   = (angleStart + angleEnd) / 2;
    const r     = depth * 110;
    const x     = Math.cos(mid) * r;
    const y     = Math.sin(mid) * r;
    const gen   = getGeneration(id);
    const p     = people[id];

    nodes.push({ id, x, y, gen, name: p.name, birth: p.birth, death: p.death, depth });
    nodeMap[id] = { x, y };

    if (parentId !== null && nodeMap[parentId]) {
      edges.push({ x1: nodeMap[parentId].x, y1: nodeMap[parentId].y, x2: x, y2: y });
    }

    const kids   = childrenOf(id);
    const isOpen = depth === 0 || expanded.has(id);
    if (!kids.length || !isOpen) return;
    const span = (angleEnd - angleStart) / kids.length;
    kids.forEach((kid, i) => {
      collectNodes(kid, id, depth + 1, angleStart + i * span, angleStart + (i + 1) * span);
    });
  }

  collectNodes(rootId, null, 0, -Math.PI, Math.PI);

  const maxR  = nodes.reduce((m, n) => Math.max(m, Math.hypot(n.x, n.y)), 0);
  const vSize = maxR * 2 + 120;
  const cx    = vSize / 2, cy = vSize / 2;

  let svg = `<svg class="radial-svg" viewBox="0 0 ${vSize} ${vSize}"
    xmlns="http://www.w3.org/2000/svg" style="width:${vSize}px;height:${vSize}px;">
    <defs>
      <filter id="rShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="2" flood-opacity=".12"/>
      </filter>
    </defs>
    <g transform="translate(${cx},${cy})">`;

  // Edges
  edges.forEach(e => {
    svg += `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}"
      stroke="#C3B79E" stroke-width="1.5" stroke-dasharray="4,3"/>`;
  });

  // Nodes
  nodes.forEach(n => {
    const col   = genColors[(n.gen - 1) % genColors.length];
    const kids  = childrenOf(n.id);
    const words = n.name.trim().split(/\s+/);
    const l1    = escapeHtml(words[0] || '');
    const l2    = escapeHtml(words.slice(1, 3).join(' '));
    const r     = n.depth === 0 ? 44 : 34;
    const fs    = n.depth === 0 ? 10 : 8.5;

    // Lingkaran luar generasi
    svg += `<circle cx="${n.x}" cy="${n.y}" r="${r + 3}"
      fill="none" stroke="${col}" stroke-width="2" opacity=".35"/>`;
    // Kotak node
    svg += `<rect x="${n.x - r}" y="${n.y - 22}" width="${r * 2}" height="44" rx="8"
      fill="#FFFDF8" stroke="${col}" stroke-width="2.5" filter="url(#rShadow)"
      class="radial-node" data-id="${n.id}" style="cursor:pointer"/>`;
    // Nama baris 1
    svg += `<text x="${n.x}" y="${n.y - 4}" text-anchor="middle" font-size="${fs}"
      font-family="Fraunces,serif" font-weight="600" fill="#2B2620"
      class="radial-node" data-id="${n.id}" style="cursor:pointer">${l1}</text>`;
    if (l2) {
      svg += `<text x="${n.x}" y="${n.y + 8}" text-anchor="middle" font-size="${fs - 1}"
        font-family="Plus Jakarta Sans,sans-serif" fill="#6B6355"
        class="radial-node" data-id="${n.id}" style="cursor:pointer">${l2}</text>`;
    }
    // Toggle expand jika punya anak
    if (kids.length) {
      const isOpen = n.depth === 0 || expanded.has(n.id);
      svg += `<circle cx="${n.x}" cy="${n.y + 26}" r="9"
        fill="${isOpen ? '#2E7D74' : '#9C5A2E'}" style="cursor:pointer"
        class="radial-toggle" data-toggle="${n.id}"/>
      <text x="${n.x}" y="${n.y + 30}" text-anchor="middle" font-size="10"
        fill="#fff" font-weight="700" style="cursor:pointer;pointer-events:none">
        ${isOpen ? '−' : kids.length}
      </text>`;
    }
  });

  svg += `</g></svg>`;
  return svg;
}

function renderRadialTree(currentId) {
  const canvas = document.getElementById('treeViewCanvas');
  canvas.className = 'tree-view-canvas tree-canvas-radial';
  canvas.innerHTML = buildRadialTree(currentId);
  // Center view pada akar
  treeX = 0; treeY = 0;
  updateTreeTransform();
}

/* ===== Entry point utama ===== */
function renderTreeView() {
  const canvas = document.getElementById('treeViewCanvas');
  if (!canvas) return;
  if (!currentId || !people[currentId]) { canvas.innerHTML = ''; return; }

  if (currentId !== lastTreeRootId) {
    expanded.add(currentId);
    treeScale = 1; treeX = 0; treeY = 0;
    lastTreeRootId = currentId;
  }

  switch (treeMode) {
    case 'radial':    renderRadialTree(currentId);     break;
    default:          renderHorizontalTree(currentId); break;
  }
  updateTreeTransform();
  updateTreeHint();
}

function updateTreeHint() {
  const hints = {
    horizontal: 'Geser = pan · Scroll/Cubit = zoom · +/− = buka/tutup cabang',
    radial:     'Geser = pan · Scroll/Cubit = zoom · angka = buka/tutup cabang',
  };
  const el = document.querySelector('.tree-hint');
  if (el) el.textContent = hints[treeMode] || hints.horizontal;
}
