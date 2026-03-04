/**
 * Webcam + MediaPipe pose detection setup.
 */

let poseLandmarker = null;
let video = null;
let running = false;

export function isRunning() { return running; }
export function getVideo() { return video; }
export function getLandmarker() { return poseLandmarker; }

export async function start(onReady) {
  if (running) return;

  const { PoseLandmarker, FilesetResolver } = await import(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'
  );
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numPoses: 2,
    minPoseDetectionConfidence: 0.6,
    minPosePresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });

  video = document.getElementById('webcam-video');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise(r => { video.onloadedmetadata = r; });
  await video.play();

  running = true;
  if (onReady) onReady();
}

export function stop() {
  running = false;
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
}

export function detect() {
  if (!running || !poseLandmarker || !video || video.readyState < 2) return null;
  const now = performance.now();
  return poseLandmarker.detectForVideo(video, now);
}
