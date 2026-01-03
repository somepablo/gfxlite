# Lighting & Shadows

GFXLite supports directional lighting with real-time shadows. Lighting affects Lambert, Phong, and Standard materials.

<LightingExample />

## Directional Light

A directional light simulates light from a distant source like the sun. All light rays are parallel.

```typescript
import { DirectionalLight, Vector3 } from "gfxlite";

const light = new DirectionalLight();
light.position = new Vector3(5, 8, 5);
light.intensity = 2.0;

scene.add(light);
```

### Properties

| Property     | Type      | Default     | Description                            |
| ------------ | --------- | ----------- | -------------------------------------- |
| `position`   | `Vector3` | `(0, 1, 0)` | Light direction (points toward origin) |
| `color`      | `Vector3` | `(1, 1, 1)` | Light color                            |
| `intensity`  | `number`  | `1.0`       | Light brightness                       |
| `castShadow` | `boolean` | `false`     | Enable shadow casting                  |

## Ambient Light

Ambient light provides a base level of illumination to all objects, ensuring that shadows are not completely black. It is a property of the scene.

```typescript
// Set ambient light intensity/color (default is 0.1, 0.1, 0.1)
scene.ambientLight = new Vector3(0.3, 0.3, 0.3);
```

## Shadows

To enable shadows, configure both the renderer and the light:

```typescript
import { ShadowType } from "gfxlite";

// Enable shadows on the renderer
renderer.shadowType = ShadowType.PCFSoft;

// Enable shadow casting on the light
light.castShadow = true;
light.shadowMapSize = 2048; // Higher = better quality
```

### Shadow Types

| Type                 | Description                                |
| -------------------- | ------------------------------------------ |
| `ShadowType.Basic`   | Hard shadows (fastest)                     |
| `ShadowType.PCF`     | Percentage Closer Filtering (soft edges)   |
| `ShadowType.PCFSoft` | Larger PCF kernel (softer, more expensive) |

### Shadow Casting and Receiving

Configure which objects cast and receive shadows:

```typescript
// This mesh will cast shadows on other objects
cube.castShadow = true;

// This mesh will receive shadows from other objects
floor.receiveShadow = true;

// Objects can both cast and receive
sphere.castShadow = true;
sphere.receiveShadow = true;
```

## Complete Lighting Example

```typescript
import {
  Renderer,
  Scene,
  Mesh,
  SphereGeometry,
  PlaneGeometry,
  PhongMaterial,
  DirectionalLight,
  PerspectiveCamera,
  ShadowType,
  Vector3,
} from "gfxlite";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const renderer = new Renderer(canvas, { shadowType: ShadowType.PCFSoft });

const scene = new Scene();

const width = canvas.clientWidth;
const height = canvas.clientHeight;
const camera = new PerspectiveCamera(60, width / height, 0.1, 1000);
camera.position = new Vector3(1, 3, 5);
camera.lookAt(new Vector3(0, 0, 0));

const light = new DirectionalLight();
light.position = new Vector3(5, 8, 5);
light.lookAt(new Vector3(0, 0, 0));
light.intensity = 2.0;
light.castShadow = true;
light.shadowMapSize = 2048;
scene.add(light);

const floorGeometry = new PlaneGeometry({
  width: 12,
  height: 12,
});
const floorMaterial = new PhongMaterial({
  color: new Vector3(0.3, 0.3, 0.35),
});
const floor = new Mesh(floorGeometry, floorMaterial);
floor.position.y = -1;
floor.receiveShadow = true;
scene.add(floor);

const sphereGeometry = new SphereGeometry({
  radius: 1,
  widthSegments: 32,
  heightSegments: 16,
});
const spheres: Mesh[] = [];

const colors = [
  new Vector3(0.9, 0.2, 0.2),
  new Vector3(0.2, 0.9, 0.2),
  new Vector3(0.2, 0.2, 0.9),
];

for (let i = 0; i < 3; i++) {
  const material = new PhongMaterial({ color: colors[i], shininess: 64 });
  const sphere = new Mesh(sphereGeometry, material);
  sphere.position.x = (i - 1) * 2;
  sphere.position.y = 0;
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  scene.add(sphere);
  spheres.push(sphere);
}

let animationId: number;
const animate = () => {
  const t = performance.now() / 1000;

  for (let i = 0; i < spheres.length; i++) {
    spheres[i].position.y = Math.abs(Math.sin(t * 2 + i * 1.2)) * 1.5;
  }

  light.position.x = Math.sin(t * 0.5) * 6;
  light.position.z = Math.cos(t * 0.5) * 6;
  light.lookAt(new Vector3(0, 0, 0));

  renderer.render(scene, camera);
  animationId = requestAnimationFrame(animate);
};
animate();
```

## Performance Tips

1. **Shadow Map Size**: Higher values (2048, 4096) give sharper shadows but cost more memory and performance
2. **Shadow Type**: Use `Basic` for best performance, `PCFSoft` for best quality
3. **Limit Shadow Casters**: Only enable `castShadow` on objects that need it
4. **Shadow Distance**: Objects too far from the light may be culled from shadow calculations
