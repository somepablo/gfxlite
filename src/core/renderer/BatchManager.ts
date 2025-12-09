import type { Mesh } from "../object/Mesh";
import type { Camera } from "../camera/Camera";
import type { Geometry } from "../geometry/Geometry";
import type { Material } from "../material/Material";
import { Matrix4 } from "../../math";

// Constants
const INSTANCE_STRIDE = 52; // 52 floats per instance (MVP + Model + Normal + CameraPosFlags)
const MIN_BUFFER_SIZE = 1024 * 1024; // 1MB minimum allocation

export interface DrawBatch {
    key: string;
    geometry: Geometry;
    material: Material;
    meshes: Mesh[];
    instanceOffset: number;
    instanceCount: number;
    boundingSphereRadius: number;

    // GPU resources
    indirectBuffer: GPUBuffer;
    culledInstanceBuffer: GPUBuffer;
    batchInfoBuffer: GPUBuffer;
    renderBindGroup: GPUBindGroup | null;
    cullBindGroup: GPUBindGroup | null;
}

export interface BatchStats {
    totalBatches: number;
    totalInstances: number;
    drawCalls: number;
    instanceBufferSize: number;
}

export interface GeometryData {
    vertexBuffer: GPUBuffer;
    normalBuffer: GPUBuffer | null;
    indexBuffer: GPUBuffer | null;
}

// Culling compute shader


export class BatchManager {
    private device: GPUDevice;

    // Global instance storage buffer
    private instanceBuffer: GPUBuffer | null = null;
    private instanceBufferCapacity: number = 0;

    // Reusable CPU arrays
    private instanceDataArray: Float32Array | null = null;

    // Batch cache (by geometry+material key)
    private batchCache = new Map<string, DrawBatch>();

    // Geometry buffer cache
    private geometryCache = new Map<number, GeometryData>();

    // Current frame data
    private batches: DrawBatch[] = [];
    private totalInstances: number = 0;

    // Culling pipeline resources - managed externally
    private cameraBindGroupLayout: GPUBindGroupLayout | null = null;
    private cullBindGroupLayout: GPUBindGroupLayout | null = null;
    private cameraUniformBuffer: GPUBuffer | null = null;
    private cameraBindGroup: GPUBindGroup | null = null;

    // Render bind group layout
    private renderBindGroupLayout: GPUBindGroupLayout | null = null;

    // Temp matrices for computation
    private _tempMatrix = new Matrix4();
    private _tempMatrix2 = new Matrix4();

    // Reusable buffer for batch info to avoid per-frame allocations
    private _batchInfoBuffer = new ArrayBuffer(16);
    private _batchInfoU32 = new Uint32Array(this._batchInfoBuffer, 0, 2);
    private _batchInfoF32 = new Float32Array(this._batchInfoBuffer, 8, 2);

    // Reusable buffer for camera uniforms (40 floats = 160 bytes)
    private _cameraUniformData = new Float32Array(40);

    constructor(device: GPUDevice) {
        this.device = device;
        this.initRenderBindGroupLayout();
    }

    setCullingLayouts(
        cameraLayout: GPUBindGroupLayout,
        cullLayout: GPUBindGroupLayout
    ): void {
        this.cameraBindGroupLayout = cameraLayout;
        this.cullBindGroupLayout = cullLayout;
        this.initCameraResources();
    }

    private initRenderBindGroupLayout(): void {
        // Render bind group layout (group 0 for render pass)
        this.renderBindGroupLayout = this.device.createBindGroupLayout({
            label: "Instance Render Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "read-only-storage" },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "read-only-storage" },
                },
            ],
        });
    }

    private initCameraResources(): void {
        if (this.cameraUniformBuffer) return;

        // Create camera uniform buffer
        // Layout: viewProjection (16 floats) + frustum (24 floats) = 40 floats = 160 bytes
        this.cameraUniformBuffer = this.device.createBuffer({
            label: "Camera Uniform Buffer",
            size: 160,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.cameraBindGroup = this.device.createBindGroup({
            label: "Camera Bind Group",
            layout: this.cameraBindGroupLayout!,
            entries: [
                { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
            ],
        });
    }

    getRenderBindGroupLayout(): GPUBindGroupLayout {
        return this.renderBindGroupLayout!;
    }



    getCameraBindGroup(): GPUBindGroup | null {
        return this.cameraBindGroup;
    }

    getGeometryData(geometry: Geometry): GeometryData {
        if (this.geometryCache.has(geometry.id)) {
            return this.geometryCache.get(geometry.id)!;
        }

        const vertexBuffer = this.device.createBuffer({
            label: `Vertex Buffer for Geometry ${geometry.id}`,
            size: geometry.vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(vertexBuffer, 0, geometry.vertices as GPUAllowSharedBufferSource);

        let normalBuffer: GPUBuffer | null = null;
        if (geometry.normals) {
            normalBuffer = this.device.createBuffer({
                label: `Normal Buffer for Geometry ${geometry.id}`,
                size: geometry.normals.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(normalBuffer, 0, geometry.normals as GPUAllowSharedBufferSource);
        } else {
            const dummyNormals = new Float32Array(geometry.vertices.length);
            normalBuffer = this.device.createBuffer({
                label: `Dummy Normal Buffer for Geometry ${geometry.id}`,
                size: dummyNormals.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(normalBuffer, 0, dummyNormals);
        }

        let indexBuffer: GPUBuffer | null = null;
        if (geometry.indices) {
            indexBuffer = this.device.createBuffer({
                label: `Index Buffer for Geometry ${geometry.id}`,
                size: geometry.indices.byteLength,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(indexBuffer, 0, geometry.indices as GPUAllowSharedBufferSource);
        }

        const data: GeometryData = { vertexBuffer, normalBuffer, indexBuffer };
        this.geometryCache.set(geometry.id, data);
        return data;
    }

    private getBatchKey(mesh: Mesh): string {
        return `${mesh.geometry.id}_${mesh.material.id}`;
    }

    private computeBoundingSphereRadius(geometry: Geometry): number {
        const bbox = geometry.boundingBox;
        if (!bbox) return 1.0;

        // Compute radius from center to corner
        const dx = bbox.max.x - bbox.min.x;
        const dy = bbox.max.y - bbox.min.y;
        const dz = bbox.max.z - bbox.min.z;

        return Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;
    }

    prepareBatches(meshes: Mesh[]): DrawBatch[] {
        const batchMap = new Map<string, Mesh[]>();

        // Group meshes by geometry+material
        for (const mesh of meshes) {
            const key = this.getBatchKey(mesh);
            if (!batchMap.has(key)) {
                batchMap.set(key, []);
            }
            batchMap.get(key)!.push(mesh);
        }

        this.batches = [];
        this.totalInstances = 0;

        for (const [key, batchMeshes] of batchMap) {
            let batch = this.batchCache.get(key);

            if (!batch) {
                batch = this.createBatch(
                    key,
                    batchMeshes[0].geometry,
                    batchMeshes[0].material
                );
                this.batchCache.set(key, batch);
            }

            batch.meshes = batchMeshes;
            batch.instanceOffset = this.totalInstances;
            batch.instanceCount = batchMeshes.length;

            // Ensure GPU resources are sized correctly
            this.ensureBatchResources(batch);

            this.batches.push(batch);
            this.totalInstances += batchMeshes.length;
        }

        return this.batches;
    }

    private createBatch(
        key: string,
        geometry: Geometry,
        material: Material
    ): DrawBatch {
        const indexCount = geometry.indexCount;
        const boundingSphereRadius = this.computeBoundingSphereRadius(geometry);

        // Create indirect args buffer (5 x u32 = 20 bytes)
        const indirectBuffer = this.device.createBuffer({
            label: `Indirect Args Buffer [${key}]`,
            size: 20,
            usage:
                GPUBufferUsage.INDIRECT |
                GPUBufferUsage.STORAGE |
                GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });

        // Initialize indirect args
        const indirectArgs = new Uint32Array(indirectBuffer.getMappedRange());
        indirectArgs[0] = indexCount; // indexCount
        indirectArgs[1] = 0; // instanceCount (will be written by compute)
        indirectArgs[2] = 0; // firstIndex
        indirectArgs[3] = 0; // baseVertex
        indirectArgs[4] = 0; // firstInstance
        indirectBuffer.unmap();

        // Create batch info buffer (4 x f32 = 16 bytes)
        const batchInfoBuffer = this.device.createBuffer({
            label: `Batch Info Buffer [${key}]`,
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Culled instance buffer will be created in ensureBatchResources
        const culledInstanceBuffer = this.device.createBuffer({
            label: `Culled Instance Buffer [${key}]`,
            size: 4 * 1024, // 1024 instances initial
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        return {
            key,
            geometry,
            material,
            meshes: [],
            instanceOffset: 0,
            instanceCount: 0,
            boundingSphereRadius,
            indirectBuffer,
            culledInstanceBuffer,
            batchInfoBuffer,
            renderBindGroup: null,
            cullBindGroup: null,
        };
    }

    private ensureBatchResources(batch: DrawBatch): void {
        const requiredCulledSize = batch.instanceCount * 4;

        // Check if we need to resize culled buffer
        if (batch.culledInstanceBuffer.size < requiredCulledSize) {
            batch.culledInstanceBuffer.destroy();
            batch.culledInstanceBuffer = this.device.createBuffer({
                label: `Culled Instance Buffer [${batch.key}]`,
                size: Math.max(requiredCulledSize * 2, 4096),
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });

            // Invalidate bind groups
            batch.cullBindGroup = null;
            batch.renderBindGroup = null;
        }
    }

    private ensureInstanceBufferCapacity(requiredInstances: number): void {
        const requiredSize = requiredInstances * INSTANCE_STRIDE * 4;

        if (!this.instanceBuffer || this.instanceBufferCapacity < requiredSize) {
            if (this.instanceBuffer) {
                this.instanceBuffer.destroy();
            }

            this.instanceBufferCapacity = Math.max(requiredSize * 2, MIN_BUFFER_SIZE);

            this.instanceBuffer = this.device.createBuffer({
                label: "Instance Storage Buffer",
                size: this.instanceBufferCapacity,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });

            // Invalidate all batch bind groups since instance buffer changed
            for (const batch of this.batchCache.values()) {
                batch.cullBindGroup = null;
                batch.renderBindGroup = null;
            }
        }

        // Ensure CPU array is large enough
        const requiredArrayLength = requiredInstances * INSTANCE_STRIDE;
        if (
            !this.instanceDataArray ||
            this.instanceDataArray.length < requiredArrayLength
        ) {
            this.instanceDataArray = new Float32Array(requiredArrayLength * 2);
        }
    }

    updateInstanceBuffer(
        batches: DrawBatch[],
        camera: Camera,
        viewProjectionMatrix: Matrix4
    ): void {
        if (this.totalInstances === 0) return;

        this.ensureInstanceBufferCapacity(this.totalInstances);

        const data = this.instanceDataArray!;
        let offset = 0;

        for (const batch of batches) {
            for (const mesh of batch.meshes) {
                // Compute MVP matrix
                const mvpMatrix = this._tempMatrix.multiplyMatrices(
                    viewProjectionMatrix,
                    mesh.worldMatrix
                );

                // Model matrix is the world matrix
                const modelMatrix = mesh.worldMatrix;

                // Compute normal matrix: (inverse(model))^T
                const normalMatrix = this._tempMatrix2
                    .copy(modelMatrix)
                    .invert()
                    .transpose();

                // Write to array
                data.set(mvpMatrix.toArray(), offset);
                offset += 16;

                data.set(modelMatrix.toArray(), offset);
                offset += 16;

                data.set(normalMatrix.toArray(), offset);
                offset += 16;

                // Camera position + receiveShadow flag
                data[offset++] = camera.position.x;
                data[offset++] = camera.position.y;
                data[offset++] = camera.position.z;
                data[offset++] = mesh.receiveShadow ? 1.0 : 0.0;
            }

            // Update batch info buffer using reusable arrays
            this._batchInfoU32[0] = batch.instanceOffset;
            this._batchInfoU32[1] = batch.instanceCount;
            this._batchInfoF32[0] = batch.boundingSphereRadius;
            this._batchInfoF32[1] = 0; // padding
            this.device.queue.writeBuffer(batch.batchInfoBuffer, 0, this._batchInfoBuffer);
        }

        // Write all instance data to GPU
        this.device.queue.writeBuffer(
            this.instanceBuffer!,
            0,
            data as GPUAllowSharedBufferSource,
            0,
            this.totalInstances * INSTANCE_STRIDE
        );
    }

    updateCameraUniforms(_camera: Camera, viewProjectionMatrix: Matrix4): void {
        if (!this.cameraUniformBuffer) return;

        const data = this._cameraUniformData;

        // View-projection matrix
        data.set(viewProjectionMatrix.toArray(), 0);

        // Extract frustum planes from view-projection matrix
        const m = viewProjectionMatrix.elements;

        // Left plane
        data[16] = m[3] + m[0];
        data[17] = m[7] + m[4];
        data[18] = m[11] + m[8];
        data[19] = m[15] + m[12];
        this.normalizePlane(data, 16);

        // Right plane
        data[20] = m[3] - m[0];
        data[21] = m[7] - m[4];
        data[22] = m[11] - m[8];
        data[23] = m[15] - m[12];
        this.normalizePlane(data, 20);

        // Bottom plane
        data[24] = m[3] + m[1];
        data[25] = m[7] + m[5];
        data[26] = m[11] + m[9];
        data[27] = m[15] + m[13];
        this.normalizePlane(data, 24);

        // Top plane
        data[28] = m[3] - m[1];
        data[29] = m[7] - m[5];
        data[30] = m[11] - m[9];
        data[31] = m[15] - m[13];
        this.normalizePlane(data, 28);

        // Near plane (z >= 0) -> Row 2
        data[32] = m[2];
        data[33] = m[6];
        data[34] = m[10];
        data[35] = m[14];
        this.normalizePlane(data, 32);

        // Far plane (z <= w) -> Row 3 - Row 2
        data[36] = m[3] - m[2];
        data[37] = m[7] - m[6];
        data[38] = m[11] - m[10];
        data[39] = m[15] - m[14];
        this.normalizePlane(data, 36);

        this.device.queue.writeBuffer(this.cameraUniformBuffer, 0, data);
    }

    private normalizePlane(data: Float32Array, offset: number): void {
        const length = Math.sqrt(
            data[offset] ** 2 + data[offset + 1] ** 2 + data[offset + 2] ** 2
        );
        if (length > 0) {
            data[offset] /= length;
            data[offset + 1] /= length;
            data[offset + 2] /= length;
            data[offset + 3] /= length;
        }
    }

    getCullBindGroup(batch: DrawBatch): GPUBindGroup {
        if (!batch.cullBindGroup) {
            batch.cullBindGroup = this.device.createBindGroup({
                label: `Cull Bind Group [${batch.key}]`,
                layout: this.cullBindGroupLayout!,
                entries: [
                    { binding: 0, resource: { buffer: this.instanceBuffer! } },
                    { binding: 1, resource: { buffer: batch.culledInstanceBuffer } },
                    { binding: 2, resource: { buffer: batch.indirectBuffer } },
                    { binding: 3, resource: { buffer: batch.batchInfoBuffer } },
                ],
            });
        }
        return batch.cullBindGroup;
    }

    getRenderBindGroup(batch: DrawBatch): GPUBindGroup {
        if (!batch.renderBindGroup) {
            batch.renderBindGroup = this.device.createBindGroup({
                label: `Render Bind Group [${batch.key}]`,
                layout: this.renderBindGroupLayout!,
                entries: [
                    { binding: 0, resource: { buffer: this.instanceBuffer! } },
                    { binding: 1, resource: { buffer: batch.culledInstanceBuffer } },
                ],
            });
        }
        return batch.renderBindGroup;
    }

    getBatches(): DrawBatch[] {
        return this.batches;
    }

    getStats(): BatchStats {
        return {
            totalBatches: this.batches.length,
            totalInstances: this.totalInstances,
            drawCalls: this.batches.length,
            instanceBufferSize: this.instanceBufferCapacity,
        };
    }

    dispose(): void {
        if (this.instanceBuffer) {
            this.instanceBuffer.destroy();
            this.instanceBuffer = null;
        }

        if (this.cameraUniformBuffer) {
            this.cameraUniformBuffer.destroy();
            this.cameraUniformBuffer = null;
        }

        for (const batch of this.batchCache.values()) {
            batch.indirectBuffer.destroy();
            batch.culledInstanceBuffer.destroy();
            batch.batchInfoBuffer.destroy();
        }

        this.batchCache.clear();
        this.geometryCache.clear();
        this.batches = [];
        this.totalInstances = 0;
    }

}
