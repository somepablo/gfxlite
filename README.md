# gfxlite

`gfxlite` is a lightweight 3D rendering engine built on top of WebGPU. It aims to provide a simple and easy-to-understand API for creating 3D scenes, handling geometry, materials, and cameras.

> Currently in development and is not yet ready for production use.

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
