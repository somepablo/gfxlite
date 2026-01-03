<script setup lang="ts">
import BaseExample, { type ExampleContext } from "../BaseExample.vue";

async function setup({ canvas, gfx }: ExampleContext) {
  const {
    Renderer,
    Scene,
    Mesh,
    SphereGeometry,
    PerspectiveCamera,
    Vector3,
    StandardMaterial,
    OrbitControls,
    Environment,
    DirectionalLight,
  } = gfx;

  const renderer = new Renderer(canvas);

  const scene = new Scene();

  const environment = await Environment.loadHDR("/env.hdr", {
    resolution: 512,
    intensity: 1.0,
  });
  scene.environment = environment;
  scene.background = { type: "environment" };

  const light = new DirectionalLight();
  light.position = new Vector3(5, 5, 5);
  light.lookAt(new Vector3(0, 0, 0));
  light.intensity = 1.5;
  scene.add(light);

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const camera = new PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position = new Vector3(0, 0, 6);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Create spheres with varying roughness
  const geometry = new SphereGeometry({
    radius: 0.7,
    widthSegments: 64,
    heightSegments: 32,
  });

  for (let i = 0; i < 5; i++) {
    const material = new StandardMaterial({
      baseColor: new Vector3(0.8, 0.6, 0.2),
      roughness: i / 4, // 0.0 to 1.0
      metallic: 0.9,
    });

    const sphere = new Mesh(geometry, material);
    sphere.position.x = (i - 2) * 1.8;
    scene.add(sphere);
  }

  let animationId: number;
  const animate = () => {
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
  <BaseExample
    title="Environment Maps - Roughness: 0.0 to 1.0 (left to right)"
    :setup="setup"
  />
</template>
