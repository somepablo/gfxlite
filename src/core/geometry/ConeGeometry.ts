import { Geometry } from "../geometry/Geometry";

export class ConeGeometry extends Geometry {
    constructor({
        radius = 1,
        height = 1,
        radialSegments = 32,
        heightSegments = 1,
        openEnded = false,
    } = {}) {
        const vertices: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];

        const halfHeight = height / 2;

        // Generate vertices, normals, and UVs for the sides (tip to base)
        for (let y = 0; y <= heightSegments; y++) {
            const v = y / heightSegments;
            const currentHeight = v * height - halfHeight;
            const currentRadius = v * radius;

            for (let x = 0; x <= radialSegments; x++) {
                const u = x / radialSegments;
                const theta = u * Math.PI * 2;

                const px = currentRadius * Math.cos(theta);
                const py = currentHeight;
                const pz = currentRadius * Math.sin(theta);

                vertices.push(px, py, pz);

                // Calculate cone surface normal (points outward and slightly up)
                const nx = Math.cos(theta);
                const nz = Math.sin(theta);
                // Normalize the normal vector (approximate)
                const ny = radius / height;
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
                normals.push(nx / len, ny / len, nz / len);

                uvs.push(u, v);
            }
        }

        // Generate indices for the sides
        for (let y = 0; y < heightSegments; y++) {
            for (let x = 0; x < radialSegments; x++) {
                const a = y * (radialSegments + 1) + x;
                const b = a + radialSegments + 1;
                const c = a + 1;
                const d = b + 1;

                indices.push(a, b, c);
                indices.push(b, d, c);
            }
        }

        // Generate base cap if not open-ended
        if (!openEnded) {
            const baseCenterIndex = vertices.length / 3;
            vertices.push(0, -halfHeight, 0);
            normals.push(0, -1, 0);
            uvs.push(0.5, 0.5);

            for (let x = 0; x <= radialSegments; x++) {
                const theta = (x / radialSegments) * Math.PI * 2;
                const px = radius * Math.cos(theta);
                const pz = radius * Math.sin(theta);
                vertices.push(px, -halfHeight, pz);
                normals.push(0, -1, 0);
                uvs.push(Math.cos(theta) * 0.5 + 0.5, Math.sin(theta) * 0.5 + 0.5);
            }

            for (let x = 0; x < radialSegments; x++) {
                const a = baseCenterIndex;
                const b = baseCenterIndex + 1 + x + 1;
                const c = baseCenterIndex + 1 + x;
                indices.push(a, c, b);
            }
        }

        super(
            new Float32Array(vertices),
            new Uint32Array(indices),
            new Float32Array(normals),
            new Float32Array(uvs)
        );
    }
}
