import { Geometry } from "../geometry/Geometry";

export class CylinderGeometry extends Geometry {
	radiusTop: number;
	radiusBottom: number;
	height: number;
	radialSegments: number;
	heightSegments: number;
	openEnded: boolean;

	constructor({
		radiusTop = 1,
		radiusBottom = 1,
		height = 1,
		radialSegments = 32,
		heightSegments = 1,
		openEnded = false,
	} = {}) {
		const { vertices, indices, normals, uvs } = CylinderGeometry.build(
			radiusTop,
			radiusBottom,
			height,
			radialSegments,
			heightSegments,
			openEnded,
		);

		super(
			new Float32Array(vertices),
			new Uint32Array(indices),
			new Float32Array(normals),
			new Float32Array(uvs),
		);

		this.radiusTop = radiusTop;
		this.radiusBottom = radiusBottom;
		this.height = height;
		this.radialSegments = radialSegments;
		this.heightSegments = heightSegments;
		this.openEnded = openEnded;
	}

	override invalidate(): void {
		const { vertices, indices, normals, uvs } = CylinderGeometry.build(
			this.radiusTop,
			this.radiusBottom,
			this.height,
			this.radialSegments,
			this.heightSegments,
			this.openEnded,
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
		radiusTop: number,
		radiusBottom: number,
		height: number,
		radialSegments: number,
		heightSegments: number,
		openEnded: boolean,
	) {
		const vertices: number[] = [];
		const normals: number[] = [];
		const uvs: number[] = [];
		const indices: number[] = [];

		const halfHeight = height / 2;

		// Generate vertices, normals, and UVs for the sides
		for (let y = 0; y <= heightSegments; y++) {
			const v = y / heightSegments;
			// v=0 is bottom (-halfHeight), v=1 is top (+halfHeight)
			const currentHeight = v * height - halfHeight;
			// Interpolate radius: v=0 uses radiusBottom, v=1 uses radiusTop
			const radius = (1 - v) * radiusBottom + v * radiusTop;

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

		// Generate caps if not open-ended
		if (!openEnded) {
			const topCenterIndex = vertices.length / 3;
			vertices.push(0, halfHeight, 0);
			normals.push(0, 1, 0);
			uvs.push(0.5, 0.5);

			// Top cap vertices
			for (let x = 0; x <= radialSegments; x++) {
				const u = x / radialSegments;
				const theta = u * Math.PI * 2;
				const px = radiusTop * Math.cos(theta);
				const pz = radiusTop * Math.sin(theta);
				vertices.push(px, halfHeight, pz);
				normals.push(0, 1, 0);
				uvs.push(Math.cos(theta) * 0.5 + 0.5, Math.sin(theta) * 0.5 + 0.5);
			}

			for (let x = 0; x < radialSegments; x++) {
				const a = topCenterIndex;
				const b = topCenterIndex + 1 + x;
				const c = topCenterIndex + 1 + x + 1;
				indices.push(a, c, b);
			}

			// Bottom cap
			const bottomCenterIndex = vertices.length / 3;
			vertices.push(0, -halfHeight, 0);
			normals.push(0, -1, 0);
			uvs.push(0.5, 0.5);

			for (let x = 0; x <= radialSegments; x++) {
				const u = x / radialSegments;
				const theta = u * Math.PI * 2;
				const px = radiusBottom * Math.cos(theta);
				const pz = radiusBottom * Math.sin(theta);
				vertices.push(px, -halfHeight, pz);
				normals.push(0, -1, 0);
				uvs.push(Math.cos(theta) * 0.5 + 0.5, Math.sin(theta) * 0.5 + 0.5);
			}

			for (let x = 0; x < radialSegments; x++) {
				const a = bottomCenterIndex;
				const b = bottomCenterIndex + 1 + x + 1;
				const c = bottomCenterIndex + 1 + x;
				indices.push(a, c, b);
			}
		}

		return { vertices, indices, normals, uvs };
	}
}
