import { RenderPhase } from "./RenderPhase";
import { LightingManager } from "./LightingManager";
import type { Scene } from "../scene/Scene";
import type { Camera } from "../camera/Camera";
import { Mesh } from "../object/Mesh";
import { Light } from "../light/Light";
import { DirectionalLight } from "../light/DirectionalLight";
import { Box3 } from "../../math";
import type { BatchManager, DrawBatch } from "./BatchManager";

export class ShadowRenderPhase extends RenderPhase {
    private lightingManager: LightingManager;
    private batchManager: BatchManager;

    private shadowPipeline: GPURenderPipeline | null = null;
    private shadowsEnabled: boolean = true;

    private lights: DirectionalLight[] = [];
    private scene: Scene | null = null;
    private batches: DrawBatch[] = [];

    // Bind group layout for shadow rendering
    private shadowRenderBindGroupLayout: GPUBindGroupLayout | null = null;

    // Per-light index uniform buffer and bind group
    private lightIndexBuffer: GPUBuffer | null = null;
    private lightIndexBindGroupLayout: GPUBindGroupLayout | null = null;
    private lightIndexBindGroups = new Map<number, GPUBindGroup>();

    // Cached shadow map layer views
    private shadowMapLayerViews = new Map<number, GPUTextureView>();
    private cachedShadowMapArray: GPUTexture | null = null;

    // Reusable bounding box for shadow bounds calculation
    private _sceneBox = new Box3();
    private _tempBox = new Box3();

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

    private initShadowRenderPipeline(): void {
        // Shadow render bind group layout (group 0)
        // Same as main render: instances + culled indices + camera uniforms
        this.shadowRenderBindGroupLayout = this.device.createBindGroupLayout({
            label: "Shadow Render Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "read-only-storage" }, // instances
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "read-only-storage" }, // culled indices
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }, // camera uniforms
                },
            ],
        });

        // Light index bind group layout (group 1)
        this.lightIndexBindGroupLayout = this.device.createBindGroupLayout({
            label: "Light Index Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" },
                },
            ],
        });

        // Create light index buffer - each light needs 256-byte alignment for uniform buffer offset
        const UNIFORM_ALIGNMENT = 256;
        this.lightIndexBuffer = this.device.createBuffer({
            label: "Light Index Buffer",
            size: UNIFORM_ALIGNMENT * 4, // 4 lights × 256 bytes (for alignment)
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Pre-create bind groups for each light
        for (let i = 0; i < 4; i++) {
            this.lightIndexBindGroups.set(i, this.device.createBindGroup({
                label: `Light Index Bind Group ${i}`,
                layout: this.lightIndexBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: {
                            buffer: this.lightIndexBuffer,
                            offset: i * UNIFORM_ALIGNMENT,
                            size: 16,
                        },
                    },
                ],
            }));

            // Write light index (cameraIndex = lightIndex + 1)
            const data = new Uint32Array([i + 1, 0, 0, 0]);
            this.device.queue.writeBuffer(this.lightIndexBuffer, i * UNIFORM_ALIGNMENT, data);
        }

        // Shadow vertex shader - uses light index to select VP from camera array
        const shadowVertexShader = /* wgsl */ `
            const MAX_CAMERAS: u32 = 5u;

            struct CameraData {
                viewProjection: mat4x4<f32>,
                frustum: array<vec4<f32>, 6>,
            }

            struct CameraUniforms {
                mainViewProjection: mat4x4<f32>,
                cameraPosition: vec3<f32>,
                activeLightCount: u32,
                cameras: array<CameraData, MAX_CAMERAS>,
            }

            struct InstanceData {
                modelMatrix: mat4x4<f32>,
                normalMatrix: mat4x4<f32>,
                flags: vec4<f32>,
            }

            struct CulledInstances {
                indices: array<u32>,
            }

            struct LightIndex {
                cameraIndex: u32,
                _pad0: u32,
                _pad1: u32,
                _pad2: u32,
            }

            @group(0) @binding(0) var<storage, read> instances: array<InstanceData>;
            @group(0) @binding(1) var<storage, read> culled: CulledInstances;
            @group(0) @binding(2) var<uniform> cameraUniforms: CameraUniforms;

            @group(1) @binding(0) var<uniform> lightInfo: LightIndex;

            @vertex
            fn main(
                @builtin(instance_index) instanceIndex: u32,
                @location(0) position: vec3<f32>
            ) -> @builtin(position) vec4<f32> {
                let actualIndex = culled.indices[instanceIndex];
                let modelMatrix = instances[actualIndex].modelMatrix;
                let worldPos = modelMatrix * vec4<f32>(position, 1.0);

                // Get light VP from cameras array using light index
                let lightVP = cameraUniforms.cameras[lightInfo.cameraIndex].viewProjection;
                return lightVP * worldPos;
            }
        `;

        const vertexModule = this.device.createShaderModule({
            label: "Shadow Vertex Shader",
            code: shadowVertexShader,
        });

        this.shadowPipeline = this.device.createRenderPipeline({
            label: "Shadow Pipeline",
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [
                    this.shadowRenderBindGroupLayout,
                    this.lightIndexBindGroupLayout,
                ],
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
    }

    setEnabled(enabled: boolean): void {
        this.shadowsEnabled = enabled;
    }

    setLights(lights: Light[]): void {
        this.lights = lights.filter(
            (l): l is DirectionalLight => l instanceof DirectionalLight && l.castShadow
        );
    }

    prepare(scene: Scene, _camera: Camera): void {
        if (!this.shadowsEnabled) return;
        this.scene = scene;

        // Get batches from batch manager (already prepared by main phase)
        this.batches = this.batchManager.getBatches();

        // Update shadow camera bounds for each light
        for (const light of this.lights) {
            if (light.shadow.autoUpdate) {
                this.updateShadowCameraBounds(light, scene);
            } else {
                light.shadow.camera.position.copy(light.position);
                light.shadow.camera.rotation.copy(light.rotation);
                light.shadow.camera.updateWorldMatrix();
            }
        }
    }

    execute(commandEncoder: GPUCommandEncoder): void {
        if (!this.shadowsEnabled || !this.scene || this.batches.length === 0) return;

        const shadowMapArray = this.lightingManager.shadowMapArray;
        if (!shadowMapArray) return;

        // Invalidate cached views if shadow map array changed
        if (this.cachedShadowMapArray !== shadowMapArray) {
            this.shadowMapLayerViews.clear();
            this.cachedShadowMapArray = shadowMapArray;
        }

        // Render shadow map for each light
        for (let lightIndex = 0; lightIndex < this.lights.length; lightIndex++) {
            const light = this.lights[lightIndex];
            const layerIndex = (light as any)._shadowLayerIndex;

            if (layerIndex === undefined || layerIndex < 0) continue;

            this.renderShadowForLight(commandEncoder, lightIndex, shadowMapArray, layerIndex);
        }
    }

    private renderShadowForLight(
        commandEncoder: GPUCommandEncoder,
        lightIndex: number,
        shadowMapArray: GPUTexture,
        layerIndex: number
    ): void {
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
            label: `Shadow Pass - Light ${lightIndex}`,
            colorAttachments: [],
            depthStencilAttachment: {
                view: layerView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });

        passEncoder.setPipeline(this.shadowPipeline!);

        // Set light index bind group (group 1)
        const lightIndexBindGroup = this.lightIndexBindGroups.get(lightIndex);
        if (lightIndexBindGroup) {
            passEncoder.setBindGroup(1, lightIndexBindGroup);
        }

        // Camera index for this light is lightIndex + 1 (0 = main camera)
        const cameraIndex = lightIndex + 1;

        for (const batch of this.batches) {
            // Get render bind group for this light's camera
            const renderBindGroup = this.batchManager.getRenderBindGroup(batch, cameraIndex);
            const geometryData = this.batchManager.getGeometryData(batch.geometry);

            passEncoder.setBindGroup(0, renderBindGroup);
            passEncoder.setVertexBuffer(0, geometryData.vertexBuffer);

            // Draw using indirect buffer at offset for this light
            const indirectOffset = this.batchManager.getIndirectBufferOffset(cameraIndex);

            if (geometryData.indexBuffer) {
                passEncoder.setIndexBuffer(geometryData.indexBuffer, "uint32");
                passEncoder.drawIndexedIndirect(batch.indirectBuffer, indirectOffset);
            } else {
                passEncoder.drawIndirect(batch.indirectBuffer, indirectOffset);
            }
        }

        passEncoder.end();
    }

    private updateShadowCameraBounds(light: DirectionalLight, scene: Scene): void {
        this._sceneBox.makeEmpty();
        let hasGeometry = false;

        scene.traverse((object) => {
            if (
                object instanceof Mesh &&
                (object.castShadow || object.receiveShadow) &&
                object.geometry.boundingBox
            ) {
                this._tempBox.copy(object.geometry.boundingBox);
                this._tempBox.applyMatrix4(object.worldMatrix);
                if (!hasGeometry) {
                    this._sceneBox.copy(this._tempBox);
                    hasGeometry = true;
                } else {
                    this._sceneBox.union(this._tempBox);
                }
            }
        });

        if (!hasGeometry) return;

        light.shadow.camera.position.copy(light.position);
        light.shadow.camera.rotation.copy(light.rotation);
        light.shadow.camera.updateWorldMatrix();

        const viewMatrix = light.shadow.camera.viewMatrix;
        const lightSpaceBox = this._sceneBox.clone().applyMatrix4(viewMatrix);

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
        this.shadowMapLayerViews.clear();
        this.cachedShadowMapArray = null;
        this.lightIndexBindGroups.clear();
        if (this.lightIndexBuffer) {
            this.lightIndexBuffer.destroy();
            this.lightIndexBuffer = null;
        }
    }
}
