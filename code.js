figma.showUI(__html__, { width: 520, height: 420, themeColors: true });

var FONT_REGULAR = { family: 'Inter', style: 'Regular' };
var FONT_MEDIUM = { family: 'Inter', style: 'Medium' };
var FONT_BOLD = { family: 'Inter', style: 'Bold' };

var COLORS = {
  bg: { r: 0.99, g: 0.99, b: 1 },
  panel: { r: 1, g: 1, b: 1 },
  text: { r: 0.07, g: 0.09, b: 0.13 },
  muted: { r: 0.42, g: 0.46, b: 0.53 },
  line: { r: 0.88, g: 0.9, b: 0.94 },
  added: { r: 0.11, g: 0.39, b: 0.93 },
  removed: { r: 0.87, g: 0.15, b: 0.2 },
  warning: { r: 0.92, g: 0.67, b: 0.07 },
  deptHeader: { r: 0.95, g: 0.97, b: 1 }
};

var PERSON_PALETTE = [
  { r: 0.2, g: 0.45, b: 0.85 },
  { r: 0.02, g: 0.62, b: 0.48 },
  { r: 0.76, g: 0.2, b: 0.44 },
  { r: 0.58, g: 0.39, b: 0.84 },
  { r: 0.88, g: 0.45, b: 0.12 },
  { r: 0.12, g: 0.56, b: 0.7 },
  { r: 0.38, g: 0.53, b: 0.12 },
  { r: 0.74, g: 0.3, b: 0.22 },
  { r: 0.13, g: 0.48, b: 0.57 },
  { r: 0.6, g: 0.37, b: 0.2 }
];

var LAYOUT = {
  rootPadding: 40,
  headerHeight: 72,
  analyticsHeight: 96,
  legendHeight: 128,
  sectionGap: 20,
  deptWidthMin: 380,
  deptHeader: 60,
  rowHeight: 90,
  rowGap: 12,
  colGap: 48,
  iconSize: 28,
  iconGap: 8
};

function normalizeText(v) {
  return (v == null ? '' : String(v)).trim();
}

function keyify(v) {
  return normalizeText(v).toLowerCase().replace(/\s+/g, ' ').replace(/[,.]/g, '');
}

function hashString(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function personColor(name) {
  var idx = hashString(keyify(name)) % PERSON_PALETTE.length;
  return PERSON_PALETTE[idx];
}

function isLeaderRole(role) {
  var t = keyify(role);
  return /начальник|руководитель|директор|генеральный|заведующий/.test(t);
}

function isDeputyRole(role) {
  var t = keyify(role);
  return /заместитель|^зам\b|зам\./.test(t);
}

function slotKey(record) {
  return keyify(record.department) + '|' + keyify(record.role);
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function buildModel(source) {
  var records = source.records || [];
  var slotsMap = {};
  var departmentsMap = {};
  var organizationLeaders = [];

  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    var dept = normalizeText(r.department) || 'Без отдела';
    var role = normalizeText(r.role) || 'Без должности';
    var k = keyify(dept) + '|' + keyify(role);

    if (!slotsMap[k]) {
      slotsMap[k] = {
        id: k,
        department: dept,
        role: role,
        assignments: [],
        flags: {
          maternity: false,
          replacement: false,
          combine: false,
          deputy: false,
          distributedRate: false,
          our: false
        },
        anomalies: []
      };
    }
    var slot = slotsMap[k];
    var assignment = {
      person: normalizeText(r.person),
      rate: Number(r.rate) || 0,
      note: normalizeText(r.note),
      vacancy: !!r.vacancy,
      flags: clone(r.flags || {})
    };

    slot.assignments.push(assignment);

    var flagKeys = Object.keys(slot.flags);
    for (var f = 0; f < flagKeys.length; f++) {
      var fk = flagKeys[f];
      slot.flags[fk] = slot.flags[fk] || !!assignment.flags[fk];
    }

    if (!departmentsMap[dept]) departmentsMap[dept] = [];
    if (departmentsMap[dept].indexOf(k) === -1) departmentsMap[dept].push(k);

    if (isLeaderRole(role) && keyify(dept).indexOf('администрац') === -1 && keyify(dept).indexOf('отдел') === -1) {
      organizationLeaders.push({ dept: dept, role: role, person: assignment.person });
    }
  }

  var slots = Object.keys(slotsMap).map(function (k) { return slotsMap[k]; });
  for (var s = 0; s < slots.length; s++) {
    var slotS = slots[s];
    var total = 0;
    for (var a = 0; a < slotS.assignments.length; a++) total += slotS.assignments[a].rate;
    slotS.totalRate = Number(total.toFixed(2));

    if (slotS.totalRate < 1) {
      var remain = Number((1 - slotS.totalRate).toFixed(2));
      if (remain > 0) {
        slotS.assignments.push({
          person: 'Вакансия',
          rate: remain,
          note: 'Автодобавлено: остаток ставки',
          vacancy: true,
          flags: {}
        });
      }
    }
    if (slotS.totalRate > 1) {
      slotS.anomalies.push('Перегруз ставки: ' + slotS.totalRate);
    }
    if (slotS.flags.maternity) {
      var hasReplacement = slotS.assignments.some(function (x) { return x.flags && x.flags.replacement; });
      if (!hasReplacement) slotS.anomalies.push('Декрет без замещения');
    }
  }

  var departments = Object.keys(departmentsMap).sort(function (a, b) {
    return a.localeCompare(b, 'ru');
  }).map(function (name) {
    var slotIds = departmentsMap[name];
    var rows = slotIds.map(function (id) { return slotsMap[id]; });
    rows.sort(function (x, y) { return x.role.localeCompare(y.role, 'ru'); });
    return { name: name, slots: rows };
  });

  return {
    fileName: source.fileName,
    departments: departments,
    slotsById: slotsMap,
    organizationLeaders: organizationLeaders
  };
}

function lcsDiffWords(oldStr, newStr) {
  var a = normalizeText(oldStr).split(/\s+/).filter(Boolean);
  var b = normalizeText(newStr).split(/\s+/).filter(Boolean);
  var m = a.length;
  var n = b.length;
  var dp = [];
  for (var i = 0; i <= m; i++) {
    dp[i] = [];
    for (var j = 0; j <= n; j++) dp[i][j] = 0;
  }
  for (i = 1; i <= m; i++) {
    for (j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  var ops = [];
  i = m;
  j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push({ type: 'common', word: a[i - 1] });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ type: 'remove', word: a[i - 1] });
      i--;
    } else {
      ops.push({ type: 'add', word: b[j - 1] });
      j--;
    }
  }
  while (i > 0) { ops.push({ type: 'remove', word: a[i - 1] }); i--; }
  while (j > 0) { ops.push({ type: 'add', word: b[j - 1] }); j--; }

  ops.reverse();
  return ops;
}

function compareSlots(oldSlot, newSlot) {
  if (!oldSlot && newSlot) return { type: 'added' };
  if (oldSlot && !newSlot) return { type: 'removed' };

  var oldRole = keyify(oldSlot.role);
  var newRole = keyify(newSlot.role);
  var oldTotal = oldSlot.totalRate;
  var newTotal = newSlot.totalRate;

  var oldPeople = oldSlot.assignments.filter(function (a) { return !a.vacancy; }).map(function (a) { return keyify(a.person) + ':' + a.rate; }).sort().join('|');
  var newPeople = newSlot.assignments.filter(function (a) { return !a.vacancy; }).map(function (a) { return keyify(a.person) + ':' + a.rate; }).sort().join('|');

  var roleChanged = oldRole !== newRole;
  var rateChanged = oldTotal !== newTotal;
  var personChanged = oldPeople !== newPeople;

  if (!roleChanged && !rateChanged && !personChanged) return { type: 'unchanged' };

  if (roleChanged && !personChanged && !rateChanged) {
    return {
      type: 'roleChanged',
      roleOps: lcsDiffWords(oldSlot.role, newSlot.role)
    };
  }

  if (!roleChanged && rateChanged && !personChanged) return { type: 'rateChanged' };
  if (!roleChanged && !rateChanged && personChanged) return { type: 'changedPerson' };

  return {
    type: 'restructured',
    roleOps: roleChanged ? lcsDiffWords(oldSlot.role, newSlot.role) : null
  };
}

function buildDiff(oldModel, newModel) {
  var keys = {};
  Object.keys(oldModel.slotsById).forEach(function (k) { keys[k] = true; });
  Object.keys(newModel.slotsById).forEach(function (k) { keys[k] = true; });

  var bySlot = {};
  var counters = {
    unchanged: 0,
    added: 0,
    removed: 0,
    roleChanged: 0,
    rateChanged: 0,
    changedPerson: 0,
    restructured: 0
  };

  Object.keys(keys).forEach(function (k) {
    var result = compareSlots(oldModel.slotsById[k], newModel.slotsById[k]);
    bySlot[k] = result;
    counters[result.type] = (counters[result.type] || 0) + 1;
  });

  return { bySlot: bySlot, counters: counters };
}

function calcAnalytics(model, diff) {
  var employees = {};
  var totalRates = 0;
  var vacancies = 0;
  var combines = 0;
  var maternity = 0;
  var overloads = 0;

  for (var d = 0; d < model.departments.length; d++) {
    var dept = model.departments[d];
    for (var s = 0; s < dept.slots.length; s++) {
      var slot = dept.slots[s];
      if (slot.flags.combine) combines++;
      if (slot.flags.maternity) maternity++;
      if (slot.totalRate > 1) overloads++;
      for (var a = 0; a < slot.assignments.length; a++) {
        var x = slot.assignments[a];
        totalRates += Number(x.rate) || 0;
        if (x.vacancy) vacancies += Number(x.rate) || 0;
        else if (x.person) employees[keyify(x.person)] = true;
      }
    }
  }

  return {
    employees: Object.keys(employees).length,
    rates: Number(totalRates.toFixed(2)),
    vacancies: Number(vacancies.toFixed(2)),
    combines: combines,
    maternity: maternity,
    overloads: overloads,
    changes: Object.keys(diff.counters).reduce(function (acc, key) {
      if (key !== 'unchanged') acc += diff.counters[key];
      return acc;
    }, 0)
  };
}

function measureLayout(model) {
  var columns = [];
  for (var i = 0; i < model.departments.length; i++) {
    var dept = model.departments[i];
    var maxRoleLen = dept.slots.reduce(function (m, s) {
      return Math.max(m, normalizeText(s.role).length);
    }, 0);
    var width = Math.max(LAYOUT.deptWidthMin, 280 + maxRoleLen * 3);
    var rowsHeight = 0;
    for (var r = 0; r < dept.slots.length; r++) rowsHeight += LAYOUT.rowHeight;
    if (dept.slots.length > 1) rowsHeight += (dept.slots.length - 1) * LAYOUT.rowGap;
    var height = LAYOUT.deptHeader + rowsHeight + 20;
    columns.push({
      name: dept.name,
      x: 0,
      y: 0,
      width: width,
      height: height,
      rowsHeight: rowsHeight
    });
  }

  var x = LAYOUT.rootPadding;
  var maxColHeight = 0;
  for (i = 0; i < columns.length; i++) {
    columns[i].x = x;
    columns[i].y = LAYOUT.rootPadding + LAYOUT.headerHeight + LAYOUT.analyticsHeight + LAYOUT.legendHeight + LAYOUT.sectionGap * 3;
    x += columns[i].width + LAYOUT.colGap;
    maxColHeight = Math.max(maxColHeight, columns[i].height);
  }
  var totalWidth = Math.max(1600, x - LAYOUT.colGap + LAYOUT.rootPadding);
  var totalHeight = columns.length ? columns[0].y + maxColHeight + LAYOUT.rootPadding : 1000;

  return { columns: columns, totalWidth: totalWidth, totalHeight: totalHeight };
}

function rect(parent, x, y, w, h, fill, stroke, radius) {
  var n = figma.createRectangle();
  n.x = x;
  n.y = y;
  n.resize(w, h);
  n.fills = [{ type: 'SOLID', color: fill || COLORS.panel }];
  if (stroke) {
    n.strokes = [{ type: 'SOLID', color: stroke }];
    n.strokeWeight = 1;
  }
  if (radius != null) n.cornerRadius = radius;
  parent.appendChild(n);
  return n;
}

async function textNode(parent, x, y, txt, size, color, weight, width, lineHeight) {
  await figma.loadFontAsync(weight || FONT_REGULAR);
  var t = figma.createText();
  t.fontName = weight || FONT_REGULAR;
  t.fontSize = size || 12;
  t.characters = txt;
  t.fills = [{ type: 'SOLID', color: color || COLORS.text }];
  if (width) t.resize(width, Math.max(20, lineHeight || 20));
  t.x = x;
  t.y = y;
  parent.appendChild(t);
  return t;
}

async function coloredRoleText(parent, x, y, oldRole, newRole, width) {
  await figma.loadFontAsync(FONT_MEDIUM);
  var ops = lcsDiffWords(oldRole, newRole);
  var chunks = [];
  for (var i = 0; i < ops.length; i++) {
    if (ops[i].type === 'common') chunks.push({ text: ops[i].word + ' ', color: COLORS.text });
    if (ops[i].type === 'remove') chunks.push({ text: ops[i].word + ' ', color: COLORS.removed });
    if (ops[i].type === 'add') chunks.push({ text: ops[i].word + ' ', color: COLORS.added });
  }
  var full = chunks.map(function (c) { return c.text; }).join('').trim();
  var t = figma.createText();
  t.fontName = FONT_MEDIUM;
  t.fontSize = 13;
  t.characters = full;
  t.resize(width, 20);
  var cursor = 0;
  for (i = 0; i < chunks.length; i++) {
    var start = cursor;
    var end = cursor + chunks[i].text.length;
    if (end > start) t.setRangeFills(start, end, [{ type: 'SOLID', color: chunks[i].color }]);
    cursor = end;
  }
  t.x = x;
  t.y = y;
  parent.appendChild(t);
  return t;
}

function line(parent, x, y, w, h, color) {
  var l = figma.createRectangle();
  l.x = x;
  l.y = y;
  l.resize(Math.max(1, w), Math.max(1, h));
  l.fills = [{ type: 'SOLID', color: color || COLORS.line }];
  parent.appendChild(l);
  return l;
}

function diffColor(diffType) {
  if (diffType === 'added') return COLORS.added;
  if (diffType === 'removed') return COLORS.removed;
  return COLORS.text;
}

async function renderOrgChart(currentModel, futureModel, diff, analytics) {
  var plan = measureLayout(futureModel);
  var root = figma.createFrame();
  root.name = 'Org Structure Diff';
  root.fills = [{ type: 'SOLID', color: COLORS.bg }];
  root.resize(plan.totalWidth, plan.totalHeight);
  root.x = figma.viewport.center.x - plan.totalWidth / 2;
  root.y = figma.viewport.center.y - plan.totalHeight / 2;

  await textNode(root, LAYOUT.rootPadding, LAYOUT.rootPadding, 'Оргструктура: текущее состояние vs реструктуризация', 24, COLORS.text, FONT_BOLD, 950, 32);
  await textNode(root, LAYOUT.rootPadding, LAYOUT.rootPadding + 36, 'Источник: ' + currentModel.fileName + ' → ' + futureModel.fileName, 12, COLORS.muted, FONT_REGULAR, 900, 20);

  var analyticsY = LAYOUT.rootPadding + LAYOUT.headerHeight;
  rect(root, LAYOUT.rootPadding, analyticsY, plan.totalWidth - LAYOUT.rootPadding * 2, LAYOUT.analyticsHeight, COLORS.panel, COLORS.line, 12);
  await textNode(root, LAYOUT.rootPadding + 14, analyticsY + 10,
    'Аналитика: сотрудников ' + analytics.employees +
    ' | ставок ' + analytics.rates +
    ' | вакансии ' + analytics.vacancies +
    ' | совмещения ' + analytics.combines +
    ' | декрет ' + analytics.maternity +
    ' | перегруз ' + analytics.overloads +
    ' | изменений ' + analytics.changes,
    13, COLORS.text, FONT_MEDIUM, plan.totalWidth - 100, 24);

  await textNode(root, LAYOUT.rootPadding + 14, analyticsY + 44,
    'Diff: +' + diff.counters.added + '  -' + diff.counters.removed +
    '  roleChanged ' + diff.counters.roleChanged +
    '  rateChanged ' + diff.counters.rateChanged +
    '  changedPerson ' + diff.counters.changedPerson +
    '  restructured ' + diff.counters.restructured,
    12, COLORS.muted, FONT_REGULAR, plan.totalWidth - 100, 20);

  var legendY = analyticsY + LAYOUT.analyticsHeight + LAYOUT.sectionGap;
  rect(root, LAYOUT.rootPadding, legendY, plan.totalWidth - LAYOUT.rootPadding * 2, LAYOUT.legendHeight, COLORS.panel, COLORS.line, 12);
  await textNode(root, LAYOUT.rootPadding + 14, legendY + 10, 'Легенда: черный — без изменений, синий — появилось/будет, красный — удалено/было.', 12, COLORS.text, FONT_MEDIUM, 1000, 20);
  await textNode(root, LAYOUT.rootPadding + 14, legendY + 34, 'Иконки: ● сотрудник | ◐ split/0.5 | ○ вакансия. Маркеры: ★ руководитель, ◆ заместитель.', 12, COLORS.muted, FONT_REGULAR, 1000, 20);
  await textNode(root, LAYOUT.rootPadding + 14, legendY + 58, 'Персональный цвет сотрудника стабилен по hash(ФИО).', 12, COLORS.muted, FONT_REGULAR, 600, 20);

  var columnsByName = {};
  for (var c = 0; c < plan.columns.length; c++) columnsByName[plan.columns[c].name] = plan.columns[c];

  var topConnectY = legendY + LAYOUT.legendHeight + 8;
  var deptTopY = plan.columns.length ? plan.columns[0].y : topConnectY + 20;
  line(root, LAYOUT.rootPadding + 200, topConnectY, 2, deptTopY - topConnectY - 10, COLORS.line);

  for (var d = 0; d < futureModel.departments.length; d++) {
    var dept = futureModel.departments[d];
    var col = columnsByName[dept.name];
    var panel = rect(root, col.x, col.y, col.width, col.height, COLORS.panel, COLORS.line, 14);
    panel.name = 'Department ' + dept.name;

    rect(root, col.x, col.y, col.width, LAYOUT.deptHeader, COLORS.deptHeader, COLORS.line, 14);
    await textNode(root, col.x + 14, col.y + 18, dept.name, 16, COLORS.text, FONT_BOLD, col.width - 28, 24);

    var connectorX = col.x + col.width / 2;
    line(root, LAYOUT.rootPadding + 200, topConnectY, connectorX - (LAYOUT.rootPadding + 200), 2, COLORS.line);
    line(root, connectorX, topConnectY, 2, col.y - topConnectY, COLORS.line);

    var y = col.y + LAYOUT.deptHeader + 10;
    for (var s = 0; s < dept.slots.length; s++) {
      var slot = dept.slots[s];
      var slotDiff = diff.bySlot[slot.id] || { type: 'unchanged' };
      var row = rect(root, col.x + 10, y, col.width - 20, LAYOUT.rowHeight, { r: 1, g: 1, b: 1 }, COLORS.line, 10);
      row.name = 'Slot ' + slot.role;

      var roleColor = diffColor(slotDiff.type);
      if (slotDiff.type === 'roleChanged' || slotDiff.type === 'restructured') {
        var oldSlot = currentModel.slotsById[slot.id];
        await coloredRoleText(root, col.x + 20, y + 10, oldSlot ? oldSlot.role : slot.role, slot.role, col.width - 40);
      } else {
        await textNode(root, col.x + 20, y + 10, slot.role, 13, roleColor, FONT_MEDIUM, col.width - 40, 20);
      }

      var marker = '';
      if (isLeaderRole(slot.role)) marker = '★';
      if (isDeputyRole(slot.role) || slot.flags.deputy) marker = marker ? marker + '◆' : '◆';
      if (marker) await textNode(root, col.x + col.width - 52, y + 10, marker, 14, COLORS.warning, FONT_BOLD, 32, 20);

      var iconX = col.x + 20;
      var textX = iconX + LAYOUT.iconSize + 12;
      var rowText = [];
      for (var a = 0; a < slot.assignments.length; a++) {
        var asg = slot.assignments[a];

        var circle = figma.createEllipse();
        circle.resize(LAYOUT.iconSize, LAYOUT.iconSize);
        circle.x = iconX;
        circle.y = y + 40;
        circle.strokes = [{ type: 'SOLID', color: COLORS.line }];
        circle.strokeWeight = 1;
        if (asg.vacancy) {
          circle.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        } else if (asg.rate >= 1) {
          circle.fills = [{ type: 'SOLID', color: personColor(asg.person) }];
        } else {
          circle.fills = [{ type: 'SOLID', color: personColor(asg.person || 'vacancy') }];
          var half = figma.createRectangle();
          half.resize(LAYOUT.iconSize / 2, LAYOUT.iconSize);
          half.x = iconX + LAYOUT.iconSize / 2;
          half.y = y + 40;
          half.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
          root.appendChild(half);
        }
        root.appendChild(circle);

        var entry = (asg.vacancy ? 'Вакансия' : asg.person || 'Не указано') + ' (' + asg.rate + ')';
        rowText.push(entry);
        iconX += LAYOUT.iconSize + LAYOUT.iconGap;
      }

      await textNode(root, textX, y + 44, rowText.join(', '), 12, COLORS.muted, FONT_REGULAR, col.width - (textX - col.x) - 14, 20);
      if (slot.anomalies.length) {
        await textNode(root, textX, y + 66, '⚠ ' + slot.anomalies.join('; '), 11, COLORS.removed, FONT_REGULAR, col.width - (textX - col.x) - 14, 18);
      }

      y += LAYOUT.rowHeight + LAYOUT.rowGap;
    }
  }

  figma.currentPage.appendChild(root);
  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);
}

figma.ui.onmessage = async function (msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'cancel') {
    figma.closePlugin();
    return;
  }

  if (msg.type === 'build-org-chart') {
    try {
      var payload = msg.payload || {};
      var current = payload.current;
      var future = payload.future;
      if (!current || !future) throw new Error('Ожидаются данные по двум таблицам.');

      var currentModel = buildModel(current);
      var futureModel = buildModel(future);
      var diff = buildDiff(currentModel, futureModel);
      var analytics = calcAnalytics(futureModel, diff);
      await renderOrgChart(currentModel, futureModel, diff, analytics);

      figma.notify('Оргструктура построена: ' + futureModel.departments.length + ' отделов');
    } catch (e) {
      figma.notify('Ошибка построения: ' + (e && e.message ? e.message : String(e)), { error: true });
    }
  }
};
