# Getting Started

GFXLite is a simple WebGPU 3D rendering library designed for ease of use while leveraging modern GPU-driven rendering techniques.

## Motivation

Many popular web 3D rendering libraries originated during the WebGL 1.0 era. While robust, they often carry legacy architectural decisions that prevent them from fully leveraging the capabilities of modern GPUs and current web standards.

**GFXLite** is built from the ground up exclusively for **WebGPU**. By foregoing WebGL fallbacks, it fully embraces modern GPU-driven rendering techniques. While this currently limits browser support, it makes GFXLite an excellent choice for forward-looking projects where performance and modern architecture are prioritized over broad compatibility with older browsers or devices.

The API is heavily influenced by [Three.js](https://threejs.org/), ensuring a familiar developer experience for those already accustomed to the ecosystem.

GFXLite is written entirely in **TypeScript**, providing first-class type safety and a modern development experience out of the box.

## Prerequisites

- **A modern browser**: A browser with WebGPU support:
  - **Chrome / Edge**: 113+ (Desktop), 121+ (Android)
  - **Firefox**: 141+ (Windows), 145+ (macOS)
  - **Safari**: 26+ (macOS, iOS)
- **For development**: Node.js 18+ is recommended.

::: info
GFXLite requires WebGPU and **does not provide a WebGL fallback**. Please ensure your target environment supports WebGPU. Check [caniuse.com/webgpu](https://caniuse.com/webgpu) for the latest status.
:::

## Installation

```bash
npm install gfxlite
```

## Basic Setup

### 1. Create a Canvas

```html
<canvas id="canvas" width="800" height="600"></canvas>
```

### 2. Initialize the Renderer

```typescript
const canvas = document.querySelector("#canvas");

// Create renderer on selected canvas
const renderer = new Renderer(canvas);
```

### 3. Create a Scene and Camera

```typescript
const scene = new Scene();

const camera = new PerspectiveCamera(
  60, // Field of view (degrees)
  800 / 600, // Aspect ratio
  0.1, // Near plane
  1000, // Far plane
);
camera.position = new Vector3(0, 0, 3);
```

### 4. Add Objects to the Scene

```typescript
const geometry = new BoxGeometry({ width: 1, height: 1, depth: 1 });
const material = new BasicMaterial({ color: new Vector3(0.2, 0.5, 1.0) });
const cube = new Mesh(geometry, material);

scene.add(cube);
```

### 5. Render Loop

```typescript
function animate() {
  cube.rotateX(0.01);
  cube.rotateY(0.005);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
```

## Complete Example

Here's the complete code for a simple rotating cube:

```typescript
import {
  Renderer,
  Scene,
  Mesh,
  BoxGeometry,
  BasicMaterial,
  PerspectiveCamera,
  Vector3,
} from "gfxlite";

const canvas = document.querySelector("#canvas");

// Create renderer with canvas
const renderer = new Renderer(canvas);

// Create scene
const scene = new Scene();

// Create camera
const camera = new PerspectiveCamera(
  60,
  canvas.clientWidth / canvas.clientHeight,
  0.1,
  1000,
);
camera.position = new Vector3(0, 0, 3);

// Create cube
const cube = new Mesh(
  new BoxGeometry({ width: 1, height: 1, depth: 1 }),
  new BasicMaterial({ color: new Vector3(0.2, 0.5, 1.0) }),
);
scene.add(cube);

// Animation loop
function animate() {
  cube.rotateX(0.01);
  cube.rotateY(0.01);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// Handle resize
window.addEventListener("resize", () => {
  renderer.resize();
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
});
```

<HelloCube />

## Next Steps

- Learn about the [Scene Graph](/guide/scene-graph) and object hierarchy
- Explore different [Materials](/guide/materials) for various visual effects
- Add [Lighting](/guide/lighting) to your scenes
- Load 3D models with [GLTF](/guide/gltf)
