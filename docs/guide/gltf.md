# GLTF Loading

<script setup>
import GLTFExample from '/.vitepress/theme/components/examples/GLTFExample.vue'
</script>

<GLTFExample />

GFXLite includes a GLTF loader for importing 3D models. GLTF (GL Transmission Format) is the recommended format for web 3D content.

## Basic Usage

```typescript
import { GLTFLoader } from "gfxlite";

const loader = new GLTFLoader();
const model = await loader.load("/model.glb");

// Add the loaded model to the scene
scene.add(model);
```

## Supported Features

The GLTF loader supports:

- **Meshes**: Geometry with vertex positions, normals, and UVs
- **Materials**: PBR materials converted to `StandardMaterial`
- **Textures**: Base color, normal, roughness, and metalness maps
- **Hierarchy**: Nested objects preserve their parent-child relationships
- **Multiple Meshes**: Complex models with many parts

## File Formats

| Format | Extension | Description                                  |
| ------ | --------- | -------------------------------------------- |
| GLTF   | `.gltf`   | JSON file with separate binary/texture files |
| GLB    | `.glb`    | Single binary file (recommended for web)     |

GLB is recommended for web use as it packages everything into a single file.

## Loaded Content

The loader returns an `Object3D` containing the model hierarchy:

```typescript
const model = await loader.load("/model.glb");

// Access individual meshes using traverse
model.traverse((child) => {
  if (child instanceof Mesh) {
    console.log("Found mesh:", child);
  }
});
```

## Transforming Loaded Models

After loading, you can transform the model like any other `Object3D`:

```typescript
const model = await loader.load("/character.glb");

// Position the model
model.position = new Vector3(0, 0, 0);

// Scale the model
model.scale = new Vector3(0.5, 0.5, 0.5);

// Rotate the model
model.rotateY(Math.PI);

scene.add(model);
```

## Enabling Shadows

Configure shadow casting/receiving for loaded meshes:

```typescript
const model = await loader.load("/model.glb");

// Enable shadows for all meshes using traverse
model.traverse((child) => {
  if (child instanceof Mesh) {
    child.castShadow = true;
    child.receiveShadow = true;
  }
});

scene.add(model);
```

## Complete Example

```typescript
import {
  Renderer,
  Scene,
  Mesh,
  DirectionalLight,
  PerspectiveCamera,
  OrbitControls,
  GLTFLoader,
  Environment,
  Vector3,
} from "gfxlite";

async function main() {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const renderer = new Renderer(canvas);

  const scene = new Scene();

  // Load environment for reflections
  const environment = await Environment.loadHDR("/env.hdr");
  scene.environment = environment;

  const camera = new PerspectiveCamera(60, 800 / 600, 0.1, 1000);
  camera.position = new Vector3(0, 0, 3);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  // Lighting
  const light = new DirectionalLight();
  light.position = new Vector3(5, 5, 5);
  light.intensity = 1.5;
  scene.add(light);

  // Load GLTF model
  const loader = new GLTFLoader();
  const model = await loader.load("/model.glb");

  // Enable shadows on the model
  model.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  scene.add(model);

  function animate() {
    controls.update();
    model.rotateY(0.005);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}
```

## Finding GLTF Models

Free GLTF models are available from:

- [Sketchfab](https://sketchfab.com) - Large collection with GLTF download
- [Poly Haven](https://polyhaven.com/models) - CC0 license models
- [Kenney](https://kenney.nl/assets) - Game-ready assets
- [glTF Sample Models](https://github.com/KhronosGroup/glTF-Sample-Models) - Official test models

## Limitations

Current limitations of the GLTF loader:

- No animation support (skeletal or keyframe)
- No morph targets/blend shapes
- No cameras or lights from GLTF
- Single scene only (first scene is loaded)
