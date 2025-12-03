import type { Mesh } from "../object/Mesh";
import type { Camera } from "../camera/Camera";
import { Matrix4 } from "../../math";

export interface DrawBatch {
    material: any;
    meshes: Mesh[];
}

export interface InstanceData {
    mvpMatrix: Float32Array;
    modelMatrix: Float32Array;
    normalMatrix: Float32Array;
    cameraPos: Float32Array;
}

export class IndirectDrawManager {
    private device: GPUDevice;
    
    private indirectBuffer: GPUBuffer | null = null;
    private instanceBuffer: GPUBuffer | null = null;
    private instanceBufferSize: number = 0;
    
    private _tempMatrix = new Matrix4();
    private _tempMatrix2 = new Matrix4();

    constructor(device: GPUDevice) {
        this.device = device;
    }

    createBatches(meshes: Mesh[]): DrawBatch[] {
        const batchMap = new Map<number, DrawBatch>();
        
        for (const mesh of meshes) {
            const materialId = mesh.material.id;
            
            if (!batchMap.has(materialId)) {
                batchMap.set(materialId, {
                    material: mesh.material,
                    meshes: []
                });
            }
            
            batchMap.get(materialId)!.meshes.push(mesh);
        }
        
        return Array.from(batchMap.values());
    }

    prepareInstanceData(
        meshes: Mesh[],
        camera: Camera,
        viewProjectionMatrix: Matrix4
    ): InstanceData[] {
        const instanceData: InstanceData[] = [];

        for (const mesh of meshes) {
            const mvpMatrix = this._tempMatrix.multiplyMatrices(
                viewProjectionMatrix,
                mesh.worldMatrix
            );

            const modelMatrix = mesh.worldMatrix;
            const normalMatrix = this._tempMatrix2
                .copy(modelMatrix)
                .invert()
                .transpose();

            instanceData.push({
                mvpMatrix: new Float32Array(mvpMatrix.toArray()),
                modelMatrix: new Float32Array(modelMatrix.toArray()),
                normalMatrix: new Float32Array(normalMatrix.toArray()),
                cameraPos: new Float32Array([
                    ...camera.position.toArray(),
                    mesh.receiveShadow ? 1.0 : 0.0
                ])
            });
        }

        return instanceData;
    }

    updateInstanceBuffer(instanceData: InstanceData[]): GPUBuffer {
        const instanceStride = (16 + 16 + 16 + 4) * 4;
        const requiredSize = instanceData.length * instanceStride;

        if (!this.instanceBuffer || this.instanceBufferSize < requiredSize) {
            if (this.instanceBuffer) {
                this.instanceBuffer.destroy();
            }
            
            this.instanceBufferSize = Math.max(requiredSize, 1024 * 1024); // Min 1MB
            this.instanceBuffer = this.device.createBuffer({
                label: "Instance Data Buffer",
                size: this.instanceBufferSize,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
        }

        const bufferData = new Float32Array(instanceData.length * 52);
        let offset = 0;

        for (const instance of instanceData) {
            bufferData.set(instance.mvpMatrix, offset);
            offset += 16;
            bufferData.set(instance.modelMatrix, offset);
            offset += 16;
            bufferData.set(instance.normalMatrix, offset);
            offset += 16;
            bufferData.set(instance.cameraPos, offset);
            offset += 4;
        }

        this.device.queue.writeBuffer(this.instanceBuffer, 0, bufferData);
        return this.instanceBuffer;
    }

    prepareIndirectArgs(batches: DrawBatch[]): Uint32Array {
        const argsPerDraw = 5; // indexCount, instanceCount, firstIndex, baseVertex, firstInstance
        const args = new Uint32Array(batches.length * argsPerDraw);
        
        let offset = 0;
        let instanceOffset = 0;

        for (const batch of batches) {
            for (const mesh of batch.meshes) {
                args[offset++] = mesh.geometry.indexCount;     // indexCount
                args[offset++] = 1;                            // instanceCount
                args[offset++] = 0;                            // firstIndex
                args[offset++] = 0;                            // baseVertex
                args[offset++] = instanceOffset;               // firstInstance
                instanceOffset++;
            }
        }

        return args;
    }

    dispose(): void {
        if (this.indirectBuffer) {
            this.indirectBuffer.destroy();
            this.indirectBuffer = null;
        }
        if (this.instanceBuffer) {
            this.instanceBuffer.destroy();
            this.instanceBuffer = null;
        }
    }
}
