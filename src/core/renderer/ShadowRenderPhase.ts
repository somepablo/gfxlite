import { RenderPhase } from "./RenderPhase";
import { LightingManager } from "./LightingManager";
import type { Scene } from "../scene/Scene";
import type { Camera } from "../camera/Camera";
import { Mesh } from "../object/Mesh";
import { Light } from "../light/Light";
import { DirectionalLight } from "../light/DirectionalLight";
import { Matrix4, Box3 } from "../../math";
import type { BatchManager, DrawBatch } from "./BatchManager";
import { CullingComputePhase } from "./CullingComputePhase";

const MAX_SHADOW_LIGHTS = 4;
const UNIFORM_BUFFER_ALIGNMENT = 256; // WebGPU minUniformBufferOffsetAlignment

interface ShadowBatchData {
    culledBuffer: GPUBuffer;
    indirectBuffer: GPUBuffer;
    batchInfoBuffer: GPUBuffer;
    cullBindGroup: GPUBindGroup | null;
    renderBindGroup: GPUBindGroup | null;
    instanceCapacity: number;
}

// Shadow culling compute shader


export class ShadowRenderPhase extends RenderPhase {
    private lightingManager: LightingManager;
    private batchManager: BatchManager;

    private shadowPipeline: GPURenderPipeline | null = null;
    private shadowsEnabled: boolean = true;

    private lights: Light[] = [];
    private renderList: Mesh[] = [];
    private scene: Scene | null = null;
    private batches: DrawBatch[] = [];

    // Per-light shadow data (per batch)
    private shadowBatchData = new Map<string, ShadowBatchData>(); // key: `${lightIndex}_${batchKey}`

    // Per-light shadow instance buffers (MVP only = 16 floats per instance)
    private shadowInstanceBuffers = new Map<number, GPUBuffer>();
    private shadowInstanceBufferCapacities = new Map<number, number>();
    private shadowInstanceData: Float32Array | null = null;

    // Per-light world matrices buffers for culling
    private worldMatricesBuffers = new Map<number, GPUBuffer>();
    private worldMatricesBufferCapacities = new Map<number, number>();

    // Shadow-specific instance offsets per batch (key: batch.key)
    private shadowBatchOffsets = new Map<string, number>();

    // Bind group layouts
    private shadowCameraBindGroupLayout: GPUBindGroupLayout | null = null;
    private shadowCullBindGroupLayout: GPUBindGroupLayout | null = null;
    private shadowRenderBindGroupLayout: GPUBindGroupLayout | null = null;

    // Per-light camera bind groups
    private lightCameraBindGroups = new Map<number, GPUBindGroup>();
    private lightCameraBuffer: GPUBuffer | null = null;

    // Cached shadow map layer views
    private shadowMapLayerViews = new Map<number, GPUTextureView>();
    private cachedShadowMapArray: GPUTexture | null = null;

    private _tempMatrix = new Matrix4();
    private _tempMatrix2 = new Matrix4();

    // Reusable buffer for batch info to avoid per-frame allocations
    private _batchInfoBuffer = new ArrayBuffer(16);
    private _batchInfoU32 = new Uint32Array(this._batchInfoBuffer, 0, 2);
    private _batchInfoF32 = new Float32Array(this._batchInfoBuffer, 8, 2);

    // Reusable array for world matrices
    private _worldMatricesData: Float32Array | null = null;

    // Reusable buffer for light camera uniforms (40 floats = 160 bytes)
    private _lightCameraUniformData = new Float32Array(40);

    constructor(
        device: GPUDevice,
        lightingManager: LightingManager,
        batchManager: BatchManager
    ) {
        super(device, "Shadow Render Phase");
        this.lightingManager = lightingManager;
        this.batchManager = batchManager;
        this.initShadowRenderPipeline();
    }

    setCullingLayouts(
        cameraLayout: GPUBindGroupLayout,
        cullLayout: GPUBindGroupLayout
    ): void {
        this.shadowCameraBindGroupLayout = cameraLayout;
        this.shadowCullBindGroupLayout = cullLayout;
    }

    private initShadowRenderPipeline(): void {
        // Shadow render bind group layout (group 0)
        this.shadowRenderBindGroupLayout = this.device.createBindGroupLayout({
            label: "Shadow Render Bind Group Layout",
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

        // Create shadow render pipeline
        const shadowVertexShader = /* wgsl */ `
            struct ShadowInstanceData {
                mvpMatrix: mat4x4<f32>,
            };

            @group(0) @binding(0) var<storage, read> instances: array<ShadowInstanceData>;

            struct CulledInstances {
                indices: array<u32>,
            };
            @group(0) @binding(1) var<storage, read> culled: CulledInstances;

            @vertex
            fn main(
                @builtin(instance_index) instanceIndex: u32,
                @location(0) position: vec3<f32>
            ) -> @builtin(position) vec4<f32> {
                let actualIndex = culled.indices[instanceIndex];
                return instances[actualIndex].mvpMatrix * vec4<f32>(position, 1.0);
            }
        `;

        const vertexModule = this.device.createShaderModule({
            label: "Shadow Vertex Shader (Indirect)",
            code: shadowVertexShader,
        });

        this.shadowPipeline = this.device.createRenderPipeline({
            label: "Shadow Pipeline (Indirect)",
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.shadowRenderBindGroupLayout],
            }),
            vertex: {
                module: vertexModule,
                entryPoint: "main",
                buffers: [
                    {
                        arrayStride: 3 * 4,
                        attributes: [
                            {
                                shaderLocation: 0,
                                offset: 0,
                                format: "float32x3",
                            },
                        ],
                    },
                ],
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth32float",
            },
            primitive: {
                topology: "triangle-list",
            },
        });

        // Create light camera buffer (256 bytes per light aligned for uniform buffer offset)
        // Data: 16 floats vp + 24 floats frustum = 160 bytes, padded to 256
        this.lightCameraBuffer = this.device.createBuffer({
            label: "Light Camera Buffer",
            size: UNIFORM_BUFFER_ALIGNMENT * MAX_SHADOW_LIGHTS,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    setEnabled(enabled: boolean): void {
        this.shadowsEnabled = enabled;
    }

    setLights(lights: Light[]): void {
        this.lights = lights;
    }

    registerCullingPasses(cullingPhase: CullingComputePhase): void {
        const shadowMapArray = this.lightingManager.shadowMapArray;
        if (!shadowMapArray || !this.shadowsEnabled || !this.scene || !this.batchManager) return;

        // Loop through lights
        for (let i = 0; i < this.lights.length; i++) {
            const light = this.lights[i];
            if (!light.castShadow) continue;

             for (const batch of this.batches) {
                const shadowData = this.getShadowBatchData(batch, i);
                if (!shadowData || !shadowData.cullBindGroup) continue;

                cullingPhase.addCullPass(
                    "shadow",
                    batch,
                    this.lightCameraBindGroups.get(i)!,
                    shadowData.cullBindGroup,
                    shadowData.indirectBuffer
                );
            }
        }
    }

    prepare(scene: Scene, _camera: Camera): void {
        if (!this.shadowsEnabled || !this.batchManager) return;
        this.scene = scene;
        this.renderList = [];

        scene.traverse((object) => {
            if (object instanceof Mesh && object.castShadow) {
                this.renderList.push(object);
            }
        });

        // Use batches from main batch manager (filtered for shadow casters)
        this.batches = this.batchManager.prepareBatches(this.renderList);

        for (const light of this.lights) {
            if (light instanceof DirectionalLight && light.castShadow) {
                if (light.shadow.autoUpdate) {
                    this.updateShadowCameraBounds(light, scene);
                } else {
                    light.shadow.camera.position.copy(light.position);
                    light.shadow.camera.rotation.copy(light.rotation);
                    light.shadow.camera.updateWorldMatrix();
                }

                // Update data for this light immediately so buffers are ready for culling registration
                const layerIndex = (light as any)._shadowLayerIndex;
                if (layerIndex !== undefined && layerIndex >= 0) {
                    const shadow = light.shadow;
                    // Ensure matrices are updated
                    shadow.camera.updateWorldMatrix(); // updateMatrixWorld in three.js, here updateWorldMatrix is on Object3D
                    
                    const viewProjectionMatrix = this._tempMatrix2.multiplyMatrices(
                        shadow.camera.projectionMatrix,
                        shadow.camera.viewMatrix
                    );

                    // Update shadow instance data for this light
                    this.updateShadowInstanceData(viewProjectionMatrix, layerIndex);

                    // Update light camera uniforms for culling
                    this.updateLightCameraUniforms(light, viewProjectionMatrix, layerIndex);
                }
            }
        }
    }

    execute(commandEncoder: GPUCommandEncoder): void {
        if (
            !this.shadowsEnabled ||
            !this.scene ||
            !this.batchManager ||
            !this.shadowPipeline
        )
            return;

        const shadowMapArray = this.lightingManager.shadowMapArray;
        if (!shadowMapArray) return;

        // Process each shadow-casting light
        for (const light of this.lights) {
            if (light instanceof DirectionalLight && light.castShadow) {
                const layerIndex = (light as any)._shadowLayerIndex;
                if (layerIndex !== undefined && layerIndex >= 0) {
                    this.renderShadowForLight(
                        commandEncoder,
                        light,
                        shadowMapArray,
                        layerIndex
                    );
                }
            }
        }
    }

    private renderShadowForLight(
        commandEncoder: GPUCommandEncoder,
        _light: DirectionalLight,
        shadowMapArray: GPUTexture,
        layerIndex: number
    ): void {
        if (this.batches.length === 0) return;


        // Phase 2: Render
        // Invalidate cached views if shadow map array changed
        if (this.cachedShadowMapArray !== shadowMapArray) {
            this.shadowMapLayerViews.clear();
            this.cachedShadowMapArray = shadowMapArray;
        }

        // Get or create cached layer view
        let layerView = this.shadowMapLayerViews.get(layerIndex);
        if (!layerView) {
            layerView = shadowMapArray.createView({
                label: `Shadow Map Layer ${layerIndex}`,
                baseArrayLayer: layerIndex,
                arrayLayerCount: 1,
                dimension: "2d",
            });
            this.shadowMapLayerViews.set(layerIndex, layerView);
        }

        const passEncoder = commandEncoder.beginRenderPass({
            label: `Shadow Pass (Indirect) - Light ${layerIndex}`,
            colorAttachments: [],
            depthStencilAttachment: {
                view: layerView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });

        passEncoder.setPipeline(this.shadowPipeline!);

        for (const batch of this.batches) {
            const shadowData = this.getShadowBatchData(batch, layerIndex);
            const geometryData = this.batchManager.getGeometryData(batch.geometry);

            passEncoder.setBindGroup(0, shadowData.renderBindGroup!);
            passEncoder.setVertexBuffer(0, geometryData.vertexBuffer);

            if (geometryData.indexBuffer) {
                passEncoder.setIndexBuffer(geometryData.indexBuffer, "uint32");
                passEncoder.drawIndexedIndirect(shadowData.indirectBuffer, 0);
            } else {
                passEncoder.drawIndirect(shadowData.indirectBuffer, 0);
            }
        }

        passEncoder.end();
    }

    private updateShadowInstanceData(
        viewProjectionMatrix: Matrix4,
        lightIndex: number
    ): void {
        let totalInstances = 0;
        for (const batch of this.batches) {
            totalInstances += batch.instanceCount;
        }

        if (totalInstances === 0) return;

        // Ensure per-light instance buffer capacity (16 floats per instance = MVP matrix)
        const requiredSize = totalInstances * 16 * 4;
        const currentCapacity = this.shadowInstanceBufferCapacities.get(lightIndex) || 0;
        let shadowInstanceBuffer = this.shadowInstanceBuffers.get(lightIndex);

        if (!shadowInstanceBuffer || currentCapacity < requiredSize) {
            if (shadowInstanceBuffer) {
                shadowInstanceBuffer.destroy();
            }
            const newCapacity = Math.max(requiredSize * 2, 1024 * 1024);
            shadowInstanceBuffer = this.device.createBuffer({
                label: `Shadow Instance Buffer - Light ${lightIndex}`,
                size: newCapacity,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this.shadowInstanceBuffers.set(lightIndex, shadowInstanceBuffer);
            this.shadowInstanceBufferCapacities.set(lightIndex, newCapacity);
            // Invalidate bind groups for this light
            this.invalidateLightBindGroups(lightIndex);
        }

        // Ensure per-light world matrices buffer capacity
        const worldMatricesSize = totalInstances * 16 * 4;
        const currentWorldCapacity = this.worldMatricesBufferCapacities.get(lightIndex) || 0;
        let worldMatricesBuffer = this.worldMatricesBuffers.get(lightIndex);

        if (!worldMatricesBuffer || currentWorldCapacity < worldMatricesSize) {
            if (worldMatricesBuffer) {
                worldMatricesBuffer.destroy();
            }
            const newCapacity = Math.max(worldMatricesSize * 2, 1024 * 1024);
            worldMatricesBuffer = this.device.createBuffer({
                label: `Shadow World Matrices Buffer - Light ${lightIndex}`,
                size: newCapacity,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this.worldMatricesBuffers.set(lightIndex, worldMatricesBuffer);
            this.worldMatricesBufferCapacities.set(lightIndex, newCapacity);
            this.invalidateLightBindGroups(lightIndex);
        }

        // Ensure CPU arrays are large enough
        const requiredLength = totalInstances * 16;
        if (
            !this.shadowInstanceData ||
            this.shadowInstanceData.length < requiredLength
        ) {
            this.shadowInstanceData = new Float32Array(requiredLength * 2);
        }
        if (
            !this._worldMatricesData ||
            this._worldMatricesData.length < requiredLength
        ) {
            this._worldMatricesData = new Float32Array(requiredLength * 2);
        }

        const mvpData = this.shadowInstanceData;
        const worldData = this._worldMatricesData;
        let offset = 0;

        // Clear and rebuild shadow batch offsets
        this.shadowBatchOffsets.clear();

        for (const batch of this.batches) {
            // Track shadow-specific offset for this batch
            this.shadowBatchOffsets.set(batch.key, offset);

            for (const mesh of batch.meshes) {
                // Compute light-space MVP
                const mvp = this._tempMatrix.multiplyMatrices(
                    viewProjectionMatrix,
                    mesh.worldMatrix
                );
                mvpData.set(mvp.toArray(), offset * 16);

                // Store world matrix for culling
                worldData.set(mesh.worldMatrix.toArray(), offset * 16);
                offset++;
            }
        }

        // Write to GPU (per-light buffers) - only write required amount
        this.device.queue.writeBuffer(
            shadowInstanceBuffer!,
            0,
            mvpData as GPUAllowSharedBufferSource,
            0,
            totalInstances * 16
        );
        this.device.queue.writeBuffer(
            worldMatricesBuffer!,
            0,
            worldData as GPUAllowSharedBufferSource,
            0,
            totalInstances * 16
        );
    }

    private invalidateLightBindGroups(lightIndex: number): void {
        // Invalidate all batch data for this light
        for (const [key, data] of this.shadowBatchData) {
            if (key.startsWith(`${lightIndex}_`)) {
                data.cullBindGroup = null;
                data.renderBindGroup = null;
            }
        }
    }

    private updateLightCameraUniforms(
        _light: DirectionalLight,
        viewProjectionMatrix: Matrix4,
        lightIndex: number
    ): void {
        if (!this.lightCameraBuffer) return;

        const data = this._lightCameraUniformData;

        // View-projection matrix
        data.set(viewProjectionMatrix.toArray(), 0);

        // Extract frustum planes from light's view-projection
        const m = viewProjectionMatrix.elements;

        // Left, Right, Bottom, Top, Near, Far planes
        data[16] = m[3] + m[0];
        data[17] = m[7] + m[4];
        data[18] = m[11] + m[8];
        data[19] = m[15] + m[12];
        this.normalizePlane(data, 16);

        data[20] = m[3] - m[0];
        data[21] = m[7] - m[4];
        data[22] = m[11] - m[8];
        data[23] = m[15] - m[12];
        this.normalizePlane(data, 20);

        data[24] = m[3] + m[1];
        data[25] = m[7] + m[5];
        data[26] = m[11] + m[9];
        data[27] = m[15] + m[13];
        this.normalizePlane(data, 24);

        data[28] = m[3] - m[1];
        data[29] = m[7] - m[5];
        data[30] = m[11] - m[9];
        data[31] = m[15] - m[13];
        this.normalizePlane(data, 28);

        data[32] = m[3] + m[2];
        data[33] = m[7] + m[6];
        data[34] = m[11] + m[10];
        data[35] = m[15] + m[14];
        this.normalizePlane(data, 32);

        data[36] = m[3] - m[2];
        data[37] = m[7] - m[6];
        data[38] = m[11] - m[10];
        data[39] = m[15] - m[14];
        this.normalizePlane(data, 36);

        const alignedOffset = lightIndex * UNIFORM_BUFFER_ALIGNMENT;
        this.device.queue.writeBuffer(
            this.lightCameraBuffer,
            alignedOffset,
            data
        );

        // Create or update camera bind group for this light
        if (!this.lightCameraBindGroups.has(lightIndex)) {
            const bindGroup = this.device.createBindGroup({
                label: `Light Camera Bind Group ${lightIndex}`,
                layout: this.shadowCameraBindGroupLayout!,
                entries: [
                    {
                        binding: 0,
                        resource: {
                            buffer: this.lightCameraBuffer,
                            offset: alignedOffset,
                            size: 160, // Actual data size
                        },
                    },
                ],
            });
            this.lightCameraBindGroups.set(lightIndex, bindGroup);
        }
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



    private getShadowBatchData(batch: DrawBatch, lightIndex: number): ShadowBatchData {
        const key = `${lightIndex}_${batch.key}`;
        let data = this.shadowBatchData.get(key);

        if (!data) {
            data = this.createShadowBatchData(batch, lightIndex);
            this.shadowBatchData.set(key, data);
        }

        // Ensure capacity
        if (data.instanceCapacity < batch.instanceCount) {
            data.culledBuffer.destroy();
            data.cullBindGroup = null;
            data.renderBindGroup = null;

            const newCapacity = Math.max(batch.instanceCount * 2, 1024);
            data.culledBuffer = this.device.createBuffer({
                label: `Shadow Culled Buffer [${key}]`,
                size: newCapacity * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            data.instanceCapacity = newCapacity;
        }

        // Update batch info buffer using reusable arrays
        // Use shadow-specific offset instead of main batch offset
        const shadowOffset = this.shadowBatchOffsets.get(batch.key) ?? 0;
        this._batchInfoU32[0] = shadowOffset;
        this._batchInfoU32[1] = batch.instanceCount;
        this._batchInfoF32[0] = batch.boundingSphereRadius;
        this._batchInfoF32[1] = 0; // padding
        this.device.queue.writeBuffer(data.batchInfoBuffer, 0, this._batchInfoBuffer);

        // Get per-light buffers
        const shadowInstanceBuffer = this.shadowInstanceBuffers.get(lightIndex)!;
        const worldMatricesBuffer = this.worldMatricesBuffers.get(lightIndex)!;

        // Create bind groups if needed
        if (!data.cullBindGroup) {
            data.cullBindGroup = this.device.createBindGroup({
                label: `Shadow Cull Bind Group [${key}]`,
                layout: this.shadowCullBindGroupLayout!,
                entries: [
                    { binding: 0, resource: { buffer: shadowInstanceBuffer } },
                    { binding: 1, resource: { buffer: data.culledBuffer } },
                    { binding: 2, resource: { buffer: data.indirectBuffer } },
                    { binding: 3, resource: { buffer: data.batchInfoBuffer } },
                    { binding: 4, resource: { buffer: worldMatricesBuffer } },
                ],
            });
        }

        if (!data.renderBindGroup) {
            data.renderBindGroup = this.device.createBindGroup({
                label: `Shadow Render Bind Group [${key}]`,
                layout: this.shadowRenderBindGroupLayout!,
                entries: [
                    { binding: 0, resource: { buffer: shadowInstanceBuffer } },
                    { binding: 1, resource: { buffer: data.culledBuffer } },
                ],
            });
        }

        return data;
    }

    private createShadowBatchData(
        batch: DrawBatch,
        lightIndex: number
    ): ShadowBatchData {
        const key = `${lightIndex}_${batch.key}`;
        const initialCapacity = Math.max(batch.instanceCount * 2, 1024);

        const indirectBuffer = this.device.createBuffer({
            label: `Shadow Indirect Buffer [${key}]`,
            size: 20,
            usage:
                GPUBufferUsage.INDIRECT |
                GPUBufferUsage.STORAGE |
                GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });

        const indirectArgs = new Uint32Array(indirectBuffer.getMappedRange());
        indirectArgs[0] = batch.geometry.indexCount;
        indirectArgs[1] = 0;
        indirectArgs[2] = 0;
        indirectArgs[3] = 0;
        indirectArgs[4] = 0;
        indirectBuffer.unmap();

        const culledBuffer = this.device.createBuffer({
            label: `Shadow Culled Buffer [${key}]`,
            size: initialCapacity * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        const batchInfoBuffer = this.device.createBuffer({
            label: `Shadow Batch Info Buffer [${key}]`,
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        return {
            culledBuffer,
            indirectBuffer,
            batchInfoBuffer,
            cullBindGroup: null,
            renderBindGroup: null,
            instanceCapacity: initialCapacity,
        };
    }

    private updateShadowCameraBounds(
        light: DirectionalLight,
        scene: Scene
    ): void {
        const sceneBox = new Box3();
        let hasGeometry = false;

        scene.traverse((object) => {
            if (
                object instanceof Mesh &&
                (object.castShadow || object.receiveShadow) &&
                object.geometry.boundingBox
            ) {
                const bbox = object.geometry.boundingBox.clone();
                bbox.applyMatrix4(object.worldMatrix);
                if (!hasGeometry) {
                    sceneBox.copy(bbox);
                    hasGeometry = true;
                } else {
                    sceneBox.union(bbox);
                }
            }
        });

        if (!hasGeometry) return;

        light.shadow.camera.position.copy(light.position);
        light.shadow.camera.rotation.copy(light.rotation);
        light.shadow.camera.updateWorldMatrix();

        const viewMatrix = light.shadow.camera.viewMatrix;
        const lightSpaceBox = sceneBox.clone().applyMatrix4(viewMatrix);

        const padding = 1.0;
        light.shadow.camera.left = lightSpaceBox.min.x - padding;
        light.shadow.camera.right = lightSpaceBox.max.x + padding;
        light.shadow.camera.bottom = lightSpaceBox.min.y - padding;
        light.shadow.camera.top = lightSpaceBox.max.y + padding;
        light.shadow.camera.near = -lightSpaceBox.max.z - padding;
        light.shadow.camera.far = -lightSpaceBox.min.z + padding;
        light.shadow.camera.updateProjectionMatrix();
    }

    dispose(): void {
        // Clean up per-light shadow instance buffers
        for (const buffer of this.shadowInstanceBuffers.values()) {
            buffer.destroy();
        }
        this.shadowInstanceBuffers.clear();
        this.shadowInstanceBufferCapacities.clear();

        // Clean up per-light world matrices buffers
        for (const buffer of this.worldMatricesBuffers.values()) {
            buffer.destroy();
        }
        this.worldMatricesBuffers.clear();
        this.worldMatricesBufferCapacities.clear();

        if (this.lightCameraBuffer) {
            this.lightCameraBuffer.destroy();
            this.lightCameraBuffer = null;
        }

        for (const data of this.shadowBatchData.values()) {
            data.indirectBuffer.destroy();
            data.culledBuffer.destroy();
            data.batchInfoBuffer.destroy();
        }
        this.shadowBatchData.clear();
        this.lightCameraBindGroups.clear();
        this.shadowMapLayerViews.clear();
        this.cachedShadowMapArray = null;
    }
}
