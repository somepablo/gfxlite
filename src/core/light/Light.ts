import { Object3D } from "../object/Object3D";
import { Vector3 } from "../../math";

export class Light extends Object3D {
    public color: Vector3;
    public intensity: number;

    constructor(color: Vector3 = new Vector3(1, 1, 1), intensity: number = 1) {
        super();
        this.color = color;
        this.intensity = intensity;
    }
}
