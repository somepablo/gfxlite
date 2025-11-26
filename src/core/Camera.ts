import { Matrix4 } from "../math";
import { Object3D } from "./Object3D";

export class Camera extends Object3D {
    public projectionMatrix: Matrix4 = new Matrix4();
    public viewMatrix: Matrix4 = new Matrix4();

    constructor() {
        super();
    }

    updateWorldMatrix(parentWorldMatrix?: Matrix4) {
        super.updateWorldMatrix(parentWorldMatrix);
        this.viewMatrix.copy(this.worldMatrix).invert();
    }
}
