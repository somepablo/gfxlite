import { Matrix4, Quaternion, Vector3 } from "../../math";

let object3DID = 0;

export class Object3D {
    public readonly id = object3DID++;
    public name: string = "";

    public parent: Object3D | null = null;
    public children: Object3D[] = [];

    public position: Vector3 = new Vector3();
    public rotation: Quaternion = new Quaternion();
    public scale: Vector3 = new Vector3(1, 1, 1);

    public castShadow: boolean = false;
    public receiveShadow: boolean = false;

    public localMatrix: Matrix4 = new Matrix4();
    public worldMatrix: Matrix4 = new Matrix4();

    public lookAt(target: Vector3) {
        const m = new Matrix4();
        m.lookAt(this.position, target, new Vector3(0, 1, 0));
        this.rotation.setFromRotationMatrix(m.extractRotation());
    }

    public add(child: Object3D) {
        if (child.parent) {
            child.parent.remove(child);
        }
        child.parent = this;
        this.children.push(child);
    }

    public remove(child: Object3D) {
        const index = this.children.indexOf(child);
        if (index !== -1) {
            child.parent = null;
            this.children.splice(index, 1);
        }
    }

    /**
     * Updates the object's local matrix from its position, rotation, and scale.
     */
    updateLocalMatrix() {
        this.localMatrix.compose(this.position, this.rotation, this.scale);
    }

    /**
     * Updates the object's world matrix, and recursively updates all children.
     * @param parentWorldMatrix The world matrix of the parent object.
     */
    updateWorldMatrix(parentWorldMatrix?: Matrix4) {
        this.updateLocalMatrix();

        if (parentWorldMatrix) {
            this.worldMatrix.multiplyMatrices(
                parentWorldMatrix,
                this.localMatrix,
            );
        } else {
            this.worldMatrix.copy(this.localMatrix);
        }

        for (const child of this.children) {
            child.updateWorldMatrix(this.worldMatrix);
        }
    }

    /**
     * Traverses the object and its descendants.
     * @param callback The function to call for each object.
     */
    traverse(callback: (object: Object3D) => void) {
        callback(this);
        for (const child of this.children) {
            child.traverse(callback);
        }
    }
}
