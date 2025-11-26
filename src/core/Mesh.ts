import type { Geometry } from "./Geometry";
import type { Material } from "./Material";
import { Object3D } from "./Object3D";

export class Mesh extends Object3D {
    public geometry: Geometry;
    public material: Material;

    constructor(geometry: Geometry, material: Material) {
        super();
        this.geometry = geometry;
        this.material = material;
    }
}
