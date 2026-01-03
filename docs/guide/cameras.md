# Cameras

Cameras define the viewpoint from which the scene is rendered. GFXLite provides two camera types for different projection needs.

## Perspective Camera

The most common camera type for 3D scenes. Objects appear smaller as they get further from the camera, creating a realistic sense of depth.

```typescript
import { PerspectiveCamera, Vector3 } from "gfxlite";

const camera = new PerspectiveCamera(
  60, // fov: vertical field of view in degrees
  16 / 9, // aspect: width / height ratio
  0.1, // near: near clipping plane
  1000, // far: far clipping plane
);

camera.position = new Vector3(0, 5, 10);
```

### Properties

| Property | Type     | Description                       |
| -------- | -------- | --------------------------------- |
| `fov`    | `number` | Vertical field of view in degrees |
| `aspect` | `number` | Aspect ratio (width / height)     |
| `near`   | `number` | Near clipping plane distance      |
| `far`    | `number` | Far clipping plane distance       |

### Updating the Camera

When properties change, call `updateProjectionMatrix()`:

```typescript
camera.fov = 45;
camera.aspect = window.innerWidth / window.innerHeight;
camera.updateProjectionMatrix();
```

## Orthographic Camera

Parallel projection where objects remain the same size regardless of distance. Useful for 2D games, UI elements, CAD applications, or isometric views.

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

### Properties

| Property | Type     | Description         |
| -------- | -------- | ------------------- |
| `left`   | `number` | Left plane          |
| `right`  | `number` | Right plane         |
| `top`    | `number` | Top plane           |
| `bottom` | `number` | Bottom plane        |
| `near`   | `number` | Near clipping plane |
| `far`    | `number` | Far clipping plane  |

## Camera Positioning

### Using position and lookAt

```typescript
camera.position = new Vector3(5, 5, 5);
camera.lookAt(new Vector3(0, 0, 0)); // Look at the origin
```

### Following an Object

```typescript
function animate() {
  // Position camera behind the player
  camera.position.x = player.position.x;
  camera.position.y = player.position.y + 5;
  camera.position.z = player.position.z + 10;

  // Look at the player
  camera.lookAt(player.position);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

::: tip
While manual synchronization works, it is often better to leverage the **Scene Graph**.
By adding the camera as a child of the player object `player.add(camera)`, the camera will automatically inherit the player's transformations. You simply set the camera's local position once, and the engine handles the rest.
:::

## Orbit Controls

For interactive camera control, use `OrbitControls`:

```typescript
import { OrbitControls } from "gfxlite";

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

function animate() {
  controls.update(); // Required when damping is enabled
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

<OrbitControlsExample />

### OrbitControls Options

| Property        | Type      | Default    | Description            |
| --------------- | --------- | ---------- | ---------------------- |
| `enableDamping` | `boolean` | `false`    | Smooth camera movement |
| `dampingFactor` | `number`  | `0.05`     | Damping inertia        |
| `enableZoom`    | `boolean` | `true`     | Allow zooming          |
| `enableRotate`  | `boolean` | `true`     | Allow rotation         |
| `enablePan`     | `boolean` | `true`     | Allow panning          |
| `minDistance`   | `number`  | `0`        | Minimum zoom distance  |
| `maxDistance`   | `number`  | `Infinity` | Maximum zoom distance  |

### Controls Cleanup

Always dispose controls when done:

```typescript
controls.dispose();
```

## Handling Window Resize

```typescript
window.addEventListener("resize", () => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  // Update renderer
  renderer.setSize(width, height);

  // Update camera
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});
```
