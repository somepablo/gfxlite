# API Reference

This section provides detailed documentation for all GFXLite classes and types.

## Core

| Class | Description |
|-------|-------------|
| [Renderer](/api/renderer) | Main rendering engine |
| [Scene](/api/scene) | Container for all scene objects |
| [Object3D](/api/object3d) | Base class for all 3D objects |
| [Mesh](/api/mesh) | Renderable object (geometry + material) |

## Cameras

| Class | Description |
|-------|-------------|
| [PerspectiveCamera](/api/perspective-camera) | Standard perspective projection |
| [OrthographicCamera](/api/orthographic-camera) | Parallel orthographic projection |

## Materials

| Class | Description |
|-------|-------------|
| [BasicMaterial](/api/basic-material) | Simple unlit material |
| [LambertMaterial](/api/lambert-material) | Diffuse Lambert shading |
| [PhongMaterial](/api/phong-material) | Phong specular shading |
| [StandardMaterial](/api/standard-material) | PBR-like material |

## Geometries

| Class | Description |
|-------|-------------|
| [BoxGeometry](/api/geometries#boxgeometry) | Rectangular box |
| [SphereGeometry](/api/geometries#spheregeometry) | UV sphere |
| [PlaneGeometry](/api/geometries#planegeometry) | Flat plane |
| [CylinderGeometry](/api/geometries#cylindergeometry) | Cylinder |
| [ConeGeometry](/api/geometries#conegeometry) | Cone |
| [TorusGeometry](/api/geometries#torusgeometry) | Torus (donut) |
| [CircleGeometry](/api/geometries#circlegeometry) | Flat circle |

## Lighting

| Class | Description |
|-------|-------------|
| DirectionalLight | Parallel light source (sun-like) |

## Other

| Class | Description |
|-------|-------------|
| Texture | 2D texture for materials |
| Environment | HDR environment map |
| OrbitControls | Interactive camera controls |
| GLTFLoader | GLTF/GLB model loader |

## Enums

### ShadowType

```typescript
enum ShadowType {
  Basic = 0,    // Hard shadows
  PCF = 1,      // Percentage Closer Filtering
  PCFSoft = 2,  // Soft PCF shadows
}
```

### BlendMode

```typescript
enum BlendMode {
  Opaque = 0,      // No transparency
  AlphaBlend = 1,  // Standard alpha blending
  AlphaCutoff = 2, // Binary transparency
}
```

## Math Utilities

| Class | Description |
|-------|-------------|
| Vector2 | 2D vector |
| Vector3 | 3D vector |
| Matrix3 | 3x3 matrix |
| Matrix4 | 4x4 matrix |
| Quaternion | Rotation quaternion |
| Euler | Euler angles |
| Box3 | Axis-aligned bounding box |

### Utility Functions

```typescript
import { clamp, degToRad, radToDeg } from "gfxlite";

clamp(value, min, max);  // Clamp value to range
degToRad(degrees);       // Convert degrees to radians
radToDeg(radians);       // Convert radians to degrees
```
