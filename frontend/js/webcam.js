/**
 * Webcam + MediaPipe pose detection setup.
 */

let poseLandmarker = null;
let video = null;
let running = false;

export function isRunning() { return running; }

export async function start() {
  if (running) return;

  try {
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
    if (!video) throw new Error('Missing #webcam-video element');

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = stream;
    await new Promise(r => { video.onloadedmetadata = r; });
    await video.play();

    running = true;
  } catch (err) {
    // Clean up partial init (e.g., camera stream acquired before video.play() failed)
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
    poseLandmarker = null;
    throw err;
  }
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
  try {
    return poseLandmarker.detectForVideo(video, performance.now());
  } catch (err) {
    console.error('Pose detection error:', err);
    return null;
  }
}
