# Textures

Textures allow you to apply images to your 3D surfaces, adding visual detail without increasing geometry complexity.

<TexturesExample />

## Loading Textures

```typescript
import { Texture } from "gfxlite";

const texture = await Texture.load("path/to/image.png");
```

Supported formats: PNG, JPG, WebP, and other browser-supported image formats.

## Applying Textures to Materials

All materials support the `map` property for the base color texture:

```typescript
import { LambertMaterial, Texture } from "gfxlite";

const texture = await Texture.load("diffuse.png");

const material = new LambertMaterial({
  map: texture,
});
```

## Standard Material Texture Maps

The `StandardMaterial` supports multiple texture types for PBR rendering:

```typescript
import { StandardMaterial, Texture } from "gfxlite";

// Load textures
const colorMap = await Texture.load("color.png");
const normalMap = await Texture.load("normal.png");
const roughnessMap = await Texture.load("roughness.png");
const metalnessMap = await Texture.load("metalness.png");

// Create material with all maps
const material = new StandardMaterial({
  map: colorMap,
  normalMap: normalMap,
  roughnessMap: roughnessMap,
  metalnessMap: metalnessMap,
});
```

### Texture Map Types

| Map Type       | Description                   |
| -------------- | ----------------------------- |
| `map`          | Base color (albedo) texture   |
| `normalMap`    | Surface normal detail         |
| `roughnessMap` | Surface roughness (grayscale) |
| `metalnessMap` | Metallic factor (grayscale)   |

## Texture with Color Tinting

You can combine a texture with a color tint:

```typescript
import { Vector3 } from "gfxlite";

const material = new LambertMaterial({
  color: new Vector3(1.0, 0.8, 0.8), // Slight red tint
  map: texture,
});
```

The color multiplies with the texture color.

## UV Coordinates

Textures are mapped to geometry using UV coordinates. Built-in geometries include UV coordinates automatically:

- **BoxGeometry**: Each face is mapped 0-1
- **SphereGeometry**: Spherical UV mapping
- **PlaneGeometry**: Simple planar mapping
- **CylinderGeometry**: Cylindrical UV mapping

## Transparency with Textures

For textures with alpha channels:

```typescript
import { BlendMode } from "gfxlite";

// Alpha blending for smooth transparency
const material = new BasicMaterial({
  map: textureWithAlpha,
  blendMode: BlendMode.AlphaBlend,
});

// Alpha cutoff for hard edges (foliage, fences)
const foliageMaterial = new BasicMaterial({
  map: leafTexture,
  blendMode: BlendMode.AlphaCutoff,
  alphaCutoff: 0.5,
});
```

## Example: Textured Cube

```typescript
import { Mesh, BoxGeometry, LambertMaterial, Texture } from "gfxlite";

async function createTexturedCube() {
  const texture = await Texture.load("crate.png");

  const geometry = new BoxGeometry({ width: 2, height: 2, depth: 2 });
  const material = new LambertMaterial({
    map: texture,
  });

  const cube = new Mesh(geometry, material);
  scene.add(cube);

  return cube;
}
```

## Performance Tips

1. **Texture Size**: Use power-of-two dimensions (256, 512, 1024, 2048) for best GPU compatibility
2. **Compression**: Use compressed formats (WebP) when possible
3. **Texture Reuse**: Share textures between materials when appropriate
4. **Mipmaps**: WebGPU generates mipmaps automatically for better rendering at different distances
