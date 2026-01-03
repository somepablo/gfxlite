# Scene Graph

GFXLite uses a hierarchical scene graph where objects can be nested within each other. Transformations (position, rotation, scale) are inherited from parent to child.

## Object3D

`Object3D` is the base class for all objects in the scene. It provides transformation properties and hierarchy management.

```typescript
import { Object3D, Vector3 } from "gfxlite";

const parent = new Object3D();
const child = new Object3D();

parent.add(child); // child is now attached to parent
```

## Transformations

Every `Object3D` has three transformation properties:

### Position

```typescript
// Set position directly
object.position = new Vector3(1, 2, 3);

// Or modify individual components
object.position.x = 5;
object.position.y = 10;
```

### Rotation

Rotation is stored as a `Quaternion`. For convenience, helper methods are provided to rotate objects:

```typescript
import { Euler, Vector3 } from "gfxlite";

// Use helper methods for incremental rotation
object.rotateY(0.01); // Rotate around local Y axis
object.rotateX(0.01); // Rotate around local X axis
object.rotateOnAxis(new Vector3(1, 1, 0).normalize(), 0.1);

// Set absolute rotation using Euler angles
object.rotation.setFromEuler(new Euler(0, Math.PI / 4, 0));
```

### Scale

```typescript
// Uniform scale
object.scale = new Vector3(2, 2, 2);

// Non-uniform scale
object.scale.x = 1;
object.scale.y = 2;
object.scale.z = 0.5;
```

## Parent-Child Relationships

When you add a child to a parent, the child's transformation becomes relative to the parent:

```typescript
const parent = new Object3D();
parent.position.x = 5;

const child = new Mesh(geometry, material);
child.position.x = 2;

parent.add(child);
scene.add(parent);

// child's world position is now (7, 0, 0)
```

### Managing Hierarchy

```typescript
// Add a child
parent.add(child);

// Remove a child
parent.remove(child);

// Access children
const children = parent.children;

// Access parent
const parentObj = child.parent;
```

## Example: Solar System

Here's a practical example of using the scene graph to create a simple solar system:

```typescript
import {
  Object3D,
  Mesh,
  SphereGeometry,
  BasicMaterial,
  Vector3,
} from "gfxlite";

// Create the sun (center of the system)
const sun = new Mesh(
  new SphereGeometry(),
  new BasicMaterial({ color: new Vector3(1, 0.8, 0.2) }),
);
sun.scale.set(2, 2, 2);
scene.add(sun);

// Create an orbit pivot for Earth
const earthOrbit = new Object3D();
scene.add(earthOrbit);

// Create Earth - offset from the orbit pivot
const earth = new Mesh(
  new SphereGeometry(),
  new BasicMaterial({ color: new Vector3(0.2, 0.4, 1) }),
);
earth.position.x = 8; // 8 units from sun
earthOrbit.add(earth);

// Create Moon orbit (relative to Earth)
const moonOrbit = new Object3D();
earth.add(moonOrbit);

// Create Moon
const moon = new Mesh(
  new SphereGeometry(),
  new BasicMaterial({ color: new Vector3(0.7, 0.7, 0.7) }),
);
moon.position.x = 1.5; // 1.5 units from Earth
moon.scale.set(0.5, 0.5, 0.5);
moonOrbit.add(moon);

// Animation
function animate() {
  // Rotate Earth's orbit around the sun
  earthOrbit.rotateY(0.01);

  // Rotate Moon's orbit around Earth
  moonOrbit.rotateY(0.03);

  // Spin the planets
  earth.rotateY(0.02);
  moon.rotateY(0.01);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

<SolarSystem />

## World vs Local Transformations

- **Local transformation**: The object's position, rotation, and scale relative to its parent
- **World transformation**: The final transformation after applying all parent transformations

The scene graph automatically computes world matrices each frame during rendering.
