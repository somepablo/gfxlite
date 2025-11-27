import { Geometry } from "../core/Geometry";

export class TorusGeometry extends Geometry {
    constructor({
        radius = 1,
        tube = 0.4,
        radialSegments = 16,
        tubularSegments = 32,
    } = {}) {
        const vertices: number[] = [];
        const indices: number[] = [];

        // Generate vertices
        for (let j = 0; j <= radialSegments; j++) {
            for (let i = 0; i <= tubularSegments; i++) {
                const u = (i / tubularSegments) * Math.PI * 2;
                const v = (j / radialSegments) * Math.PI * 2;

                const x = (radius + tube * Math.cos(v)) * Math.cos(u);
                const y = (radius + tube * Math.cos(v)) * Math.sin(u);
                const z = tube * Math.sin(v);

                vertices.push(x, y, z);
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

        super(new Float32Array(vertices), new Uint32Array(indices));
    }
}
