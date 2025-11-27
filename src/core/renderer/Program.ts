export interface ProgramOptions {
    vertex: {
        code: string;
        entryPoint?: string;
    };
    fragment: {
        code: string;
        entryPoint?: string;
    };
}

export class Program {
    public pipeline: GPURenderPipeline;

    constructor(device: GPUDevice, { vertex, fragment }: ProgramOptions) {
        const vertexModule = device.createShaderModule({
            label: "Vertex Shader",
            code: vertex.code,
        });

        const fragmentModule = device.createShaderModule({
            label: "Fragment Shader",
            code: fragment.code,
        });

        this.pipeline = device.createRenderPipeline({
            label: "Render Pipeline",
            layout: "auto", // Let WebGPU infer the layout from shaders
            vertex: {
                module: vertexModule,
                entryPoint: vertex.entryPoint || "main",
                buffers: [
                    // This describes the vertex data layout
                    {
                        arrayStride: 3 * 4, // 3 floats * 4 bytes per float
                        attributes: [
                            {
                                shaderLocation: 0,
                                offset: 0,
                                format: "float32x3",
                            }, // position
                        ],
                    },
                ],
            },
            fragment: {
                module: fragmentModule,
                entryPoint: fragment.entryPoint || "main",
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
        });
    }
}
