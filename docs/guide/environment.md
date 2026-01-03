# Environment Maps

Environment maps provide image-based lighting (IBL) and skybox backgrounds for realistic scene lighting and reflections.

<EnvironmentExample />

## Loading Environment Maps

GFXLite supports HDR environment maps in the Radiance HDR format (.hdr):

```typescript
import { Environment, Scene } from "gfxlite";

const scene = new Scene();

const environment = await Environment.loadHDR("/environment.hdr");
scene.environment = environment;
```

When set, the environment provides:

- **Image-Based Lighting**: Ambient lighting derived from the environment
- **Reflections**: Used by `StandardMaterial` for realistic reflections

## Environment Options

Configure the environment when loading:

```typescript
const environment = await Environment.loadHDR("/studio.hdr", {
  resolution: 512, // Cubemap resolution (default: 512)
  specularMipLevels: 5, // Mip levels for specular reflections (default: 5)
  intensity: 1.0, // Environment intensity multiplier (default: 1.0)
});
```

| Option              | Type     | Default | Description                               |
| ------------------- | -------- | ------- | ----------------------------------------- |
| `resolution`        | `number` | `512`   | Resolution of the generated cubemap       |
| `specularMipLevels` | `number` | `5`     | Number of mip levels for specular IBL     |
| `intensity`         | `number` | `1.0`   | Brightness multiplier for the environment |

## Environment as Background

Display the environment map as the scene background:

```typescript
scene.background = { type: "environment" };
```

## Usage with Standard Material

The `StandardMaterial` automatically uses the scene's environment for reflections:

```typescript
import { StandardMaterial, Vector3 } from "gfxlite";

// Metallic surface will reflect the environment
const chrome = new StandardMaterial({
  baseColor: new Vector3(0.9, 0.9, 0.95),
  roughness: 0.1,
  metallic: 1.0,
});

// Rough surface has diffuse environment lighting
const rubber = new StandardMaterial({
  baseColor: new Vector3(0.2, 0.2, 0.2),
  roughness: 0.9,
  metallic: 0.0,
});
```

## Complete Example

```typescript
import {
  Renderer,
  Scene,
  Mesh,
  SphereGeometry,
  StandardMaterial,
  Environment,
  PerspectiveCamera,
  OrbitControls,
  Vector3,
} from "gfxlite";

async function main() {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const renderer = new Renderer(canvas);

  const scene = new Scene();

  // Load HDR environment
  const environment = await Environment.loadHDR("/studio.hdr", {
    intensity: 1.0,
  });
  scene.environment = environment;
  scene.background = { type: "environment" };

  const camera = new PerspectiveCamera(60, 800 / 600, 0.1, 1000);
  camera.position = new Vector3(0, 0, 5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  // Create spheres with varying roughness
  const geometry = new SphereGeometry({
    radius: 0.8,
    widthSegments: 64,
    heightSegments: 32,
  });

  for (let i = 0; i < 5; i++) {
    const material = new StandardMaterial({
      baseColor: new Vector3(0.8, 0.6, 0.2),
      roughness: i / 4, // 0.0 to 1.0
      metallic: 1.0,
    });

    const sphere = new Mesh(geometry, material);
    sphere.position.x = (i - 2) * 2;
    scene.add(sphere);
  }

  function animate() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}
```

## Cleanup

Dispose of the environment when no longer needed:

```typescript
environment.dispose();
```

## Finding HDR Environment Maps

Free HDR environment maps are available from:

- [Poly Haven](https://polyhaven.com/hdris) - High quality, CC0 license
- [sIBL Archive](http://www.hdrlabs.com/sibl/archive.html) - Classic collection

## Performance Considerations

1. **Resolution**: Higher resolution HDRs provide better reflections but use more memory
2. **Prefiltering**: GFXLite precomputes multiple mip levels for roughness-based reflections
3. **File Size**: HDR files can be large; consider file size for web delivery
