<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue';

const GENERATION_PROGRESS_DURATION_MS = 60_000;
const MAX_CAMERA_PHOTO_DIMENSION = 1024;

const isBusy = ref(false);
const isGenerating = ref(false);
const errorMessage = ref('');
const statusMessage = ref('');
const csrfToken = ref('');
const generatedImageUrl = ref('');
const userReferenceImageUrl = ref('');
const generationProgress = ref(0);
const isCameraOpen = ref(false);
const appShellRef = ref(null);
const cameraVideoRef = ref(null);

let generationProgressFrame = null;
let generationProgressStartedAt = 0;
let cameraStream = null;

/** Used in `onMounted` and after content updates. */
async function syncWindowSize() {
  await nextTick();

  const shell = appShellRef.value;
  if (!shell || !window.fittingRoom?.resizeToContent) return;

  window.fittingRoom.resizeToContent(shell.scrollWidth, shell.scrollHeight);
}

/** Used in `captureScreenAndSend`. */
async function captureScreen() {
  if (!window.fittingRoom?.captureScreen) 
    throw new Error('Screen capture is only available in the Electron app.');
  

  return window.fittingRoom.captureScreen();
}

/** Used in `captureScreenAndSend` and `captureFromCameraAndSend`. */
function dataUrlToFile(dataUrl, filename) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

/** Used in `startGenerationProgress`. */
function tickGenerationProgress(now) {
  const elapsed = now - generationProgressStartedAt;
  const ratio = Math.min(elapsed / GENERATION_PROGRESS_DURATION_MS, 1);
  generationProgress.value = ratio * 100;

  if (ratio < 1) {
    generationProgressFrame = requestAnimationFrame(tickGenerationProgress);
  }
}

/** Used in `startGenerationProgress`. */
function startGenerationProgress() {
  stopGenerationProgress();
  generationProgress.value = 0;
  generationProgressStartedAt = performance.now();
  generationProgressFrame = requestAnimationFrame(tickGenerationProgress);
}

/** Used in `sendCapturedImage` and `onUnmounted`. */
function stopGenerationProgress() {
  if (generationProgressFrame === null) return;

  cancelAnimationFrame(generationProgressFrame);
  generationProgressFrame = null;
}

/** Used in `onMounted`. */
async function loadCsrfToken() {
  const response = await fetch('/csrf-token', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Failed to load CSRF token');

  const data = await response.json();
  csrfToken.value = data.csrfToken ?? '';
}

/** Used in `captureScreenAndSend`. */
async function sendCapturedImage(clothingDataUrl, clothingFilename) {
  isGenerating.value = true;
  statusMessage.value = 'Generating outfit…';
  startGenerationProgress();
  await syncWindowSize();

  const formData = new FormData();
  formData.append('image', dataUrlToFile(clothingDataUrl, clothingFilename));

  if (userReferenceImageUrl.value) {
    formData.append(
      'reference',
      dataUrlToFile(userReferenceImageUrl.value, 'user-reference.jpg'),
    );
  }

  const response = await fetch('/capture', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'X-CSRF-Token': csrfToken.value,
    },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Failed to send capture');

  stopGenerationProgress();
  generationProgress.value = 0;
  isGenerating.value = false;
  generatedImageUrl.value = data.imageDataUrl ?? '';
  statusMessage.value = '';
  await syncWindowSize();
}

/** Used in `openCamera` and `onUnmounted`. */
function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  if (cameraVideoRef.value) {
    cameraVideoRef.value.srcObject = null;
  }

  isCameraOpen.value = false;
}

/** Used in `captureCameraFrame`. */
function scaleToMaxDimension(width, height, maxDimension) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  const scale = maxDimension / Math.max(width, height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/** Used in `saveUserReferencePhoto`. */
function captureCameraFrame() {
  const video = cameraVideoRef.value;
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
    throw new Error('Camera preview is not ready yet.');
  }

  const { width, height } = scaleToMaxDimension(
    video.videoWidth,
    video.videoHeight,
    MAX_CAMERA_PHOTO_DIMENSION,
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not capture from camera.');

  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

/** Bound to the camera button click. */
async function openCamera() {
  if (isBusy.value || isCameraOpen.value) return;

  errorMessage.value = '';

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera capture is not supported in this environment.');
    }

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });

    isCameraOpen.value = true;
    await nextTick();

    if (!cameraVideoRef.value) throw new Error('Camera preview failed to open.');

    cameraVideoRef.value.srcObject = cameraStream;
    await cameraVideoRef.value.play();
    await syncWindowSize();
  } catch (error) {
    stopCamera();
    errorMessage.value = error instanceof Error ? error.message : 'Could not open camera';
    await syncWindowSize();
  }
}

/** Bound to the camera cancel button click. */
async function cancelCamera() {
  stopCamera();
  await syncWindowSize();
}

/** Bound to the take photo button click. */
async function saveUserReferencePhoto() {
  if (isBusy.value || !isCameraOpen.value) return;

  errorMessage.value = '';

  try {
    userReferenceImageUrl.value = captureCameraFrame();
    stopCamera();
    await syncWindowSize();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Camera capture failed';
    await syncWindowSize();
  }
}

/** Bound to the clear reference photo button click. */
async function clearUserReferencePhoto() {
  userReferenceImageUrl.value = '';
  await syncWindowSize();
}

/** Used in `onMounted`. */
function onUserReferenceImageLoad() {
  syncWindowSize().catch(console.error);
}

/** Bound to the screen capture button click. */
async function captureScreenAndSend() {
  if (isBusy.value) return;

  isBusy.value = true;
  isGenerating.value = false;
  errorMessage.value = '';
  statusMessage.value = '';
  generatedImageUrl.value = '';
  await nextTick();
  await syncWindowSize();

  try {
    if (!csrfToken.value) throw new Error('Security token missing. Reload the app.');

    const imageDataUrl = await captureScreen();
    await sendCapturedImage(imageDataUrl, 'screen-capture.png');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Capture failed';
    await syncWindowSize();
  } finally {
    stopGenerationProgress();
    generationProgress.value = 0;
    isBusy.value = false;
    isGenerating.value = false;
  }
}

/** Used in `onMounted`. */
function onGeneratedImageLoad() {
  syncWindowSize().catch(console.error);
}

let resizeObserver;

onMounted(() => {
  loadCsrfToken().catch((error) => {
    console.error(error);
    errorMessage.value = 'Failed to initialize security token';
  });

  const shell = appShellRef.value;
  if (!shell) return;

  resizeObserver = new ResizeObserver(() => {
    syncWindowSize().catch(console.error);
  });
  resizeObserver.observe(shell);
  syncWindowSize().catch(console.error);
});

onUnmounted(() => {
  stopCamera();
  stopGenerationProgress();
  resizeObserver?.disconnect();
});
</script>

<template>
  <div
    ref="appShellRef"
    class="appShell"
  >
    <div
      v-if="!isGenerating && !isCameraOpen"
      class="actionButtons"
    >
      <button
        type="button"
        class="captureButton"
        :class="{ captureButtonBusy: isBusy }"
        :disabled="isBusy"
        @click="captureScreenAndSend"
      >
        Show me the outfit
      </button>

      <button
        type="button"
        class="cameraButton"
        :disabled="isBusy"
        @click="openCamera"
      >
        {{ userReferenceImageUrl ? 'Retake my photo' : 'Take my photo' }}
      </button>
    </div>

    <div
      v-if="userReferenceImageUrl && !isCameraOpen && !isBusy && !isGenerating && !generatedImageUrl"
      class="referencePhotoPanel"
    >
      <p class="referencePhotoLabel">
        Using your camera photo
      </p>

      <img
        :src="userReferenceImageUrl"
        alt="Your reference photo"
        class="referencePhotoPreview"
        @load="onUserReferenceImageLoad"
      >

      <button
        type="button"
        class="cameraButton"
        @click="clearUserReferencePhoto"
      >
        Use reference-photos instead
      </button>
    </div>

    <div
      v-if="isCameraOpen"
      class="cameraPanel"
    >
      <video
        ref="cameraVideoRef"
        class="cameraPreview"
        autoplay
        muted
        playsinline
      />

      <div class="cameraActions">
        <button
          type="button"
          class="captureButton"
          @click="saveUserReferencePhoto"
        >
          Save photo
        </button>

        <button
          type="button"
          class="cameraButton"
          :disabled="isBusy"
          @click="cancelCamera"
        >
          Cancel
        </button>
      </div>
    </div>

    <div
      v-if="isGenerating"
      class="generatingPanel"
    >
      <p
        v-if="statusMessage"
        class="statusGenerating"
      >
        {{ statusMessage }}
      </p>

      <div
        class="progressTrack"
        role="progressbar"
        :aria-valuenow="Math.round(generationProgress)"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Generation progress"
      >
        <div
          class="progressBar"
          :style="{ width: `${generationProgress}%` }"
        />
      </div>
    </div>

    <p
      v-if="errorMessage"
      class="error"
    >
      {{ errorMessage }}
    </p>

    <img
      v-if="generatedImageUrl"
      :src="generatedImageUrl"
      alt="Generated outfit preview"
      class="generatedImage"
      @load="onGeneratedImageLoad"
    >
  </div>
</template>

<style>
.appShell {
  align-items: center;
  background: #f4f4f5;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  gap: 8px;
  padding: 12px;
  width: fit-content;
}

.actionButtons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.captureButton {
  background: #18181b;
  border: none;
  border-radius: 8px;
  color: #fafafa;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  padding: 12px 20px;
  width: 100%;
}

.cameraButton {
  background: #fafafa;
  border: 1px solid #d4d4d8;
  border-radius: 8px;
  color: #18181b;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  padding: 12px 20px;
  width: 100%;
}

.cameraButton:disabled,
.captureButton:disabled {
  cursor: wait;
}

.captureButtonBusy {
  opacity: 0.5;
}

.cameraPanel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.cameraPreview {
  background: #000;
  border-radius: 8px;
  display: block;
  height: auto;
  max-width: 640px;
  transform: scaleX(-1);
  width: 640px;
}

.cameraActions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.generatingPanel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 280px;
  width: 100%;
}

.statusGenerating {
  color: #18181b;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  padding: 12px 20px 0;
  text-align: center;
}

.progressTrack {
  background: #e4e4e7;
  border-radius: 999px;
  height: 8px;
  overflow: hidden;
  width: 100%;
}

.progressBar {
  background: #18181b;
  border-radius: 999px;
  height: 100%;
  transition: width 0.12s linear;
  width: 0;
}

.error {
  color: #dc2626;
  font-size: 13px;
  margin: 0;
  max-width: 640px;
  text-align: center;
}

.referencePhotoPanel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.referencePhotoLabel {
  color: #52525b;
  font-size: 13px;
  font-weight: 600;
  margin: 0;
  text-align: center;
}

.referencePhotoPreview {
  border-radius: 8px;
  display: block;
  height: auto;
  max-width: 240px;
  width: 240px;
}

.generatedImage {
  border-radius: 8px;
  display: block;
  height: auto;
  max-width: 640px;
  width: 640px;
}
</style>
