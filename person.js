/* ============================================================
   person.js — Data orang: struktur keluarga & CRUD
   ============================================================ */

/* ===== State global ===== */
let people  = {};
let rootIds = [];
const genColors = ['#9C5A2E','#2E7D74','#3D6B4B','#8A3B3B'];

/* ===== Utilitas keluarga ===== */
function rawChildrenOf(id) {
  return Object.keys(people).filter(pid => people[pid].parents.includes(id));
}

function ensureSiblingOrder(parentId) {
  const kids    = rawChildrenOf(parentId);
  const missing = kids.filter(kid => typeof people[kid].siblingOrder !== 'number');
  if (!missing.length) return;
  const already = kids
    .filter(kid => typeof people[kid].siblingOrder === 'number')
    .sort((a, b) => people[a].siblingOrder - people[b].siblingOrder);
  missing.sort((a, b) => {
    const ba = parseInt(people[a].birth, 10), bb = parseInt(people[b].birth, 10);
    const aHas = !isNaN(ba), bHas = !isNaN(bb);
    if (aHas && bHas && ba !== bb) return ba - bb;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return people[a].name.localeCompare(people[b].name, 'id');
  });
  missing.forEach(kid => {
    const kb = parseInt(people[kid].birth, 10);
    let insertAt = already.length;
    if (!isNaN(kb)) {
      const idx = already.findIndex(aid => {
        const ab = parseInt(people[aid].birth, 10);
        return !isNaN(ab) && ab > kb;
      });
      if (idx !== -1) insertAt = idx;
    }
    already.splice(insertAt, 0, kid);
  });
  already.forEach((kid, idx) => {
    if (people[kid].siblingOrder !== idx) {
      people[kid].siblingOrder = idx;
      savePersonToDB(kid, people[kid]);
    }
  });
}

function migrateAllSiblingOrders() {
  const parentIds = new Set();
  Object.values(people).forEach(p => (p.parents || []).forEach(pid => parentIds.add(pid)));
  parentIds.forEach(pid => ensureSiblingOrder(pid));
}

function childrenOf(id) {
  return rawChildrenOf(id).sort((a, b) =>
    (people[a].siblingOrder ?? 0) - (people[b].siblingOrder ?? 0)
  );
}

function primaryParentOf(id) {
  const parents = people[id].parents || [];
  if (!parents.length) return null;
  const isLeluhur = pid => people[pid] && (people[pid].parents.length > 0 || rootIds.includes(pid));
  return parents.find(isLeluhur) || parents[0];
}

function canonicalChildren(id) {
  return childrenOf(id).filter(pid => primaryParentOf(pid) === id);
}

function getGeneration(id, memo = {}, visiting = new Set()) {
  if (memo[id] !== undefined) return memo[id];
  if (visiting.has(id)) { memo[id] = 1; return 1; }
  visiting.add(id);
  const p = people[id].parents;
  if (p.length) {
    const g = Math.max(...p.map(pp => getGeneration(pp, memo, visiting))) + 1;
    memo[id] = g; visiting.delete(id); return g;
  }
  if (rootIds.includes(id)) { memo[id] = 1; visiting.delete(id); return 1; }
  const sp = (people[id].spouses || [])[0];
  if (sp) { const g = getGeneration(sp, memo, visiting); memo[id] = g; visiting.delete(id); return g; }
  memo[id] = 1; visiting.delete(id); return 1;
}

function totalGenerations() {
  const gens = Object.keys(people).map(id => getGeneration(id));
  return gens.length ? Math.max(...gens) : 0;
}

function getNRB(id, memo = {}) {
  if (memo[id]) return memo[id];
  const p = people[id].parents;
  let nrb;
  if (p.length) {
    const parent    = primaryParentOf(id);
    const parentNRB = getNRB(parent, memo);
    const sibs      = canonicalChildren(parent);
    const idx       = sibs.indexOf(id) + 1;
    nrb = parentNRB + '.' + String(idx).padStart(2, '0');
  } else if (rootIds.includes(id)) {
    nrb = String(rootIds.indexOf(id) + 1);
  } else {
    const sp = (people[id].spouses || [])[0];
    nrb = sp ? (getNRB(sp, memo) + '-P') : '—';
  }
  memo[id] = nrb;
  return nrb;
}

function countDescendants(id) {
  let count = 0;
  childrenOf(id).forEach(kid => { count += 1 + countDescendants(kid); });
  return count;
}

function ancestorChain(id) {
  const chain = [id];
  let cur = id;
  while (people[cur].parents.length) {
    cur = primaryParentOf(cur);
    chain.unshift(cur);
  }
  return chain;
}

function kinshipChain(id) {
  const chain = [id];
  let cur = id;
  while (people[cur].parents.length) {
    cur = primaryParentOf(cur);
    chain.push(cur);
  }
  return chain;
}

function pathToRoot(id) {
  const chain = [];
  let cur = id;
  const guard = new Set();
  while (cur && people[cur] && !guard.has(cur)) {
    guard.add(cur);
    chain.unshift(cur);
    cur = primaryParentOf(cur);
  }
  return chain;
}

/* ===== Pengelompokan per-pasangan ===== */
function getSpouseGroups(id) {
  const person = people[id];
  if (!person || (person.spouses || []).length < 2) return null;
  const kids = childrenOf(id);
  const bySpouse = {};
  const groups   = [];
  kids.forEach(kid => {
    const coParents = (people[kid].parents || []).filter(p => p !== id && people[p]);
    let key, spouseId, ambiguous = false;
    if (coParents.length === 1)      { spouseId = coParents[0]; key = 'sp:' + spouseId; }
    else if (coParents.length === 0) { spouseId = null; key = 'sp:none'; }
    else                             { spouseId = null; key = 'sp:multi'; ambiguous = true; }
    if (!bySpouse[key]) {
      bySpouse[key] = {
        key, spouseId, ambiguous,
        label: spouseId ? people[spouseId].name : (ambiguous ? 'Perlu dipastikan ibu/ayahnya' : 'Belum ditentukan pasangan'),
        kids: []
      };
      groups.push(bySpouse[key]);
    }
    bySpouse[key].kids.push(kid);
  });
  const order = (person.spouses || []).map(s => 'sp:' + s);
  groups.sort((a, b) => {
    const ia = order.indexOf(a.key), ib = order.indexOf(b.key);
    if (ia === -1 && ib === -1) return a.key.localeCompare(b.key);
    if (ia === -1) return 1; if (ib === -1) return -1;
    return ia - ib;
  });
  return groups;
}

/* ===== CRUD ===== */
function savePersonAndSync(id) {
  savePersonToDB(id, people[id]);
}
function saveRootIdsAndSync() {
  saveRootIdsToDB(rootIds);
}

function reorderSiblingBeforeTarget(draggedId, targetId, currentId) {
  if (draggedId === targetId) return;
  const siblings = childrenOf(currentId);
  if (!siblings.includes(draggedId) || !siblings.includes(targetId)) return;
  const without = siblings.filter(sid => sid !== draggedId);
  const idx = without.indexOf(targetId);
  without.splice(idx, 0, draggedId);
  without.forEach((sid, i) => {
    if (people[sid].siblingOrder !== i) {
      people[sid].siblingOrder = i;
      savePersonToDB(sid, people[sid]);
    }
  });
}

function makeOlderSibling(id) {
  if (!people[id].parents.length) {
    const idx = rootIds.indexOf(id);
    if (idx <= 0) return;
    [rootIds[idx - 1], rootIds[idx]] = [rootIds[idx], rootIds[idx - 1]];
    saveRootIdsAndSync();
    return true;
  }
  const siblings = childrenOf(primaryParentOf(id));
  const idx = siblings.indexOf(id);
  if (idx <= 0) return;
  const above = siblings[idx - 1];
  const tmp = people[id].siblingOrder;
  people[id].siblingOrder    = people[above].siblingOrder;
  people[above].siblingOrder = tmp;
  savePersonAndSync(id); savePersonAndSync(above);
  return true;
}

function makeYoungerSibling(id) {
  if (!people[id].parents.length) {
    const idx = rootIds.indexOf(id);
    if (idx === -1 || idx >= rootIds.length - 1) return;
    [rootIds[idx], rootIds[idx + 1]] = [rootIds[idx + 1], rootIds[idx]];
    saveRootIdsAndSync();
    return true;
  }
  const siblings = childrenOf(primaryParentOf(id));
  const idx = siblings.indexOf(id);
  if (idx === -1 || idx >= siblings.length - 1) return;
  const below = siblings[idx + 1];
  const tmp = people[id].siblingOrder;
  people[id].siblingOrder    = people[below].siblingOrder;
  people[below].siblingOrder = tmp;
  savePersonAndSync(id); savePersonAndSync(below);
  return true;
}

function deletePersonKeepChildren(id, orphanChoice) {
  const p          = people[id];
  const kids       = childrenOf(id);
  const grandParents = p.parents || [];
  kids.forEach(kid => {
    const kp = people[kid];
    kp.parents = kp.parents.filter(pp => pp !== id);
    if (kp.parents.length === 0) {
      if (orphanChoice === 'naik' && grandParents.length) {
        grandParents.forEach(gp => { if (!kp.parents.includes(gp)) kp.parents.push(gp); });
      }
      if (kp.parents.length === 0 && !rootIds.includes(kid)) rootIds.push(kid);
    }
    savePersonToDB(kid, people[kid]);
  });
  removePersonEverywhere(id);
}

function deletePersonCascade(id) {
  childrenOf(id).forEach(kid => deletePersonCascade(kid));
  removePersonEverywhere(id);
}

function removePersonEverywhere(id) {
  const p = people[id];
  if (!p) return;
  (p.spouses || []).forEach(spId => {
    const sp = people[spId];
    if (!sp) return;
    sp.spouses = (sp.spouses || []).filter(s => s !== id);
    if (!sp.parents.length && !sp.spouses.length && !rootIds.includes(spId)) rootIds.push(spId);
    savePersonToDB(spId, people[spId]);
  });
  if (rootIds.includes(id)) rootIds.splice(rootIds.indexOf(id), 1);
  expanded.delete(id);
  delete people[id];
  deletePersonFromDB(id);
  saveRootIdsToDB(rootIds);
}
