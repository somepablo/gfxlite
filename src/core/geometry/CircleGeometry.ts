import { Geometry } from "../geometry/Geometry";

export class CircleGeometry extends Geometry {
	radius: number;
	segments: number;

	constructor({ radius = 1, segments = 32 } = {}) {
		const { vertices, indices, normals, uvs } = CircleGeometry.build(
			radius,
			segments,
		);

		super(
			new Float32Array(vertices),
			new Uint32Array(indices),
			new Float32Array(normals),
			new Float32Array(uvs),
		);

		this.radius = radius;
		this.segments = segments;
	}

	override invalidate(): void {
		const { vertices, indices, normals, uvs } = CircleGeometry.build(
			this.radius,
			this.segments,
		);

		this.setBuffers(
			new Float32Array(vertices),
			new Uint32Array(indices),
			new Float32Array(normals),
			new Float32Array(uvs),
		);

		super.invalidate();
	}

	private static build(radius: number, segments: number) {
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

		return { vertices, indices, normals, uvs };
	}
}
