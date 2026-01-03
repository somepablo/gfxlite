<script setup lang="ts">
import BaseExample, { type ExampleContext } from "../BaseExample.vue";

function setup({ canvas, gfx }: ExampleContext) {
  const {
    Renderer,
    Scene,
    Mesh,
    BoxGeometry,
    SphereGeometry,
    TorusGeometry,
    PerspectiveCamera,
    Vector3,
    PhongMaterial,
    DirectionalLight,
    OrbitControls,
  } = gfx;

  const renderer = new Renderer(canvas);

  const scene = new Scene();

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const camera = new PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position = new Vector3(4, 3, 4);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  const light = new DirectionalLight();
  light.position = new Vector3(1, 5, 2);
  light.lookAt(new Vector3(0, 0, 0));
  light.intensity = 1.5;
  scene.add(light);

  const box = new Mesh(
    new BoxGeometry({
      width: 1.5,
      height: 1.5,
      depth: 1.5,
    }),
    new PhongMaterial({ color: new Vector3(0.8, 0.3, 0.3), shininess: 32 }),
  );
  box.position.x = -3;
  scene.add(box);

  const sphere = new Mesh(
    new SphereGeometry({
      radius: 1,
      widthSegments: 32,
      heightSegments: 16,
    }),
    new PhongMaterial({ color: new Vector3(0.3, 0.8, 0.3), shininess: 64 }),
  );
  scene.add(sphere);

  const torus = new Mesh(
    new TorusGeometry({
      radius: 0.8,
      tube: 0.3,
      radialSegments: 32,
      tubularSegments: 32,
    }),
    new PhongMaterial({ color: new Vector3(0.3, 0.3, 0.8), shininess: 64 }),
  );
  torus.position.x = 3;
  scene.add(torus);

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
  };
}
</script>

<template>
  <BaseExample
    title="Orbit Controls - Click and drag to rotate, scroll to zoom"
    :setup="setup"
  />
</template>
