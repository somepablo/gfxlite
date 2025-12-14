export interface ProgramOptions {
    vertex: {
        code: string;
        entryPoint?: string;
    };
    fragment: {
        code: string;
        entryPoint?: string;
    };
    multisample?: GPUMultisampleState;
    // For indirect rendering with explicit bind group layouts
    bindGroupLayouts?: GPUBindGroupLayout[];
    // Whether to use position-only vertex buffer (no normals)
    positionOnly?: boolean;
    // Whether to include UV coordinates (slot 2)
    hasUVs?: boolean;
    // Blend state for transparency
    blend?: GPUBlendState;
    // Whether to write to depth buffer
    depthWrite?: boolean;
    // Face culling mode
    cullMode?: GPUCullMode;
}

export class Program {
    public pipeline: GPURenderPipeline;
    public bindGroupLayouts: GPUBindGroupLayout[] | null = null;

    constructor(device: GPUDevice, options: ProgramOptions) {
        const vertexModule = device.createShaderModule({
            label: "Vertex Shader",
            code: options.vertex.code,
        });

        const fragmentModule = device.createShaderModule({
            label: "Fragment Shader",
            code: options.fragment.code,
        });

        // Determine vertex buffer layout based on options
        const vertexBuffers: GPUVertexBufferLayout[] = [];

        // Position buffer (always present)
        vertexBuffers.push({
            arrayStride: 3 * 4,
            attributes: [
                {
                    shaderLocation: 0,
                    offset: 0,
                    format: "float32x3",
                },
            ],
        });

        // Normal buffer (unless position-only)
        if (!options.positionOnly) {
            vertexBuffers.push({
                arrayStride: 3 * 4,
                attributes: [
                    {
                        shaderLocation: 1,
                        offset: 0,
                        format: "float32x3",
                    },
                ],
            });
        }

        // UV buffer (if requested)
        if (options.hasUVs) {
            vertexBuffers.push({
                arrayStride: 2 * 4,
                attributes: [
                    {
                        shaderLocation: 2,
                        offset: 0,
                        format: "float32x2",
                    },
                ],
            });
        }

        // Determine pipeline layout
        let layout: GPUPipelineLayout | "auto" = "auto";
        if (options.bindGroupLayouts) {
            this.bindGroupLayouts = options.bindGroupLayouts;
            layout = device.createPipelineLayout({
                label: "Explicit Pipeline Layout",
                bindGroupLayouts: options.bindGroupLayouts,
            });
        }

        // Build fragment target with optional blend state
        const fragmentTarget: GPUColorTargetState = {
            format: navigator.gpu.getPreferredCanvasFormat(),
        };
        if (options.blend) {
            fragmentTarget.blend = options.blend;
        }

        this.pipeline = device.createRenderPipeline({
            label: "Render Pipeline",
            layout,
            vertex: {
                module: vertexModule,
                entryPoint: options.vertex.entryPoint || "main",
                buffers: vertexBuffers,
            },
            fragment: {
                module: fragmentModule,
                entryPoint: options.fragment.entryPoint || "main",
                targets: [fragmentTarget],
            },
            depthStencil: {
                depthWriteEnabled: options.depthWrite !== false,
                depthCompare: "less",
                format: "depth24plus",
            },
            primitive: {
                topology: "triangle-list",
            },
            multisample: options.multisample,
        });
    }
}
