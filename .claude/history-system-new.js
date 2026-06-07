// ---- Balance History System (per-save) ----
const LS_HISTORIES_KEY = 'blackjack_balance_histories';
const LS_ACTIVE_SAVE_KEY = 'blackjack_active_save';

let balanceHistories = {};  // { [saveId]: [ ...entries ] }
let activeSaveId = null;     // null = unsaved session, or save id number
let balanceHistory = [];     // convenience ref to the currently active history array

function loadHistory() {
  try {
    const raw = localStorage.getItem(LS_HISTORIES_KEY);
    balanceHistories = raw ? JSON.parse(raw) : {};
  } catch (e) { balanceHistories = {}; }
  try {
    const saved = localStorage.getItem(LS_ACTIVE_SAVE_KEY);
    activeSaveId = saved ? parseInt(saved) : null;
    // Verify the active save still exists
    if (activeSaveId !== null && !savesCache.some(s => s.id === activeSaveId)) {
      activeSaveId = null;
    }
  } catch (e) { activeSaveId = null; }
  _syncActiveHistory();
}

function _syncActiveHistory() {
  const key = activeSaveId !== null ? String(activeSaveId) : '_unsaved_';
  if (!balanceHistories[key]) {
    balanceHistories[key] = [];
  }
  balanceHistory = balanceHistories[key];
}

function persistHistory() {
  localStorage.setItem(LS_HISTORIES_KEY, JSON.stringify(balanceHistories));
  localStorage.setItem(LS_ACTIVE_SAVE_KEY, activeSaveId !== null ? String(activeSaveId) : '');
}

function _getActiveKey() {
  return activeSaveId !== null ? String(activeSaveId) : '_unsaved_';
}

function recordBalance(resultLabel) {
  balanceHistory.push({
    game: balanceHistory.length + 1,
    balance: state.balance,
    timestamp: new Date().toLocaleString('zh-CN'),
    result: resultLabel || ''
  });
  // Keep max 500 entries per history to avoid localStorage bloat
  if (balanceHistory.length > 500) {
    const trimmed = balanceHistory.slice(-500);
    trimmed.forEach((e, i) => { e.game = i + 1; });
    balanceHistories[_getActiveKey()] = trimmed;
    balanceHistory = trimmed;
  }
  persistHistory();
}

// ---- History-save binding ----

function bindHistoryToSave(saveId) {
  // Move unsaved history (or current active history) to the new save's key
  const oldKey = _getActiveKey();
  const newKey = String(saveId);
  if (oldKey !== newKey && balanceHistories[oldKey] && balanceHistories[oldKey].length > 0) {
    // Merge: new save gets the current history
    balanceHistories[newKey] = [...balanceHistories[oldKey]];
  }
  if (!balanceHistories[newKey]) {
    balanceHistories[newKey] = [];
  }
  activeSaveId = saveId;
  balanceHistory = balanceHistories[newKey];
  persistHistory();
}

function switchToSaveHistory(saveId) {
  const key = String(saveId);
  if (!balanceHistories[key]) {
    balanceHistories[key] = [];
  }
  activeSaveId = saveId;
  balanceHistory = balanceHistories[key];
  persistHistory();
}

function deleteSaveHistory(saveId) {
  const key = String(saveId);
  delete balanceHistories[key];
  if (activeSaveId === saveId) {
    activeSaveId = null;
    balanceHistory = balanceHistories['_unsaved_'] || [];
  }
  persistHistory();
}

function getActiveSaveName() {
  if (activeSaveId === null) return null;
  const save = savesCache.find(s => s.id === activeSaveId);
  return save ? save.name : null;
}

// ---- Chart drawing ----

function drawChart(canvas, data) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const rect = canvas.parentElement.getBoundingClientRect();
  const W = rect.width;
  const H = 320;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const pad = { top: 30, right: 20, bottom: 40, left: 60 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  if (data.length === 0) return;

  let minVal = Infinity, maxVal = -Infinity;
  data.forEach(d => {
    if (d.balance < minVal) minVal = d.balance;
    if (d.balance > maxVal) maxVal = d.balance;
  });
  const rangePad = Math.max((maxVal - minVal) * 0.1, 50);
  minVal = Math.max(0, minVal - rangePad);
  maxVal = maxVal + rangePad;
  const roughStep = (maxVal - minVal) / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const niceStep = Math.ceil(roughStep / magnitude) * magnitude;
  minVal = Math.floor(minVal / niceStep) * niceStep;
  maxVal = Math.ceil(maxVal / niceStep) * niceStep;

  const xScale = (i) => pad.left + (i / Math.max(data.length - 1, 1)) * plotW;
  const yScale = (v) => pad.top + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(pad.left, pad.top, plotW, plotH);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  for (let v = minVal; v <= maxVal; v += niceStep) {
    const y = yScale(v);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
  }

  // Reference line at 1000
  if (minVal <= 1000 && maxVal >= 1000) {
    const refY = yScale(1000);
    ctx.strokeStyle = 'rgba(255,215,0,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, refY);
    ctx.lineTo(pad.left + plotW, refY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,215,0,0.7)';
    ctx.font = '10px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.fillText('$1000', pad.left + 4, refY - 4);
  }

  // Y-axis labels
  ctx.fillStyle = '#8a9a7a';
  ctx.font = '10px Georgia, serif';
  ctx.textAlign = 'right';
  for (let v = minVal; v <= maxVal; v += niceStep) {
    const y = yScale(v);
    ctx.fillText('$' + v, pad.left - 6, y + 4);
  }

  // X-axis labels
  ctx.textAlign = 'center';
  const xLabelInterval = data.length <= 20 ? 1 : Math.ceil(data.length / 15);
  data.forEach((d, i) => {
    if (i % xLabelInterval === 0 || i === data.length - 1) {
      const x = xScale(i);
      ctx.fillText(d.game, x, pad.top + plotH + 18);
    }
  });

  // X-axis title
  ctx.fillStyle = '#8a9a7a';
  ctx.font = '11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('游戏局数', pad.left + plotW / 2, pad.top + plotH + 34);

  // ---- Filled area ----
  const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
  gradient.addColorStop(0, 'rgba(46,204,113,0.35)');
  gradient.addColorStop(0.5, 'rgba(46,204,113,0.10)');
  gradient.addColorStop(1, 'rgba(231,76,60,0.10)');

  ctx.beginPath();
  ctx.moveTo(xScale(0), pad.top + plotH);
  data.forEach((d, i) => { ctx.lineTo(xScale(i), yScale(d.balance)); });
  ctx.lineTo(xScale(data.length - 1), pad.top + plotH);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // ---- Line ----
  ctx.beginPath();
  ctx.strokeStyle = '#f0d080';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  data.forEach((d, i) => {
    const x = xScale(i);
    const y = yScale(d.balance);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // ---- Data points ----
  const pointRadius = data.length <= 30 ? 4 : (data.length <= 80 ? 3 : (data.length <= 200 ? 2 : 1.5));
  data.forEach((d, i) => {
    if (data.length > 100 && i % Math.ceil(data.length / 80) !== 0 && i !== data.length - 1) return;
    const x = xScale(i);
    const y = yScale(d.balance);
    const isUp = d.balance >= 1000;
    ctx.beginPath();
    ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
    ctx.fillStyle = isUp ? '#2ecc71' : '#e74c3c';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  canvas._chartData = { data, xScale, yScale, pad, plotW, plotH, W, H };
}

// ---- Modal ----

function openHistoryModal() {
  _syncActiveHistory();
  buildHistoryModal();
  document.getElementById('history-modal-overlay').classList.remove('hidden');
}

function closeHistoryModal() {
  document.getElementById('history-modal-overlay').classList.add('hidden');
}

function buildHistoryModal() {
  const emptyEl = document.getElementById('history-empty');
  const summaryEl = document.getElementById('history-summary');
  const canvas = document.getElementById('history-canvas');
  const wrapper = document.getElementById('chart-wrapper');

  if (balanceHistory.length === 0) {
    emptyEl.style.display = 'block';
    summaryEl.style.display = 'none';
    wrapper.style.display = 'none';
    // Update empty message based on save state
    const saveName = getActiveSaveName();
    if (saveName) {
      emptyEl.innerHTML = `存档「${escapeHtml(saveName)}」暂无游戏记录<br>开始游戏后，每局结束时的余额将自动记录在这里`;
    } else {
      emptyEl.innerHTML = '暂无游戏记录<br>开始游戏后，每局结束时的余额将自动记录在这里<br><small style="color:#8a9a7a">提示：创建存档后可独立追踪每个存档的盈亏</small>';
    }
    return;
  }

  emptyEl.style.display = 'none';
  summaryEl.style.display = 'flex';
  wrapper.style.display = 'block';

  drawChart(canvas, balanceHistory);

  document.getElementById('stat-games').textContent = balanceHistory.length;
  document.getElementById('stat-balance').textContent = '$' + state.balance;

  let peak = -Infinity, low = Infinity;
  balanceHistory.forEach(d => {
    if (d.balance > peak) peak = d.balance;
    if (d.balance < low) low = d.balance;
  });
  document.getElementById('stat-peak').textContent = '$' + peak;
  document.getElementById('stat-low').textContent = '$' + low;
  document.getElementById('stat-low').className = low < 1000 ? 'stat-value down' : 'stat-value';

  const net = state.balance - 1000;
  const netEl = document.getElementById('stat-net');
  netEl.textContent = (net >= 0 ? '$+' : '-$') + Math.abs(net);
  netEl.className = net >= 0 ? 'stat-value up' : 'stat-value down';
}

// ---- Resize ----
let historyResizeTimer = null;
window.addEventListener('resize', () => {
  const overlay = document.getElementById('history-modal-overlay');
  if (overlay.classList.contains('hidden')) return;
  if (balanceHistory.length === 0) return;
  if (historyResizeTimer) clearTimeout(historyResizeTimer);
  historyResizeTimer = setTimeout(() => {
    drawChart(document.getElementById('history-canvas'), balanceHistory);
  }, 150);
});

// ---- Hover tooltip ----
document.addEventListener('mousemove', function(e) {
  const overlay = document.getElementById('history-modal-overlay');
  if (overlay.classList.contains('hidden')) return;
  const canvas = document.getElementById('history-canvas');
  const cd = canvas._chartData;
  if (!cd || cd.data.length === 0) return;

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  let nearest = null;
  let nearestDist = Infinity;
  cd.data.forEach((d, i) => {
    const px = cd.xScale(i);
    const py = cd.yScale(d.balance);
    const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
    if (dist < nearestDist) { nearestDist = dist; nearest = { d, i, px, py }; }
  });

  const ctx = canvas.getContext('2d');
  drawChart(canvas, cd.data);

  if (nearest && nearestDist < 30) {
    const { d, px, py } = nearest;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd700';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    const tipW = 140, tipH = 50;
    let tipX = px - tipW / 2;
    if (tipX < 5) tipX = 5;
    if (tipX + tipW > cd.W - 5) tipX = cd.W - tipW - 5;
    const tipY = py - tipH - 14;
    const tipYFinal = tipY < 5 ? py + 14 : tipY;

    ctx.fillStyle = 'rgba(20,40,20,0.92)';
    ctx.strokeStyle = '#d4a843';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    const r = 6;
    ctx.moveTo(tipX + r, tipYFinal);
    ctx.lineTo(tipX + tipW - r, tipYFinal);
    ctx.arcTo(tipX + tipW, tipYFinal, tipX + tipW, tipYFinal + r, r);
    ctx.lineTo(tipX + tipW, tipYFinal + tipH - r);
    ctx.arcTo(tipX + tipW, tipYFinal + tipH, tipX + tipW - r, tipYFinal + tipH, r);
    ctx.lineTo(tipX + r, tipYFinal + tipH);
    ctx.arcTo(tipX, tipYFinal + tipH, tipX, tipYFinal + tipH - r, r);
    ctx.lineTo(tipX, tipYFinal + r);
    ctx.arcTo(tipX, tipYFinal, tipX + r, tipYFinal, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f0d080';
    ctx.font = 'bold 12px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`第 ${d.game} 局`, tipX + tipW / 2, tipYFinal + 18);
    ctx.fillStyle = d.balance >= 1000 ? '#2ecc71' : '#e74c3c';
    ctx.fillText(`余额: $${d.balance}`, tipX + tipW / 2, tipYFinal + 36);
  }
});

// ---- Clear history ----
document.getElementById('history-clear-btn').addEventListener('click', () => {
  if (confirm('确定要清除当前存档的盈亏记录吗？此操作不可撤销。')) {
    balanceHistory.length = 0;
    balanceHistories[_getActiveKey()] = [];
    persistHistory();
    buildHistoryModal();
    showToast('记录已清除');
  }
});

// ---- Modal open/close ----
document.getElementById('history-btn').addEventListener('click', openHistoryModal);
document.getElementById('history-modal-close').addEventListener('click', closeHistoryModal);
document.getElementById('history-modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeHistoryModal();
});
