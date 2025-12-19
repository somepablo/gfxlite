import { RenderPhase } from "./RenderPhase";
import type { Scene } from "../scene/Scene";
import type { Camera } from "../camera/Camera";
import type { BatchManager, DrawBatch } from "./BatchManager";

export class DepthPrePhase extends RenderPhase {
    private batchManager: BatchManager;
    private depthTextureView: GPUTextureView | null = null;
    private sampleCount: number;

    private depthPipeline: GPURenderPipeline | null = null;
    private opaqueBatches: DrawBatch[] = [];

    constructor(
        device: GPUDevice,
        batchManager: BatchManager,
        sampleCount: number = 1
    ) {
        super(device, "Depth Pre-Pass Phase");
        this.batchManager = batchManager;
        this.sampleCount = sampleCount;
        this.initDepthPipeline();
    }

    private initDepthPipeline(): void {
        const renderBindGroupLayout = this.batchManager.getRenderBindGroupLayout();

        // Depth-only vertex shader - minimal, position only
        const depthVertexShader = /* wgsl */ `
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

            @group(0) @binding(0) var<storage, read> instances: array<InstanceData>;
            @group(0) @binding(1) var<storage, read> culled: CulledInstances;
            @group(0) @binding(2) var<uniform> cameraUniforms: CameraUniforms;

            @vertex
            fn main(
                @builtin(instance_index) instanceIndex: u32,
                @location(0) position: vec3<f32>
            ) -> @invariant @builtin(position) vec4<f32> {
                let actualIndex = culled.indices[instanceIndex];
                let worldPos = instances[actualIndex].modelMatrix * vec4<f32>(position, 1.0);
                return cameraUniforms.mainViewProjection * worldPos;
            }
        `;

        const vertexModule = this.device.createShaderModule({
            label: "Depth Pre-Pass Vertex Shader",
            code: depthVertexShader,
        });

        this.depthPipeline = this.device.createRenderPipeline({
            label: "Depth Pre-Pass Pipeline",
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [renderBindGroupLayout],
            }),
            vertex: {
                module: vertexModule,
                entryPoint: "main",
                buffers: [
                    {
                        arrayStride: 3 * 4, // vec3<f32>
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
                format: "depth24plus",
            },
            primitive: {
                topology: "triangle-list",
            },
            multisample: {
                count: this.sampleCount,
            },
        });
    }

    setDepthTextureView(depthTextureView: GPUTextureView): void {
        this.depthTextureView = depthTextureView;
    }

    prepare(_scene: Scene, _camera: Camera): void {
        // Filter to opaque batches only
        const allBatches = this.batchManager.getBatches();
        this.opaqueBatches = allBatches.filter(batch => !batch.material.transparent);
    }

    execute(commandEncoder: GPUCommandEncoder): void {
        if (!this.depthTextureView || this.opaqueBatches.length === 0) return;

        const passEncoder = commandEncoder.beginRenderPass({
            label: "Depth Pre-Pass",
            colorAttachments: [],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });

        passEncoder.setPipeline(this.depthPipeline!);

        // Camera index 0 = main camera
        const cameraIndex = 0;

        for (const batch of this.opaqueBatches) {
            const renderBindGroup = this.batchManager.getRenderBindGroup(batch, cameraIndex);
            const geometryData = this.batchManager.getGeometryData(batch.geometry);

            passEncoder.setBindGroup(0, renderBindGroup);
            passEncoder.setVertexBuffer(0, geometryData.vertexBuffer);

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

    dispose(): void {
        this.depthPipeline = null;
        this.opaqueBatches = [];
    }
}
