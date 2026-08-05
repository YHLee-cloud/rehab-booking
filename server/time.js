// 時間輔助函式：HH:MM <-> 分鐘數，時段重疊判斷

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function addMinutes(hhmm, minutesToAdd) {
  return toHHMM(toMinutes(hhmm) + minutesToAdd);
}

// 兩時段是否重疊（半開區間 [start, end)）
function overlaps(startA, endA, startB, endB) {
  return toMinutes(startA) < toMinutes(endB) && toMinutes(startB) < toMinutes(endA);
}

module.exports = { toMinutes, toHHMM, addMinutes, overlaps };
