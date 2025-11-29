import { Object3D } from "../object/Object3D";
import { Vector3 } from "../../math";

export class Scene extends Object3D {
    public ambientLight: Vector3 = new Vector3(0.1, 0.1, 0.1);
}
