import { Geometry } from "../geometry/Geometry";

export class TorusGeometry extends Geometry {
  radius: number;
  tube: number;
  radialSegments: number;
  tubularSegments: number;

  constructor({
    radius = 1,
    tube = 0.4,
    radialSegments = 16,
    tubularSegments = 32,
  } = {}) {
    const { vertices, indices, normals, uvs } = TorusGeometry.build(
      radius,
      tube,
      radialSegments,
      tubularSegments,
    );

    super(
      new Float32Array(vertices),
      new Uint32Array(indices),
      new Float32Array(normals),
      new Float32Array(uvs),
    );

    this.radius = radius;
    this.tube = tube;
    this.radialSegments = radialSegments;
    this.tubularSegments = tubularSegments;
  }

  override invalidate(): void {
    const { vertices, indices, normals, uvs } = TorusGeometry.build(
      this.radius,
      this.tube,
      this.radialSegments,
      this.tubularSegments,
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
    radius: number,
    tube: number,
    radialSegments: number,
    tubularSegments: number,
  ) {
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Generate vertices, normals, and UVs
    for (let j = 0; j <= radialSegments; j++) {
      const vCoord = j / radialSegments;
      for (let i = 0; i <= tubularSegments; i++) {
        const uCoord = i / tubularSegments;
        const u = uCoord * Math.PI * 2;
        const v = vCoord * Math.PI * 2;

        const x = (radius + tube * Math.cos(v)) * Math.cos(u);
        const y = (radius + tube * Math.cos(v)) * Math.sin(u);
        const z = tube * Math.sin(v);

        vertices.push(x, y, z);

        // Calculate normal (from torus center to vertex on tube surface)
        const centerX = radius * Math.cos(u);
        const centerY = radius * Math.sin(u);
        const centerZ = 0;

        const nx = x - centerX;
        const ny = y - centerY;
        const nz = z - centerZ;

        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        normals.push(nx / len, ny / len, nz / len);

        uvs.push(uCoord, vCoord);
      }
    }

    // Generate indices
    for (let j = 0; j < radialSegments; j++) {
      for (let i = 0; i < tubularSegments; i++) {
        const a = (tubularSegments + 1) * j + i;
        const b = (tubularSegments + 1) * (j + 1) + i;
        const c = (tubularSegments + 1) * (j + 1) + i + 1;
        const d = (tubularSegments + 1) * j + i + 1;

        indices.push(a, d, b);
        indices.push(d, c, b);
      }
    }

    return { vertices, indices, normals, uvs };
  }
}
