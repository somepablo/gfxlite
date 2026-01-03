import { Geometry } from "../geometry/Geometry";

export class PlaneGeometry extends Geometry {
  width: number;
  height: number;
  widthSegments: number;
  heightSegments: number;

  constructor({
    width = 1,
    height = 1,
    widthSegments = 1,
    heightSegments = 1,
  } = {}) {
    const { vertices, indices, normals, uvs } = PlaneGeometry.build(
      width,
      height,
      widthSegments,
      heightSegments,
    );

    super(
      new Float32Array(vertices),
      new Uint32Array(indices),
      new Float32Array(normals),
      new Float32Array(uvs),
    );

    this.width = width;
    this.height = height;
    this.widthSegments = widthSegments;
    this.heightSegments = heightSegments;
  }

  override invalidate(): void {
    const { vertices, indices, normals, uvs } = PlaneGeometry.build(
      this.width,
      this.height,
      this.widthSegments,
      this.heightSegments,
    );

    this.setBuffers(
      new Float32Array(vertices),
      new Uint32Array(indices),
      new Float32Array(normals),
      new Float32Array(uvs),
    );

    super.invalidate();
  }

  private static build(
    width: number,
    height: number,
    widthSegments: number,
    heightSegments: number,
  ) {
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const widthHalf = width / 2;
    const heightHalf = height / 2;

    const gridX = widthSegments;
    const gridY = heightSegments;

    const segmentWidth = width / gridX;
    const segmentHeight = height / gridY;

    // Generate vertices, normals, and UVs
    for (let iy = 0; iy <= gridY; iy++) {
      const z = iy * segmentHeight - heightHalf;
      const v = iy / gridY;

      for (let ix = 0; ix <= gridX; ix++) {
        const x = ix * segmentWidth - widthHalf;
        const u = ix / gridX;

        vertices.push(x, 0, z);
        normals.push(0, 1, 0);
        uvs.push(u, v);
      }
    }

    // Generate indices
    for (let iy = 0; iy < gridY; iy++) {
      for (let ix = 0; ix < gridX; ix++) {
        const a = ix + (gridX + 1) * iy;
        const b = ix + (gridX + 1) * (iy + 1);
        const c = ix + 1 + (gridX + 1) * (iy + 1);
        const d = ix + 1 + (gridX + 1) * iy;

        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    return { vertices, indices, normals, uvs };
  }
}
