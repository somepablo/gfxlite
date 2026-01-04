import type { Geometry } from "../geometry/Geometry";
import type { Material } from "../material/Material";
import { Object3D } from "../object/Object3D";

export class Mesh extends Object3D {
	public geometry: Geometry;
	public material: Material;

	constructor(geometry: Geometry, material: Material) {
		super();
		this.geometry = geometry;
		this.material = material;
	}
}
