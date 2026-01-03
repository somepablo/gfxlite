# Materials

Materials define how surfaces appear when rendered. GFXLite provides four material types with increasing complexity and realism.

<MaterialsExample />

## Basic Material

The simplest material - displays a solid color without any lighting calculations.

```typescript
import { BasicMaterial, Vector3 } from "gfxlite";

const material = new BasicMaterial({
  color: new Vector3(1, 0, 0), // RGB values from 0 to 1
});
```

### Options

| Property    | Type        | Default     | Description        |
| ----------- | ----------- | ----------- | ------------------ |
| `color`     | `Vector3`   | `(1, 1, 1)` | Base color         |
| `opacity`   | `number`    | `1.0`       | Transparency (0-1) |
| `blendMode` | `BlendMode` | `Opaque`    | Blending mode      |

## Lambert Material

Diffuse shading using the Lambertian reflectance model. Reacts to lights but has no specular highlights.

```typescript
import { LambertMaterial, Vector3 } from "gfxlite";

const material = new LambertMaterial({
  color: new Vector3(0.2, 0.8, 0.2),
});
```

### Options

| Property  | Type      | Default     | Description     |
| --------- | --------- | ----------- | --------------- |
| `color`   | `Vector3` | `(1, 1, 1)` | Diffuse color   |
| `opacity` | `number`  | `1.0`       | Transparency    |
| `map`     | `Texture` | `null`      | Diffuse texture |

## Phong Material

Classic Phong shading with diffuse and specular components. Good for shiny surfaces.

```typescript
import { PhongMaterial, Vector3 } from "gfxlite";

const material = new PhongMaterial({
  color: new Vector3(0.8, 0.2, 0.2),
  shininess: 64,
});
```

### Options

| Property    | Type      | Default     | Description        |
| ----------- | --------- | ----------- | ------------------ |
| `color`     | `Vector3` | `(1, 1, 1)` | Diffuse color      |
| `shininess` | `number`  | `32`        | Specular sharpness |
| `specular`  | `Vector3` | `(1, 1, 1)` | Specular color     |
| `opacity`   | `number`  | `1.0`       | Transparency       |
| `map`       | `Texture` | `null`      | Diffuse texture    |

## Standard Material

A more physically-based material with roughness and metalness parameters.

```typescript
import { StandardMaterial, Vector3 } from "gfxlite";

const material = new StandardMaterial({
  color: new Vector3(0.8, 0.6, 0.2),
  roughness: 0.3,
  metalness: 0.8,
});
```

### Options

| Property       | Type      | Default     | Description                             |
| -------------- | --------- | ----------- | --------------------------------------- |
| `color`        | `Vector3` | `(1, 1, 1)` | Base color                              |
| `roughness`    | `number`  | `0.5`       | Surface roughness (0=smooth, 1=rough)   |
| `metalness`    | `number`  | `0.0`       | Metallic factor (0=dielectric, 1=metal) |
| `opacity`      | `number`  | `1.0`       | Transparency                            |
| `map`          | `Texture` | `null`      | Base color texture                      |
| `normalMap`    | `Texture` | `null`      | Normal map texture                      |
| `roughnessMap` | `Texture` | `null`      | Roughness texture                       |
| `metalnessMap` | `Texture` | `null`      | Metalness texture                       |

## Transparency

All materials support transparency through the `opacity` and `blendMode` properties:

```typescript
import { BasicMaterial, BlendMode, Vector3 } from "gfxlite";

// Semi-transparent material
const material = new BasicMaterial({
  color: new Vector3(1, 0, 0),
  opacity: 0.5,
  blendMode: BlendMode.AlphaBlend,
});

// Alpha cutoff (for textures with hard edges)
const foliageMaterial = new BasicMaterial({
  map: leafTexture,
  blendMode: BlendMode.AlphaCutoff,
  alphaCutoff: 0.5,
});
```

### Blend Modes

| Mode                    | Description                                  |
| ----------------------- | -------------------------------------------- |
| `BlendMode.Opaque`      | No transparency (default)                    |
| `BlendMode.AlphaBlend`  | Standard alpha blending                      |
| `BlendMode.AlphaCutoff` | Binary transparency based on alpha threshold |

## Material Comparison

| Material | Lighting | Specular  | Performance | Use Case                          |
| -------- | -------- | --------- | ----------- | --------------------------------- |
| Basic    | No       | No        | Fastest     | UI, unlit effects, debugging      |
| Lambert  | Yes      | No        | Fast        | Matte surfaces, stylized graphics |
| Phong    | Yes      | Yes       | Medium      | Shiny objects, classic 3D look    |
| Standard | Yes      | Yes (PBR) | Slower      | Realistic rendering               |
