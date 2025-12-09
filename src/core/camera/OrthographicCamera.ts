import { Camera } from "./Camera";

export class OrthographicCamera extends Camera {
    public left: number;
    public right: number;
    public top: number;
    public bottom: number;
    public near: number;
    public far: number;

    constructor(
        left: number = -1,
        right: number = 1,
        top: number = 1,
        bottom: number = -1,
        near: number = 0.1,
        far: number = 2000,
    ) {
        super();
        this.left = left;
        this.right = right;
        this.top = top;
        this.bottom = bottom;
        this.near = near;
        this.far = far;

        this.updateProjectionMatrix();
    }

    updateProjectionMatrix() {
        this.projectionMatrix.orthographic(
            this.left,
            this.right,
            this.bottom,
            this.top,
            this.near,
            this.far,
        );
        super.updateProjectionMatrix();
    }
}
