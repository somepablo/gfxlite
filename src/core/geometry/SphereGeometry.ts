import { Geometry } from "../geometry/Geometry";
import { Vector3 } from "../../math";

export class SphereGeometry extends Geometry {
  radius: number;
  widthSegments: number;
  heightSegments: number;

  constructor({ radius = 1, widthSegments = 32, heightSegments = 16 } = {}) {
    const { vertices, indices, normals, uvs } = SphereGeometry.build(
      radius,
      widthSegments,
      heightSegments,
    );

    super(
      new Float32Array(vertices),
      new Uint32Array(indices),
      new Float32Array(normals),
      new Float32Array(uvs),
    );

    this.radius = radius;
    this.widthSegments = widthSegments;
    this.heightSegments = heightSegments;
  }

  override invalidate(): void {
    const { vertices, indices, normals, uvs } = SphereGeometry.build(
      this.radius,
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
    radius: number,
    widthSegments: number,
    heightSegments: number,
  ) {
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Generate vertices and UVs
    for (let y = 0; y <= heightSegments; y++) {
      const v = y / heightSegments;
      const phi = v * Math.PI;

      for (let x = 0; x <= widthSegments; x++) {
        const u = x / widthSegments;
        const theta = u * Math.PI * 2;

        const px = -radius * Math.cos(theta) * Math.sin(phi);
        const py = radius * Math.cos(phi);
        const pz = radius * Math.sin(theta) * Math.sin(phi);

        vertices.push(px, py, pz);
        uvs.push(u, v);
      }
    }

    // Generate indices
    for (let y = 0; y < heightSegments; y++) {
      for (let x = 0; x < widthSegments; x++) {
        const a = y * (widthSegments + 1) + x;
        const b = a + widthSegments + 1;
        const c = a + 1;
        const d = b + 1;

        // Two triangles per quad
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    // For a sphere, normals are the same as positions (normalized)
    const normals: number[] = [];
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const y = vertices[i + 1];
      const z = vertices[i + 2];
      const n = new Vector3(x, y, z).normalize();
      normals.push(n.x, n.y, n.z);
    }

    return { vertices, indices, normals, uvs };
  }
}
