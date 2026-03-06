/**
 * Skeleton drawing — renders body tracking visualization on a canvas.
 * Uses uniform scaling (toCanvas) so the body fits proportionally
 * regardless of canvas aspect ratio.
 */

const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
];

const BODY_COLORS = ['#8af', '#fa8'];
const PADDING = 20;

function toCanvas(lmX, lmY, W, H) {
  const scale = Math.min(W, H) - PADDING * 2;
  const offsetX = (W - scale) / 2;
  const offsetY = (H - scale) / 2;
  return {
    x: offsetX + (1 - lmX) * scale,
    y: offsetY + lmY * scale,
  };
}

export function drawSkeletons(canvas, allLandmarks, bodyCount, readingValues) {
  if (!canvas || canvas.style.display === 'none') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width = canvas.clientWidth || 200;
  const H = canvas.height = canvas.clientHeight || 150;
  ctx.clearRect(0, 0, W, H);

  // Tint background for relational readings
  for (const r of readingValues) {
    if ((r.id === 'unison' || r.id === 'opposition') && r.active && r.value > 0.1) {
      ctx.fillStyle = r.id === 'unison'
        ? `rgba(170, 255, 100, ${r.value * 0.15})`
        : `rgba(255, 100, 170, ${r.value * 0.15})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  for (let b = 0; b < bodyCount && b < 2; b++) {
    const landmarks = allLandmarks[b];
    const color = BODY_COLORS[b];

    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, W / 120);
    ctx.lineCap = 'round';

    for (const [a, i] of POSE_CONNECTIONS) {
      const la = landmarks[a], lb = landmarks[i];
      if (la.visibility > 0.3 && lb.visibility > 0.3) {
        const pa = toCanvas(la.x, la.y, W, H);
        const pb = toCanvas(lb.x, lb.y, W, H);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }

    const jointR = Math.max(3, W / 80);
    const noseR = Math.max(5, W / 50);
    ctx.fillStyle = color;
    for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
      const lm = landmarks[i];
      if (lm.visibility > 0.3) {
        const p = toCanvas(lm.x, lm.y, W, H);
        ctx.beginPath();
        ctx.arc(p.x, p.y, jointR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const nose = landmarks[0];
    if (nose.visibility > 0.3) {
      const p = toCanvas(nose.x, nose.y, W, H);
      ctx.beginPath();
      ctx.arc(p.x, p.y, noseR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
