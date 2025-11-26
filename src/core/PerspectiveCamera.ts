import { Camera } from "./Camera";

export class PerspectiveCamera extends Camera {
    public fov: number;
    public aspect: number;
    public near: number;
    public far: number;

    constructor(
        fov: number = 50,
        aspect: number = 1,
        near: number = 0.1,
        far: number = 2000,
    ) {
        super();
        this.fov = fov;
        this.aspect = aspect;
        this.near = near;
        this.far = far;
        this.updateProjectionMatrix();
    }

    updateProjectionMatrix() {
        this.projectionMatrix.perspective(
            (this.fov * Math.PI) / 180,
            this.aspect,
            this.near,
            this.far,
        );
    }
}
