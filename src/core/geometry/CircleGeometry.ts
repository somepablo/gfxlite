import { Geometry } from "../geometry/Geometry";

export class CircleGeometry extends Geometry {
    constructor({ radius = 1, segments = 32 } = {}) {
        const vertices: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];

        // Center vertex
        vertices.push(0, 0, 0);
        normals.push(0, 0, 1);
        uvs.push(0.5, 0.5);

        // Generate vertices around the circle
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const x = radius * Math.cos(theta);
            const y = radius * Math.sin(theta);
            vertices.push(x, y, 0);
            normals.push(0, 0, 1);
            uvs.push(Math.cos(theta) * 0.5 + 0.5, Math.sin(theta) * 0.5 + 0.5);
        }

        // Generate indices (triangles from center to edge)
        for (let i = 1; i <= segments; i++) {
            indices.push(0, i, i + 1);
        }

        super(
            new Float32Array(vertices),
            new Uint32Array(indices),
            new Float32Array(normals),
            new Float32Array(uvs)
        );
    }
}
