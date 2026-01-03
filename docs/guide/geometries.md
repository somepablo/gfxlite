# Geometries

GFXLite provides several built-in geometry types for common 3D shapes. All geometries generate vertex positions, normals, and UV coordinates.

<GeometriesExample />

## Box Geometry

A rectangular box (cuboid).

```typescript
import { BoxGeometry } from "gfxlite";

const geometry = new BoxGeometry({
  width: 1,
  height: 1,
  depth: 1,
});
```

## Sphere Geometry

A UV sphere.

```typescript
import { SphereGeometry } from "gfxlite";

const geometry = new SphereGeometry({
  radius: 1,
  widthSegments: 32,
  heightSegments: 16,
});
```

Higher segment counts produce smoother spheres but use more vertices.

## Plane Geometry

A flat rectangular surface in the XZ plane.

```typescript
import { PlaneGeometry } from "gfxlite";

const geometry = new PlaneGeometry({
  width: 10,
  height: 10,
});
```

::: tip
Unlike Three.js, GFXLite uses the XZ plane instead of the XY plane for the `PlaneGeometry`. We found it more convenient for 3D environments.
:::

## Cylinder Geometry

A cylinder with configurable top and bottom radius.

```typescript
import { CylinderGeometry } from "gfxlite";

const geometry = new CylinderGeometry({
  radiusTop: 0.5,
  radiusBottom: 0.5,
  height: 2,
  radialSegments: 32,
});
```

::: tip
Set `radiusTop` to 0 to create a cone shape (or use `ConeGeometry`).
:::

## Cone Geometry

A cone with a circular base.

```typescript
import { ConeGeometry } from "gfxlite";

const geometry = new ConeGeometry({
  radius: 0.5,
  height: 1,
  radialSegments: 32,
});
```

## Torus Geometry

A donut shape (torus).

```typescript
import { TorusGeometry } from "gfxlite";

const geometry = new TorusGeometry({
  radius: 1,
  tube: 0.3,
  radialSegments: 16,
  tubularSegments: 32,
});
```

## Circle Geometry

A flat circular disc in the XZ plane.

```typescript
import { CircleGeometry } from "gfxlite";

const geometry = new CircleGeometry({
  radius: 1,
  segments: 32,
});
```

## Using Geometries

Geometries are combined with materials to create meshes:

```typescript
import { Mesh, BoxGeometry, BasicMaterial, Vector3 } from "gfxlite";

const geometry = new BoxGeometry({ width: 1, height: 1, depth: 1 });
const material = new BasicMaterial({ color: new Vector3(1, 0, 0) });
const mesh = new Mesh(geometry, material);

scene.add(mesh);
```

## Geometry Reuse

Geometries can be shared between multiple meshes to save memory:

```typescript
const sharedGeometry = new SphereGeometry({ radius: 0.5 });

for (let i = 0; i < 100; i++) {
  const material = new BasicMaterial({
    color: new Vector3(Math.random(), Math.random(), Math.random()),
  });
  const mesh = new Mesh(sharedGeometry, material);
  mesh.position.x = (i % 10) * 2;
  mesh.position.z = Math.floor(i / 10) * 2;
  scene.add(mesh);
}
```

## Dynamic Geometry Updates

You can modify geometry parameters at runtime and call `invalidate()` to rebuild:

```typescript
const sphere = new SphereGeometry({ radius: 1 });
const mesh = new Mesh(sphere, material);

// Later, update the radius
sphere.radius = 2;
sphere.invalidate(); // Rebuilds the geometry
```
