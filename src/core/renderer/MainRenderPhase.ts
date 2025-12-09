import { RenderPhase } from "./RenderPhase";
import type { Scene } from "../scene/Scene";
import type { Camera } from "../camera/Camera";
import { Mesh } from "../object/Mesh";
import { PhongMaterial } from "../material/PhongMaterial";
import { LambertMaterial } from "../material/LambertMaterial";
import { BasicMaterial } from "../material/BasicMaterial";
import type { LightingManager } from "./LightingManager";
import type { BatchManager, DrawBatch } from "./BatchManager";
import type { Material } from "../material/Material";
import { Program } from "./Program";

interface IndirectPipelineData {
    program: Program;
    lightingBindGroup: GPUBindGroup | null;
}

export class MainRenderPhase extends RenderPhase {
    private lightingManager: LightingManager;
    private batchManager: BatchManager;
    private context: GPUCanvasContext;
    private depthTextureView: GPUTextureView;
    private msaaTextureView: GPUTextureView | null;
    private sampleCount: number;

    private renderList: Mesh[] = [];
    private batches: DrawBatch[] = [];

    // Indirect pipeline cache by material constructor name
    private indirectPipelineCache = new Map<string, IndirectPipelineData>();

    // Bind group layouts for indirect rendering
    private materialBindGroupLayout: GPUBindGroupLayout | null = null;
    private lightingBindGroupLayout: GPUBindGroupLayout | null = null;

    public debugInfo = {
        calls: 0,
        triangles: 0,
        batches: 0,
    };

    constructor(
        device: GPUDevice,
        lightingManager: LightingManager,
        batchManager: BatchManager,
        context: GPUCanvasContext,
        depthTextureView: GPUTextureView,
        msaaTextureView: GPUTextureView | null,
        sampleCount: number
    ) {
        super(device, "Main Render Phase");
        this.lightingManager = lightingManager;
        this.batchManager = batchManager;
        this.context = context;
        this.depthTextureView = depthTextureView;
        this.msaaTextureView = msaaTextureView;
        this.sampleCount = sampleCount;

        this.initBindGroupLayouts();
    }

    private initBindGroupLayouts(): void {
        // Material bind group layout (group 1)
        this.materialBindGroupLayout = this.device.createBindGroupLayout({
            label: "Material Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
            ],
        });

        // Lighting bind group layout (group 2)
        this.lightingBindGroupLayout = this.device.createBindGroupLayout({
            label: "Lighting Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "depth",
                        viewDimension: "2d-array",
                    },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: "comparison" },
                },
            ],
        });
    }

    private getIndirectPipeline(material: Material): IndirectPipelineData {
        const materialType = material.constructor.name;

        let pipelineData = this.indirectPipelineCache.get(materialType);
        if (pipelineData) {
            return pipelineData;
        }

        const needsLighting =
            material instanceof PhongMaterial ||
            material instanceof LambertMaterial;

        // Build bind group layouts array
        const bindGroupLayouts: GPUBindGroupLayout[] = [
            this.batchManager.getRenderBindGroupLayout(), // Group 0: instances + culled + camera
            this.materialBindGroupLayout!, // Group 1: material
        ];

        if (needsLighting) {
            bindGroupLayouts.push(this.lightingBindGroupLayout!); // Group 2: lighting
        }

        // Create the program
        const program = new Program(this.device, {
            vertex: { code: material.getVertexShader() },
            fragment: { code: material.getFragmentShader() },
            multisample: { count: this.sampleCount },
            bindGroupLayouts,
            positionOnly: material instanceof BasicMaterial,
        });

        // Create lighting bind group if needed
        let lightingBindGroup: GPUBindGroup | null = null;
        if (needsLighting) {
            lightingBindGroup = this.createLightingBindGroup();
        }

        pipelineData = { program, lightingBindGroup };
        this.indirectPipelineCache.set(materialType, pipelineData);

        return pipelineData;
    }

    private createLightingBindGroup(): GPUBindGroup {
        const lightingBuffer = this.lightingManager.getLightingBuffer()!;
        const shadowMapView =
            this.lightingManager.shadowMapArrayView ||
            this.lightingManager.getDummyShadowMap();
        const shadowSampler = this.lightingManager.getShadowSampler();

        return this.device.createBindGroup({
            label: "Indirect Lighting Bind Group",
            layout: this.lightingBindGroupLayout!,
            entries: [
                { binding: 0, resource: { buffer: lightingBuffer } },
                { binding: 1, resource: shadowMapView },
                { binding: 2, resource: shadowSampler },
            ],
        });
    }

    invalidateLightingBindGroups(): void {
        // Called when shadow map is recreated
        for (const [, data] of this.indirectPipelineCache) {
            if (data.lightingBindGroup) {
                data.lightingBindGroup = this.createLightingBindGroup();
            }
        }
    }

    prepare(scene: Scene, _camera: Camera): void {
        this.renderList = [];
        this.debugInfo.calls = 0;
        this.debugInfo.triangles = 0;
        this.debugInfo.batches = 0;

        // Collect meshes
        scene.traverse((object) => {
            if (object instanceof Mesh) {
                this.renderList.push(object);
            }
        });

        // Prepare batches
        this.batches = this.batchManager.prepareBatches(this.renderList);
        this.debugInfo.batches = this.batches.length;
    }

    execute(commandEncoder: GPUCommandEncoder): void {
        if (this.batches.length === 0) return;

        const textureView = this.context.getCurrentTexture().createView();

        const colorAttachment: GPURenderPassColorAttachment = {
            view: this.sampleCount > 1 ? this.msaaTextureView! : textureView,
            clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
            loadOp: "clear",
            storeOp: this.sampleCount > 1 ? "discard" : "store",
        };

        if (this.sampleCount > 1) {
            colorAttachment.resolveTarget = textureView;
        }

        const passEncoder = commandEncoder.beginRenderPass({
            label: "Main Render Pass (Indirect)",
            colorAttachments: [colorAttachment],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "discard",
            },
        });

        let currentPipeline: GPURenderPipeline | null = null;
        let currentMaterialType: string | null = null;

        for (const batch of this.batches) {
            const materialType = batch.material.constructor.name;
            const pipelineData = this.getIndirectPipeline(batch.material);
            const geometryData = this.batchManager.getGeometryData(batch.geometry);

            // Set pipeline if changed
            if (materialType !== currentMaterialType) {
                currentMaterialType = materialType;
                currentPipeline = pipelineData.program.pipeline;
                passEncoder.setPipeline(currentPipeline);

                // Set lighting bind group (group 2) if needed
                if (pipelineData.lightingBindGroup) {
                    passEncoder.setBindGroup(2, pipelineData.lightingBindGroup);
                }
            }

            // Set instance bind group (group 0) - camera index 0 for main camera
            const renderBindGroup = this.batchManager.getRenderBindGroup(batch, 0);
            passEncoder.setBindGroup(0, renderBindGroup);

            // Set material bind group (group 1)
            const materialBindGroup = this.getMaterialBindGroup(
                batch.material,
                pipelineData.program
            );
            passEncoder.setBindGroup(1, materialBindGroup);

            // Set vertex buffers
            passEncoder.setVertexBuffer(0, geometryData.vertexBuffer);
            if (geometryData.normalBuffer && !(batch.material instanceof BasicMaterial)) {
                passEncoder.setVertexBuffer(1, geometryData.normalBuffer);
            }

            // Draw using indirect buffer at offset 0 (main camera)
            const indirectOffset = this.batchManager.getIndirectBufferOffset(0);
            if (geometryData.indexBuffer) {
                passEncoder.setIndexBuffer(geometryData.indexBuffer, "uint32");
                passEncoder.drawIndexedIndirect(batch.indirectBuffer, indirectOffset);
            } else {
                passEncoder.drawIndirect(batch.indirectBuffer, indirectOffset);
            }

            this.debugInfo.calls++;
            this.debugInfo.triangles +=
                (batch.geometry.indexCount / 3) * batch.instanceCount;
        }

        passEncoder.end();
    }

    private materialBindGroupCache = new Map<number, GPUBindGroup>();
    private materialBufferCache = new Map<number, GPUBuffer>();

    private getMaterialBindGroup(
        material: Material,
        _program: Program
    ): GPUBindGroup {
        let bindGroup = this.materialBindGroupCache.get(material.id);

        if (!bindGroup || material.needsUpdate) {
            // Destroy old buffer if exists to prevent memory leak
            const oldBuffer = this.materialBufferCache.get(material.id);
            if (oldBuffer) {
                oldBuffer.destroy();
            }

            const uniformData = material.getUniformBufferData();
            const uniformBuffer = this.device.createBuffer({
                label: `Material Uniform Buffer ${material.id}`,
                size: Math.max(uniformData.byteLength, 16), // Minimum 16 bytes
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(uniformBuffer, 0, uniformData as GPUAllowSharedBufferSource);

            bindGroup = this.device.createBindGroup({
                label: `Material Bind Group ${material.id}`,
                layout: this.materialBindGroupLayout!,
                entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
            });

            this.materialBufferCache.set(material.id, uniformBuffer);
            this.materialBindGroupCache.set(material.id, bindGroup);
            material.needsUpdate = false;
        }

        return bindGroup;
    }

    dispose(): void {
        // Clean up material buffers
        for (const buffer of this.materialBufferCache.values()) {
            buffer.destroy();
        }
        this.materialBufferCache.clear();
        this.materialBindGroupCache.clear();
    }
}
