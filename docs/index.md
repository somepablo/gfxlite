---
layout: home

hero:
  name: GFXLite
  text: Modern 3D Renderer for the Web
  tagline: A lightweight, GPU-driven 3D rendering library built on WebGPU
  image:
    src: /gfxlite.svg
    alt: GFXLite Logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    #    - theme: alt
    #      text: View Examples
    #      link: /examples/hello-cube
    - theme: alt
      text: GitHub
      link: https://github.com/somepablo/gfxlite

features:
  - icon: 🚀
    title: GPU-Driven Rendering
    details: Utilizes storage buffers, indirect drawing, and compute shader culling for efficient rendering of complex scenes.
  - icon: 🎨
    title: Multiple Material Types
    details: Basic, Lambert, Phong, and Standard (PBR) materials with support for textures, transparency, and reflections.
  - icon: 💡
    title: Lighting & Shadows
    details: Directional lights with PCF soft shadows and HDR environment map support for realistic lighting.
  - icon: 📦
    title: GLTF Support
    details: Load 3D models in GLTF/GLB format with full material and texture support.
---

<HelloCube />

## Quick Start

```bash
npm install gfxlite
```

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

// Create renderer with canvas
const renderer = new Renderer(canvas);

// Create scene and camera
const scene = new Scene();
const camera = new PerspectiveCamera(60, 800 / 600, 0.1, 1000);
camera.position = new Vector3(0, 0, 3);

// Create a mesh
const cube = new Mesh(
  new BoxGeometry({
    width: 1,
    height: 1,
    depth: 1,
  }),
  new BasicMaterial({ color: new Vector3(0.2, 0.5, 1.0) }),
);
scene.add(cube);

// Render loop
function animate() {
  cube.rotateX(0.01);
  cube.rotateY(0.01);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
```
