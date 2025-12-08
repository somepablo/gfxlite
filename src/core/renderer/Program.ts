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
        const vertexBuffers: GPUVertexBufferLayout[] = options.positionOnly
            ? [
                // Position buffer only
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
            ]
            : [
                // Position buffer
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
                // Normal buffer
                {
                    arrayStride: 3 * 4,
                    attributes: [
                        {
                            shaderLocation: 1,
                            offset: 0,
                            format: "float32x3",
                        },
                    ],
                },
            ];

        // Determine pipeline layout
        let layout: GPUPipelineLayout | "auto" = "auto";
        if (options.bindGroupLayouts) {
            this.bindGroupLayouts = options.bindGroupLayouts;
            layout = device.createPipelineLayout({
                label: "Explicit Pipeline Layout",
                bindGroupLayouts: options.bindGroupLayouts,
            });
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
                targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }],
            },
            depthStencil: {
                depthWriteEnabled: true,
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
