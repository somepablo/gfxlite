# Basic Scene

This guide covers the fundamentals of creating and managing a 3D scene in GFXLite.

## The Renderer

The `Renderer` is the core class that handles all WebGPU rendering. It manages the GPU device, render pipelines, and executes draw calls.

```typescript
import { Renderer, ShadowType } from "gfxlite";

// Create renderer with canvas and options
const renderer = new Renderer(canvas, {
  antialias: true,
  shadowType: ShadowType.PCFSoft,
});
renderer.resize();
```

### Renderer Methods

```typescript
// Resize to match canvas dimensions
renderer.resize();

// Set pixel ratio for high DPI displays
renderer.setPixelRatio(window.devicePixelRatio);

// Configure shadows after creation
renderer.shadowType = ShadowType.PCFSoft; // Basic, PCF, or PCFSoft

// Clean up when done
renderer.dispose();
```

## The Scene

The `Scene` is a container for all objects in your 3D world. It serves as the root of your scene graph.

```typescript
import { Scene } from "gfxlite";

const scene = new Scene();

// Add objects
scene.add(mesh);
scene.add(light);

// Remove objects
scene.remove(mesh);
```

## Cameras

GFXLite provides two camera types:

### Perspective Camera

Most common for 3D scenes. Objects appear smaller as they get further away.

```typescript
import { PerspectiveCamera, Vector3 } from "gfxlite";

const camera = new PerspectiveCamera(
  60, // fov: field of view in degrees
  16 / 9, // aspect: width / height
  0.1, // near: near clipping plane
  1000, // far: far clipping plane
);

camera.position = new Vector3(0, 5, 10);
camera.lookAt(new Vector3(0, 0, 0));
```

### Orthographic Camera

Parallel projection without perspective distortion. Useful for 2D games or isometric views.

```typescript
import { OrthographicCamera } from "gfxlite";

const camera = new OrthographicCamera(
  -10, // left
  10, // right
  10, // top
  -10, // bottom
  0.1, // near
  1000, // far
);
```

## The Render Loop

A typical render loop updates the scene and renders each frame:

```typescript
function animate() {
  // Update your scene
  cube.rotateX(0.01);

  // Render
  renderer.render(scene, camera);

  // Request next frame
  requestAnimationFrame(animate);
}

animate();
```

## Handling Window Resize

Always update the renderer and camera when the window resizes:

```typescript
window.addEventListener("resize", () => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  // Update renderer
  renderer.setSize(width, height);

  // Update camera aspect ratio
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});
```

## Coordinate System

GFXLite uses a right-handed coordinate system:

- **X** points right
- **Y** points up
- **Z** points toward the viewer

This is the same coordinate system used by most 3D software and WebGL/WebGPU standards.
