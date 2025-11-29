import { Geometry } from "../geometry/Geometry";

export class TorusGeometry extends Geometry {
    constructor({
        radius = 1,
        tube = 0.4,
        radialSegments = 16,
        tubularSegments = 32,
    } = {}) {
        const vertices: number[] = [];
        const normals: number[] = [];
        const indices: number[] = [];

        // Generate vertices and normals
        for (let j = 0; j <= radialSegments; j++) {
            for (let i = 0; i <= tubularSegments; i++) {
                const u = (i / tubularSegments) * Math.PI * 2;
                const v = (j / radialSegments) * Math.PI * 2;

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
            }
        }

        // Generate indices
        for (let j = 0; j < radialSegments; j++) {
            for (let i = 0; i < tubularSegments; i++) {
                const a = (tubularSegments + 1) * j + i;
                const b = (tubularSegments + 1) * (j + 1) + i;
                const c = (tubularSegments + 1) * (j + 1) + i + 1;
                const d = (tubularSegments + 1) * j + i + 1;

                indices.push(a, b, d);
                indices.push(b, c, d);
            }
        }

        super(
            new Float32Array(vertices),
            new Uint32Array(indices),
            new Float32Array(normals)
        );
    }
}
