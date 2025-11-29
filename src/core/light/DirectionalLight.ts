import { Light } from "./Light";
import { Vector3 } from "../../math";

export class DirectionalLight extends Light {
    constructor(color: Vector3 = new Vector3(1, 1, 1), intensity: number = 1) {
        super(color, intensity);
    }

    get direction(): Vector3 {
        const forward = new Vector3(0, 0, -1);
        forward.applyQuaternion(this.rotation);
        return forward.normalize();
    }
}
