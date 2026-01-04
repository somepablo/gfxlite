<p align="center">
  <img src="docs/public/gfxlite.svg" alt="GFXLite Logo" width="128" height="128">
</p>

<h1 align="center">GFXLite</h1>

`GFXLite` is a lightweight 3D rendering engine built on top of WebGPU. It aims to provide a simple and easy-to-understand API for creating 3D scenes, handling geometry, materials, and cameras.

> Currently in development and is not yet ready for production use.

## Architecture

`GFXLite` implements a modern, GPU-driven rendering pipeline designed for high performance and efficiency.

While the API is heavily influenced by **Three.js** for ease of use, the internals are built from the ground up for **WebGPU**. It adopts modern render strategies from high-performance frameworks like **Bevy**, prioritizing GPU-driven techniques over traditional CPU-heavy approaches.

### Rendering Pipeline

- **Unified Instance Storage**: Uses monolithic Storage Buffers to store instance data (transforms, colors, etc.) for all objects, avoiding the overhead of multiple small uniform buffers.
- **Automatic Batching**: The `BatchManager` automatically groups compatible meshes (same geometry and material) to maximize instance counts per draw call.
- **Indirect Drawing**: leverages `drawIndexedIndirect` to heavily reduce CPU-side render loop overhead. The CPU prepares batch data once, and the GPU handles the rest.
- **GPU Frustum Culling**: A Compute Shader pass pre-calculates visibility for all instances in parallel before rendering. Only visible objects are added to the indirect draw buffer, significantly reducing vertex shading load.

## Installation

To install the dependencies, run:

```bash
npm install
```

## Running Examples

To start the development server and see the examples in action:

```bash
npm run dev
```

Open your browser and navigate to the URL provided (usually `http://localhost:5173`).

## Basic Usage

Here is a simple example of how to create a scene with a box and a camera:

```typescript
import { Renderer, Scene, PerspectiveCamera, BoxGeometry, Mesh, BasicMaterial, Vector3 } from "gfxlite";

// 1. Setup Renderer
const canvas = document.getElementById("gfx-canvas") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
renderer.resize(window.innerWidth, window.innerHeight);

// 2. Create Scene
const scene = new Scene();

// 3. Create Camera
const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 3, 10);
camera.lookAt(new Vector3(0, 0, 0));

// 4. Add Objects
const geometry = new BoxGeometry();
const material = new BasicMaterial({ color: new Vector3(1, 0.5, 0) });
const mesh = new Mesh(geometry, material);
scene.add(mesh);

// 5. Render Loop
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
```
