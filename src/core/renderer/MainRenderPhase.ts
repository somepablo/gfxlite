import { RenderPhase } from "./RenderPhase";
import type { Scene } from "../scene/Scene";
import type { Camera } from "../camera/Camera";
import { Mesh } from "../object/Mesh";
import type { BasicMaterial } from "../material/BasicMaterial";
import type { LambertMaterial } from "../material/LambertMaterial";
import type { PhongMaterial } from "../material/PhongMaterial";
import type { StandardMaterial } from "../material/StandardMaterial";
import { MaterialType } from "../material/Material";
import type { LightingManager } from "./LightingManager";
import type { BatchManager, DrawBatch } from "./BatchManager";
import type { TextureManager } from "../material/TextureManager";
import type { EnvironmentManager } from "../environment/EnvironmentManager";
import type { Environment } from "../environment/Environment";
import type { Material } from "../material/Material";
import { Program } from "./Program";
import { Vector3 } from "../../math";

interface IndirectPipelineData {
	program: Program;
	lightingBindGroup: GPUBindGroup | null;
}

// Alpha blend state for transparent materials
const ALPHA_BLEND_STATE: GPUBlendState = {
	color: {
		srcFactor: "src-alpha",
		dstFactor: "one-minus-src-alpha",
		operation: "add",
	},
	alpha: {
		srcFactor: "one",
		dstFactor: "one-minus-src-alpha",
		operation: "add",
	},
};

export class MainRenderPhase extends RenderPhase {
	private lightingManager: LightingManager;
	private batchManager: BatchManager;
	private textureManager: TextureManager;
	private environmentManager: EnvironmentManager | null = null;
	private context: GPUCanvasContext;
	private depthTextureView: GPUTextureView;
	private msaaTextureView: GPUTextureView | null;
	private sampleCount: number;

	private renderList: Mesh[] = [];
	private batches: DrawBatch[] = [];

	// Current environment for rendering
	private currentEnvironment: Environment | null = null;

	// Whether skybox was rendered (determines if we need to clear)
	private skyboxRendered: boolean = false;

	// Clear color for background (when not using skybox)
	private clearColor: { r: number; g: number; b: number; a: number } = {
		r: 0.1,
		g: 0.1,
		b: 0.1,
		a: 1.0,
	};

	// Camera position for transparent sorting
	private cameraPosition: Vector3 = new Vector3();

	// Indirect pipeline cache by material type + transparency
	private indirectPipelineCache = new Map<string, IndirectPipelineData>();

	// Bind group layouts for indirect rendering
	private materialBindGroupLayout: GPUBindGroupLayout | null = null;
	private lightingBindGroupLayout: GPUBindGroupLayout | null = null;
	private textureBindGroupLayout: GPUBindGroupLayout | null = null;
	private simpleTextureBindGroupLayout: GPUBindGroupLayout | null = null;

	// Texture bind group cache
	private textureBindGroupCache = new Map<number, GPUBindGroup>();
	private simpleTextureBindGroupCache = new Map<number, GPUBindGroup>();

	// Per-environment params buffers (key: "envId_intensity")
	private envParamsBufferCache = new Map<string, GPUBuffer>();
	private sceneEnvironmentId: number = -1;
	private materialEnvKeyCache = new Map<number, string>();

	public debugInfo = {
		calls: 0,
		triangles: 0,
		batches: 0,
	};

	constructor(
		device: GPUDevice,
		lightingManager: LightingManager,
		batchManager: BatchManager,
		textureManager: TextureManager,
		context: GPUCanvasContext,
		depthTextureView: GPUTextureView,
		msaaTextureView: GPUTextureView | null,
		sampleCount: number,
	) {
		super(device, "Main Render Phase");
		this.lightingManager = lightingManager;
		this.batchManager = batchManager;
		this.textureManager = textureManager;
		this.context = context;
		this.depthTextureView = depthTextureView;
		this.msaaTextureView = msaaTextureView;
		this.sampleCount = sampleCount;

		this.initBindGroupLayouts();
	}

	setEnvironmentManager(environmentManager: EnvironmentManager): void {
		this.environmentManager = environmentManager;
		// Clear pipeline cache to rebuild with environment bind group
		this.indirectPipelineCache.clear();
	}

	setEnvironment(environment: Environment | null): void {
		this.currentEnvironment = environment;
	}

	/** Called by Renderer to inform whether skybox was rendered this frame */
	setSkyboxRendered(rendered: boolean): void {
		this.skyboxRendered = rendered;
	}

	/** Set the clear color for the background */
	setClearColor(r: number, g: number, b: number, a: number = 1.0): void {
		this.clearColor = { r, g, b, a };
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

		// Texture bind group layout (group 3) for PBR materials + environment
		this.textureBindGroupLayout = this.device.createBindGroupLayout({
			label: "PBR Texture Bind Group Layout",
			entries: [
				// PBR textures (bindings 0-5)
				{
					binding: 0,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "float" },
				}, // baseColorMap
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "float" },
				}, // normalMap
				{
					binding: 2,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "float" },
				}, // metallicRoughnessMap
				{
					binding: 3,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "float" },
				}, // emissiveMap
				{
					binding: 4,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "float" },
				}, // aoMap
				{
					binding: 5,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: { type: "filtering" },
				}, // sampler
				// Environment IBL (bindings 6-11)
				{
					binding: 6,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "float", viewDimension: "cube" },
				}, // irradianceMap
				{
					binding: 7,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "float", viewDimension: "cube" },
				}, // prefilteredMap
				{
					binding: 8,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "float" },
				}, // brdfLUT
				{
					binding: 9,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: { type: "filtering" },
				}, // envSampler
				{
					binding: 10,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: { type: "filtering" },
				}, // brdfSampler
				{
					binding: 11,
					visibility: GPUShaderStage.FRAGMENT,
					buffer: { type: "uniform" },
				}, // envParams
			],
		});

		// Simple texture bind group layout for Basic/Lambert/Phong materials
		this.simpleTextureBindGroupLayout = this.device.createBindGroupLayout({
			label: "Simple Texture Bind Group Layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.FRAGMENT,
					texture: { sampleType: "float" },
				}, // map
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: { type: "filtering" },
				}, // sampler
			],
		});
	}

	private getIndirectPipeline(material: Material): IndirectPipelineData {
		// Use cached pipeline key from material
		const cacheKey = material.getPipelineKey();

		let pipelineData = this.indirectPipelineCache.get(cacheKey);
		if (pipelineData) {
			return pipelineData;
		}

		const matType = material.materialType;
		const isStandard = matType === MaterialType.Standard;
		const isBasic = matType === MaterialType.Basic;
		const hasTextures = material.hasTextures();
		const needsLighting = material.needsLighting;
		const needsNormals = material.needsNormals;

		// Build bind group layouts array
		const bindGroupLayouts: GPUBindGroupLayout[] = [
			this.batchManager.getRenderBindGroupLayout(), // Group 0: instances + culled + camera
			this.materialBindGroupLayout!, // Group 1: material
		];

		if (needsLighting) {
			bindGroupLayouts.push(this.lightingBindGroupLayout!); // Group 2: lighting
		}

		if (isStandard) {
			bindGroupLayouts.push(this.textureBindGroupLayout!); // Group 3: textures (PBR) + environment
		} else if (hasTextures) {
			// Simple materials with textures
			if (isBasic) {
				bindGroupLayouts.push(this.simpleTextureBindGroupLayout!); // Group 2: textures (no lighting)
			} else {
				bindGroupLayouts.push(this.simpleTextureBindGroupLayout!); // Group 3: textures (after lighting)
			}
		}

		// Determine if UVs are needed
		const needsUVs = isStandard || hasTextures;

		// Create the program with appropriate options
		const program = new Program(this.device, {
			vertex: { code: material.getVertexShader() },
			fragment: { code: material.getFragmentShader() },
			multisample: { count: this.sampleCount },
			bindGroupLayouts,
			positionOnly: isBasic && !hasTextures,
			hasNormals: needsNormals,
			hasUVs: needsUVs,
			hasTangents: isStandard,
			blend: material.transparent ? ALPHA_BLEND_STATE : undefined,
			depthWrite: !material.transparent,
			depthCompare: "less-equal",
			cullMode: material.doubleSided ? "none" : "back",
		});

		// Create lighting bind group if needed
		let lightingBindGroup: GPUBindGroup | null = null;
		if (needsLighting) {
			lightingBindGroup = this.createLightingBindGroup();
		}

		pipelineData = { program, lightingBindGroup };
		this.indirectPipelineCache.set(cacheKey, pipelineData);

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

	prepare(scene: Scene, camera: Camera): void {
		this.renderList = [];
		this.debugInfo.calls = 0;
		this.debugInfo.triangles = 0;
		this.debugInfo.batches = 0;

		// Store camera position for transparent sorting
		this.cameraPosition.copy(camera.position);

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

		// Separate batches into opaque and transparent
		const opaqueBatches: DrawBatch[] = [];
		const transparentBatches: DrawBatch[] = [];

		for (const batch of this.batches) {
			if (batch.material.transparent) {
				transparentBatches.push(batch);
			} else {
				opaqueBatches.push(batch);
			}
		}

		// Sort transparent batches back-to-front
		if (transparentBatches.length > 0) {
			this.sortTransparentBatches(transparentBatches);
		}

		const textureView = this.context.getCurrentTexture().createView();

		// Render all batches in a single pass (required for MSAA - can't load discarded MSAA buffer)
		// Opaque first, then transparent (already sorted back-to-front)
		const allBatchesOrdered = [...opaqueBatches, ...transparentBatches];

		// colorLoadOp is "load" if skybox was rendered, "clear" otherwise
		const colorLoadOp = this.skyboxRendered ? "load" : "clear";
		// depthLoadOp is "load" to use the depth buffer from depth pre-pass (early-z optimization)
		this.renderBatches(
			commandEncoder,
			allBatchesOrdered,
			textureView,
			colorLoadOp,
			"load",
		);
	}

	private sortTransparentBatches(batches: DrawBatch[]): void {
		batches.sort((a, b) => {
			const distA = this.getBatchCentroidDistance(a);
			const distB = this.getBatchCentroidDistance(b);
			return distB - distA; // Back to front
		});
	}

	private getBatchCentroidDistance(batch: DrawBatch): number {
		// Average distance of all mesh centroids in batch
		let totalDist = 0;
		for (const mesh of batch.meshes) {
			const pos = mesh.worldMatrix.extractPosition();
			const dx = pos.x - this.cameraPosition.x;
			const dy = pos.y - this.cameraPosition.y;
			const dz = pos.z - this.cameraPosition.z;
			totalDist += Math.sqrt(dx * dx + dy * dy + dz * dz);
		}
		return totalDist / batch.meshes.length;
	}

	private renderBatches(
		commandEncoder: GPUCommandEncoder,
		batches: DrawBatch[],
		textureView: GPUTextureView,
		colorLoadOp: "clear" | "load",
		depthLoadOp: "clear" | "load",
	): void {
		if (batches.length === 0) return;

		const colorAttachment: GPURenderPassColorAttachment = {
			view: this.sampleCount > 1 ? this.msaaTextureView! : textureView,
			clearValue: this.clearColor,
			loadOp: colorLoadOp,
			storeOp: this.sampleCount > 1 ? "discard" : "store",
		};

		if (this.sampleCount > 1) {
			colorAttachment.resolveTarget = textureView;
		}

		const passEncoder = commandEncoder.beginRenderPass({
			label: `Main Render Pass (color: ${colorLoadOp}, depth: ${depthLoadOp})`,
			colorAttachments: [colorAttachment],
			depthStencilAttachment: {
				view: this.depthTextureView,
				depthClearValue: 1.0,
				depthLoadOp: depthLoadOp,
				depthStoreOp: "store",
			},
		});

		let currentPipeline: GPURenderPipeline | null = null;
		let currentPipelineKey: string | null = null;

		for (let i = 0; i < batches.length; i++) {
			const batch = batches[i];
			const material = batch.material;

			// Use cached material properties instead of instanceof checks
			const matType = material.materialType;
			const isStandard = matType === MaterialType.Standard;
			const isBasic = matType === MaterialType.Basic;
			const hasTextures = material.hasTextures();
			const needsNormals = material.needsNormals;

			const pipelineKey = material.getPipelineKey();
			const pipelineData = this.getIndirectPipeline(material);
			const geometryData = this.batchManager.getGeometryData(batch.geometry);

			// Set pipeline if changed
			if (pipelineKey !== currentPipelineKey) {
				currentPipelineKey = pipelineKey;
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

			if (material.needsUpdate) {
				this.updateMaterial(material);
			}

			// Set material bind group (group 1)
			const materialBindGroup = this.getMaterialBindGroup(material);
			passEncoder.setBindGroup(1, materialBindGroup);

			// Set texture bind group for materials with textures (includes environment for StandardMaterial)
			if (isStandard) {
				const textureBindGroup = this.getTextureBindGroup(
					material as StandardMaterial,
				);
				passEncoder.setBindGroup(3, textureBindGroup);
			} else if (hasTextures) {
				const textureBindGroup = this.getSimpleTextureBindGroup(material);
				// BasicMaterial uses group 2 (no lighting), others use group 3 (after lighting)
				const textureGroupIndex = isBasic ? 2 : 3;
				passEncoder.setBindGroup(textureGroupIndex, textureBindGroup);
			}

			// Set vertex buffers
			// Slot 0: position (always)
			passEncoder.setVertexBuffer(0, geometryData.vertexBuffer);

			// Determine buffer layout:
			// BasicMaterial: position only, or position + UV (no normals)
			// Others: position + normal, or position + normal + UV
			const needsUVs = isStandard || hasTextures;

			let nextSlot = 1;

			// Slot 1: normal (for non-Basic materials)
			if (needsNormals && geometryData.normalBuffer) {
				passEncoder.setVertexBuffer(nextSlot++, geometryData.normalBuffer);
			}

			// Slot 1 or 2: UV (depending on whether normals are present)
			if (needsUVs && geometryData.uvBuffer) {
				passEncoder.setVertexBuffer(nextSlot++, geometryData.uvBuffer);
			}

			// Slot 2 or 3: Tangent (for StandardMaterial)
			if (isStandard && geometryData.tangentBuffer) {
				passEncoder.setVertexBuffer(nextSlot++, geometryData.tangentBuffer);
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

	private updateMaterial(material: Material): void {
		// Clean up old buffer
		const oldBuffer = this.materialBufferCache.get(material.id);
		if (oldBuffer) {
			oldBuffer.destroy();
		}

		const uniformData = material.getUniformBufferData();
		// Ensure 16-byte alignment for uniform (standard WebGPU requirement)
		const alignedSize =
			Math.ceil(Math.max(uniformData.byteLength, 16) / 16) * 16;

		const uniformBuffer = this.device.createBuffer({
			label: `Material Uniform Buffer ${material.id}`,
			size: alignedSize,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.device.queue.writeBuffer(
			uniformBuffer,
			0,
			uniformData as GPUAllowSharedBufferSource,
		);

		const bindGroup = this.device.createBindGroup({
			label: `Material Bind Group ${material.id}`,
			layout: this.materialBindGroupLayout!,
			entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
		});

		this.materialBufferCache.set(material.id, uniformBuffer);
		this.materialBindGroupCache.set(material.id, bindGroup);

		// 2. Clear Texture Bind Group Caches to force recreation
		// (We don't create them here, we just invalidate them so getters recreate them)
		this.textureBindGroupCache.delete(material.id);
		this.simpleTextureBindGroupCache.delete(material.id);

		// Allow material to reset its update flag
		material.needsUpdate = false;
	}

	private getTextureBindGroup(material: StandardMaterial): GPUBindGroup {
		// Use material's envMap if set, otherwise fall back to scene environment
		const env = material.envMap ?? this.currentEnvironment;
		const envId = env?.id ?? -1;

		// Cache key combines material with environment configuration
		const cacheKey = material.id;
		const currentEnvKey = `${material.id}_${envId}_${material.envMapIntensity}`;

		// If scene environment changed, clear only bind groups that use scene environment
		// (materials with their own envMap should not be affected)
		if (this.currentEnvironment?.id !== this.sceneEnvironmentId) {
			for (const [matId, envKey] of this.materialEnvKeyCache) {
				// Only clear if this material was using the scene environment
				if (!this.textureBindGroupCache.has(matId)) continue;

				// Check if this material has its own envMap by looking at the cached key
				const parts = envKey.split("_");
				const cachedEnvId = parseInt(parts[1]);
				const sceneEnvId = this.sceneEnvironmentId;

				if (cachedEnvId === sceneEnvId) {
					this.textureBindGroupCache.delete(matId);
					this.materialEnvKeyCache.delete(matId);
				}
			}
			this.sceneEnvironmentId = this.currentEnvironment?.id ?? -1;
		}

		let bindGroup = this.textureBindGroupCache.get(cacheKey);
		const cachedEnvKey = this.materialEnvKeyCache.get(cacheKey);

		if (!bindGroup || cachedEnvKey !== currentEnvKey) {
			const tm = this.textureManager;

			// Get environment resources
			const envManager = this.environmentManager;
			const dummyCubemap = envManager?.dummyCubemapView;
			const cubemapSampler = envManager?.cubemapSampler;
			const brdfSampler = envManager?.brdfSampler;
			const brdfLUTView = envManager?.brdfLUTView;

			// Calculate intensity using material's envMapIntensity
			const baseIntensity = env?.intensity ?? 1.0;
			const intensity = baseIntensity * material.envMapIntensity;
			const hasEnv = env?.irradianceMapView ? 1.0 : 0.0;

			// Get or create environment params buffer for this env configuration
			const envParamsKey = `${envId}_${intensity}`;
			let envParamsBuffer = this.envParamsBufferCache.get(envParamsKey);

			if (!envParamsBuffer) {
				envParamsBuffer = this.device.createBuffer({
					label: `Env Params Buffer (${envParamsKey})`,
					size: 16,
					usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
				});
				this.device.queue.writeBuffer(
					envParamsBuffer,
					0,
					new Float32Array([intensity, hasEnv, 0, 0]),
				);
				this.envParamsBufferCache.set(envParamsKey, envParamsBuffer);
			}

			bindGroup = this.device.createBindGroup({
				label: `PBR Texture Bind Group ${material.id}`,
				layout: this.textureBindGroupLayout!,
				entries: [
					// PBR textures (bindings 0-5)
					{
						binding: 0,
						resource: material.baseColorMap
							? tm.uploadTexture(material.baseColorMap)
							: tm.dummyWhiteTexture,
					},
					{
						binding: 1,
						resource: material.normalMap
							? tm.uploadTexture(material.normalMap)
							: tm.dummyNormalTexture,
					},
					{
						binding: 2,
						resource: material.metallicRoughnessMap
							? tm.uploadTexture(material.metallicRoughnessMap)
							: tm.dummyWhiteTexture,
					},
					{
						binding: 3,
						resource: material.emissiveMap
							? tm.uploadTexture(material.emissiveMap)
							: tm.dummyBlackTexture,
					},
					{
						binding: 4,
						resource: material.aoMap
							? tm.uploadTexture(material.aoMap)
							: tm.dummyWhiteTexture,
					},
					{ binding: 5, resource: tm.defaultSampler },
					// Environment IBL (bindings 6-11)
					{
						binding: 6,
						resource: env?.irradianceMapView ?? dummyCubemap!,
					},
					{
						binding: 7,
						resource: env?.prefilteredMapView ?? dummyCubemap!,
					},
					{
						binding: 8,
						resource: brdfLUTView ?? tm.dummyWhiteTexture,
					},
					{ binding: 9, resource: cubemapSampler! },
					{ binding: 10, resource: brdfSampler! },
					{ binding: 11, resource: { buffer: envParamsBuffer } },
				],
			});

			this.textureBindGroupCache.set(cacheKey, bindGroup);
			this.materialEnvKeyCache.set(cacheKey, currentEnvKey);
		}

		return bindGroup;
	}

	private getSimpleTextureBindGroup(material: Material): GPUBindGroup {
		let bindGroup = this.simpleTextureBindGroupCache.get(material.id);

		if (!bindGroup) {
			const tm = this.textureManager;

			// Get the map from the material (Basic, Lambert, or Phong)
			const map = (material as BasicMaterial | LambertMaterial | PhongMaterial)
				.map;

			bindGroup = this.device.createBindGroup({
				label: `Simple Texture Bind Group ${material.id}`,
				layout: this.simpleTextureBindGroupLayout!,
				entries: [
					{
						binding: 0,
						resource: map ? tm.uploadTexture(map) : tm.dummyWhiteTexture,
					},
					{ binding: 1, resource: tm.defaultSampler },
				],
			});

			this.simpleTextureBindGroupCache.set(material.id, bindGroup);
		}

		return bindGroup;
	}

	private materialBindGroupCache = new Map<number, GPUBindGroup>();
	private materialBufferCache = new Map<number, GPUBuffer>();

	private getMaterialBindGroup(material: Material): GPUBindGroup {
		let bindGroup = this.materialBindGroupCache.get(material.id);

		if (!bindGroup) {
			this.updateMaterial(material);
			bindGroup = this.materialBindGroupCache.get(material.id)!;
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
		this.textureBindGroupCache.clear();
		this.simpleTextureBindGroupCache.clear();
		this.materialEnvKeyCache.clear();

		// Clean up environment params buffers
		for (const buffer of this.envParamsBufferCache.values()) {
			buffer.destroy();
		}
		this.envParamsBufferCache.clear();
	}
}
