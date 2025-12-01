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
}

export class Program {
    public pipeline: GPURenderPipeline;

    constructor(device: GPUDevice, options: ProgramOptions) {
        const vertexModule = device.createShaderModule({
            label: "Vertex Shader",
            code: options.vertex.code,
        });

        const fragmentModule = device.createShaderModule({
            label: "Fragment Shader",
            code: options.fragment.code,
        });

        this.pipeline = device.createRenderPipeline({
            label: "Render Pipeline",
            layout: "auto", // Let WebGPU infer the layout from shaders
            vertex: {
                module: vertexModule,
                entryPoint: options.vertex.entryPoint || "main",
                buffers: [
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
                ],
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
