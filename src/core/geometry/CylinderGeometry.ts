import { Geometry } from "../geometry/Geometry";

export class CylinderGeometry extends Geometry {
    constructor({
        radiusTop = 1,
        radiusBottom = 1,
        height = 1,
        radialSegments = 32,
        heightSegments = 1,
        openEnded = false,
    } = {}) {
        const vertices: number[] = [];
        const normals: number[] = [];
        const indices: number[] = [];

        const halfHeight = height / 2;

        // Generate vertices and normals for the sides
        for (let y = 0; y <= heightSegments; y++) {
            const v = y / heightSegments;
            const currentHeight = v * height - halfHeight;
            const radius = v * (radiusBottom - radiusTop) + radiusTop;

            for (let x = 0; x <= radialSegments; x++) {
                const u = x / radialSegments;
                const theta = u * Math.PI * 2;

                const px = radius * Math.cos(theta);
                const py = currentHeight;
                const pz = radius * Math.sin(theta);

                vertices.push(px, py, pz);

                // Normal points outward radially
                const nx = Math.cos(theta);
                const nz = Math.sin(theta);
                normals.push(nx, 0, nz);
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

        // Generate caps if not open-ended
        if (!openEnded) {
            const topCenterIndex = vertices.length / 3;
            vertices.push(0, halfHeight, 0); // Top center
            normals.push(0, 1, 0); // Normal points up

            // Top cap vertices
            for (let x = 0; x <= radialSegments; x++) {
                const theta = (x / radialSegments) * Math.PI * 2;
                const px = radiusTop * Math.cos(theta);
                const pz = radiusTop * Math.sin(theta);
                vertices.push(px, halfHeight, pz);
                normals.push(0, 1, 0);
            }

            // Top cap indices
            for (let x = 0; x < radialSegments; x++) {
                const a = topCenterIndex;
                const b = topCenterIndex + 1 + x;
                const c = topCenterIndex + 1 + x + 1;
                indices.push(a, b, c);
            }

            // Bottom cap
            const bottomCenterIndex = vertices.length / 3;
            vertices.push(0, -halfHeight, 0); // Bottom center
            normals.push(0, -1, 0); // Normal points down

            for (let x = 0; x <= radialSegments; x++) {
                const theta = (x / radialSegments) * Math.PI * 2;
                const px = radiusBottom * Math.cos(theta);
                const pz = radiusBottom * Math.sin(theta);
                vertices.push(px, -halfHeight, pz);
                normals.push(0, -1, 0);
            }

            // Bottom cap indices
            for (let x = 0; x < radialSegments; x++) {
                const a = bottomCenterIndex;
                const b = bottomCenterIndex + 1 + x + 1;
                const c = bottomCenterIndex + 1 + x;
                indices.push(a, b, c);
            }
        }

        super(
            new Float32Array(vertices),
            new Uint32Array(indices),
            new Float32Array(normals)
        );
    }
}
