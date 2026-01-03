<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

export type GFXLite = typeof import("gfxlite");

export interface ExampleContext {
  canvas: HTMLCanvasElement;
  gfx: GFXLite;
}

const props = defineProps<{
  title: string;
  setup: (
    ctx: ExampleContext,
  ) => void | (() => void) | Promise<void | (() => void)>;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const error = ref<string | null>(null);

let cleanup: (() => void) | void = undefined;

onMounted(async () => {
  if (!canvasRef.value) return;

  if (!navigator.gpu) {
    error.value =
      "WebGPU is not supported in this browser. Try Chrome 113+ or Edge 113+.";
    return;
  }

  try {
    const gfx = await import("gfxlite");
    cleanup = await props.setup({ canvas: canvasRef.value, gfx });
  } catch (e) {
    console.error("WebGPU Example Error:", e);
    error.value =
      e instanceof Error ? e.message : "Failed to initialize WebGPU";
  }
});

onUnmounted(() => {
  if (cleanup) cleanup();
});
</script>

<template>
  <div class="webgpu-example">
    <div class="webgpu-example-header">
      <span>{{ title }}</span>
    </div>
    <div class="webgpu-example-canvas-container">
      <canvas ref="canvasRef" class="webgpu-example-canvas" />
      <div v-if="error" class="webgpu-example-error">
        <h3>WebGPU Not Available</h3>
        <p>{{ error }}</p>
      </div>
    </div>
  </div>
</template>
