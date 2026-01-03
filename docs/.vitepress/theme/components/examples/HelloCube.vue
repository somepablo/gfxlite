<script setup lang="ts">
import BaseExample, { type ExampleContext } from "../BaseExample.vue";

function setup({ canvas, gfx }: ExampleContext) {
  const {
    Renderer,
    Scene,
    Mesh,
    BoxGeometry,
    BasicMaterial,
    PerspectiveCamera,
    Vector3,
  } = gfx;

  const renderer = new Renderer(canvas);

  const scene = new Scene();

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const camera = new PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position = new Vector3(0, 0, 3);

  const geometry = new BoxGeometry({
    width: 1,
    height: 1,
    depth: 1,
  });
  const material = new BasicMaterial({ color: new Vector3(0.2, 0.5, 1.0) });
  const cube = new Mesh(geometry, material);
  scene.add(cube);

  let animationId: number;

  const animate = () => {
    cube.rotateX(0.01);
    cube.rotateY(0.01);
    renderer.render(scene, camera);
    animationId = requestAnimationFrame(animate);
  };
  animate();

  return () => cancelAnimationFrame(animationId);
}
</script>

<template>
  <BaseExample title="Hello Cube" :setup="setup" />
</template>
