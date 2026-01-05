<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";

const props = defineProps<{
  code: string;
  runTrigger: number;
}>();

const emit = defineEmits<{
  error: [error: { message: string; line: number | null }];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const error = ref<string | null>(null);
const isRunning = ref(false);

// Lines added before user code in the wrapped function
const CODE_LINE_OFFSET = 5;

let cleanup: (() => void) | void;
let resizeObserver: ResizeObserver | null = null;
let handleResize: ((width: number, height: number) => void) | null = null;

function parseErrorLine(e: Error): number | null {
  const stack = e.stack || "";
  // Match patterns like "at eval (eval at ...:lineNumber:column)"
  // or "<anonymous>:lineNumber:column"
  const patterns = [
    /<anonymous>:(\d+):\d+/,
    /eval.*:(\d+):\d+/,
    /Function.*:(\d+):\d+/,
  ];

  for (const pattern of patterns) {
    const match = stack.match(pattern);
    if (match) {
      const rawLine = parseInt(match[1], 10);
      // Subtract offset for injected wrapper code
      const userLine = rawLine - CODE_LINE_OFFSET;
      if (userLine > 0) {
        return userLine;
      }
    }
  }
  return null;
}

function emitError(message: string, line: number | null) {
  error.value = message;
  emit("error", { message, line });
}

function clearError() {
  error.value = null;
  emit("error", { message: "", line: null });
}

async function executeCode() {
  if (!canvasRef.value) return;

  // Cleanup previous execution
  if (cleanup) {
    cleanup();
    cleanup = undefined;
  }
  handleResize = null;

  clearError();
  isRunning.value = true;

  if (!navigator.gpu) {
    emitError("WebGPU is not supported in this browser.", null);
    isRunning.value = false;
    return;
  }

  try {
    const gfx = await import("gfxlite");
    const canvas = canvasRef.value;

    // Destructure all exports for user convenience
    const exportNames = Object.keys(gfx).join(", ");

    // Wrap user code and inject resize handling (not visible in editor)
    const wrappedCode = `
      return (async function(canvas, gfx) {
        const { ${exportNames} } = gfx;
        ${props.code}

        // Auto-injected resize handling
        return {
          resize: (w, h) => {
            if (typeof renderer !== 'undefined') renderer.resize(w, h);
            if (typeof camera !== 'undefined' && 'aspect' in camera) {
              camera.aspect = w / h;
              camera.updateProjectionMatrix();
            }
          }
        };
      })(canvas, gfx);
    `;

    const fn = new Function("canvas", "gfx", wrappedCode);
    const result = await fn(canvas, gfx);

    if (result && typeof result.resize === "function") {
      handleResize = result.resize;
    }
  } catch (e) {
    console.error("Playground execution error:", e);
    const message = e instanceof Error ? e.message : String(e);
    const line = e instanceof Error ? parseErrorLine(e) : null;
    emitError(message, line);
  } finally {
    isRunning.value = false;
  }
}

function onResize(width: number, height: number) {
  if (handleResize && width > 0 && height > 0) {
    handleResize(width, height);
  }
}

// Run on mount
onMounted(() => {
  if (props.code) {
    executeCode();
  }

  // Setup resize observer to update renderer/camera when container size changes
  if (canvasRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        onResize(width, height);
      }
    });
    resizeObserver.observe(canvasRef.value);
  }
});

// Watch for run trigger changes
watch(
  () => props.runTrigger,
  () => {
    if (props.code) {
      executeCode();
    }
  }
);

onUnmounted(() => {
  if (cleanup) cleanup();
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});
</script>

<template>
  <div class="playground-preview">
    <canvas ref="canvasRef" class="playground-canvas" />
    <div v-if="error" class="playground-error">
      <strong>Error:</strong> {{ error }}
    </div>
    <div v-if="isRunning && !error" class="playground-loading">
      Initializing...
    </div>
  </div>
</template>
