<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import PlaygroundEditor from "./PlaygroundEditor.vue";
import PlaygroundPreview from "./PlaygroundPreview.vue";

const DEFAULT_TEMPLATE = `// Create renderer and scene
const renderer = new Renderer(canvas);
const scene = new Scene();

// Setup camera
const camera = new PerspectiveCamera(
  60,
  canvas.clientWidth / canvas.clientHeight,
  0.1,
  1000
);
camera.position = new Vector3(0, 2, 5);
camera.lookAt(new Vector3(0, 0, 0));

// Add orbit controls for interactivity
const controls = new OrbitControls(camera, canvas);

// Add lighting
const light = new DirectionalLight();
light.position = new Vector3(1, 3, 5);
light.lookAt(new Vector3(0, 0, 0));
scene.add(light);

// Create a cube
const geometry = new BoxGeometry({ width: 1, height: 1, depth: 1 });
const material = new LambertMaterial({
  color: new Vector3(0.2, 0.6, 1.0),
});
const cube = new Mesh(geometry, material);
scene.add(cube);

// Animation loop
function animate() {
  cube.rotateY(0.01);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
`;

const code = ref(DEFAULT_TEMPLATE);
const runTrigger = ref(0);
const copied = ref(false);
const errorLine = ref<number | null>(null);

function runCode() {
  runTrigger.value++;
}

function handleError(err: { message: string; line: number | null }) {
  errorLine.value = err.line;
}

// Clear error line when user edits code
watch(code, () => {
  errorLine.value = null;
});

function resetCode() {
  if (window.confirm("Reset playground? Your code changes will be lost.")) {
    code.value = DEFAULT_TEMPLATE;
    runCode();
  }
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(code.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error("Failed to copy:", err);
  }
}

// Draggable divider
const contentRef = ref<HTMLDivElement | null>(null);
const editorWidth = ref(50);
const isDragging = ref(false);

function startDrag(e: MouseEvent) {
  e.preventDefault();
  isDragging.value = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function onDrag(e: MouseEvent) {
  if (!isDragging.value || !contentRef.value) return;

  const rect = contentRef.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const percent = (x / rect.width) * 100;

  editorWidth.value = Math.min(Math.max(percent, 20), 80);
}

function stopDrag() {
  if (isDragging.value) {
    isDragging.value = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }
}

onMounted(() => {
  document.addEventListener("mousemove", onDrag);
  document.addEventListener("mouseup", stopDrag);
});

onUnmounted(() => {
  document.removeEventListener("mousemove", onDrag);
  document.removeEventListener("mouseup", stopDrag);
});
</script>

<template>
  <div class="playground">
    <div class="playground-header">
      <span class="playground-title">GFXLite Playground</span>
      <div class="playground-actions">
        <button class="playground-btn playground-btn-primary" @click="runCode">
          Run
          <span class="playground-shortcut">Ctrl+S</span>
        </button>
        <button class="playground-btn" @click="copyCode">
          {{ copied ? "Copied!" : "Copy" }}
        </button>
        <button class="playground-btn" @click="resetCode">Reset</button>
      </div>
    </div>
    <div ref="contentRef" class="playground-content">
      <div class="playground-editor-panel" :style="{ width: editorWidth + '%' }">
        <PlaygroundEditor v-model="code" :error-line="errorLine" @run="runCode" />
      </div>
      <div
        class="playground-divider"
        :class="{ 'is-dragging': isDragging }"
        @mousedown="startDrag"
      />
      <div class="playground-preview-panel" :style="{ width: (100 - editorWidth) + '%' }">
        <PlaygroundPreview :code="code" :run-trigger="runTrigger" @error="handleError" />
      </div>
    </div>
  </div>
</template>
