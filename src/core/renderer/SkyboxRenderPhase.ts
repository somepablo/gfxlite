import type { Camera } from "../camera/Camera";
import type { Environment } from "../environment/Environment";
import type { EnvironmentManager } from "../environment/EnvironmentManager";
import type { Scene } from "../scene/Scene";
import { RenderPhase } from "./RenderPhase";

export class SkyboxRenderPhase extends RenderPhase {
	private environmentManager: EnvironmentManager;
	private presentationFormat: GPUTextureFormat;
	private sampleCount: number;

	private pipeline: GPURenderPipeline | null = null;
	private bindGroupLayout: GPUBindGroupLayout | null = null;

	private cameraBuffer: GPUBuffer | null = null;
	private paramsBuffer: GPUBuffer | null = null;
	private bindGroup: GPUBindGroup | null = null;

	private colorTextureView: GPUTextureView | null = null;
	private depthTextureView: GPUTextureView | null = null;

	private environment: Environment | null = null;

	constructor(
		device: GPUDevice,
		environmentManager: EnvironmentManager,
		presentationFormat: GPUTextureFormat,
		sampleCount: number = 1,
	) {
		super(device, "Skybox Render Phase");
		this.environmentManager = environmentManager;
		this.presentationFormat = presentationFormat;
		this.sampleCount = sampleCount;
		this.createResources();
		this.createPipeline();
	}

	private createResources(): void {
		// Camera buffer: inverse view-projection matrix (16 floats)
		this.cameraBuffer = this.device.createBuffer({
			label: "Skybox Camera Buffer",
			size: 64, // mat4x4
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		// Params buffer: intensity
		this.paramsBuffer = this.device.createBuffer({
			label: "Skybox Params Buffer",
			size: 16, // vec4
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
	}

	private createPipeline(): void {
		const vertexShader = /* wgsl */ `
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) direction: vec3<f32>,
}

@group(0) @binding(0) var<uniform> inverseViewProjection: mat4x4<f32>;

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    // Fullscreen triangle
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );

    var output: VertexOutput;
    let pos = positions[vertexIndex];
    output.position = vec4<f32>(pos, 0.9999, 1.0); // Near far plane

    // Compute world direction from clip space
    let clipPos = vec4<f32>(pos, 1.0, 1.0);
    let worldPos = inverseViewProjection * clipPos;
    output.direction = normalize(worldPos.xyz / worldPos.w);

    return output;
}
        `;

		const fragmentShader = /* wgsl */ `
@group(0) @binding(1) var envCubemap: texture_cube<f32>;
@group(0) @binding(2) var envSampler: sampler;
@group(0) @binding(3) var<uniform> params: vec4<f32>; // x: intensity

@fragment
fn main(@location(0) direction: vec3<f32>) -> @location(0) vec4<f32> {
    let color = textureSample(envCubemap, envSampler, direction).rgb * params.x;

    // Tone mapping (Reinhard)
    let mapped = color / (color + vec3<f32>(1.0));

    // Gamma correction
    let gammaCorrected = pow(mapped, vec3<f32>(1.0 / 2.2));

    return vec4<f32>(gammaCorrected, 1.0);
}
        `;

		const vertexModule = this.device.createShaderModule({
			label: "Skybox Vertex Shader",
			code: vertexShader,
		});

		const fragmentModule = this.device.createShaderModule({
			label: "Skybox Fragment Shader",
			code: fragmentShader,
		});

		this.bindGroupLayout = this.device.createBindGroupLayout({
			label: "Skybox Bind Group Layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX,
					buffer: { type: "uniform" },
				},
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "float", viewDimension: "cube" },
				},
				{
					binding: 2,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: { type: "filtering" },
				},
				{
					binding: 3,
					visibility: GPUShaderStage.FRAGMENT,
					buffer: { type: "uniform" },
				},
			],
		});

		this.pipeline = this.device.createRenderPipeline({
			label: "Skybox Pipeline",
			layout: this.device.createPipelineLayout({
				bindGroupLayouts: [this.bindGroupLayout],
			}),
			vertex: {
				module: vertexModule,
				entryPoint: "main",
			},
			fragment: {
				module: fragmentModule,
				entryPoint: "main",
				targets: [
					{
						format: this.presentationFormat,
					},
				],
			},
			primitive: {
				topology: "triangle-list",
				frontFace: "ccw",
				cullMode: "none",
			},
			depthStencil: {
				depthWriteEnabled: false,
				depthCompare: "less-equal",
				format: "depth24plus",
			},
			multisample: {
				count: this.sampleCount,
			},
		});
	}

	setEnvironment(environment: Environment | null): void {
		this.environment = environment;
		this.bindGroup = null; // Force recreation
	}

	setRenderTargets(
		colorTextureView: GPUTextureView,
		depthTextureView: GPUTextureView,
	): void {
		this.colorTextureView = colorTextureView;
		this.depthTextureView = depthTextureView;
	}

	prepare(_scene: Scene, camera: Camera): void {
		// Compute inverse view-projection matrix
		// We want view rotation only (no translation) for skybox
		const viewMatrix = camera.viewMatrix.clone();
		// Zero out translation
		viewMatrix.elements[12] = 0;
		viewMatrix.elements[13] = 0;
		viewMatrix.elements[14] = 0;

		const viewProjection = camera.projectionMatrix.clone().multiply(viewMatrix);
		const inverseViewProjection = viewProjection.clone().invert();

		// Update camera buffer
		this.device.queue.writeBuffer(
			this.cameraBuffer!,
			0,
			new Float32Array(inverseViewProjection.elements),
		);

		// Update params buffer
		const resources = this.environmentManager.getSkyboxResources(
			this.environment,
		);
		this.device.queue.writeBuffer(
			this.paramsBuffer!,
			0,
			new Float32Array([resources.intensity, 0, 0, 0]),
		);

		// Create/update bind group
		if (!this.bindGroup) {
			this.bindGroup = this.device.createBindGroup({
				layout: this.bindGroupLayout!,
				entries: [
					{ binding: 0, resource: { buffer: this.cameraBuffer! } },
					{ binding: 1, resource: resources.cubemapView },
					{ binding: 2, resource: resources.sampler },
					{ binding: 3, resource: { buffer: this.paramsBuffer! } },
				],
			});
		}
	}

	execute(commandEncoder: GPUCommandEncoder): void {
		if (!this.colorTextureView || !this.depthTextureView || !this.environment) {
			return;
		}

		// Update bind group with current environment
		const resources = this.environmentManager.getSkyboxResources(
			this.environment,
		);
		this.bindGroup = this.device.createBindGroup({
			layout: this.bindGroupLayout!,
			entries: [
				{ binding: 0, resource: { buffer: this.cameraBuffer! } },
				{ binding: 1, resource: resources.cubemapView },
				{ binding: 2, resource: resources.sampler },
				{ binding: 3, resource: { buffer: this.paramsBuffer! } },
			],
		});

		const passEncoder = commandEncoder.beginRenderPass({
			label: "Skybox Render Pass",
			colorAttachments: [
				{
					view: this.colorTextureView,
					loadOp: "clear",
					storeOp: "store",
					clearValue: { r: 0, g: 0, b: 0, a: 1 },
				},
			],
			depthStencilAttachment: {
				view: this.depthTextureView,
				depthLoadOp: "load",
				depthStoreOp: "store",
			},
		});

		passEncoder.setPipeline(this.pipeline!);
		passEncoder.setBindGroup(0, this.bindGroup!);
		passEncoder.draw(3); // Fullscreen triangle

		passEncoder.end();
	}

	dispose(): void {
		this.cameraBuffer?.destroy();
		this.paramsBuffer?.destroy();
		this.pipeline = null;
		this.bindGroup = null;
	}
}
