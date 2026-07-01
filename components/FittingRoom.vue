<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue';

const isBusy = ref(false);
const isGenerating = ref(false);
const errorMessage = ref('');
const statusMessage = ref('');
const csrfToken = ref('');
const generatedImageUrl = ref('');
const appShellRef = ref(null);

/** Used in `onMounted` and after content updates. */
async function syncWindowSize() {
  await nextTick();

  const shell = appShellRef.value;
  if (!shell || !window.fittingRoom?.resizeToContent) return;

  window.fittingRoom.resizeToContent(shell.scrollWidth, shell.scrollHeight);
}

/** Used in `captureAndSend`. */
async function captureScreen() {
  if (!window.fittingRoom?.captureScreen) 
    throw new Error('Screen capture is only available in the Electron app.');
  

  return window.fittingRoom.captureScreen();
}

/** Used in `captureAndSend`. */
function dataUrlToFile(dataUrl, filename) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

/** Used in `onMounted`. */
async function loadCsrfToken() {
  const response = await fetch('/csrf-token', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Failed to load CSRF token');

  const data = await response.json();
  csrfToken.value = data.csrfToken ?? '';
}

/** Bound to the capture button click. */
async function captureAndSend() {
  if (isBusy.value) return;

  isBusy.value = true;
  isGenerating.value = false;
  errorMessage.value = '';
  statusMessage.value = '';
  generatedImageUrl.value = '';

  try {
    if (!csrfToken.value) throw new Error('Security token missing. Reload the app.');

    const imageDataUrl = await captureScreen();

    isGenerating.value = true;
    statusMessage.value = 'Generating outfit…';
    await syncWindowSize();

    const formData = new FormData();
    formData.append('image', dataUrlToFile(imageDataUrl, 'screen-capture.png'));

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

    generatedImageUrl.value = data.imageDataUrl ?? '';
    statusMessage.value = '';
    await syncWindowSize();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Capture failed';
    await syncWindowSize();
  } finally {
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
  resizeObserver?.disconnect();
});
</script>

<template>
  <div
    ref="appShellRef"
    class="appShell"
  >
    <button
      v-show="!isGenerating"
      type="button"
      class="captureButton"
      :class="{ captureButtonBusy: isBusy && !isGenerating }"
      :disabled="isBusy"
      @click="captureAndSend"
    >
      Show me the outfit
    </button>

    <p
      v-if="isGenerating && statusMessage"
      class="statusGenerating"
    >
      {{ statusMessage }}
    </p>

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

.captureButton {
  background: #18181b;
  border: none;
  border-radius: 8px;
  color: #fafafa;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  padding: 12px 20px;
}

.captureButton:disabled {
  cursor: wait;
}

.captureButtonBusy {
  opacity: 0.5;
}

.statusGenerating {
  color: #18181b;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  padding: 12px 20px;
  text-align: center;
}

.error {
  color: #dc2626;
  font-size: 13px;
  margin: 0;
  max-width: 640px;
  text-align: center;
}

.generatedImage {
  border-radius: 8px;
  display: block;
  height: auto;
  max-width: 640px;
  width: 640px;
}
</style>
