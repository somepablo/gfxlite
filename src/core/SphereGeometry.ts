import { Geometry } from "../core/Geometry";

export class SphereGeometry extends Geometry {
    constructor({
        radius = 1,
        widthSegments = 32,
        heightSegments = 16,
    } = {}) {
        const vertices: number[] = [];
        const indices: number[] = [];

        // Generate vertices
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

        super(new Float32Array(vertices), new Uint32Array(indices));
    }
}
