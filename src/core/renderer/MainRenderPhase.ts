import { RenderPhase } from "./RenderPhase";
import { ResourceManager } from "./ResourceManager";
import type { Scene } from "../scene/Scene";
import type { Camera } from "../camera/Camera";
import { Mesh } from "../object/Mesh";
import { Matrix4 } from "../../math";
import { PhongMaterial } from "../material/PhongMaterial";
import { LambertMaterial } from "../material/LambertMaterial";
import type { LightingManager } from "./LightingManager";

export class MainRenderPhase extends RenderPhase {

    private resourceManager: ResourceManager;
    private lightingManager: LightingManager;
    private context: GPUCanvasContext;
    private depthTextureView: GPUTextureView;
    private msaaTextureView: GPUTextureView | null;
    private sampleCount: number;
    
    private renderList: Mesh[] = [];
    private viewProjectionMatrix: Matrix4 = new Matrix4();
    private camera: Camera | null = null;

    private _tempMatrix = new Matrix4();
    private _tempMatrix2 = new Matrix4();
    
    public debugInfo = {
        calls: 0,
        triangles: 0,
    };

    constructor(
        device: GPUDevice,
        resourceManager: ResourceManager,
        lightingManager: LightingManager,
        context: GPUCanvasContext,
        depthTextureView: GPUTextureView,
        msaaTextureView: GPUTextureView | null,
        sampleCount: number
    ) {
        super(device, "Main Render Phase");
        this.resourceManager = resourceManager;
        this.lightingManager = lightingManager;
        this.context = context;
        this.depthTextureView = depthTextureView;
        this.msaaTextureView = msaaTextureView;
        this.sampleCount = sampleCount;
    }

    prepare(scene: Scene, camera: Camera): void {
        this.camera = camera;
        this.renderList = [];
        this.debugInfo.calls = 0;
        this.debugInfo.triangles = 0;

        scene.traverse((object) => {
            if (object instanceof Mesh) {
                this.renderList.push(object);
            }
        });

        this.viewProjectionMatrix.multiplyMatrices(
            camera.projectionMatrix,
            camera.viewMatrix
        );
    }

    execute(commandEncoder: GPUCommandEncoder): void {
        if (this.renderList.length === 0 || !this.camera) return;

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
            label: "Main Render Pass",
            colorAttachments: [colorAttachment],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "discard",
            },
        });

        for (const mesh of this.renderList) {
            this.renderMesh(passEncoder, mesh);
        }

        passEncoder.end();
    }

    private renderMesh(passEncoder: GPURenderPassEncoder, mesh: Mesh): void {
        const materialData = this.resourceManager.getMaterialData(mesh.material);
        const geometryData = this.resourceManager.getGeometryData(mesh.geometry);
        const program = materialData.program;
        const meshData = this.resourceManager.getMeshData(mesh, program.pipeline);

        this.resourceManager.updateMaterialUniforms(mesh.material);
        passEncoder.setPipeline(program.pipeline);

        const mvpMatrix = this._tempMatrix.multiplyMatrices(
            this.viewProjectionMatrix,
            mesh.worldMatrix
        );
        
        const modelMatrix = mesh.worldMatrix;
        const normalMatrix = this._tempMatrix2
            .copy(modelMatrix)
            .invert()
            .transpose();

        const uniformData = new Float32Array(52);
        uniformData.set(mvpMatrix.toArray(), 0);
        uniformData.set(modelMatrix.toArray(), 16);
        uniformData.set(normalMatrix.toArray(), 32);
        uniformData.set(this.camera!.position.toArray(), 48);
        uniformData[51] = mesh.receiveShadow ? 1.0 : 0.0;

        this.device.queue.writeBuffer(meshData.uniformBuffer, 0, uniformData);

        passEncoder.setBindGroup(0, meshData.bindGroup);
        passEncoder.setBindGroup(1, materialData.bindGroup);

        if ((mesh.material instanceof PhongMaterial || mesh.material instanceof LambertMaterial)) {
            const lightingBindGroup = this.lightingManager.getLightingBindGroup(
                program.pipeline
            );

            if (lightingBindGroup) {
                passEncoder.setBindGroup(2, lightingBindGroup);
            }
        }

        passEncoder.setVertexBuffer(0, geometryData.vertexBuffer);
        if (geometryData.normalBuffer) {
            passEncoder.setVertexBuffer(1, geometryData.normalBuffer);
        }

        if (geometryData.indexBuffer) {
            passEncoder.setIndexBuffer(geometryData.indexBuffer, "uint32");
            passEncoder.drawIndexed(mesh.geometry.indexCount);
        } else {
            passEncoder.draw(mesh.geometry.indexCount);
        }
        this.debugInfo.triangles += mesh.geometry.indexCount / 3;
        this.debugInfo.calls++;
    }
}
