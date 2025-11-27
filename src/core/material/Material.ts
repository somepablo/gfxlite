let materialID = 0;

export abstract class Material {
    public readonly id = materialID++;
    public uniforms: { [key: string]: unknown } = {};

    abstract getVertexShader(): string;
    abstract getFragmentShader(): string;
    abstract getUniformBufferData(): Float32Array;
}
