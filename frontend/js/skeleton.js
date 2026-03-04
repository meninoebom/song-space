/**
 * Skeleton drawing — renders body tracking visualization on a canvas.
 */

const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
];

const BODY_COLORS = ['#8af', '#fa8'];

export function drawSkeletons(canvas, allLandmarks, bodyCount, readingValues) {
  if (!canvas || canvas.style.display === 'none') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width = 200;
  const H = canvas.height = 150;
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
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    for (const [a, i] of POSE_CONNECTIONS) {
      const la = landmarks[a], lb = landmarks[i];
      if (la.visibility > 0.3 && lb.visibility > 0.3) {
        ctx.beginPath();
        ctx.moveTo((1 - la.x) * W, la.y * H);
        ctx.lineTo((1 - lb.x) * W, lb.y * H);
        ctx.stroke();
      }
    }

    ctx.fillStyle = color;
    for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
      const lm = landmarks[i];
      if (lm.visibility > 0.3) {
        ctx.beginPath();
        ctx.arc((1 - lm.x) * W, lm.y * H, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const nose = landmarks[0];
    if (nose.visibility > 0.3) {
      ctx.beginPath();
      ctx.arc((1 - nose.x) * W, nose.y * H, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
