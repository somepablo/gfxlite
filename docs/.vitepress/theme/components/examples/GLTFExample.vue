<script setup lang="ts">
import BaseExample, { type ExampleContext } from "../BaseExample.vue";

async function setup({ canvas, gfx }: ExampleContext) {
  const {
    Renderer,
    Scene,
    PerspectiveCamera,
    Vector3,
    DirectionalLight,
    OrbitControls,
    GLTFLoader,
    Environment,
  } = gfx;

  const renderer = new Renderer(canvas);

  const scene = new Scene();

  // Load environment for reflections
  const environment = await Environment.loadHDR("/env.hdr", {
    resolution: 512,
    intensity: 1.0,
  });
  scene.environment = environment;

  // Lighting
  const light = new DirectionalLight();
  light.position = new Vector3(5, 5, 5);
  light.lookAt(new Vector3(0, 0, 0));
  light.intensity = 1.5;
  scene.add(light);

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const camera = new PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position = new Vector3(0, 0, 3);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Load GLTF model
  const loader = new GLTFLoader();
  const model = await loader.load("/DamagedHelmet.glb");
  scene.add(model);

  let animationId: number;
  const animate = () => {
    model.rotateY(0.005);
    controls.update();
    renderer.render(scene, camera);
    animationId = requestAnimationFrame(animate);
  };
  animate();

  return () => {
    cancelAnimationFrame(animationId);
    controls.dispose();
    environment.dispose();
  };
}
</script>

<template>
  <BaseExample title="GLTF Model - Damaged Helmet" :setup="setup" />
</template>
